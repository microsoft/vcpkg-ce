// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { generate_msbuild } from '@microsoft/vcpkg-ce/dist/generators/msbuild-generator';
import { strict } from 'assert';

describe('MSBuild Generator', () => {
  it('Generates locations in order', () => {
    const locations : Array<[string, string]> = [
      ['z', 'zse&tting'],
      ['a', 'ase<tting'],
      ['c', 'csetting'],
      ['b', 'bsetting']
    ];
    const properties : Array<[string, Array<string>]> =
      [
        ['prop', ['first', 'seco>nd', 'third']]
      ];
    const expected = '<?xml version="1.0"?>\n'
      + '<Project xmlns="http://schemas.microsoft.com/developer/msbuild/2003">\n'
      + '    <PropertyGroup>\n'
      + '        <a>ase&lt;tting</a>\n'
      + '        <b>bsetting</b>\n'
      + '        <c>csetting</c>\n'
      + '        <prop>first;seco&gt;nd;third</prop>\n'
      + '        <z>zse&amp;tting</z>\n'
      + '    </PropertyGroup>\n'
      + '</Project>';
    strict.equal(generate_msbuild(locations, properties), expected);
  });
});
