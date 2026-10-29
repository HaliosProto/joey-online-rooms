JOEY ONLINE ROOMS - MULTIPLAYER PREVIEW

This companion connects the existing two-player screens in Joey the Passion to
a public cloud room list. Each player needs their own compatible game copy.
No GameRanger, VPN, router forwarding, or lobby account is needed.

SETUP
1. Close the game.
2. Open the folder containing joey_pc.exe and data.dat.
3. If dinput.dll already exists there, do not overwrite it: another mod may use it.
4. Copy dinput.dll and joey-online.ini from this package into that game folder.
5. Start joey_pc.exe normally.
6. Open the game's two-player/LAN multiplayer option. Choose Online rooms as
   the connection provider, then create a room or join one from the room list.

Use the same companion version and endpoint on both PCs. A duel supports two
players; a group of friends can create several rooms or rotate opponents.

This is a preview. Cloud-service and native transport checks must pass before
this package is published, but a complete duel in the original game has not
yet been verified. Some screens may retain their original LAN wording.

SUPPORTED EXECUTABLE
The module enables its game integration only for the inspected x86 build.
joey_pc.exe SHA-256:
c5749eb934a1cf68d9236e44ff81e98b8aaee486b4f8ebd417440505d44ac1ea

REMOVAL
Close the game, then remove only the dinput.dll and joey-online.ini files copied
from this package. The original executable and data archives are unchanged.

CLOUD AVAILABILITY
The cloud service uses the Free plan. Reaching its free quotas can interrupt
online play until the quota resets. This companion does not enable paid billing.

SOURCE AND STATUS
https://github.com/HaliosProto/joey-online-rooms

Original game files are not included. See NOTICE.md and COPYING.LIB for the
public DirectPlay interface headers used to compile the companion.
