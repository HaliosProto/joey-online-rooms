# Joey Online Rooms

A native multiplayer companion for Yu-Gi-Oh! Power of Chaos: Joey the Passion, with public rooms and a cloud relay.

## Download and play

**Full game + configured multiplayer:**
https://github.com/HaliosProto/joey-online-rooms/releases/tag/full-game-preview-2

Download **Joey-the-Passion-Online-Full-Game.zip**, extract it completely, and run **joey_pc.exe** from the extracted game folder. The game files, multiplayer companion, cloud endpoint, original readme and new play instructions are included together. This bundles the supplied game folder; it is not the original disc installer.

**Multiplayer-only download for an existing game copy:**
https://github.com/HaliosProto/joey-online-rooms/releases/tag/preview-2

For that smaller package, close the game and copy dinput.dll and joey-online.ini beside the supported joey_pc.exe. Do not overwrite another mod's dinput.dll.

Start the original game, open its two-player/LAN multiplayer option, choose **Online rooms** as the connection provider, and create or join a room. Each duel supports one host and one guest. Everyone uses the same companion and endpoint. No GameRanger, VPN, lobby account or router forwarding is required by this implementation. The companion requires Windows 8 or newer.

## Status

The service is deployed at:
https://joey-online-rooms.joey-online-rooms.workers.dev

Cloud-based tests passed against the live HTTPS service, including native Windows clients. They cover room discovery/creation, two-player joins, capacity, sender identities, session configuration, isolated bidirectional binary relay, nonblocking search cancellation, idle connections and disconnect cleanup. Native builds treat compiler warnings as errors.

This remains a preview: a complete duel in the original game and the rendered in-game menus have not been verified. Some screens may retain their original LAN wording. Background transport checks do not establish that a full duel finishes correctly. See TESTING.md for exact evidence.

## Implementation

The companion integrates at the existing game's DirectPlay 8 interface. Its DirectInput proxy forwards ordinary input to the Windows system DLL and enables the online networking replacement only for the inspected executable. It does not modify the original executable or data archives, replace game rules, unlock cards, or provide anti-cheat.

The cloud directory lists live rooms; separate SQLite-backed Durable Objects relay each duel using hibernating WebSockets. A room accepts one host and one guest. Sender identity is server-assigned, host credentials are random and hashed, packets are bounded, and closed rooms expire. Host session configuration is preserved for joining players.

The directory admits at most 20 new rooms per minute and 100 live/reserved rooms per game ID. These application limits are separate from the hosting provider's free quotas, which are shared across the account. The project does not enable paid billing; exhausted free quotas can interrupt service.

## Source and maintenance

- cloud/: Worker, directory, duel relays and protocol/service tests.
- native/: native companion, reversible installer and console-only client checks.
- .github/workflows/: standard GitHub Windows cloud builds and live release verification.
- cloud/DEPLOY.md: free-cloud deployment procedure.

The configured preview was built from source commit 99496c05536da5d47735f3455c30ff47d73a0d8c. Multiplayer builds and transport tests run in the cloud. The full game bundle is a separate release asset; the large game archives are not part of the Git source tree.

Backend: npm ci, npm run types, npm run check, npm test from cloud/. Use npm run test:integration to run local service checks without opening the game.

Native: native/Build.ps1 requires Visual Studio C++ Build Tools and a Windows SDK. native/build/native-check.exe accepts a local development URL or the deployed HTTPS origin and tests the two native peers without a game window.

## Supported executable and removal

Supported joey_pc.exe SHA-256:
c5749eb934a1cf68d9236e44ff81e98b8aaee486b4f8ebd417440505d44ac1ea

The provided installer checks this exact executable, verifies the cloud endpoint, and refuses to overwrite another mod. From native/, run node install.mjs --endpoint https://joey-online-rooms.joey-online-rooms.workers.dev. To remove an unchanged installer-managed installation, run node install.mjs --remove. For manual ZIP installation, close the game and remove only its two companion files.

## Third-party interfaces

The DirectPlay interface headers retain their Wine copyright and LGPL notices; see native/NOTICE.md and native/COPYING.LIB. The full game release preserves the supplied game notices. The Git source tree excludes original game binaries, extracted disassembly and personal account details; the game files are distributed through the full-bundle release.
