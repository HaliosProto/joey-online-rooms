# Mobile compatibility builds

The Android APK loads the same HTTPS game site used by the iPhone Home Screen app. BoxedWine executes the supplied original game locally through single-thread WebAssembly; Cloudflare only lists rooms and relays multiplayer data. No PC host, paid relay, Apple developer membership or App Store listing is required.

## Rebuild in the cloud

1. Run `mobile-probe.yml`. It builds the pinned emulator and x86 companion, checks the original game/runtime SHA-256 values, and tests startup. Record the successful run ID. Runtime/native artifacts expire after two days; rerun this workflow to regenerate them.
2. Run `mobile-browser-test.yml` with that `engine_run`, browser `webkit`, check `game`. Run its `network` check with Chromium to exercise real native WinHTTP peers inside the emulator against an isolated Worker.
3. Run `mobile-publish.yml` with the engine run ID. With `publish=false`, it packages the site, exercises the original game in a touch browser, validates persistent storage setup, and produces a signed APK. Inspect the screenshots to qualify actual menus. With `publish=true`, it deploys only after the site and Android checks pass.
4. Alternatively, run `mobile-deploy-tested.yml` with the successful packaging run ID to publish the already tested Pages artifact without rebuilding it.
5. Run `mobile-android-test.yml` with the APK build run ID for an Android 15 emulator check. Its network/DNS configuration and fullscreen tutorial handling apply only to the ephemeral cloud emulator.

The APK uses an owner-controlled release signing identity in encrypted GitHub Actions secrets. `create_android_signing.py` refuses to replace existing signing secrets. The encrypted local backup under ignored `bundles/` is protected by the original Windows user's DPAPI credentials. Preserve that backup and Windows recovery access; never publish the key/password or replace the signing identity when updating the APK.

Site assets are assembled from verified inputs in cloud CI and published through GitHub Pages. Large game/runtime archives are split into 16 MiB resumable cache entries and streamed back to the emulator by the service worker. Cache keys include asset SHA-256 values so an update can replace controls without clearing the IndexedDB Wine prefix and saves. Save data uses the stable `joey-online-v1` key. Save backups include the Wine prefix overlay; the Android system file picker and iPhone sharing/download flow export a ZIP.

`room-transport.js` accepts only the emulator's loopback TCP port 80 and the fixed room protocol. It is not a general TCP proxy. Native HTTP/WebSocket requests become HTTPS/WSS browser requests. The Worker permits the published mobile origin and preserves originless desktop clients. Browser host credentials use a WebSocket subprotocol that the Worker translates into the existing per-room authorization header.

Exact upstream sources: BoxedWine `8790ff20428c22daa64368af9553417e4f499c94`, Emscripten 6.0.13, TinyCore15Wine11.0-web filesystem, and Wine `db11d0fe6a169c457e23d007e20404643d067aa8` plus the BoxedWine build patches. Corresponding emulator/Wine source archives accompany the mobile release. Do not remove their notices.

This is a preview. Cloud WebKit is not a physical iPhone, and Android emulator startup does not establish physical-phone performance, audio quality, real-game save/load, or complete multiplayer duels.
