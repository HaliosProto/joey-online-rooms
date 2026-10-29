JOEY ONLINE FOR MAC - PREVIEW

1. Extract this ZIP and move Joey Online.app to Applications.
2. Open Joey Online.app. On Apple Silicon (M1/M2/M3/M4 and newer), allow
   Apple's Rosetta installation if macOS asks. Rosetta is free.
3. First launch downloads and verifies Wine 11.20 (226 MB) from its
   upstream release. No Homebrew, Windows license or paid app is required.
4. Open the game's two-player/LAN option and choose Online rooms. Create
   a room or join your friend. Windows friends use the existing Windows ZIP.

This app is not Apple-notarized. If macOS blocks it, follow Apple's
instructions for an app you trust: System Settings > Privacy & Security >
Open Anyway. See https://support.apple.com/en-us/102445 .
Do not disable Gatekeeper globally.

The original Windows game runs through Wine; this is a compatibility
package, not a rewrite of the game engine. A full multiplayer duel is
not yet qualified. Check the release notes for the exact Mac test results.

Your saves, isolated Windows environment and runtime are stored in:
~/Library/Application Support/Joey Online/
The .app does not modify other Wine environments or your system settings.
Keep the support folder when replacing/updating the .app to retain saves.
Startup details are in that folder's launcher.log.

The supplied game files and their notices remain included in the app's
Contents/Resources/Game folder. Multiplayer source and runtime sources:
https://github.com/HaliosProto/joey-online-rooms
https://github.com/Gcenx/macOS_Wine_builds/releases/tag/11.20
https://gitlab.winehq.org/wine/wine/-/tree/wine-11.20

Rosetta information: https://support.apple.com/en-us/102527
