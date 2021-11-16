// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { isMap } from 'yaml';
import { i } from '../i18n';
import { ErrorKind } from '../interfaces/error-kind';
import { ValidationError } from '../interfaces/validation-error';
import { parseQuery } from '../mediaquery/media-query';
import { Coerce } from '../yaml/Coerce';
import { Entity } from '../yaml/Entity';
import { EntityMap } from '../yaml/EntityMap';
import { Yaml, YAMLDictionary } from '../yaml/yaml-types';
import { Installs } from './installer';
import { Requires } from './Requires';
import { Settings } from './settings';

const hostFeatures = new Set<string>(['x64', 'x86', 'arm', 'arm64', 'windows', 'linux', 'osx', 'freebsd']);

const ignore = new Set<string>(['info', 'contacts', 'error', 'message', 'warning', 'requires', 'see-also']);
/**
 * A map of mediaquery to DemandBlock
 */
export class Demands extends EntityMap<YAMLDictionary, DemandBlock> {
  constructor(node?: YAMLDictionary, parent?: Yaml, key?: string) {
    super(DemandBlock, node, parent, key);
  }

  override get keys() {
    return super.keys.filter(each => !ignore.has(each));
  }

  /** @internal */
  override *validate(): Iterable<ValidationError> {
    yield* super.validate();

    for (const [mediaQuery, demandBlock] of this) {
      if (ignore.has(mediaQuery)) {
        continue;
      }
      if (!isMap(demandBlock.node)) {
        yield {
          message: `Conditional demand '${mediaQuery}' is not an object`,
          range: demandBlock.node!.range || [0, 0, 0],
          category: ErrorKind.IncorrectType
        };
        continue;
      }

      const query = parseQuery(mediaQuery);
      if (!query.isValid) {
        yield { message: i`Error parsing conditional demand '${mediaQuery}'- ${query.error?.message}`, range: this.sourcePosition(mediaQuery)/* mediaQuery.range! */, rangeOffset: query.error, category: ErrorKind.ParseError };
        continue;
      }

      yield* demandBlock.validate();
    }
  }
}

export class DemandBlock extends Entity {
  get error(): string | undefined { return Coerce.String(this.getMember('error')); }
  set error(value: string | undefined) { this.setMember('error', value); }

  get warning(): string | undefined { return Coerce.String(this.getMember('warning')); }
  set warning(value: string | undefined) { this.setMember('warning', value); }

  get message(): string | undefined { return Coerce.String(this.getMember('message')); }
  set message(value: string | undefined) { this.setMember('message', value); }

  seeAlso = new Requires(undefined, this, 'seeAlso');
  requires = new Requires(undefined, this, 'requires');

  settings = new Settings(undefined, this, 'settings');
  install = new Installs(undefined, this, 'install');

  /** @internal */
  override *validate(): Iterable<ValidationError> {
    yield* super.validate();
    if (this.exists()) {
      yield* this.settings.validate();
      yield* this.requires.validate();
      yield* this.seeAlso.validate();
      yield* this.install.validate();
    }
  }
}