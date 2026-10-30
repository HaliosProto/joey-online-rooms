# Joey Fast

The emulator-free successor to the compatibility preview. The duel core is compiled directly to WebAssembly and the interface uses the browser's native rendering and touch controls. The host's device runs the rules engine; the existing free room service relays messages.

This uses a new duel protocol. Both friends must use Joey Fast. Existing Windows/Mac compatibility downloads remain available separately.

Use the iPhone Home Screen app or the same URL on Android, Windows and Mac. Installation does not require an App Store listing or an Apple signing account.

The 771 original card entries are converted into browser-native artwork and metadata. Alternate artwork is grouped by actual card ID. The client uses the OCGCore classic five-zone ruleset and contemporary card-effect scripts; some rulings differ from the original executable. Original campaign/AI, voices and save collections have not been ported. Practice controls both sides on one device.

The engine is built in the cloud from `n1xx1/ocgcore-wasm` commit `6e9a76d6b8aa38339145db3834505b9c22ec29ba`, including its pinned OCGCore and Lua submodules. The synchronous build uses JavaScript-based exception handling for WebKit compatibility. CardScripts and BabelCDB revisions are fixed in the workflows. Full corresponding sources are included with the release.

Client code and the duel engine are AGPL-3.0-or-later. Original game artwork retains its original notices. Format documentation is credited under the toolset's MIT license.

This remains a preview: cloud tests do not replace physical-phone measurements or qualification of every card interaction. The host's device runs the engine and therefore is trusted with both decks; the service relays opaque messages. This is designed for games between friends, with no ranked-play or anti-cheat claim.
