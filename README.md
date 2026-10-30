# Joey Online Rooms

A native multiplayer companion for Yu-Gi-Oh! Power of Chaos: Joey the Passion, with public rooms and a cloud relay.

## Download and play

**Play the complete original game on the website (computer and mobile):**

https://haliosproto.github.io/joey-online-rooms/

Press **Play game**. The website runs the supplied original Joey the Passion executable, including Joey's AI, single/match duels, deck editing, card rewards/progression, graphics and voices, plus the public online room companion. No installer, ZIP extraction, APK or App Store listing is required. Both computer and phone players use the same website.

Background music is disabled on the website. Joey's voices and game sound effects remain enabled. The browser package silences only the music WAV samples, preserving their headers, durations, all other sounds, the executable and game data. Existing desktop release archives are unchanged.

The browser still transfers the game files automatically on the first visit and caches them where storage allows. The original assets are large (about 573 MB); initial loading and startup can take several minutes. Running the original game in a browser is demanding, and mobile performance remains limited. Saves stay in this browser/device under the existing `joey-online-v1` storage key.

A separate experimental card-client rewrite under `fast/` is not the original game and does not include Joey's AI/campaign. It is not the selected solution for this project. Existing links to it are being redirected to the original game.

Optional desktop downloads remain available:

**Windows: full game + configured multiplayer:**
https://github.com/HaliosProto/joey-online-rooms/releases/tag/full-game-preview-2

Download **Joey-the-Passion-Online-Full-Game.zip**, extract it completely, and run **joey_pc.exe** from the extracted game folder. The game files, multiplayer companion, cloud endpoint, original readme and new play instructions are included together. This bundles the supplied game folder; it is not the original disc installer.

**Mac: full game + configured multiplayer:**
https://github.com/HaliosProto/joey-online-rooms/releases/tag/mac-preview-7

Download **Joey-Online-Mac.zip**, extract it, move **Joey Online.app** to Applications and open it. The first launch downloads and verifies the free Wine 11.20 runtime (226 MB); Apple Silicon Macs also use Apple's free Rosetta. No Homebrew or paid compatibility app is required. This compatibility build runs the original Windows game. It was checked on Intel and Apple Silicon cloud Macs running macOS 15. If macOS blocks the app because it is not Apple-notarized, see [Apple's per-app opening instructions](https://support.apple.com/en-us/102445) and the included README-MAC.txt.

Mac and Windows players use the same online room service. Saves and the Mac runtime stay in `~/Library/Application Support/Joey Online/`. The existing Windows download stays available unchanged.

**Original mobile compatibility preview (slower):**

https://haliosproto.github.io/joey-online-rooms/legacy.html

On iPhone or iPad, open the link in Safari, tap **Share → Add to Home Screen**, then launch the new icon. No App Store account, signing renewal or paid service is required. Android can use the same Home Screen app or the signed APK in the mobile release. The first game download is approximately 573 MB; use Wi-Fi. The original game runs locally through BoxedWine, with touch controls and the same online room service as desktop players. It is not streamed from a PC.

Tap to click, drag to move cards, and use **Right click** for the next tap. **Back** sends Escape, **Name** types into the selected game text field. Turn the phone sideways. Saves are kept in this browser/app's private storage; save in game and export **Save backup** before removing browser data. Clearing storage or uninstalling can erase local progress. This is a compatibility preview: physical phones and a complete duel have not been qualified.

**Windows multiplayer-only download for an existing game copy:**
https://github.com/HaliosProto/joey-online-rooms/releases/tag/preview-2

For that smaller package, close the game and copy dinput.dll and joey-online.ini beside the supported joey_pc.exe. Do not overwrite another mod's dinput.dll.

Start the original game and choose **Duel Mode -> 2-PLAYER DUEL -> Data from your PC**. Confirm your name with the in-game **OK** lever. Select **Host** to create a room or **Guest** to find a room, then use the **OK** lever again. Some dialogs keep their original LAN wording. Each duel supports one host and one guest. Everyone uses the same companion and endpoint. No GameRanger, VPN, lobby account or router forwarding is required by this implementation. The Windows companion requires Windows 8 or newer; Mac players use the separate app above.

## Status

The service is deployed at:
https://joey-online-rooms.joey-online-rooms.workers.dev

Cloud-based tests passed against the live HTTPS service, including native Windows clients and Wine clients on Intel and Apple Silicon Macs. They cover room discovery/creation, two-player joins, capacity, sender identities, session configuration, isolated bidirectional binary relay, nonblocking search cancellation, idle connections and disconnect cleanup. Native builds treat compiler warnings as errors.

This remains a preview: Chromium and WebKit checks navigate the original game by touch through Duel Mode, the data/name screens and Host selection, then require successful room creation and public discovery. Two original game instances also pass room discovery and joining, reaching the rock-paper-scissors screen together. A complete duel and physical phones remain unverified. Some screens retain their original LAN wording. Background transport checks do not establish that a full duel finishes correctly. See TESTING.md for exact evidence.

## Implementation

The companion integrates at the existing game's DirectPlay 8 interface. Its DirectInput proxy forwards ordinary input to the Windows system DLL and enables the online networking replacement only for the inspected executable. It does not modify the original executable or data archives, replace game rules, unlock cards, or provide anti-cheat.

The cloud directory lists live rooms; separate SQLite-backed Durable Objects relay each duel using hibernating WebSockets. A room accepts one host and one guest. Sender identity is server-assigned, host credentials are random and hashed, packets are bounded, and closed rooms expire. Host session configuration is preserved for joining players.

The directory admits at most 20 new rooms per minute and 100 live/reserved rooms per game ID. These application limits are separate from the hosting provider's free quotas, which are shared across the account. The project does not enable paid billing; exhausted free quotas can interrupt service.

## Source and maintenance

- cloud/: Worker, directory, duel relays and protocol/service tests.
- native/: native companion, reversible installer and console-only client checks.
- macos/: Mac launcher, isolated runtime setup, packaging and cloud Mac qualification.
- mobile/: Android installer, iPhone Home Screen app, browser socket transport and reproducible cloud runtime builds.
- .github/workflows/: standard GitHub Windows and Mac cloud builds and release verification.
- cloud/DEPLOY.md: free-cloud deployment procedure.

The configured preview was built from source commit 99496c05536da5d47735f3455c30ff47d73a0d8c. Multiplayer builds and transport tests run in the cloud. The full game bundle is a separate release asset; the large game archives are not part of the Git source tree.

Backend: npm ci, npm run types, npm run check, npm test from cloud/. Use npm run test:integration to run local service checks without opening the game.

Native: native/Build.ps1 requires Visual Studio C++ Build Tools and a Windows SDK. native/build/native-check.exe accepts a local development URL or the deployed HTTPS origin and tests the two native peers without a game window.

## Supported executable and removal

Supported joey_pc.exe SHA-256:
c5749eb934a1cf68d9236e44ff81e98b8aaee486b4f8ebd417440505d44ac1ea

The Windows installer checks this exact executable, verifies the cloud endpoint, and refuses to overwrite another mod. From native/, run node install.mjs --endpoint https://joey-online-rooms.joey-online-rooms.workers.dev. To remove an unchanged installer-managed installation, run node install.mjs --remove. For manual Windows ZIP installation, close the game and remove only its two companion files. For Mac, remove the app; keep its Application Support folder to preserve saves.

## Third-party interfaces

The DirectPlay interface headers retain their Wine copyright and LGPL notices; see native/NOTICE.md and native/COPYING.LIB. The full game release preserves the supplied game notices. The Git source tree excludes original game binaries, extracted disassembly and personal account details; the game files are distributed through the full-bundle release.
