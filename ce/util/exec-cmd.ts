// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChildProcess, spawn, SpawnOptions } from 'child_process';

export interface ExecOptions extends SpawnOptions {
  onCreate?(cp: ChildProcess): void;
  onStdOutData?(chunk: any): void;
  onStdErrData?(chunk: any): void;
}

export interface ExecResult {
  stdout: string;
  stderr: string;

  /**
   * Union of stdout and stderr.
   */
  log: string;
  error: Error | null;
  code: number | null;
}


export function cmdlineToArray(text: string, result: Array<string> = [], matcher = /[^\s"]+|"([^"]*)"/gi, count = 0): Array<string> {
  text = text.replace(/\\"/g, '\ufffe');
  const match = matcher.exec(text);
  return match
    ? cmdlineToArray(
      text,
      result,
      matcher,
      result.push(match[1] ? match[1].replace(/\ufffe/g, '\\"') : match[0].replace(/\ufffe/g, '\\"')),
    )
    : result;
}

export function execute(command: string, cmdlineargs: Array<string>, options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const cp = spawn(command, cmdlineargs, { ...options, stdio: 'pipe' });
    if (options.onCreate) {
      options.onCreate(cp);
    }

    options.onStdOutData ? cp.stdout.on('data', options.onStdOutData) : cp;
    options.onStdErrData ? cp.stderr.on('data', options.onStdErrData) : cp;

    let err = '';
    let out = '';
    let all = '';
    cp.stderr.on('data', (chunk) => {
      err += chunk;
      all += chunk;
    });
    cp.stdout.on('data', (chunk) => {
      out += chunk;
      all += chunk;
    });

    cp.on('error', (err) => {
      reject(err);
    });

    cp.on('close', (code, signal) =>
      resolve({
        stdout: out,
        stderr: err,
        log: all,
        error: code ? new Error('Process Failed.') : null,
        code,
      }),
    );
  });
}