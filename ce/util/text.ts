// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { TextDecoder } from 'util';

const decoder = new TextDecoder('utf-8');

export function decode(input?: NodeJS.ArrayBufferView | ArrayBuffer | null | undefined) {
  return decoder.decode(input);
}
export function encode(content: string): Uint8Array {
  return Buffer.from(content, 'utf-8');
}