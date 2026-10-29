"""Upload an authorized release asset with bounded bandwidth and in-memory auth."""
import argparse
import hashlib
import json
import mimetypes
from pathlib import Path
import subprocess
import time
import urllib.parse
import urllib.request

parser = argparse.ArgumentParser()
parser.add_argument('--repo', required=True)
parser.add_argument('--tag', required=True)
parser.add_argument('--release-id', type=int)
parser.add_argument('--file', type=Path, required=True)
parser.add_argument('--bytes-per-second', type=int, default=1024 * 1024)
args = parser.parse_args()
gh = r'C:\Program Files\GitHub CLI\gh.exe'
asset = args.file.resolve(strict=True)
if args.bytes_per_second < 1:
    raise SystemExit('The bandwidth limit must be positive.')
release_endpoint = f'repos/{args.repo}/releases/{args.release_id}' if args.release_id else f'repos/{args.repo}/releases/tags/{args.tag}'
release = json.loads(subprocess.run(
    [gh, 'api', release_endpoint],
    check=True, capture_output=True, text=True).stdout)
if release['tag_name'] != args.tag:
    raise SystemExit('The release ID does not match the requested tag.')
upload_url = release['upload_url'].split('{', 1)[0]
parts = urllib.parse.urlsplit(upload_url)
if parts.scheme != 'https' or parts.hostname != 'uploads.github.com' or parts.username or parts.password:
    raise SystemExit('GitHub returned an unexpected upload destination.')
if any(item['name'] == asset.name for item in release['assets']):
    raise SystemExit('This asset name already exists; it was not overwritten.')
token = subprocess.run([gh, 'auth', 'token', '--hostname', 'github.com'],
                       check=True, capture_output=True, text=True).stdout.strip()

class LimitedReader:
    def __init__(self, stream):
        self.stream = stream
        self.start = time.monotonic()
        self.last_progress = self.start
        self.count = 0
        self.digest = hashlib.sha256()
    def read(self, size=-1):
        block = self.stream.read(65536 if size < 0 else min(size, 65536))
        if not block:
            return b''
        self.count += len(block)
        self.digest.update(block)
        delay = self.count / args.bytes_per_second - (time.monotonic() - self.start)
        if delay > 0:
            time.sleep(delay)
        now = time.monotonic()
        if now - self.last_progress >= 20:
            print(f'Upload: {self.count / 1048576:.1f} / {asset.stat().st_size / 1048576:.1f} MiB', flush=True)
            self.last_progress = now
        return block

try:
    with asset.open('rb') as stream:
        body = LimitedReader(stream)
        request = urllib.request.Request(
            upload_url + '?' + urllib.parse.urlencode({'name': asset.name}),
            data=body, method='POST', headers={
                'Authorization': 'Bearer ' + token,
                'User-Agent': 'JoeyOnlineReleasePublisher/1',
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': mimetypes.guess_type(asset.name)[0] or 'application/octet-stream',
                'Content-Length': str(asset.stat().st_size),
            })
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.load(response)
        if result['size'] != asset.stat().st_size or result['state'] != 'uploaded':
            raise RuntimeError('GitHub did not confirm the complete asset.')
        if result.get('digest') != 'sha256:' + body.digest.hexdigest():
            raise RuntimeError('GitHub asset digest did not match the uploaded bytes.')
        print(json.dumps({'name': result['name'], 'bytes': result['size'],
                          'digest': result['digest'], 'url': result['browser_download_url']}), flush=True)
finally:
    token = None
