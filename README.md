# Integrated multiplayer investigation

Requested: an in-game public room browser, hosting and joining over the internet, no external player client, and no paid services.

Status: investigation only. The integrated mod is not implemented or installed. The discarded GameRanger launcher has been removed. Original game files remain unpatched.

The game is a 32-bit Windows executable with DirectPlay 8 peer networking. Static inspection located peer creation, host discovery, joining, and receive callbacks. These are possible integration points for an internet lobby and relay while retaining the existing duel rules. Runtime verification remains necessary: the game starts from its own folder, but current captured frames are black.

Executable SHA-256: c5749eb934a1cf68d9236e44ff81e98b8aaee486b4f8ebd417440505d44ac1ea

Key addresses (preferred image base 0x00400000):
- DirectPlay8Peer class identifier: file offset 0x1DDB00.
- Peer creation: 0x004436AD via CoCreateInstance pointer 0x005DA338.
- Peer callback: 0x00443760, dispatching to 0x00443AA0.
- Discovery helper: 0x004014E0; EnumHosts via peer vtable offset 0x64.
- Join helper: 0x004013D0; Connect via peer vtable offset 0x18.
- Peer information callbacks: GetPeerInfo via vtable offset 0x54.

network-disassembly.txt contains the inspected helper code. native/dplay8.h and native/dpaddr.h come from Wine and retain their original LGPL notices.

A common public room list needs a shared internet-reachable service. A PC-hosted service requires the owner's PC to stay online. A free cloud service requires an account and obeys its free quotas. No production service has been deployed.

Cloudflare quotas checked October 29, 2026:
- Workers Free: 100,000 requests/day, shared across the account.
- Durable Objects Free: 100,000 metered requests/day and 13,000 GB-seconds/day.
- Incoming WebSocket messages count at a 20:1 request billing ratio.
- Exceeding a Free-plan quota causes affected operations to fail. Daily quotas reset at 00:00 UTC. Do not enable a paid plan for this project.
- A room directory for a small friend group should fit readily. Full duel relay capacity needs measurement of the game's actual traffic.

Next: verify baseline gameplay, trace Host/SendTo/Close and callback lifetime rules, implement and test the directory/relay locally, integrate the native networking calls, verify a complete duel between two game instances, then deploy to a confirmed free account and test separate internet connections.

Sources:
https://developers.cloudflare.com/workers/platform/limits/
https://developers.cloudflare.com/durable-objects/platform/pricing/
https://github.com/wine-mirror/wine/blob/master/include/dplay8.h
https://github.com/wine-mirror/wine/blob/master/include/dpaddr.h
