// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { delimiter } from 'path';
import { linq } from '../util/linq';
import { Uri } from '../util/uri';

export class Activation {
  defines = new Map<string, string>();
  tools = new Map<string, Uri>();
  paths = new Map<string, Array<Uri>>();
  environment = new Map<string, Array<string>>();

  get Paths(): Array<[string, string]> {
    return [...linq.entries(this.paths).select(([variable, values]) => <[string, string]>[variable, values.map(uri => uri.fsPath).join(delimiter)])];
  }

  get Variables() {
    // tools + environment
    const result = new Array<[string, string]>();

    // combine variables with spaces
    for (const [key, values] of this.environment) {
      result.push([key, values.join(' ')]);
    }

    // add tools to the list
    for (const [key, value] of this.tools) {
      result.push([key, value.fsPath]);
    }
    return result;
  }

  get Defines(): Array<[string, string]> {
    return linq.entries(this.defines).toArray();
  }
}