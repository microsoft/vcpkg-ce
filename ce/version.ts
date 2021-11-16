// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFileSync } from 'fs';

/** export a constant with the version of this library. */
export const Version: string = JSON.parse(readFileSync(`${__dirname}/../package.json`, { encoding: 'utf8' })).version;
