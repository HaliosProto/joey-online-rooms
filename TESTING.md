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
