#!/bin/bash
# Run in a dedicated per-user environment; never change a system Wine install.
set -euo pipefail
resources="$(cd "$(dirname "$0")" && pwd)"
support="${JOEY_HOME:-$HOME/Library/Application Support/Joey Online}"
mkdir -p "$support"
exec 3>&1
exec >>"$support/launcher.log" 2>&1
status() { printf '%s\n' "$1" >&3; printf '%s\n' "$1"; }
status 'Preparing Joey Online...'
export WINEPREFIX="$support/prefix"
export WINEARCH=win64
export WINEDLLOVERRIDES='dinput=n,b;mscoree,mshtml,winevulkan,winemenubuilder.exe='
export WINE_D3D_CONFIG='renderer=gdi'
export MVK_CONFIG_LOG_LEVEL=0
export WINEDEBUG="${JOEY_WINE_DEBUG:--all}"
# Inhibits Wine's optional HTML/.NET installers; the game needs neither.
engine="$support/runtime-11.20"
if [[ ! -f "$engine/.complete" ]]; then
  status 'Downloading the free compatibility runtime (226 MB, first launch only)...'
  stage="$(mktemp -d "$support/runtime-download.XXXXXX")"
  trap 'rm -rf -- "$stage"' EXIT
  /usr/bin/curl --fail --location --retry 3 --connect-timeout 30 --proto '=https' --proto-redir '=https' \
    'https://github.com/Gcenx/macOS_Wine_builds/releases/download/11.20/wine-devel-11.20-osx64.tar.xz' -o "$stage/wine.tar.xz"
  actual="$(/usr/bin/shasum -a 256 "$stage/wine.tar.xz" | /usr/bin/awk '{print $1}')"
  [[ "$actual" == '33bbe09ac5d867d75d6d3aef23b66d25ff81cb62c33bc3f405c138bbf7195ad7' ]] || { status 'Runtime verification failed. Please try again.'; exit 1; }
  status 'Unpacking the compatibility runtime...'
  mkdir "$stage/unpacked"
  /usr/bin/tar -xJf "$stage/wine.tar.xz" -C "$stage/unpacked"
  [[ -x "$stage/unpacked/Wine Devel.app/Contents/Resources/wine/bin/wine" ]]
  # A completed engine is never overwritten, and an incomplete one is not used.
  [[ ! -e "$engine" ]] || { status 'An incomplete runtime folder needs attention. See launcher.log.'; exit 1; }
  touch "$stage/unpacked/.complete"
  mv "$stage/unpacked" "$engine"
  rm -rf -- "$stage"
  trap - EXIT
fi
wine="$engine/Wine Devel.app/Contents/Resources/wine/bin/wine"
wineserver="$engine/Wine Devel.app/Contents/Resources/wine/bin/wineserver"
"$wine" --version
# Keep saves and Wine registry outside the .app so Finder moves/updates are safe.
game="$support/game-preview-2"
if [[ ! -f "$game/.complete" ]]; then
  status 'Preparing your game folder (first launch only)...'
  stage="$(mktemp -d "$support/game-copy.XXXXXX")"
  trap 'rm -rf -- "$stage"' EXIT
  /usr/bin/ditto "$resources/Game" "$stage/game"
  (cd "$stage/game" && /usr/bin/shasum -a 256 -c SHA256SUMS.txt)
  [[ ! -e "$game" ]] || { status 'An incomplete game folder needs attention. See launcher.log.'; exit 1; }
  touch "$stage/game/.complete"
  mv "$stage/game" "$game"
  rm -rf -- "$stage"
  trap - EXIT
fi
status 'Preparing Windows compatibility (first launch may take a minute)...'
if [[ ! -f "$support/.prefix-initialized" ]]; then
  # Prefix setup does not need a visible window. Avoid Wine's rundll32/Cocoa
  # activation loop during first-run setup, then restart with normal Mac input.
  WINEDLLOVERRIDES="$WINEDLLOVERRIDES;winemac.drv=" "$wine" wineboot -u
  "$wineserver" -k
  "$wineserver" -w
  mkdir -p "$support/Common"
  gamewin="$("$wine" winepath -w "$game" | tr -d '\r')"
  commonwin="$("$wine" winepath -w "$support/Common" | tr -d '\r')"
  "$wine" reg add 'HKLM\Software\KONAMI\Yu-Gi-Oh! Power Of Chaos' /v InstallDirJ /t REG_SZ /d "$gamewin" /f /reg:32
  "$wine" reg add 'HKLM\Software\KONAMI\Yu-Gi-Oh! Power Of Chaos' /v CommonDir /t REG_SZ /d "$commonwin" /f /reg:32
  touch "$support/.prefix-initialized"
fi
# A windowed desktop avoids forcing the Mac display to the game's old resolution.
"$wine" reg add 'HKCU\Software\Wine\Explorer\Desktops' /v JoeyOnline /t REG_SZ /d 1024x768 /f
"$wine" reg add 'HKCU\Software\Wine\Drivers' /v Audio /t REG_SZ /d coreaudio /f
cd "$game"
trap '"$wineserver" -k || true' TERM INT
if [[ "${1:-}" == '--transport-check' ]]; then
  status 'Checking public online rooms...'
  "$wine" "${2:?Transport check executable required}" 'https://joey-online-rooms.joey-online-rooms.workers.dev'
else
  status 'Starting game...'
  "$wine" explorer /desktop=JoeyOnline,1024x768 joey_pc.exe &
  child=$!
  wait "$child"
  "$wineserver" -w
fi
status 'Finished.'
