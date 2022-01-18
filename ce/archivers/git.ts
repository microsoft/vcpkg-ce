// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { InstallEvents } from '../interfaces/events';
import { Credentials } from '../util/credentials';
import { execute } from '../util/exec-cmd';
import { Uri } from '../util/uri';

export interface CloneOptions {
  force?: boolean;
  credentials?: Credentials;
}

/** @internal */
export class Git {
  #toolPath: string;
  #targetFolder: string;
  #environment: NodeJS.ProcessEnv;

  constructor(toolPath: string, environment: NodeJS.ProcessEnv, targetFolder: Uri) {
    this.#toolPath = toolPath;
    this.#targetFolder = targetFolder.fsPath;
    this.#environment = environment;
  }

  async clone(repo: Uri, events: Partial<InstallEvents>, options: { recursive?: boolean, depth?: number } = {}) {
    const remote = await repo.isFile() ? repo.fsPath : repo.toString();

    const result = await execute(this.#toolPath, [
      'clone',
      remote,
      this.#targetFolder,
      options.recursive ? '--recursive' : '',
      options.depth ? `--depth ${options.depth}` : '',
      '--progress'
    ], {
      env: this.#environment,
      onStdErrData: (chunk) => {
        // generate progress events
        const regex = /\s([0-9]*?)%/;
        chunk.toString().split('\n').forEach((line: string) => {
          const match_array = line.match(regex);
          if (match_array !== null) {
            events.heartbeat?.(line);
          }
        });
      }
    });

    if (result.code) {
      return false;
    }

    return true;
  }

  async fetch() {
    //todo
  }

  async checkout() {
    //todo
  }

  async reset() {
    //todo
  }
}
