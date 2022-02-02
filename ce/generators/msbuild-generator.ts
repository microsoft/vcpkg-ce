// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

const XMLWriter = require('xml-writer');

export function generate_msbuild(locations: Array<[string, string]>, properties: Array<[string, Array<string>]>) : string {
  const unified = new Array<[string, string]>();
  Array.prototype.push.apply(unified, locations);
  for (const entry of properties) {
    unified.push([entry[0], entry[1].join(';')]);
  }

  unified.sort((a, b) => {
    if (a[0] < b[0]) { return -1; }
    if (b[0] < a[0]) { return 1; }
    return 0;
  });

  const xw = new XMLWriter(true);
  xw.startDocument();
  xw.startElement('Project');
  xw.writeAttribute('xmlns', 'http://schemas.microsoft.com/developer/msbuild/2003');
  xw.startElement('PropertyGroup');
  for (const entry of unified) {
    // <ItemName>ItemValue</ItemName>
    xw.writeElement(entry[0], entry[1]);
  }

  xw.endElement(); // </PropertyGroup>
  xw.endElement(); // </Project>
  return xw.toString();
}
