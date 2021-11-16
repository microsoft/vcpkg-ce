// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { fail } from 'assert';
import * as micromatch from 'micromatch';
import { MetadataFile } from '../amf/metadata-file';
import { AcquireEvents } from '../fs/acquire';
import { UnpackEvents } from '../fs/archive';
import { i } from '../i18n';
import { Installer } from '../interfaces/metadata/installers/Installer';
import { NupkgInstaller } from '../interfaces/metadata/installers/nupkg';
import { UnTarInstaller } from '../interfaces/metadata/installers/tar';
import { UnZipInstaller } from '../interfaces/metadata/installers/zip';
import { Registries } from '../registries/registries';
import { Session } from '../session';
import { linq } from '../util/linq';
import { Uri } from '../util/uri';
import { Activation } from './activation';
import { installNuGet, installUnTar, installUnZip } from './installer-impl';
import { SetOfDemands } from './SetOfDemands';

export type Selections = Map<string, string>;
export type UID = string;
export type ID = string;
export type VersionRange = string;
export type Selection = [Artifact, ID, VersionRange]

export class ArtifactMap extends Map<UID, Selection>{
  get artifacts() {
    return linq.values(this).select(([artifact, id, range]) => artifact);
  }
}

class ArtifactBase {
  public registries: Registries;
  readonly applicableDemands: SetOfDemands;

  constructor(protected session: Session, public readonly metadata: MetadataFile) {
    this.applicableDemands = new SetOfDemands(this.metadata, this.session);
    this.registries = new Registries(session);

    // load the registries from the project file
    for (const [name, registry] of this.metadata.registries) {
      const reg = session.loadRegistry(registry.location.get(0), registry.registryKind || 'artifact');
      if (reg) {
        this.registries.add(reg, name);
      }
    }
  }

  async resolveDependencies(artifacts = new ArtifactMap(), recurse = true) {
    // find the dependencies and add them to the set
    for (const [id, version] of linq.entries(this.applicableDemands.requires)) {
      if (id.indexOf(':') === -1) {
        throw new Error(`Dependency '${id}' version '${version.raw}' does not specify the registry.`);
      }
      const dep = await this.registries.getArtifact(id, version.raw);
      if (!dep) {
        throw new Error(`Unable to resolve dependency ${id}/${version}`);
      }
      const artifact = dep[2];
      if (!artifacts.has(artifact.uniqueId)) {
        artifacts.set(artifact.uniqueId, [artifact, id, version.raw || '*']);

        if (recurse) {
          // process it's dependencies too.
          await artifact.resolveDependencies(artifacts);
        }
      }
    }
    return artifacts;
  }

}

export class Artifact extends ArtifactBase {
  isPrimary = false;

  constructor(session: Session, metadata: MetadataFile, public shortName: string = '', protected targetLocation: Uri, public readonly registryId: string, public readonly registryUri: Uri) {
    super(session, metadata);
  }

  get id() {
    return this.metadata.info.id;
  }

  get reference() {
    return `${this.registryId}:${this.id}`;
  }

  get version() {
    return this.metadata.info.version;
  }

  get isInstalled() {
    return this.targetLocation.exists('artifact.yaml');
  }

  get uniqueId() {
    return `${this.registryUri.toString()}::${this.id}::${this.version}`;
  }

  private async installSingle(installInfo: Installer, options: { events?: Partial<UnpackEvents & AcquireEvents>, allLanguages?: boolean, language?: string }): Promise<void> {
    if (installInfo.lang && !options.allLanguages && options.language && options.language.toLowerCase() !== installInfo.lang.toLowerCase()) {
      return;
    }
    const target = { name: this.id, targetLocation: this.targetLocation };
    switch (installInfo.installerKind) {
      case 'nupkg':
        await installNuGet(this.session, target, <NupkgInstaller>installInfo, options);
        break;
      case 'unzip':
        await installUnZip(this.session, target, <UnZipInstaller>installInfo, options);
        break;
      case 'untar':
        await installUnTar(this.session, target, <UnTarInstaller>installInfo, options);
        break;
      case 'git':
        throw new Error('not implemented');
      default:
        fail(i`Unknown installer type ${installInfo!.installerKind}`);
    }
  }

  async install(options?: { events?: Partial<UnpackEvents & AcquireEvents>, force?: boolean, allLanguages?: boolean, language?: string }): Promise<boolean> {
    if (!options) {
      options = {};
    }

    // is it installed?
    if (await this.isInstalled && !options.force) {
      return false;
    }

    if (options.force) {
      try {
        await this.uninstall();
      } catch {
        // if a file is locked, it may not get removed. We'll deal with this later.
      }
    }

    const d = this.applicableDemands;
    {
      let fail = false;
      for (const each of d.errors) {
        this.session.channels.error(each);
        fail = true;
      }

      // check to see that we only have one install block

      if (fail) {
        throw Error('errors present');
      }
    }

    // warnings
    for (const each of d.warnings) {
      this.session.channels.warning(each);
    }

    // messages
    for (const each of d.messages) {
      this.session.channels.message(each);
    }

    // ok, let's install this.
    for (const singleInstallInfo of d.installer) {
      await this.installSingle(singleInstallInfo, options);
    }

    // after we unpack it, write out the installed manifest
    await this.writeManifest();

    return true;
  }

  get name() {
    return `${this.metadata.info.id.replace(/[^\w]+/g, '.')}-${this.metadata.info.version}`;
  }

  async writeManifest() {
    await this.targetLocation.createDirectory();
    await this.metadata.save(this.targetLocation.join('artifact.yaml'));
  }

  async uninstall() {
    await this.targetLocation.delete({ recursive: true, useTrash: false });
  }

  async loadActivationSettings(activation: Activation) {
    // construct paths (bin, lib, include, etc.)
    // construct tools
    // compose variables
    // defines

    const l = this.targetLocation.toString().length + 1;
    const allPaths = (await this.targetLocation.readDirectory(undefined, { recursive: true })).select(([name, stat]) => name.toString().substr(l));

    for (const s of this.applicableDemands.settings) {
      // eslint-disable-next-line prefer-const
      for (let [key, value] of s.defines) {
        if (value === 'true') {
          value = '1';
        }

        const v = activation.defines.get(key);
        if (v && v !== value) {
          // conflict. todo: what do we want to do?
          this.session.channels.warning(i`Duplicate define ${key} during activation. New value will replace old `);
        }
        activation.defines.set(key, value);
      }

      for (const key of s.paths.keys) {
        if (!key) {
          continue;
        }
        const pathEnvVariable = key.toUpperCase();
        const p = activation.paths.getOrDefault(pathEnvVariable, []);
        const l = s.paths.get(key);
        const locations = (l ? [...l] : []).map(each => each).selectMany(path => {
          const p = sanitizePath(path);
          return p ? micromatch(allPaths, p) : [''];
        }).map(each => this.targetLocation.join(each));

        if (locations?.length) {
          p.push(...locations);
          this.session.channels.debug(`locations: ${locations.map(l => l.toString())}`);
        }
      }

      for (const key of s.tools.keys) {
        const envVariable = key.toUpperCase();
        if (activation.tools.has(envVariable)) {
          this.session.channels.error(i`Duplicate tool declared ${key} during activation. Probably not a good thing?`);
        }

        const location = sanitizePath(s.tools.get(key) || '');
        const uri = this.targetLocation.join(location);

        if (! await uri.exists()) {
          this.session.channels.error(i`Tool '${key}' is specified as '${location}' which does not exist in the package`);
        }

        activation.tools.set(envVariable, uri);
      }

      for (const [key, value] of s.variables) {
        const envKey = activation.environment.getOrDefault(key, []);
        envKey.push(...value);
      }
    }
  }
}

export function sanitizePath(path: string) {
  return path.
    replace(/[\\/]+/g, '/').     // forward slahses please
    replace(/[?<>:|"]/g, ''). // remove illegal characters.
    // eslint-disable-next-line no-control-regex
    replace(/[\x00-\x1f\x80-\x9f]/g, ''). // remove unicode control codes
    replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i, ''). // no reserved names
    replace(/^[/.]*\//, ''). // dots and slashes off the front.
    replace(/[/.]+$/, ''). // dots and slashes off the back.
    replace(/\/\.+\//g, '/'). // no parts made just of dots.
    replace(/\/+/g, '/'); // duplicate slashes.
}

export function sanitizeUri(u: string) {
  return u.
    replace(/[\\/]+/g, '/').     // forward slahses please
    replace(/[?<>|"]/g, ''). // remove illegal characters.
    // eslint-disable-next-line no-control-regex
    replace(/[\x00-\x1f\x80-\x9f]/g, ''). // remove unicode control codes
    replace(/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i, ''). // no reserved names
    replace(/^[/.]*\//, ''). // dots and slashes off the front.
    replace(/[/.]+$/, ''). // dots and slashes off the back.
    replace(/\/\.+\//g, '/'). // no parts made just of dots.
    replace(/\/+/g, '/'); // duplicate slashes.
}

export class ProjectManifest extends ArtifactBase {

}

export class InstalledArtifact extends Artifact {
  constructor(session: Session, metadata: MetadataFile) {
    super(session, metadata, '', Uri.invalid, 'OnDisk?', Uri.invalid); /* fixme ? */
  }
}