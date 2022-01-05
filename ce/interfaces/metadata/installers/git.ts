// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Installer } from './Installer';

/**
 * a file that can be untar/unzip/unrar/etc
 *
 * combined with Verifiable, the hash should be matched before proceeding
 */

export interface GitInstaller extends Installer {
  /** the git repo location to be cloned */
  location: string;

  /** optionally, a tag/branch to be checked out */
  commit?: string;

  /**
   * determines if the whole repo is cloned.
   *
   * Note:
   *  - when false (default), indicates that the repo should be cloned with --depth 1
   *  - when true, indicates that the full repo should be cloned
   * */
  full?: boolean;

  /**
   * determines if the repo should be cloned recursively.
   *
   * Note:
   *  - when false (default), indicates that the repo should clone recursive submodules
   *  - when true, indicates that the repo should be cloned recursively.
   */
  recurse?: boolean;

  /**
   * Gives a subdirectory to clone the repo to, if given.
   */
  subdirectory?: string;

  /**
   * determines if the thing being installed is esp-idf, and if so, it should do some other installations after
   * the git install.
   */
  espidf?: boolean;
}
