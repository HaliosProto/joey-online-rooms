$ErrorActionPreference = 'Stop'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Visual Studio C++ Build Tools were not found.' }
$visualStudio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $visualStudio) { throw 'Install the Visual Studio Desktop development with C++ workload.' }
$toolVersion = (Get-Content -LiteralPath (Join-Path $visualStudio 'VC\Auxiliary\Build\Microsoft.VCToolsVersion.default.txt') -Raw).Trim()
$toolRoot = Join-Path $visualStudio "VC\Tools\MSVC\$toolVersion"
$sdkRoot = 'C:\Program Files (x86)\Windows Kits\10'
$sdkVersion = (Get-ChildItem -LiteralPath (Join-Path $sdkRoot 'Include') -Directory | Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'um\Windows.h') } | Sort-Object Name -Descending | Select-Object -First 1).Name
$compiler = Join-Path $toolRoot 'bin\Hostx64\x86\cl.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw 'The x86 Visual C++ compiler was not found. Update toolRoot in this build script for your installation.' }
$outputDirectory = Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Push-Location -LiteralPath $outputDirectory
try {
    $common = @('/nologo','/std:c++17','/O2','/EHsc','/MT','/W3','/WX','/DUNICODE','/D_UNICODE','/DWIN32_LEAN_AND_MEAN','/D_WIN32_WINNT=0x0602',
        "/I$PSScriptRoot", "/I$toolRoot\include", "/I$sdkRoot\Include\$sdkVersion\ucrt", "/I$sdkRoot\Include\$sdkVersion\shared", "/I$sdkRoot\Include\$sdkVersion\um")
    $sources = @((Join-Path $PSScriptRoot 'peer.cpp'), (Join-Path $PSScriptRoot 'transport.cpp'), (Join-Path $PSScriptRoot 'guids.cpp'))
    $libraries = @('/link', "/LIBPATH:$toolRoot\lib\x86", "/LIBPATH:$sdkRoot\Lib\$sdkVersion\um\x86", "/LIBPATH:$sdkRoot\Lib\$sdkVersion\ucrt\x86", 'kernel32.lib','user32.lib','ole32.lib','uuid.lib','winhttp.lib')
    & $compiler @common /LD @sources (Join-Path $PSScriptRoot 'proxy.cpp') @libraries "/DEF:$PSScriptRoot\proxy.def" '/OUT:dinput.dll'
    if ($LASTEXITCODE -ne 0) { throw 'Native module compilation failed.' }
    & $compiler @common @sources (Join-Path $PSScriptRoot 'harness.cpp') @libraries '/OUT:native-check.exe'
    if ($LASTEXITCODE -ne 0) { throw 'Native transport check compilation failed.' }
    Write-Output 'Built the native module and background transport check.'
} finally { Pop-Location }
