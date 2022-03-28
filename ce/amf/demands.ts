// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { stream } from 'fast-glob';
import { lstat, Stats } from 'fs';
import { join, resolve } from 'path';
import { isMap, isScalar } from 'yaml';
import { i } from '../i18n';
import { ErrorKind } from '../interfaces/error-kind';
import { AlternativeFulfillment } from '../interfaces/metadata/alternative-fulfillment';
import { ValidationError } from '../interfaces/validation-error';
import { parseQuery } from '../mediaquery/media-query';
import { Session } from '../session';
import { cmdlineToArray, execute } from '../util/exec-cmd';
import { safeEval, valiadateExpression } from '../util/safeEval';
import { Entity } from '../yaml/Entity';
import { EntityMap } from '../yaml/EntityMap';
import { ScalarMap } from '../yaml/ScalarMap';
import { Strings } from '../yaml/strings';
import { Primitive, Yaml, YAMLDictionary } from '../yaml/yaml-types';
import { Exports } from './exports';
import { Installs } from './installer';
import { Requires } from './Requires';

const hostFeatures = new Set<string>(['x64', 'x86', 'arm', 'arm64', 'windows', 'linux', 'osx', 'freebsd']);

const ignore = new Set<string>(['info', 'contacts', 'error', 'message', 'warning', 'requires', 'see-also']);
/**
 * A map of mediaquery to DemandBlock
 */
export class Demands extends EntityMap<YAMLDictionary, DemandBlock> {
  protected filteredData = <any>{};

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
  discoveredData = <any>{};

  get error(): string | undefined { return this.usingAlternative ? this.unless.error : this.asString(this.getMember('error')); }
  set error(value: string | undefined) { this.setMember('error', value); }

  get warning(): string | undefined { return this.usingAlternative ? this.unless.warning : this.asString(this.getMember('warning')); }
  set warning(value: string | undefined) { this.setMember('warning', value); }

  get message(): string | undefined { return this.usingAlternative ? this.unless.message : this.asString(this.getMember('message')); }
  set message(value: string | undefined) { this.setMember('message', value); }

  get seeAlso(): Requires {
    return this.usingAlternative ? this.unless.seeAlso : this._seeAlso;
  }

  get requires(): Requires {
    return this.usingAlternative ? this.unless.requires : this._requires;
  }

  get exports(): Exports {
    return this.usingAlternative ? this.unless.exports : this._exports;
  }

  get install(): Installs {
    return this.usingAlternative ? this.unless.install : this._install;
  }

  get apply(): ScalarMap<string> {
    return this.usingAlternative ? this.unless.apply : this._apply;
  }

  protected readonly _seeAlso = new Requires(undefined, this, 'seeAlso');
  protected readonly _requires = new Requires(undefined, this, 'requires');
  protected readonly _exports = new Exports(undefined, this, 'exports');
  protected readonly _install = new Installs(undefined, this, 'install');
  protected readonly _apply = new ScalarMap<string>(undefined, this, 'apply');

  readonly unless!: Unless;

  protected usingAlternative: boolean | undefined;

  constructor(node?: YAMLDictionary, parent?: Yaml, key?: string) {
    super(node, parent, key);
    if (key !== 'unless') {
      this.unless = new Unless(undefined, this, 'unless');
    }
  }

  /**
   * Async Initializer.
   *
   * checks the alternative demand resolution.
   * when this runs, if the alternative is met, the rest of the demand is redirected to the alternative.
   */
  async init(session: Session): Promise<DemandBlock> {

    if (this.usingAlternative === undefined && this.has('unless')) {
      await this.unless.init(session);
      this.usingAlternative = this.unless.usingAlternative;
    }
    return this;
  }

  /** @internal */
  override *validate(): Iterable<ValidationError> {
    yield* this.validateChildKeys(['error', 'warning', 'message', 'seeAlso', 'requires', 'exports', 'install', 'apply', 'unless']);

    yield* super.validate();
    if (this.exists()) {
      yield* this.validateChild('error', 'string');
      yield* this.validateChild('warning', 'string');
      yield* this.validateChild('message', 'string');

      yield* this.exports.validate();
      yield* this.requires.validate();
      yield* this.seeAlso.validate();
      yield* this.install.validate();
      if (this.unless) {
        yield* this.unless.validate();
      }
    }
  }

  private evaluate(value: string) {
    if (!value || value.indexOf('$') === -1) {
      // quick exit if no expression or no variables
      return value;
    }

    // $$ -> escape for $
    value = value.replace(/\$\$/g, '\uffff');

    // $0 ... $9 -> replace contents with the values from the artifact
    value = value.replace(/\$([0-9])/g, (match, index) => this.discoveredData[match] || match);

    // restore escaped $
    return value.replace(/\uffff/g, '$');
  }

  override asString(value: any): string | undefined {
    if (value === undefined) {
      return value;
    }
    value = isScalar(value) ? value.value : value;

    return this.evaluate(value);
  }

  override asPrimitive(value: any): Primitive | undefined {
    if (value === undefined) {
      return value;
    }
    if (isScalar(value)) {
      value = value.value;
    }
    switch (typeof value) {
      case 'boolean':
      case 'number':
        return value;

      case 'string': {
        return this.evaluate(value);
      }
    }
    return undefined;
  }
}

/** filters output and produces a sandbox context object */
function filter(expression: string, content: string) {
  const parsed = /^\/(.*)\/(\w*)$/.exec(expression);
  if (parsed) {
    return new RegExp(parsed[1], parsed[2]).exec(content)?.reduce((p, c, i) => { p[`$${i}`] = c; return p; }, <any>{}) ?? {};
  }
  return {};
}

export class Unless extends DemandBlock implements AlternativeFulfillment {

  readonly from = new Strings(undefined, this, 'from');
  readonly where = new Strings(undefined, this, 'where');

  get run(): string | undefined { return this.asString(this.getMember('run')); }
  set run(value: string | undefined) { this.setMember('run', value); }

  get select(): string | undefined { return this.asString(this.getMember('select')); }
  set select(value: string | undefined) { this.setMember('select', value); }

  get matches(): string | undefined { return this.asString(this.getMember('is')); }
  set matches(value: string | undefined) { this.setMember('is', value); }

  /** @internal */
  override *validate(): Iterable<ValidationError> {
    if (this.exists()) {
      // todo: what other validations do we need?
      //  yield* super.validate();
      if (this.has('unless')) {
        yield {
          message: i`"unless" is not supported in an unless block`,
          range: this.sourcePosition('unless'),
          category: ErrorKind.InvalidDefinition
        };
      }
      if (this.matches && !valiadateExpression(this.matches)) {
        yield {
          message: i`'is' expression ("${this.matches}") is not a valid comparison expression.`,
          range: this.sourcePosition('is'),
          category: ErrorKind.InvalidExpression
        };
      }
    }
  }

  override async init(session: Session): Promise<Unless> {
    if (this.usingAlternative === undefined) {
      this.usingAlternative = false;
      if (this.from.length > 0 && this.where.length > 0) {
        // we're doing some kind of check.
        const locations = [...this.from].map(each => session.activation.expandPathLikeVariableExpressions(each)).flat();
        const binaries = [...this.where];

        const search = locations.map(location => binaries.map(binary => join(location, binary).replace(/\\/g, '/'))).flat();

        // when we find an adequate match, we stop looking
        // to do so and not work hrd

        const Break = <NodeJS.ErrnoException>{};
        for await (const item of stream(search, {
          concurrency: 1,
          stats: false, fs: <any>{
            lstat: (path: string, callback: (error: NodeJS.ErrnoException | null, stats: Stats) => void) => {
              // if we're done iterating, always return an error.
              if (this.usingAlternative) {
                return callback(Break, <Stats><any>undefined);
              }

              return lstat(path, (error, stats) => {
                // just return an error, as we don't want more results.
                if (this.usingAlternative) {
                  // just return an error, as we don't want more results.
                  return callback(Break, <Stats><any>undefined);
                }

                // symlink'd binaries on windows give us errors when it interrogates it too much.
                if (stats && stats.mode === 41398) {
                  stats.mode = stats.mode & ~8192;
                }
                return callback(error, stats);
              });
            }
          }
        })) {
          // we found something that looks promising.
          this.discoveredData = { $0: item.toString() };
          const run = this.run?.replace('$0', item.toString());

          if (run) {
            const commandline = cmdlineToArray(run);
            const result = await execute(resolve(commandline[0]), commandline.slice(1));
            if (result.code !== 0) {
              continue;
            }

            this.discoveredData = filter(this.select || '', result.log) || [];
            this.discoveredData.$0 = item.toString();
            (<DemandBlock>(this.parent)).discoveredData = this.discoveredData;

            // if we have a match expression, let's check it.
            if (this.matches && !safeEval(this.matches, this.discoveredData)) {
              continue; // not a match, move on
            }

            // it did match, or it's just presence check
            this.usingAlternative = true;
            // set the data output of the check
            // this is used later to fill in the settings.

            return this;
          }
        }
      }
    }
    return this;
  }

  override get error(): string | undefined { return this.asString(this.getMember('error')); }
  override get warning(): string | undefined { return this.asString(this.getMember('warning')); }
  override get message(): string | undefined { return this.asString(this.getMember('message')); }

  override get seeAlso(): Requires {
    return this._seeAlso;
  }

  override get requires(): Requires {
    return this._requires;
  }

  override get exports(): Exports {
    return this._exports;
  }

  override get install(): Installs {
    return this._install;
  }

}
