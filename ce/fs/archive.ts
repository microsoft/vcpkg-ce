// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { fail } from 'assert';
import { sed } from 'sed-lite';
import { pipeline as origPipeline, Readable, Transform } from 'stream';
import { extract as tarExtract, Headers } from 'tar-stream';
import { promisify } from 'util';
import { createGunzip } from 'zlib';
import { i } from '../i18n';
import { Session } from '../session';
import { ExtendedEmitter } from '../util/events';
import { PercentageScaler } from '../util/percentage-scaler';
import { Queue } from '../util/promise';
import { Uri } from '../util/uri';
import { ProgressTrackingStream } from './streams';
import { UnifiedFileSystem } from './unified-filesystem';
import { ZipEntry, ZipFile } from './unzip';

const pipeline = promisify(origPipeline);

// eslint-disable-next-line @typescript-eslint/no-var-requires
const bz2 = require('unbzip2-stream');

export interface FileEntry {
  archiveUri: Uri;
  destination: Uri | undefined;
  path: string;
  extractPath: string | undefined;
}

/** The event definitions for for unpackers */
export interface UnpackEvents {
  progress(archivePercentage: number): void;
  fileProgress(entry: Readonly<FileEntry>, filePercentage: number): void;
  unpacked(entry: Readonly<FileEntry>): void;
  error(entry: Readonly<FileEntry>, message: string): void;
}

/** Unpacker output options */
export interface OutputOptions {
  /**
   * Strip # directories from the path
   *
   * Typically used to remove excessive nested folders off the front of the paths in an archive.
  */
  strip?: number;

  /**
   * A regular expression to transform filenames during unpack. If the resulting file name is empty, it is not emitted.
   */
  transform?: Array<string>;

  events?: Partial<UnpackEvents>;
}

/** Unpacker base class definition */
export abstract class Unpacker extends ExtendedEmitter<UnpackEvents> {
  /* Event Emitters */

  /** EventEmitter: progress, at least once per file */
  protected progress(archivePercentage: number): void {
    this.emit('progress', archivePercentage);
  }
  protected fileProgress(entry: Readonly<FileEntry>, filePercentage: number): void {
    this.emit('fileProgress', entry, filePercentage);
  }
  /** EventEmitter: unpacked, emitted per file (not per archive)  */
  protected unpacked(entry: Readonly<FileEntry>) {
    this.emit('unpacked', entry);
  }

  abstract unpack(archiveUri: Uri, outputUri: Uri, options?: OutputOptions): Promise<void>;

  /**
 * Returns a new path string such that the path has prefixCount path elements removed, and directory
 * separators normalized to a single forward slash.
 * If prefixCount is greater than or equal to the number of path elements in the path, undefined is returned.
 */
  public static stripPath(path: string, prefixCount: number): string | undefined {
    const elements = path.split(/[\\/]+/);
    const hasLeadingSlash = elements.length !== 0 && elements[0].length === 0;
    const hasTrailingSlash = elements.length !== 0 && elements[elements.length - 1].length === 0;
    let countForUndefined = prefixCount;
    if (hasLeadingSlash) {
      ++countForUndefined;
    }

    if (hasTrailingSlash) {
      ++countForUndefined;
    }

    if (elements.length <= countForUndefined) {
      return undefined;
    }

    if (hasLeadingSlash) {
      return '/' + elements.splice(prefixCount + 1).join('/');
    }

    return elements.splice(prefixCount).join('/');
  }

  /**
 * Apply OutputOptions to a path before extraction.
 * @param entry The initial path to a file to unpack.
 * @param options Options to apply to that file name.
 * @returns If the file is to be emitted, the path to use; otherwise, undefined.
 */
  protected static implementOutputOptions(path: string, options: OutputOptions): string | undefined {
    if (options.strip) {
      const maybeStripped = Unpacker.stripPath(path, options.strip);
      if (maybeStripped) {
        path = maybeStripped;
      } else {
        return undefined;
      }
    }

    if (options.transform) {
      for (const transformExpr of options.transform) {
        if (!path) {
          break;
        }

        const sedTransformExpr = sed(transformExpr);
        path = sedTransformExpr(path);
      }
    }

    return path;
  }
}

export class ZipUnpacker extends Unpacker {
  constructor(private readonly session: Session) {
    super();
  }

  async unpackFile(file: ZipEntry, archiveUri: Uri, outputUri: Uri, options: OutputOptions) {
    const extractPath = Unpacker.implementOutputOptions(file.name, options);
    if (extractPath) {
      const destination = outputUri.join(extractPath);
      const fileEntry = {
        archiveUri,
        destination,
        path: file.name,
        extractPath
      };

      this.fileProgress(fileEntry, 0);
      this.session.channels.debug(`unpacking ZIP file ${archiveUri}/${file.name} => ${destination}`);
      await destination.parent.createDirectory();
      const readStream = await file.read();
      const mode = ((file.attr >> 16) & 0xfff);

      const writeStream = await destination.writeStream({ mtime: file.time, mode: mode ? mode : undefined });
      const progressStream = new ProgressTrackingStream(0, file.size);
      progressStream.on('progress', (filePercentage) => this.fileProgress(fileEntry, filePercentage));
      await pipeline(readStream, progressStream, writeStream);
      this.fileProgress(fileEntry, 100);
      this.unpacked(fileEntry);
    }
  }

  async unpack(archiveUri: Uri, outputUri: Uri, options: OutputOptions): Promise<void> {
    this.subscribe(options?.events);
    try {
      this.session.channels.debug(`unpacking ZIP ${archiveUri} => ${outputUri}`);

      const openedFile = await archiveUri.openFile();
      const zipFile = await ZipFile.read(openedFile);

      const archiveProgress = new PercentageScaler(0, zipFile.files.size);
      this.progress(0);
      const q = new Queue();
      let count = 0;
      for (const file of zipFile.files.values()) {

        void q.enqueue(async () => {
          await this.unpackFile(file, archiveUri, outputUri, options);
          this.progress(archiveProgress.scalePosition(count++));
        });
      }
      await q.done;
      await zipFile.close();
      this.progress(100);
    } finally {
      this.unsubscribe(options?.events);
    }
  }
}

abstract class BasicTarUnpacker extends Unpacker {
  constructor(protected readonly session: Session) {
    super();
  }

  async maybeUnpackEntry(archiveUri: Uri, outputUri: Uri, options: OutputOptions, header: Headers, stream: Readable): Promise<void> {
    const streamPromise = new Promise((accept, reject) => {
      stream.on('end', accept);
      stream.on('error', reject);
    });

    try {

      const extractPath = Unpacker.implementOutputOptions(header.name, options);
      let destination: Uri | undefined = undefined;
      if (extractPath) {
        destination = outputUri.join(extractPath);
      }

      if (destination) {
        switch (header?.type) {
          case 'symlink': {
            const linkTargetUri = destination?.parent.join(header.linkname!) || fail('');
            await destination.parent.createDirectory();
            await (<UnifiedFileSystem>this.session.fileSystem).filesystem(linkTargetUri).createSymlink(linkTargetUri, destination!);
          }
            return;

          case 'link': {
            // this should be a 'hard-link' -- but I'm not sure if we can make hardlinks on windows. todo: find out
            const linkTargetUri = outputUri.join(Unpacker.implementOutputOptions(header.linkname!, options)!);
            // quick hack
            await destination.parent.createDirectory();
            await (<UnifiedFileSystem>this.session.fileSystem).filesystem(linkTargetUri).createSymlink(linkTargetUri, destination!);
          }
            return;

          case 'directory':
            this.session.channels.debug(`in ${archiveUri.fsPath} skipping directory ${header.name}`);
            return;

          case 'file':
            // files handle below
            break;

          default:
            this.session.channels.warning(i`in ${archiveUri.fsPath} skipping ${header.name} because it is a ${header?.type || ''}`);
            return;
        }

        const fileEntry = {
          archiveUri: archiveUri,
          destination: destination,
          path: header.name,
          extractPath: extractPath
        };

        this.session.channels.debug(`unpacking TAR ${archiveUri}/${header.name} => ${destination}`);
        this.fileProgress(fileEntry, 0);

        if (header.size) {
          const parentDirectory = destination.parent;
          await parentDirectory.createDirectory();
          const fileProgress = new ProgressTrackingStream(0, header.size);
          fileProgress.on('progress', (filePercentage) => this.fileProgress(fileEntry, filePercentage));
          fileProgress.on('progress', (filePercentage) => options.events?.fileProgress?.(fileEntry, filePercentage));
          const writeStream = await destination.writeStream({ mtime: header.mtime, mode: header.mode });
          await pipeline(stream, fileProgress, writeStream);
        }

        this.fileProgress(fileEntry, 100);
        this.unpacked(fileEntry);
      }

    } finally {
      stream.resume();
      await streamPromise;
    }
  }

  protected async unpackTar(archiveUri: Uri, outputUri: Uri, options: OutputOptions, decompressor?: Transform): Promise<void> {
    this.subscribe(options?.events);
    const archiveSize = await archiveUri.size();
    const archiveFileStream = await archiveUri.readStream(0, archiveSize);
    const archiveProgress = new ProgressTrackingStream(0, archiveSize);
    const tarExtractor = tarExtract();

    tarExtractor.on('entry', (header, stream, next) =>
      this.maybeUnpackEntry(archiveUri, outputUri, options, header, stream).then(() => {
        this.progress(archiveProgress.currentPercentage);
        next();
      }).catch(err => (<any>next)(err)));

    if (decompressor) {
      await pipeline(archiveFileStream, archiveProgress, decompressor, tarExtractor);
    } else {
      await pipeline(archiveFileStream, archiveProgress, tarExtractor);
    }
  }
}

export class TarUnpacker extends BasicTarUnpacker {
  unpack(archiveUri: Uri, outputUri: Uri, options: OutputOptions): Promise<void> {
    this.session.channels.debug(`unpacking TAR ${archiveUri} => ${outputUri}`);
    return this.unpackTar(archiveUri, outputUri, options);
  }
}

export class TarGzUnpacker extends BasicTarUnpacker {
  unpack(archiveUri: Uri, outputUri: Uri, options: OutputOptions): Promise<void> {
    this.session.channels.debug(`unpacking TAR.GZ ${archiveUri} => ${outputUri}`);
    return this.unpackTar(archiveUri, outputUri, options, createGunzip());
  }
}

export class TarBzUnpacker extends BasicTarUnpacker {
  unpack(archiveUri: Uri, outputUri: Uri, options: OutputOptions): Promise<void> {
    this.session.channels.debug(`unpacking TAR.BZ2 ${archiveUri} => ${outputUri}`);
    return this.unpackTar(archiveUri, outputUri, options, bz2());
  }
}
