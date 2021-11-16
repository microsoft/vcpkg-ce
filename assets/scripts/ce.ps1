@(echo off) > $null
if #ftw NEQ '' goto :init
($true){ $Error.clear(); }

# Copyright (c) Microsoft Corporation.
# Licensed under the MIT License.

# wrapper script for ce.
# this is intended to be dot-sourced and then you can use the ce() function

# unpack arguments if they came from CMD
$hash=@{};
get-item env:argz* |% { $hash[$_.name] = $_.value }
if ($hash.count -gt 0) {
  $args=for ($i=0; $i -lt $hash.count;$i++) { $hash["ARGZ[$i]"] }
}
# force the array to be an arraylist since we like to mutate it.
$args=[System.Collections.ArrayList][System.Array]$args

# GLOBALS
$VCPKG_NODE_LATEST='16.12.0'
$VCPKG_NODE_REMOTE='https://nodejs.org/dist/'
$VCPKG_START_TIME=get-date

function eval($item) {
  if( $item -is [ScriptBlock] ) { return & $item }
  return $item
}

function Invoke-Assignment {
  if( $args ) {
    # ternary
    if ($p = [array]::IndexOf($args,'?' )+1) {
      if (eval($args[0])) { return eval($args[$p]) }  # ternary true
      return eval($args[([array]::IndexOf($args,':',$p))+1])  # ternary false
    }

    # null-coalescing
    if ($p = ([array]::IndexOf($args,'??',$p)+1)) {
      if ($result = eval($args[0])) { return $result }  # first arg true
      return eval($args[$p]) # first arg false
    }

    # neither ternary or null-coalescing, just a value
    return eval($args[0])
  }
  return $null
}

# alias the function to the equals sign (which doesn't impede the normal use of = )
set-alias = Invoke-Assignment

function resolve([string]$name) {
  $name = Resolve-Path $name -ErrorAction 0 -ErrorVariable _err
  if (-not($name)) { return $_err[0].TargetObject }
  $Error.clear()
  return $name
}

$SCRIPT:DEBUG=( $args.indexOf('--debug') -gt -1 )

function ce-debug() {
  $t = [int32]((get-date).Subtract(($VCPKG_START_TIME)).ticks/10000)
  if($SCRIPT:DEBUG) {
    write-host -fore green "[$t msec] " -nonewline
    write-host -fore gray $args
  }
  write-output "[$t msec] $args" >> $VCPKG_ROOT/log.txt
}

function download($url, $path) {
  $wc = New-Object net.webclient

  if( test-path -ea 0 $path) {
    # check to see if the size is a match before downloading
    $s = $wc.OpenRead($url)
    $len = $wc.ResponseHeaders['Content-Length']
    $s.Dispose()
    if( (get-item $path).Length -eq $len ){
      $wc.Dispose();
      ce-debug "skipping download of '$url' - '$path' is ok."
      return $path;
    }
  }
  ce-debug "Downloading '$url' -> '$path'"
  $wc.DownloadFile($url, $path);
  $wc.Dispose();
  if( (get-item $path).Length -ne $wc.ResponseHeaders['Content-Length'] ) {
    throw "Download of '$url' failed.  Check your internet connection."
  }
  ce-debug "Completed Download of $url"
  return $path
}

# set the home path.
if( $ENV:VCPKG_ROOT ) {
  $SCRIPT:VCPKG_ROOT=(resolve $ENV:VCPKG_ROOT)
  $ENV:VCPKG_ROOT=$VCPKG_ROOT
} else {
  $SCRIPT:VCPKG_ROOT=(resolve "$HOME/.vcpkg")
  $ENV:VCPKG_ROOT=$VCPKG_ROOT
}

$CE = "${VCPKG_ROOT}/CE"
$MODULES= "$CE/node_modules"
$SCRIPT:VCPKG_SCRIPT=(resolve $MODULES/.bin/ce.ps1)
$SCRIPT:CE_MODULE=(resolve $MODULES/vcpkg-ce )

$reset = $args.IndexOf('--reset-ce') -gt -1
$remove = $args.IndexOf('--remove-ce') -gt -1

if( $reset -or -$remove ) {
  $args.remove('--reset-ce');
  $args.remove('--remove-ce');

  if( $reset ) {
    write-host "Resetting vcpkg-ce"
  }

  remove-item -recurse -force -ea 0 "$MODULES/.bin","$MODULES"
  remove-item -force -ea 0 "${VCPKG_ROOT}/ce.ps1","${VCPKG_ROOT}/ce.cmd","${VCPKG_ROOT}/ce","${VCPKG_ROOT}/NOTICE.txt","${VCPKG_ROOT}/LICENSE.txt"
  $error.clear();

  if( $remove ) {
    write-host "Removing vcpkg-ce"
    exit
  }
}

function verify-node($NODE) {
  if( $NODE -and (get-command -ea 0 $NODE) -and ( (& $NODE -p "/(^\d*\.\d*)/g.exec( process.versions.node)[0]") -ge 16.12 ) ) {
    # it's a good version of node, let's set the variables
    $SCRIPT:VCPKG_NODE=$NODE
    $error.clear();
    return $TRUE;
  }
  $error.clear();
  return $FALSE
}

function bootstrap-node {
  # if we have a custom ce node let's use that first
  if( (verify-node (resolve "$CE/bin/node"))) {
    ce-debug "Node: ${VCPKG_NODE}"
    return $TRUE;
  }

  # check the node on the path.
  if( (verify-node ((get-command node -ea 0).source ))) {
    ce-debug "Node: ${VCPKG_NODE}"
    return $TRUE;
  }

  # not there, or not good enough
  if((($PSVersionTable.OS -match "windows") -or ($PSVersionTable.PSEdition -match 'desktop') ) ) {   # windows
    $NODE_OS='win'
    switch($ENV:PROCESSOR_ARCHITECTURE) {
      'AMD64' { $NODE_ARCH='x64' }
      'ARM64' { $NODE_ARCH='arm64' }
      Default { $NODE_ARCH='x86' }
    }
    $NODE_ARCHIVE_EXT=".zip"
  } else {
    $NODE_OS=(uname | sed 'y/ABCDEFGHIJKLMNOPQRSTUVWXYZ/abcdefghijklmnopqrstuvwxyz/')
    $NODE_ARCH=(uname -m | sed -e 's/x86_64/x64/;s/i86pc/x64/;s/i686/x86/;s/aarch64/arm64/')
    if ( $NODE_OS -eq "aix" ) { $NODE_ARCH="ppc64" } #aix special
    $NODE_ARCHIVE_EXT=".tar.gz"
  }

  $NODE_FULLNAME="node-v${VCPKG_NODE_LATEST}-${NODE_OS}-${NODE_ARCH}"
  $NODE_URI="${VCPKG_NODE_REMOTE}v${VCPKG_NODE_LATEST}/${NODE_FULLNAME}${NODE_ARCHIVE_EXT}"
  $NODE_ARCHIVE= resolve "$CE/files/${NODE_FULLNAME}${NODE_ARCHIVE_EXT}"

  $ProgressPreference = 'SilentlyContinue'
  ce-debug "Downloading Node: ${NODE_URI}"
  download $NODE_URI $NODE_ARCHIVE

  switch($NODE_OS){
    'win' {
      if( get-command -ea 0 tar.exe ) {
        tar "-xvf" "${NODE_ARCHIVE}" -C "${CE}"  2>&1  > $null
      } else {
        $shh= expand-archive -path $NODE_ARCHIVE -destinationpath "${CE}"
      }
      move-item "$CE/${NODE_FULLNAME}" "$CE/bin"
    }
    'aix' {
      $shh = gunzip "${NODE_ARCHIVE}" | tar -xvC "${CE}" "${NODE_FULLNAME}/bin/${NODE_EXE}"
      move-item "$CE/${NODE_FULLNAME}/bin" "$CE/"
      move-item "$CE/${NODE_FULLNAME}/lib" "$CE/"
      remove-item "$CE/${NODE_FULLNAME}" -force -recurse
    }
    default {
      $shh = tar "-zxvf" "${NODE_ARCHIVE}" -C "${CE}"
      move-item "$CE/${NODE_FULLNAME}/bin" "$CE/"
      move-item "$CE/${NODE_FULLNAME}/lib" "$CE/"
      remove-item "$CE/${NODE_FULLNAME}" -force -recurse
    }
  }

  if( (verify-node (resolve "$CE/bin/node"))) {
    ce-debug "Node: ${VCPKG_NODE}"
    return $TRUE;
  }

  write-error 'Unable to resolve nodejs'
  return $FALSE;
}

function bootstrap-vcpkg-ce {
  if( test-path $VCPKG_SCRIPT ) {
    return $TRUE;
  }

  ## if we're running from an installed module location, we'll keep that.
  $MODULE=(resolve ${PSScriptRoot}/CE/node_modules/vcpkg-ce )

  if( test-path $MODULE ) {
    $SCRIPT:CE_MODULE=$MODULE
    return $TRUE
  }

  # cleanup the yarn cache.
  ce-debug "Clearing YARN cache"
  $shh = & $VCPKG_NODE $YARN cache clean --force 2>&1
  $error.clear();

  write-host "Installing vcpkg-ce to ${VCPKG_ROOT}"

  $PKG == $USE_LOCAL_VCPKG_PKG ?? https://aka.ms/vcpkg-ce.tgz
  pushd $CE

  $PATH = $ENV:PATH
  $ENV:PATH="$CE\bin\;$PATH"
  # &$VCPKG_NODE $NPM install $PKG --no-lockfile --force --verbose 2>&1 >> $VCPKG_ROOT/log.txt
  &$VCPKG_NODE $YARN add $PKG --no-lockfile --force --scripts-prepend-node-path=true --modules-folder=$MODULES 2>&1 >> $VCPKG_ROOT/log.txt
  $ENV:PATH = $PATH

  remove-item -path $ce/package.json -ea 0

  popd
  # 2>&1 >> $VCPKG_ROOT/log.txt
  ce-debug 'yarn finished.'
  if( $error.count -gt 0 ) {
    $error |% { add-content -encoding UTF8 $VCPKG_ROOT/log.txt $_ }
    $Error.clear()
  }

  # we should also copy the .bin files into the $VCPKG_ROOT folder to make reactivation (without being on the PATH) easy
  copy-item "$MODULES/.bin/ce.*" $VCPKG_ROOT

  # Copy the NOTICE and LICENSE files to $VCPKG_ROOT to improve discoverability.
  copy-item "$CE_MODULE/NOTICE.txt","$CE_MODULE/LICENSE.txt" $VCPKG_ROOT

  ce-debug "Bootstrapped vcpkg-ce: ${VCPKG_ROOT}"

  if( -not (test-path $CE_MODULE )) {
    write-error "ERROR! Unable to find/get vcpkg-ce module $CE_MODULE"
    return $false;
  }
  return $true;
}

# ensure it's there.
$shh = new-item -type directory $CE,$MODULES,"$CE/files" -ea 0

# grab the yarn cli script
$SCRIPT:YARN = resolve "$CE/files/yarn.js"
if( -not (test-path $SCRIPT:YARN )) {
  $SCRIPT:YARN = download https://aka.ms/yarn.js $YARN
}

if( -not (bootstrap-node )) {
  write-error "Unable to acquire an appropriate version of Node."
  write-error "You should install the LTS version or greater of NodeJS"
  throw "Installation Unsuccessful."
}

if( -not (bootstrap-vcpkg-ce )) {
  write-error "Unable to install vcpkg-ce."
  throw "Installation Unsuccessful."
}

# export vcpkg-ce to the current shell.
$shh = New-Module -name vcpkg-ce -ArgumentList @($VCPKG_NODE,$CE_MODULE,$VCPKG_ROOT) -ScriptBlock {
  param($VCPKG_NODE,$CE_MODULE,$VCPKG_ROOT)

  function resolve([string]$name) {
    $name = Resolve-Path $name -ErrorAction 0 -ErrorVariable _err
    if (-not($name)) { return $_err[0].TargetObject }
    $Error.clear()
    return $name
  }

  function ce() {
    if( ($args.indexOf('--remove-ce') -gt -1) -or ($args.indexOf('--reset-ce') -gt -1)) {
      # we really want to do call the ps1 script to do this.
      if( test-path "${VCPKG_ROOT}/ce.ps1" ) {
        & "${VCPKG_ROOT}/ce.ps1" @args
      }
      return
    }

    if( -not (test-path $CE_MODULE )) {
      write-error "vcpkg-ce is not installed."
      write-host -nonewline "You can reinstall vcpkg-ce by running "
      write-host -fore green "iex (iwr -useb aka.ms/install-ce.ps1)"
      return
    }

    # setup the postscript file
    # Generate 31 bits of randomness, to avoid clashing with concurrent executions.
    $env:Z_VCPKG_POSTSCRIPT = resolve "${VCPKG_ROOT}/VCPKG_tmp_$(Get-Random -SetSeed $PID).ps1"

    & $VCPKG_NODE --harmony $CE_MODULE @args

    # dot-source the postscript file to modify the environment
    if ($env:Z_VCPKG_POSTSCRIPT -and (Test-Path $env:Z_VCPKG_POSTSCRIPT)) {
      # write-host (get-content -raw $env:Z_VCPKG_POSTSCRIPT)
      $postscr = get-content -raw $env:Z_VCPKG_POSTSCRIPT
      if( $postscr ) {
        iex $postscr
      }
      Remove-Item -Force -ea 0 $env:Z_VCPKG_POSTSCRIPT,env:Z_VCPKG_POSTSCRIPT
    }
  }
}

# finally, if this was run with some arguments, then let's just pass it
if( $args.length -gt 0 ) {
  ce @args
}

return
<#
:set
set ARGZ[%i%]=%1&set /a i+=1 & goto :eof

:unset
set %1=& goto :eof

:init
if exist $null erase $null

:: do anything we need to before calling into powershell
if exist $null erase $null

IF "%VCPKG_ROOT%"=="" SET VCPKG_ROOT=%USERPROFILE%\.vcpkg

if exist %~dp0ce\node_modules\vcpkg-ce\package.json (
  :: we're running the wrapper script for a module-installed vcpkg-ce
  set VCPKG_CMD=%~dpf0
  set VCPKG_MODULE=%~dp0ce\node_modules\vcpkg-ce
  goto INVOKE
)

:: we're running vcpkg-ce from the ce home folder
set VCPKG_CMD=%VCPKG_ROOT%\ce\node_modules\vcpkg-ce\ce.cmd

:: if we're being asked to reset the install, call bootstrap
if "%1" EQU "--reset-ce" goto BOOTSTRAP

:: if we're being asked to remove the install, call bootstrap
if "%1" EQU "--remove-ce" (
  set REMOVE_CE=TRUE
  doskey ce=
  goto BOOTSTRAP
)

:: do we even have it installed?
if NOT exist "%VCPKG_CMD%" goto BOOTSTRAP

set VCPKG_MODULE="%VCPKG_ROOT%\ce\node_modules\vcpkg-ce"

:: if this is the actual installed vcpkg-ce, let's get to the invocation
if "%~dfp0" == "%VCPKG_CMD%" goto INVOKE

:: this is not the 'right' ce cmd, let's forward this on to that one.
call %VCPKG_CMD% %*
set VCPKG_EXITCODE=%ERRORLEVEL%
goto :eof

:INVOKE
:: Generate 30 bits of randomness, to avoid clashing with concurrent executions.
SET /A Z_VCPKG_POSTSCRIPT=%RANDOM% * 32768 + %RANDOM%
SET Z_VCPKG_POSTSCRIPT=%VCPKG_ROOT%\VCPKG_tmp_%Z_VCPKG_POSTSCRIPT%.cmd

:: find the right node
if exist %VCPKG_ROOT%\ce\bin\node.exe set VCPKG_NODE=%VCPKG_ROOT%\ce\bin\node.exe
if "%VCPKG_NODE%" EQU "" (
  for %%i in (node.exe) do set VCPKG_NODE=%%~$PATH:i
)
if "%VCPKG_NODE%" EQU "" goto OHNONONODE:

:: call the program
"%VCPKG_NODE%" --harmony "%VCPKG_MODULE%" %*
set VCPKG_EXITCODE=%ERRORLEVEL%
doskey ce="%VCPKG_CMD%" $*

:POSTSCRIPT
:: Call the post-invocation script if it is present, then delete it.
:: This allows the invocation to potentially modify the caller's environment (e.g. PATH).
IF NOT EXIST "%Z_VCPKG_POSTSCRIPT%" GOTO :fin
CALL "%Z_VCPKG_POSTSCRIPT%"
DEL "%Z_VCPKG_POSTSCRIPT%"

goto :fin

:OHNONONODE
set VCPKG_EXITCODE=1
echo "Unable to find the nodejs for ce to run."
goto fin:

:BOOTSTRAP
:: add the cmdline args to the environment so powershell can use them
set /a i=0 & for %%a in (%*) do call :set %%a

set POWERSHELL_EXE=
for %%i in (pwsh.exe powershell.exe) do (
  if EXIST "%%~$PATH:i" set POWERSHELL_EXE=%%~$PATH:i & goto :gotpwsh
)
:gotpwsh

"%POWERSHELL_EXE%" -noprofile -executionpolicy unrestricted -command "iex (get-content %~dfp0 -raw)#" &&  set REMOVE_CE=
set VCPKG_EXITCODE=%ERRORLEVEL%

:: clear out the argz
@for /f "delims==" %%_ in ('set ^|  findstr -i argz') do call :unset %%_

:: if we're being asked to remove it,we're done.
if "%REMOVE_CE%" EQU "TRUE" (
  goto :fin
)

:CREATEALIAS
doskey ce="%VCPKG_ROOT%\ce.cmd" $*

:fin
SET Z_VCPKG_POSTSCRIPT=
SET VCPKG_CMD=
set VCPKG_NODE=

EXIT /B %VCPKG_EXITCODE%
goto :eof
#>
