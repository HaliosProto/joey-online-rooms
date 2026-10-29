import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const endpoint = 'http://127.0.0.1:8789';
let serverLog = '';
const server = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--local', '--port', '8789', '--ip', '127.0.0.1', '--log-level', 'warn', '--persist-to', '.test-state'], {
  cwd: directory, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true
});
for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverLog = (serverLog + chunk.toString()).slice(-131072); });
const run = (program, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(program, args, { cwd: directory, stdio: 'inherit', windowsHide: true, ...options });
  child.once('error', reject); child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
});
try {
  server.once('error', error => { serverLog += error.message; });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error('Test backend exited before it was ready');
    try { const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(500) }); if (response.ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  if (!ready) throw new Error('Test backend did not become ready');
  const result = await run(process.execPath, ['--test', 'test/protocol.test.mjs', 'test/browser.test.mjs', 'test/service.test.mjs', '../mobile/room-transport.live.test.mjs'], { env: { ...process.env, TEST_SERVER: endpoint } });
  if (result) throw new Error(`Service tests failed with exit ${result}`);
  const nativeIndex = process.argv.indexOf('--native');
  if (nativeIndex >= 0) {
    const program = path.resolve(directory, process.argv[nativeIndex + 1]);
    const result = await run(program, [endpoint]);
    if (result) throw new Error(`Native tests failed with exit ${result}`);
  }
} catch (error) {
  console.error(error.message);
  if (serverLog) console.error(serverLog);
  process.exitCode = 1;
} finally {
  server.stdin.end();
  if (process.platform === 'win32') spawnSync('taskkill.exe', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore', windowsHide: true });
  else server.kill('SIGTERM');
}
