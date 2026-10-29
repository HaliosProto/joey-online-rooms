# Verification status

Cloud verification passed for source commit `99496c05536da5d47735f3455c30ff47d73a0d8c`:

https://github.com/HaliosProto/joey-online-rooms/actions/runs/40868356668

The same source passed live HTTPS service and native Windows client tests before publishing preview-2:

https://github.com/HaliosProto/joey-online-rooms/actions/runs/40868648530

The cloud-built ZIP checksum was verified before installation in the local game folder. Installed module/configuration hashes and the unchanged original executable hash were verified afterwards. The game was not opened for that installation.

The check runs on a standard GitHub Windows runner. It installs the locked backend tooling, generates runtime types, type-checks the Worker, builds the x86 module with compiler warnings treated as errors, runs the live service tests against the local Workers runtime, runs the native client check against the same runtime, and packages the Worker without deploying it.

Verified behaviors:

- UTF-16 player/session names and opaque binary payloads survive encoding.
- Malformed/oversized packets and invalid identifiers are rejected.
- A room is listed only after its host connects.
- An invalid host credential cannot claim a room.
- One host and one guest can join; a third player is rejected.
- Room traffic is isolated and sender IDs come from the connection.
- Native peer callbacks expose the correct local/host identities.
- Joining peers receive the host's session identity and opaque session-configuration bytes.
- Cancelling enumeration returns while an application callback is blocked.
- Native connections survive a 25-second pause between moves, including heartbeat activity.
- Native clients exchange exact binary payloads in both directions.
- Disconnects propagate and closed rooms are removed.

Remaining qualification:

- Verify the companion loads in the supported original executable, the in-game provider/room screens behave correctly, and a complete duel finishes between two original game instances on separate internet connections. The original Windows build checks do not launch the game. The Mac build downloads the authorized full-game release to verify startup on cloud Macs.

The original executable and data archives are unchanged. The companion is installed with the verified live endpoint. Background/native tests do not constitute a completed in-game duel.

## Mac qualification

Mac source commit `683d5b4766ca6b9f5459129eaf3eb2b8f1c0f509` passed on both `macos-15-intel` and `macos-15` (Apple Silicon, Rosetta) in this free public-repository cloud run:

https://github.com/HaliosProto/joey-online-rooms/actions/runs/40925805825

The checks build and ad-hoc sign the actual Mac app; verify the pinned Windows ZIP and upstream Wine runtime; prepare a fresh isolated environment using a path containing spaces; launch the original game and confirm its in-memory multiplayer hook; create and release a real DirectInput interface through the Mac proxy; preserve a test file in the save directory; and run the native public-room/relay checks above against the deployed service. Screenshots confirm the game's introductory graphics render on both cloud Mac types.

The Mac prefix preserves Wine's original input module under a separate name and installs the companion at Wine's absolute DirectInput system path. A Wine-only WebSocket close handshake wakes pending synchronous reads, which otherwise hang when leaving a room. The published Windows package is unchanged.

A complete duel, the rendered provider/room menus, audio quality, and real game save/load remain unverified. macOS versions other than 15 and the first-install Rosetta/Gatekeeper prompts on a fresh personal Mac have not been exercised. The Mac app is ad-hoc signed, not Developer ID signed or Apple-notarized. Wine downloads directly from its upstream release at first launch; it is not redistributed inside the Mac ZIP.


## Mobile qualification

The browser runtime is built from BoxedWine commit `8790ff20428c22daa64368af9553417e4f499c94`, using Emscripten 6.0.13 and the single-thread WebAssembly JIT with legacy WebAssembly exception handling. It uses the verified TinyCore15Wine11.0-web filesystem and unmodified original game executable. Exact input files and checksums are in `mobile/prepare_probe.py`.

Original-game startup and multiplayer-hook activation passed in Chromium in cloud run https://github.com/HaliosProto/joey-online-rooms/actions/runs/40939175466 and in WebKit in https://github.com/HaliosProto/joey-online-rooms/actions/runs/40939979131. Screenshots show the original game's main menu. Linux WebKit is an engine compatibility check, not a physical iPhone or iOS simulator test.

The native Windows test executable running *inside the browser emulator* passed the room creation, discovery, cancellation, joining, idle heartbeat, identity/session metadata, capacity, bidirectional binary relay and disconnect checks against an isolated Worker in cloud run https://github.com/HaliosProto/joey-online-rooms/actions/runs/40940794205. A separate browser transport test passed against the live HTTPS/WSS production service. Browser authentication/CORS changes and existing native interoperability passed cloud run https://github.com/HaliosProto/joey-online-rooms/actions/runs/40936301551 before deployment.

The Android app builds with Java 17, Gradle 8.11.1 and Android Gradle Plugin 8.9.2. Android lint and APK signature validation passed in cloud run https://github.com/HaliosProto/joey-online-rooms/actions/runs/40940364190. The signing key is kept in encrypted GitHub secrets, with a Windows-user-encrypted backup excluded from Git. The APK is a small WebView launcher for the same locally executed browser game; its first launch needs the game download.

Mobile preview limits: performance and memory use on physical Android/iPhone devices, audio quality, real-game save/load, complete in-game duels and the original Guest selection flow still require qualification. The Home Screen app does not use an iOS signing certificate. No paid cloud billing or local game server is enabled.


The signed Android installer downloaded and cached the game and launched the original executable with its multiplayer hook in a clean Android 15 cloud emulator in https://github.com/HaliosProto/joey-online-rooms/actions/runs/40947239326. The system fullscreen tutorial and the cloud emulator's DNS/startup configuration are handled by the test harness. The resulting screenshot shows the original main menu. This does not replace physical-phone qualification.

The actual published HTTPS mobile site passed native Windows peer checks *inside its browser emulator* against the production Cloudflare service in https://github.com/HaliosProto/joey-online-rooms/actions/runs/40949079115. This covers creation/discovery, joining, cancellation, idle heartbeat, player/session metadata, capacity, exact bidirectional binary payloads and disconnect. It verifies the real browser Origin/CORS and WebSocket authorization path.

The menu-input check waits for the original animated title/menu to become stable after dismissing the demonstration. It then requires the rendered lower menu to change after a touch while the upper game logo remains unchanged. Native event delivery alone does not qualify menu navigation.


The mobile release site was assembled and checked in https://github.com/HaliosProto/joey-online-rooms/actions/runs/40964414578 (Chromium, signed Android build and lint), with the same original-game navigation passing WebKit in https://github.com/HaliosProto/joey-online-rooms/actions/runs/40964421311. Tests use the original game, not a recreated menu: touch dismisses the demo, opens Duel Mode, chooses 2-PLAYER DUEL and Data from your PC, confirms the name with the game's OK lever, selects Host and confirms. Both engines receive HTTP 201 from the isolated room service; a separate directory fetch reports one publicly listed room. The screenshot shows the original "Wait for a 2-Player Duel opponent to connect" screen. The isolated endpoint is installed before any emulator socket initializes; production's CORS restrictions remain intact.

A generic Enter shortcut was removed because Enter on a game screen without an active selection can crash the original executable. Mobile players use the original buttons and OK lever to confirm. Native companion and emulator binaries match the earlier tested build; the game executable is unchanged.
