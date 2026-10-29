# Free cloud deployment

Use a Cloudflare account on the **Workers Free** plan. This project uses only Workers and SQLite-backed Durable Objects. Do not enable a paid Workers plan or any paid add-on.

From this directory:

1. Install the locked dependencies with `npm ci`.
2. Run `npx wrangler login --device --browser=false --use-keyring --scopes account:read user:read workers_scripts:write workers_tail:read` and complete the displayed authorization link using the account owner. Install the optional credential-store component if Wrangler requests it. Do not put credentials or API tokens in source files.
3. Run `npm run types`, `npm run check`, and `npm test`.
4. Run `npx wrangler deploy --dry-run`.
5. Run `npm run deploy`. The first deployment creates the two SQLite-backed Durable Object namespaces declared in wrangler.jsonc.
6. Verify `/health`, then run the live service tests with `TEST_SERVER` set to the returned HTTPS origin. Run the native transport validation program against that same origin.
7. Configure `joey-online.ini` beside the installed native DLL with the verified HTTPS origin.

The current service is deployed at https://joey-online-rooms.joey-online-rooms.workers.dev. A newly registered workers.dev address may need time before its HTTPS certificate is active. Keep certificate validation enabled and verify HTTPS before running release tests or installing a configured companion.

No service runs on a player's PC. Players run their original game and the companion module. The module makes outbound HTTPS/WebSocket connections to the common endpoint; no router port forwarding is needed.

The directory admits at most 20 new rooms per minute per game ID and retains at most 100 live/reserved rooms per game ID. Each duel accepts one host and one guest. Messages are bounded, sender IDs are assigned by the service, and traffic cannot cross room boundaries. Host credentials are random, stored as hashes, and required to claim the hosting connection. The service does not validate Yu-Gi-Oh! game rules or provide anti-cheat.

Free quotas are shared across the account. Hitting a Free-plan quota can interrupt online play until it resets. Check the current Cloudflare pricing and quota documentation before deployment. The code does not enable paid billing.
