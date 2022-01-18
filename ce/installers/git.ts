// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { CloneOptions, Git } from '../archivers/git';
import { Activation } from '../artifacts/activation';
import { i } from '../i18n';
import { InstallEvents, InstallOptions } from '../interfaces/events';
import { CloneSettings, GitInstaller } from '../interfaces/metadata/installers/git';
import { Session } from '../session';
import { Uri } from '../util/uri';

export async function installGit(session: Session, activation: Activation, name: string, targetLocation: Uri, install: GitInstaller, events: Partial<InstallEvents>, options: Partial<InstallOptions & CloneOptions & CloneSettings>): Promise<void> {
  // clone the uri
  // save it to the cache
  const gitPath = activation.tools.get('git');
  if (!gitPath) {
    throw new Error(i`Git is not installed`);
  }

  const repo = session.parseUri(install.location);
  const targetDirectory = targetLocation.join(options.subdirectory ?? '');

  const gitTool = new Git(gitPath, activation.environmentBlock, targetDirectory);

  await gitTool.clone(repo, events, {
    recursive: options.recurse,
    depth: options.full ? undefined : 1,
  });

  if (options.commit) {
    if (options.full) {
      await gitTool.reset(events, {
        recursive: options.recurse,
        hard: true
      });
    }
    else {
      await gitTool.fetch('origin', events, {
        commit: options.commit,
        recursive: options.recurse,
        depth: options.full ? undefined : 1
      });
      await gitTool.checkout(events, {
        commit: options.commit
      });
    }
  }
}
