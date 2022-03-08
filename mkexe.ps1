
# prereq: build binary image for x86 windows
  # windows x86
  # must use patched pkg-fetch
  # must have nasm installed and git (and add git\bin to path)
  # in  node_modules\pkg\node_modules\pkg-fetch\lib-es5\build.js  comment out if block on line 252 : //if (system_1.hostArch !== targetArch && ... 


  # start with VC cross tools for x86
  # run powershell
  # mkdir c:\projects\pkg-x86
  # cd c:\projects\pkg-x86
  # mkdir dist
  # 
  # $env:path="$env:path;$(resolve-path ~\AppData\Local\bin\NASM\);c:\program files\git\usr\bin"
  # pkg-fetch --node-range node16 --arch x86 --output dist
  # copy dist\node-v16.13.2-win-x86 ~/.pkg-cache/v3.2/built-v16.13.2-win-x86
  # copy dist\node-v16.13.2-win-x86.sha256sum ~/.pkg-cache/v3.2/built-v16.13.2-win-x86.sha256sum

# make sure you `npm install -g pkg` first


function rimraf { 
  write-host removing $args[0]
  remove-item -ea 0 -recurse $args 
} 

function resolve([string]$name) {
  $name = Resolve-Path $name -ErrorAction 0 -ErrorVariable _err
  if (-not($name)) { return $_err[0].TargetObject }
  $Error.clear()
  return $name
}

function recursive-copy ($src, $dest) {
    mkdir -ea 0 "$dest" | out-null
    robocopy /E /R:1 /W:1 "$src" "$dest"  | out-null
}


if( -not (get-command -ea 0 pkg)) {
  write-error "Install node package 'pkg' first"
  exit 1
}

$env:PKG_CACHE_PATH=(resolve-path "$PSScriptRoot\node-pkg-files\")
$deploy = (resolve "$PSScriptRoot/common/deploy")
$pkgs = (resolve "$deploy/common/temp/node_modules/.pnpm")
$layout = (resolve "$PSScriptRoot/layout")
$modules = (resolve "$layout/node_modules")
$binaries = (resolve "$PSScriptRoot/binaries")

# Clean out layout directory
if( test-path "$layout" ) {
    write-host "Cleaning layout folder"
    rimraf "$layout"
}
mkdir -ea 0 "$modules" | out-null

if( test-path "$binaries" ) {
    write-host "Cleaning binaries folder"
    rimraf "$binaries"
}
mkdir -ea 0 $binaries | out-null


# build deployment folder
pushd $psscriptroot
  rimraf $deploy
  rush set-versions
  node -e "const c = require('./ce/package.json'); p = require('./assets/package.json') ; p.version = c.version; require('fs').writeFileSync('./assets/package.json', JSON.stringify(p,undefined,2)); console.log(``set asset version to `${p.version}``);"

  write-host -fore cyan -nonewline "[1] "; write-host -fore green "Building Deployment"
  rush rebuild 
  rush deploy --overwrite

  rush reset-versions
  git checkout ./assets/package.json
popd

$special = @(
    "chalk@4.1.2"
    "chalk@5.0.0"
    "form-data@3.0.1"
    "form-data@4.0.0"
    "glob-parent@5.1.2"
    "glob-parent@6.0.2"
    "mimic-response@1.0.1"
    "mimic-response@3.1.0"
    "semver@7.3.5"
    "semver@5.7.1"
    "tslib@1.14.1"
    "tslib@2.3.1"
)

# first, ce itself
recursive-copy "$deploy/ce" "$layout/ce/"

# and our custom ones
recursive-copy "$deploy/custom" "$modules/" 

# our scripts
mkdir -ea 0 "$layout/scripts" | out-null
copy-item "$deploy/scripts/ce" "$layout/scripts/ce" 
copy-item "$deploy/scripts/ce" "$layout/scripts/ce.sh" 
copy-item "$deploy/scripts/ce.ps1" "$layout/scripts/ce.ps1" 
copy-item "$deploy/scripts/ce.ps1" "$layout/scripts/ce.cmd"

# text files
copy "$deploy/*.txt" "$layout/"

# package file 
copy "$deploy/package.json" "$layout/package.json"

# simple ones
(get-childitem "$pkgs/*@*") |% { 
    $full = $_.FullName;
    $name = $_.name 

    # easy cases first
    if( $special.indexOf($name) -eq -1) {
      write-host "Copying module $name"
      recursive-copy "$full/node_modules" "$modules"  
    }        
}

# special cases
# chalk
recursive-copy (resolve "$pkgs/chalk@4.1.2/node_modules") (resolve "$modules/") 
recursive-copy (resolve "$pkgs/chalk@5.0.0/node_modules") (resolve  "$modules/marked-terminal/node_modules/") 

#form-data
# recursive-copy "$pkgs/form-data@3.0.1/node_modules" "$modules/" | out-null
recursive-copy (resolve "$pkgs/form-data@4.0.0/node_modules") (resolve  "$modules/") 

# glob-parent
recursive-copy (resolve "$pkgs/glob-parent@6.0.2/node_modules") (resolve  "$modules/") 
recursive-copy (resolve "$pkgs/glob-parent@5.1.2/node_modules") (resolve  "$modules/"fast-glob/node_modules/) 

#mimic-response
recursive-copy (resolve "$pkgs/mimic-response@3.1.0/node_modules") (resolve  "$modules/"decompress-response/node_modules/) 
recursive-copy (resolve "$pkgs/mimic-response@1.0.1/node_modules") (resolve  "$modules/"clone-response/node_modules/) 

#semver
recursive-copy (resolve "$pkgs/semver@7.3.5/node_modules") (resolve  "$modules/ce/node_modules/") 
recursive-copy (resolve "$pkgs/semver@5.7.1/node_modules") (resolve  "$modules/") 

#tslib
recursive-copy (resolve "$pkgs/tslib@2.3.1/node_modules") (resolve  "$modules/") 

# trim useless stuff
rimraf (resolve "$layout/node_modules/@snyk/nuget-semver/test")
rimraf (resolve "$layout/node_modules/ansicolors/test")
rimraf (resolve "$layout/node_modules/async-hook-jl/test")
rimraf (resolve "$layout/node_modules/async-listener/test")
rimraf (resolve "$layout/node_modules/cardinal/test")
rimraf (resolve "$layout/node_modules/continuation-local-storage/test")
rimraf (resolve "$layout/node_modules/emitter-listener/test")
rimraf (resolve "$layout/node_modules/fastq/test")
rimraf (resolve "$layout/node_modules/json-buffer/test")
rimraf (resolve "$layout/node_modules/keyv/test")
rimraf (resolve "$layout/node_modules/node-emoji/test")
rimraf (resolve "$layout/node_modules/redeyed/test")
rimraf (resolve "$layout/node_modules/shimmer/test")
rimraf (resolve "$layout/node_modules/stack-chain/test")
rimraf (resolve "$layout/node_modules/through/test")
rimraf (resolve "$layout/node_modules/@snyk/nuget-semver/.github")
rimraf (resolve "$layout/node_modules/fastq/.github")
rimraf (resolve "$layout/node_modules/node-emoji/.github")
rimraf (resolve "$layout/node_modules/unbzip2-stream/dist")
rimraf (resolve "$layout/node_modules/fast-xml-parser/src/cli")
rimraf (resolve "$layout/node_modules/redeyed/examples")
rimraf (resolve "$layout/node_modules/asynckit/bench.js")
rimraf (resolve "$layout/node_modules/fastq/bench.js")
rimraf (resolve "$layout/node_modules/reusify/test.js")
rimraf (resolve "$layout/node_modules/esprima/bin")
rimraf (resolve "$layout/node_modules/psl/dist")
rimraf (resolve "$layout/node_modules/stack-chain\benchmark.js")
rimraf (resolve "$layout/node_modules/marked-terminal/node_modules/chalk/source")

# remove d.ts files from distribution
write-host removing d.ts files
get-childitem -recurse $layout |? { ($_.name).endsWith('d.ts') } |% { $_.fullname } | remove-item

write-host "Creating binaries"
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-win-x64 --output $binaries/windows-x64/vcpkg-ce.exe $layout &
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-win-x86 --output $binaries/windows-x86/vcpkg-ce.exe $layout &
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-win-arm64 --output $binaries/windows-arm64/vcpkg-ce.exe $layout & 
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-alpine-x64 --output $binaries/alpine-x64/vcpkg-ce $layout & 
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-alpine-arm64 --output $binaries/alpine-arm64/vcpkg-ce $layout & 
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-macos-x64 --output $binaries/macos-x64/vcpkg-ce $layout & 
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-macos-arm64 --output $binaries/macos-arm64/vcpkg-ce $layout &
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-linux-x64 --output $binaries/linux-x64/vcpkg-ce $layout  & 
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-linux-arm64 --output $binaries/linux-arm64/vcpkg-ce $layout  &
pkg --no-bytecode --public-packages "*" --compress GZip -t node16-linuxstatic-armv7 --output $binaries/linux-static-arm7/vcpkg-ce $layout &

get-job | wait-job | receive-job | out-null
write-host Binaries created: 
(get-childitem -recurse -File  $binaries) |% { write-host -fore  green "  $($_.fullname) : $($_.length) bytes" }