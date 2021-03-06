# Configure Environment: vcpkg-ce 

## Important Notes  

This tool is currently in 'preview' -- there will most certainly be changes between now
and when the tool is 'released' based on feedback. 

You can use it, but be forewarned that we may change formats, commands, etc. 

## Summary

The `ce` tool is a cross-platform developer environment configuration utility. 

Think of it as a manifest-driven desired state configuration for C/C++ projects. 

It 
 - integrates itself into your shell (PowerShell, CMD, bash/zsh)
 - can restore artifacts according to a manifest that follows one’s code 
 - provides discoverability interfaces


## Security Considerations

The `ce` tool is an automation convenience, and we're working towards a solid solution that can be used to control the developer supply chain.

Consequently, it currently only supports downloading from `HTTPS`. All artifacts must have `SHA256` hashes that are checked for assurance that the files downloaded are correct.


## Installation

While the usage of `ce` is the same on all platforms, the installation/loading/removal is slightly different depending on the platform you're using.

`ce` doesn't persist any changes to the environment, nor does it automatically add itself to the start-up environment. If you wish to make it load in a window, you can just execute the script. Manually adding that in your profile will load it in every new window.

<hr>

### Install/Use/Remove

| OS              | Install                                             | Use                   | Remove                          |
|-----------------|-----------------------------------------------------|-----------------------|---------------------------------|
| **PowerShell/Pwsh** |`iex (iwr -useb aka.ms/install-ce.ps1)`              |` . ~/.ce/ce`          | `rmdir -recurse ~/.ce`          |
| **Linux/OSX**       |`. <(curl aka.ms/install-ce.sh -L)`                  |` . ~/.ce/ce`          | `rm -rf ~/.ce`                  |
| **CMD Shell**       |`curl -LO aka.ms/install-ce.cmd && .\install-ce.cmd` |`%USERPROFILE%\.ce\ce` | `rmdir /s /q %USERPROFILE%\.ce` |
| using node 14.17.0+/NPM | `npm install -g https://aka.ms/vcpkg-ce.tgz` | _same as above per platform_ | _same as above per platform_ | 

<hr>

## Usage

### Synopsis

``` bash
  ce COMMAND <arguments> [--switches]
```

### Available ce commands:

| command | summary | 
|---------|---------|
|  `help`       | get help on ce or one of the commands |
|  `find`       | find artifacts in the repository |
|  `list`       | lists the artifacts |
|  `add`        | adds an artifact to the project |
|  `acquire`    | acquire artifacts in the repository |
|  `use`        | instantly activates an artifact outside of the project |
|  `remove`     | emoves an artifact from a project |
|  `delete`     | deletes an artifact from the artifact folder |
|  `activate`   | activates the tools required for a project |
|  `deactivate` | deactivates the current session |
|  `new`        | creates a new project file |
|  `regenerate` | regenerate the index for a repository |
|  `update`     | update the repository from the remote |
|  `version`    | manage the version of ce |
|  `cache`      | manages the download cache |
|  `clean`      | cleans up |

Use `ce <command> --help` to get detailed usage instructions.

## Glossary

| Term       | Description                                         |
|------------|-----------------------------------------------------|
| `artifact` | An archive (.zip or .tar.gz-like), package (.nupkg, .vsix) binary inside which build tools or components thereof are stored. |
| `artifact metadata` | A description of the locations one or more artifacts describing rules for which ones are deployed given selection of a host architecture, target architecture, or other properties|
| `artifact identity` | A short string that uniquely describes a moniker that a given artifact (and its metadata) can be referenced by. They can have one of the following forms:<br> `full/identity/path` - the full identity of an artifact that is in the built-in artifact source<br>`sourcename:full/identity/path` - the full identity of an artifact that is in the artifact source specified by the sourcename prefix<br>`shortname` - the shortened unique name of an artifact that is in the built-in artifact source<br>`sourcename:shortname` - the shortened unique name of an artifact that is in the artifact source specified by the sourcename prefix<br>Shortened names are generated based off the shortest unique identity path in the given source. |
| `artifact source` | Also known as a “feed”. An Artifact Source is a location that hosts metadata to locate artifacts. (_There is only one source currently_) |
| `project profile` | The per-project configuration file (`environment.yaml` or `environment.json`) 
| `AMF`&nbsp;or&nbsp;`Metadata`&nbsp;`Format` | The schema / format of the YAML/JSON files for project profiles, global settings, and artifacts metadata. |
| `activation` | The process by which a particular set of artifacts are acquired and enabled for use in a calling command program.|
| `versions` | Version numbers are specified using the Semver format. If a version for a particular operation isn't specified, a range for the latest version ( `*` ) is assumed. A version or version range can be specified using the npm semver matching syntax. When a version is stored, it can be stored using the version range specified, a space and then the version found. (ie, the first version is what was asked for, the second is what was installed. No need for a separate lock file.) |

## Trademarks

This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft 
trademarks or logos is subject to and must follow 
[Microsoft's Trademark & Brand Guidelines](https://www.microsoft.com/en-us/legal/intellectualproperty/trademarks/usage/general).
Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship.
Any use of third-party trademarks or logos are subject to those third-party's policies.
