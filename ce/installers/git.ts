// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { CloneOptions, Git } from '../archivers/git';
import { Activation } from '../artifacts/activation';
import { i } from '../i18n';
import { InstallEvents, InstallOptions } from '../interfaces/events';
import { CloneSettings, GitInstaller } from '../interfaces/metadata/installers/git';
import { Session } from '../session';
import { execute_shell } from '../util/exec-cmd';
import { Uri } from '../util/uri';

export async function installGit(session: Session, activation: Activation, name: string, targetLocation: Uri, install: GitInstaller, events: Partial<InstallEvents>, options: Partial<InstallOptions & CloneOptions & CloneSettings>): Promise<void> {
  // clone the uri
  // save it to the cache
  const gitPath = activation.tools.get('git');
  if (!gitPath) {
    throw new Error(i`Git is not installed`);
  }

  const repo = session.parseUri(install.location);

  const gitTool = new Git(gitPath, activation.environmentBlock, targetLocation.join(options.subdirectory ?? ''));
  await gitTool.clone(repo, events, {
    recursive: options.recurse,
    depth: options.full ? undefined : 1,
  });

  try {
    const directoryLocation = `${targetLocation.fsPath.toString()}/${options?.subdirectory ? options?.subdirectory : ''}`;

    const command: Array<string> = [
      'git.exe', 'clone', repo.toString(), directoryLocation, '--progress'
    ];

    if (options?.full) {
      command.push('--depth=1');
    }

    if (options?.recurse) {
      command.push('--recursive');
    }

    if (options?.commit !== undefined) {
      // if the entire repo wasn't cloned, some additional steps need to be taken in order to grab the right commit
      if (options?.full !== undefined && options?.full !== true) {
        command.push(`&& git.exe -C ${directoryLocation} fetch origin`, options?.commit);
        command.push('--depth=1');
        if (options?.recurse) {
          command.push('--recurse-submodules');
        }
        command.push(`&& git -C ${directoryLocation} checkout`, options?.commit);
      }
      else {
        command.push(`&& git.exe -C ${directoryLocation} reset --hard`, options?.commit);
        if (options?.recurse !== undefined && options?.recurse === true) {
          command.push('--recurse-submodules');
        }
      }
    }

    let completion_percentage = 0;
    let last_progress_percent = 0;
    let current_progress_percent = 0;

    const regex = /\s([0-9]*?)%/;
    // command is passed through as one string, since there is a possibility of commands being chained together
    // if shell is true, the execute command will tell spawn that it should spawn with a shell, not just with a
    // command
    /**
     * Progress is tracked incrementally by checking for percentages reaching 100%.
     */
    await execute_shell(command.toString().replaceAll(',', ' '), {
      onStdErrData: (chunk: any) => {
        chunk.toString().split('\n').forEach((line: string) => {
          const match_array = line.match(regex);
          if (match_array !== null) {
            current_progress_percent = parseInt(match_array[1].toString());
            if (current_progress_percent === 100 || current_progress_percent < last_progress_percent) {
              if (completion_percentage < 45) {
                completion_percentage += 10;
              }
              else if (completion_percentage < 65) {
                completion_percentage += 5;
              }
              else if (completion_percentage < 90) {
                completion_percentage += 3;
              }
              events?.progress?.(completion_percentage);
            }
            last_progress_percent = current_progress_percent;
          }
        });
      }
    });
  } catch (err) {
    throw new Error('Failure to run git');
  }
}

/*
export async function installGit(session: Session, activation: Activation, artifact: InstallArtifactInfo, install: GitInstaller, options: { events?: Partial<CloneEvents & AcquireEvents> }): Promise<void> {
  // at this point, we have all we need to pass to some kind of git api
  // url
  // commit id (if passed)
  // options of recursive espidf, full
  options.events?.progress?.(0);

  await git(
    session,
    activation,
    session.parseUri(install.location),
    artifact.targetLocation, {
    events: options.events,
    commit: install.commit,
    recurse: install.recurse,
    full: install.full,
    subdirectory: install.subdirectory
  }
  );
  options.events?.progress?.(100);
}
*/
