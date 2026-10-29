Separate Mac download; the existing Windows release stays available.

Extract **Joey-Online-Mac.zip**, move **Joey Online.app** to Applications and open it. Game files and multiplayer configuration are included. On first launch, the app downloads and verifies the free Wine 11.20 runtime (226 MB). Apple Silicon Macs also require Apple's free Rosetta. No paid compatibility software or Windows license is required.

If macOS blocks this app, use its per-app **Privacy & Security > Open Anyway** option only if you trust the download. This free build is ad-hoc signed and is not Apple-notarized. [Apple's opening instructions](https://support.apple.com/en-us/102445).

Open the original game's two-player/LAN option, choose **Online rooms**, then create or join a room. Mac and Windows packages use the same cloud lobby.

Cloud verification uses Intel and Apple Silicon Macs running macOS 15. The launcher, runtime bootstrap, original game startup/multiplayer hook, and native live public-room and relay tests are checked. A complete in-game duel remains unverified; this is a preview.

Saves and the isolated runtime stay in `~/Library/Application Support/Joey Online/`. Wine is downloaded directly from its upstream release and is not redistributed in this ZIP. Original game and mod notices remain included.

[Windows game download](https://github.com/HaliosProto/joey-online-rooms/releases/tag/full-game-preview-2) | [Source and updates](https://github.com/HaliosProto/joey-online-rooms)
