import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function option(name) { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
const game = path.resolve(option('--game-directory') ?? path.join(directory, '..', '..', 'Yu-Gi-Oh! Power of Chaos JOEY THE PASSION'));
const knownGame = 'c5749eb934a1cf68d9236e44ff81e98b8aaee486b4f8ebd417440505d44ac1ea';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function optional(filename) { try { return await readFile(filename); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function atomic(filename, bytes) {
  const temporary = `${filename}.joey-${process.pid}.tmp`;
  try { await writeFile(temporary, bytes, { flag: 'wx' }); await rename(temporary, filename); }
  finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
}
const modulePath = path.join(game, 'dinput.dll');
const configPath = path.join(game, 'joey-online.ini');
const manifestPath = path.join(game, 'joey-online-installation.json');

try {
  const previous = await optional(manifestPath);
  const manifest = previous ? JSON.parse(previous.toString('utf8')) : null;
  const currentModule = await optional(modulePath);
  const currentConfig = await optional(configPath);
  if (args.includes('--remove')) {
    if (!manifest || !currentModule || manifest.moduleSha256 !== hash(currentModule) || manifest.modulePath !== modulePath) throw new Error('No unchanged installation of this module was found. No files were removed.');
    if (currentConfig && manifest.configSha256 !== hash(currentConfig)) throw new Error('The online configuration was edited after installation. No files were removed.');
    await unlink(modulePath);
    if (currentConfig) await unlink(configPath);
    await unlink(manifestPath);
    console.log('Removed the companion module. The original game executable and data files are unchanged.');
  } else {
    const endpoint = option('--endpoint');
    if (!endpoint) throw new Error('Supply --endpoint with the verified HTTPS cloud service URL.');
    const url = new URL(endpoint);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('The cloud endpoint must be an HTTPS URL without credentials, a query or a fragment.');
    const executable = await readFile(path.join(game, 'joey_pc.exe'));
    if (hash(executable) !== knownGame) throw new Error('This game executable has not been qualified for the module. No game files were changed.');
    if ((currentModule || currentConfig) && (!manifest || !currentModule || hash(currentModule) !== manifest.moduleSha256 || (currentConfig && hash(currentConfig) !== manifest.configSha256))) throw new Error('An existing module or configuration belongs to another installation. No files were overwritten.');
    const origin = endpoint.replace(/\/+$/, '');
    const health = await fetch(`${origin}/health`, { redirect: 'error', signal: AbortSignal.timeout(10000) });
    const status = await health.json();
    if (!health.ok || status.service !== 'joey-online-rooms' || status.protocol !== 1) throw new Error('The cloud service did not pass its health check. No files were installed.');
    const dll = await readFile(path.join(directory, 'build', 'dinput.dll'));
    const pe = dll.readUInt32LE(0x3c);
    if (dll.toString('ascii', 0, 2) !== 'MZ' || dll.readUInt32LE(pe) !== 0x4550 || dll.readUInt16LE(pe + 4) !== 0x14c || !(dll.readUInt16LE(pe + 22) & 0x2000)) throw new Error('The native module is not a valid x86 DLL.');
    const config = Buffer.concat([Buffer.from([255,254]), Buffer.from(`[Online]\r\nEnabled=1\r\nEndpoint=${origin}\r\n`, 'utf16le')]);
    const nextManifest = Buffer.from(JSON.stringify({ version: 1, endpoint: origin, modulePath, moduleSha256: hash(dll), configSha256: hash(config), originalGameSha256: knownGame, installedAt: new Date().toISOString() }, null, 2));
    try {
      await atomic(modulePath, dll);
      await atomic(configPath, config);
      await atomic(manifestPath, nextManifest);
    } catch (error) {
      for (const [filename, bytes] of [[modulePath, currentModule], [configPath, currentConfig], [manifestPath, previous]]) {
        if (bytes) await atomic(filename, bytes); else await unlink(filename).catch(item => { if (item.code !== 'ENOENT') throw item; });
      }
      throw error;
    }
    console.log('Installed the in-game cloud companion. The original game executable and data files are unchanged.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
