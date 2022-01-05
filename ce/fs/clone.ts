// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Credentials } from '../util/credentials';
import { FileEntry } from './archive';

/** The event definitions for cloners */
export interface CloneEvents {
  progress(archivePercentage: number): void;
  error(entry: Readonly<FileEntry>, message: string): void;
}


export interface CloneOptions {
  force?: boolean;
  credentials?: Credentials;
  events?: Partial<CloneEvents>
}