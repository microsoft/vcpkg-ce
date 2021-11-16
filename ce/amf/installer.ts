// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { isMap, isSeq } from 'yaml';
import { Installer as IInstaller } from '../interfaces/metadata/installers/Installer';
import { NupkgInstaller } from '../interfaces/metadata/installers/nupkg';
import { UnTarInstaller } from '../interfaces/metadata/installers/tar';
import { UnZipInstaller } from '../interfaces/metadata/installers/zip';
import { Coerce } from '../yaml/Coerce';
import { Entity } from '../yaml/Entity';
import { EntitySequence } from '../yaml/EntitySequence';
import { Strings } from '../yaml/strings';
import { Node, Yaml, YAMLDictionary } from '../yaml/yaml-types';

export class Installs extends EntitySequence<Installer> {
  constructor(node?: YAMLDictionary, parent?: Yaml, key?: string) {
    super(Installer, node, parent, key);
  }

  override *[Symbol.iterator](): Iterator<Installer> {
    if (isMap(this.node)) {
      yield this.createInstance(this.node);
    }
    if (isSeq(this.node)) {
      for (const item of this.node.items) {
        yield this.createInstance(item);
      }
    }
  }

  protected createInstance(node: Node): Installer {
    if (isMap(node)) {
      if (node.has('unzip')) {
        return new UnzipNode(node, this);
      }
      if (node.has('nupkg')) {
        return new NupkgNode(node, this);
      }
      if (node.has('untar')) {
        return new UnTarNode(node, this);
      }
      if (node.has('git')) {
        return new GitCloneNode(node, this);
      }
    }
    throw new Error('Unsupported node type');
  }
}


export class Installer extends Entity implements IInstaller {
  get installerKind(): string {
    throw new Error('abstract type, should not get here.');
  }

  get lang() {
    return Coerce.String(this.getMember('lang'));
  }

  get nametag() {
    return Coerce.String(this.getMember('nametag'));
  }
}

abstract class FileInstallerNode extends Installer {
  get sha256() {
    return Coerce.String(this.getMember('sha256'));
  }

  set sha256(value: string | undefined) {
    this.setMember('sha256', value);
  }

  get sha512() {
    return Coerce.String(this.getMember('sha512'));
  }

  set sha512(value: string | undefined) {
    this.setMember('sha512', value);
  }

  get strip() {
    return Coerce.Number(this.getMember('strip'));
  }

  set strip(value: number | undefined) {
    this.setMember('1', value);
  }

  readonly transform = new Strings(undefined, this, 'transform');
}
class UnzipNode extends FileInstallerNode implements UnZipInstaller {
  override get installerKind() { return 'unzip'; }

  readonly location = new Strings(undefined, this, 'unzip');

}
class UnTarNode extends FileInstallerNode implements UnTarInstaller {
  override get installerKind() { return 'untar'; }
  location = new Strings(undefined, this, 'untar');

}
class NupkgNode extends Installer implements NupkgInstaller {
  get location() {
    return Coerce.String(this.getMember('nupkg'))!;
  }

  set location(value: string) {
    this.setMember('nupkg', value);
  }

  override get installerKind() { return 'nupkg'; }

  get strip() {
    return Coerce.Number(this.getMember('strip'));
  }

  set strip(value: number | undefined) {
    this.setMember('1', value);
  }

  get sha256() {
    return Coerce.String(this.getMember('sha256'));
  }

  set sha256(value: string | undefined) {
    this.setMember('sha256', value);
  }

  get sha512() {
    return Coerce.String(this.getMember('sha512'));
  }

  set sha512(value: string | undefined) {
    this.setMember('sha512', value);
  }

  readonly transform = new Strings(undefined, this, 'transform');

}
class GitCloneNode extends Installer {
  override get installerKind() { return 'git'; }
}
