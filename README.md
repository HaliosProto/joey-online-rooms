# Joey Online Rooms

An in-game multiplayer companion for Yu-Gi-Oh! Power of Chaos: Joey the Passion, with a shared public room directory and an HTTPS/WebSocket relay on Cloudflare Workers Free.

## Status

This is a pre-release implementation. The backend passes local packet and live-service tests. The native x86 module compiles with warnings treated as errors. Cloud-based native integration tests are being established. A production cloud deployment and a complete duel in the original game have not yet been verified. Do not treat this as a finished, playable release.

## Intended player experience

Launch the original game, open its two-player multiplayer screen, and choose **Online rooms** as the connection provider. Create a room or select another player's room from the game's existing list. Each duel is one against one. Players need the same companion module and cloud endpoint; they do not need GameRanger, a VPN, a separate account for the lobby, or router port forwarding.

The module integrates at the game's DirectPlay 8 interface and relays opaque duel payloads. It does not replace the game rules, unlock cards, or provide anti-cheat. The existing screen may still contain the original LAN wording; menu rendering still needs an in-game check.

## Components

- cloud/: public directory, per-duel relays, protocol checks and live-service tests.
- native/: reversible dinput.dll companion, DirectPlay-compatible interfaces, and a console-only native integration check.
- .github/workflows/check.yml: build and test on a standard GitHub Windows cloud runner. No original game files are uploaded.

The directory supports up to 100 live/reserved rooms per game ID, with creation limited to 20 rooms per minute per game ID. Each room accepts one host and one guest. Disconnected rooms expire and are removed. Free cloud quotas remain shared with other applications in the same account.

## Build and validate

Backend: npm ci, npm run types, npm run check, npm test from cloud/.

Native: run native/Build.ps1 with Visual Studio C++ Build Tools and a Windows SDK installed. Run native/build/native-check.exe against a local development endpoint or the deployed HTTPS endpoint. It creates and joins a room, checks player identities and capacity, sends binary payloads in both directions, and checks disconnect propagation without opening the game.

See cloud/DEPLOY.md for strictly free cloud setup. Do not enable a paid plan.

## Install after deployment and qualification

From native/, run node install.mjs --endpoint https://YOUR-VERIFIED-ENDPOINT. The installer requires the exact supported executable, checks the cloud service, refuses to overwrite another mod, and leaves the original game executable and data archives unchanged. It has not been run on the original game folder yet.

To remove an unchanged installation, run node install.mjs --remove. The module and its configuration are the only game-folder additions.

Supported executable SHA-256: c5749eb934a1cf68d9236e44ff81e98b8aaee486b4f8ebd417440505d44ac1ea

## Third-party interfaces

The two DirectPlay interface headers retain their Wine copyright and LGPL notices; see native/NOTICE.md and native/COPYING.LIB. Original game executables, assets, and extracted disassembly are excluded from this repository.
