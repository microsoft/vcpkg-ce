// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChildProcess, ProcessEnvOptions, spawn, SpawnOptions } from 'child_process';

interface MoreOptions extends SpawnOptions {
  onCreate?(cp: ChildProcess): void;
  onClose?() : void;
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


/**
 * Method that wraps spawn with for ease of calling. It is wrapped with a promise that must be awaited.
 * This method creates a shell with the command passed along with arguments.
 * @param command Command for the spawn to be created with. i.e. git.exe
 * @param cmdlineargs Arguments to be passed along with the command. i.e. 'status'
 * @param options Options to be passed for what to do. These options are callbacks for various scenarios.
 * @param environmentOptions Environment options, passing environment variables for the spawn to be created with.
 * @returns
 */
export const execute_command = (
  command: string,
  cmdlineargs: Array<string>,
  options: MoreOptions = {},
  environmentOptions?: ProcessEnvOptions
): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    const cp = spawn(command, cmdlineargs, environmentOptions ? { ...options, ...environmentOptions, stdio: 'pipe' } : { ...options, stdio: 'pipe' });
    if (options.onCreate) {
      options.onCreate(cp);
    }

    options.onStdOutData ? cp.stdout.on('data', options.onStdOutData) : cp;
    options.onStdErrData ? cp.stderr.on('data', options.onStdErrData) : cp;
    options.onClose ? cp.on('close', options.onClose): cp;

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
};

/**
 * Method that wraps spawn with for ease of calling. It is wrapped with a promise that must be awaited.
 * This version calls spawn with a shell and allows for chaining of commands. In this version, commands and
 * arguments must both be given in the command string.
 * @param commands String of commands with parameters, possibly chained together with '&&' or '||'.
 * @param options Options providing callbacks for various scenarios.
 * @param environmentOptions Environment options for passing environment variables into the spawn.
 * @returns
 */
export const execute_shell = (
  command: string,
  options: MoreOptions = {},
  environmentOptions?: ProcessEnvOptions
): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    const cp = spawn(command, environmentOptions ? { ...options, ...environmentOptions, stdio: 'pipe', shell: true } : { ...options, stdio: 'pipe', shell: true });
    if (options.onCreate) {
      options.onCreate(cp);
    }

    options.onStdOutData ? cp.stdout.on('data', options.onStdOutData) : cp;
    options.onStdErrData ? cp.stderr.on('data', options.onStdErrData) : cp;
    options.onClose ? cp.on('close', options.onClose): cp;

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
};
