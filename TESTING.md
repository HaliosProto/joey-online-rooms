# Verification status

Cloud verification passed for source commit `2a47846`:

https://github.com/HaliosProto/joey-online-rooms/actions/runs/40865645897

The check runs on a standard GitHub Windows runner. It installs the locked backend tooling, generates runtime types, type-checks the Worker, builds the x86 module with compiler warnings treated as errors, runs the live service tests against the local Workers runtime, runs the native client check against the same runtime, and packages the Worker without deploying it.

Verified behaviors:

- UTF-16 player/session names and opaque binary payloads survive encoding.
- Malformed/oversized packets and invalid identifiers are rejected.
- A room is listed only after its host connects.
- An invalid host credential cannot claim a room.
- One host and one guest can join; a third player is rejected.
- Room traffic is isolated and sender IDs come from the connection.
- Native peer callbacks expose the correct local/host identities.
- Cancelling enumeration returns while an application callback is blocked.
- Native connections survive a 25-second pause between moves, including heartbeat activity.
- Native clients exchange exact binary payloads in both directions.
- Disconnects propagate and closed rooms are removed.

Remaining qualification:

- Repeat the service and native checks against the deployed HTTPS endpoint. The manual release workflow requires both to pass before publishing a preview download.
- Verify the companion loads in the supported original executable, the in-game provider/room screens behave correctly, and a complete duel finishes between two original game instances on separate internet connections. No original game files are uploaded to the public build repository.

The supplied original game has not been modified or opened during cloud development. The companion is not installed until a live endpoint is verified. Background/native tests do not constitute a completed in-game duel.
