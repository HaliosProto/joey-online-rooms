/* Browser-only TCP facade for the game's own HTTP/WebSocket room protocol.
 * It accepts virtual loopback port 80 only; it is not an internet TCP proxy. */
globalThis.createJoeyRoomTransport = function (api, endpoint, platform = globalThis) {
  const origin = new URL(endpoint);
  if (origin.protocol !== 'https:' && !['127.0.0.1', 'localhost'].includes(origin.hostname)) throw new Error('Secure room origin required');
  const sockets = new Map();
  const enc = new TextEncoder(), dec = new TextDecoder();
  const MAX = 1048576;
  function events(s) {
    const flags = (s.rxBytes ? 1 : 0) | (!s.closed && !s.error && !s.outClosed ? 4 : 0) | (s.error ? 8 : 0) | (s.closed ? 16 : 0);
    s.events = flags; api.setEvents(s.id, flags, s.rxBytes);
  }
  function enqueue(s, bytes) {
    if (!sockets.has(s.id)) return;
    if (s.rxBytes + bytes.length > MAX) { fail(s); return; }
    s.rx.push(bytes); s.rxBytes += bytes.length; events(s);
  }
  function frame(op, bytes) {
    const n = bytes.length;
    const out = new Uint8Array(n + (n < 126 ? 2 : n <= 65535 ? 4 : 10));
    out[0] = 128 | op;
    if (n < 126) out[1] = n;
    else if (n <= 65535) { out[1] = 126; new DataView(out.buffer).setUint16(2, n); }
    else { out[1] = 127; new DataView(out.buffer).setUint32(6, n); }
    out.set(bytes, out.length - n); return out;
  }
  function fail(s) {
    s.error = 104; s.closed = true; s.abort?.abort();
    try { s.ws?.close(1000); } catch {}
    events(s);
  }
  function response(s, status, body = new Uint8Array()) {
    if (s.replied) return; s.replied = true;
    enqueue(s, enc.encode(`HTTP/1.1 ${status}\r\nContent-Type: application/octet-stream\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`));
    enqueue(s, body); s.closed = true; events(s);
  }
  async function upgrade(s, path, headers) {
    const key = headers.get('sec-websocket-key');
    if (!key || !/^[a-zA-Z0-9+/]{22}==$/.test(key)) throw new Error('Invalid virtual WebSocket key');
    const digest = new Uint8Array(await platform.crypto.subtle.digest('SHA-1', enc.encode(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')));
    const accept = btoa(String.fromCharCode(...digest));
    if (!sockets.has(s.id)) return;
    const auth = headers.get('authorization');
    const protocols = ['joey-online-v1'];
    if (auth) {
      if (!/^Bearer [a-f0-9]{64}$/.test(auth)) throw new Error('Invalid host credential');
      protocols.push('joey-auth.' + auth.slice(7));
    }
    const url = new URL(path, origin); url.protocol = origin.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = s.ws = new platform.WebSocket(url.href, protocols);
    ws.binaryType = 'arraybuffer';
    let opened = false;
    ws.onopen = () => {
      if (!sockets.has(s.id)) { ws.close(1000); return; }
      opened = true; s.mode = 'websocket';
      enqueue(s, enc.encode(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`));
      pump(s);
    };
    ws.onmessage = event => {
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength > MAX) { fail(s); return; }
      enqueue(s, frame(2, new Uint8Array(event.data)));
    };
    ws.onerror = () => { if (!opened && sockets.has(s.id)) response(s, '502 Bad Gateway'); else fail(s); };
    ws.onclose = event => {
      if (!sockets.has(s.id)) return;
      if (!opened) { response(s, '502 Bad Gateway'); return; }
      const bytes = new Uint8Array(2); new DataView(bytes.buffer).setUint16(0, event.wasClean ? 1000 : 1011);
      enqueue(s, frame(8, bytes)); s.closed = true; events(s);
    };
  }
  async function request(s, method, path, headers, body) {
    try {
      if (!/^\/v1\/rooms(?:\?app=[a-f0-9]{32})?$/.test(path) && !/^\/v1\/rooms\/[a-f0-9]{32}\/play\?/.test(path) && path !== '/health') throw new Error('Unsupported room path');
      if (headers.get('upgrade')?.toLowerCase() === 'websocket') { await upgrade(s, path, headers); return; }
      if (!['GET', 'POST'].includes(method) || path.includes('/play')) throw new Error('Unsupported room request');
      s.abort = new AbortController();
      const result = await platform.fetch(new URL(path, origin).href, {
        method, headers: { 'Content-Type': 'application/octet-stream' },
        body: method === 'POST' ? body : undefined, credentials: 'omit', redirect: 'error', signal: s.abort.signal,
      });
      if (Number(result.headers.get('content-length') || 0) > MAX) throw new Error('Room response too large');
      const reader = result.body?.getReader(); let size = 0; const chunks = [];
      if (reader) try {
        for (;;) {
          const next = await reader.read(); if (next.done) break;
          size += next.value.length;
          if (size > MAX) { await reader.cancel(); throw new Error('Room response too large'); }
          chunks.push(next.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let at = 0;
      for (const part of chunks) { bytes.set(part, at); at += part.length; }
      if (sockets.has(s.id)) response(s, `${result.status} ${result.statusText || 'Result'}`, bytes);
    } catch { if (sockets.has(s.id)) response(s, '502 Bad Gateway'); }
  }
  function pump(s) {
    try {
      if (s.mode === 'http') {
        const split = dec.decode(s.tx).indexOf('\r\n\r\n');
        if (split < 0) { if (s.tx.length > 16384) fail(s); return; }
        const lines = dec.decode(s.tx.subarray(0, split)).split('\r\n');
        const match = /^(GET|POST) (\/[^ ]*) HTTP\/1\.[01]$/.exec(lines.shift());
        if (!match) throw new Error('Invalid virtual HTTP request');
        const headers = new Headers();
        for (const line of lines) {
          const colon = line.indexOf(':'); if (colon < 1) throw new Error('Invalid header');
          headers.append(line.slice(0, colon).trim(), line.slice(colon + 1).trim());
        }
        if (headers.has('transfer-encoding')) throw new Error('Unsupported chunked request');
        const length = Number(headers.get('content-length') || 0);
        if (!Number.isSafeInteger(length) || length < 0 || length > 9000) throw new Error('Invalid request length');
        if (s.tx.length < split + 4 + length) {
          if (!s.continued && headers.get('expect')?.toLowerCase() === '100-continue') { s.continued = true; enqueue(s, enc.encode('HTTP/1.1 100 Continue\r\n\r\n')); }
          return;
        }
        const body = s.tx.slice(split + 4, split + 4 + length);
        s.tx = s.tx.slice(split + 4 + length); s.mode = 'pending';
        void request(s, match[1], match[2], headers, body);
      }
      while (s.mode === 'websocket' && s.tx.length >= 2) {
        const a = s.tx; let n = a[1] & 127, at = 2;
        if (!(a[1] & 128) || (a[0] & 112)) throw new Error('Invalid client frame');
        if (n === 126) { if (a.length < 4) return; n = new DataView(a.buffer, a.byteOffset).getUint16(2); at = 4; }
        else if (n === 127) { if (a.length < 10) return; const v = new DataView(a.buffer, a.byteOffset); if (v.getUint32(2)) throw new Error('Frame too large'); n = v.getUint32(6); at = 10; }
        if (n > MAX) throw new Error('Frame too large');
        if (a.length < at + 4 + n) return;
        const bytes = a.slice(at + 4, at + 4 + n);
        for (let i = 0; i < n; i++) bytes[i] ^= a[at + (i % 4)];
        s.tx = a.slice(at + 4 + n);
        const op = a[0] & 15, final = !!(a[0] & 128);
        if (op >= 8 && (!final || n > 125)) throw new Error('Invalid control frame');
        if (op === 8) { s.ws.close(1000); s.outClosed = true; events(s); return; }
        if (op === 9) { enqueue(s, frame(10, bytes)); continue; }
        if (op === 10) continue;
        if ((op !== 2 && op !== 0) || (op === 0) !== !!s.fragments.length) throw new Error('Unsupported data frame');
        s.fragments.push(bytes); s.fragmentBytes += n;
        if (s.fragmentBytes > MAX) throw new Error('Message too large');
        if (final) {
          const message = new Uint8Array(s.fragmentBytes); let offset = 0;
          for (const fragment of s.fragments) { message.set(fragment, offset); offset += fragment.length; }
          s.fragments = []; s.fragmentBytes = 0; s.ws.send(message);
        }
      }
    } catch { fail(s); }
  }
  return {
    socket(domain, type, protocol) {
      if (domain !== 2 || (type & 15) !== 1) return -97;
      const id = api.allocateSocket(domain, type, protocol);
      const s = { id, rx: [], rxBytes: 0, tx: new Uint8Array(), events: 0, error: 0, closed: false, mode: 'http', fragments: [], fragmentBytes: 0 };
      sockets.set(id, s); return id;
    },
    connect(id, ipv4, port) {
      const s = sockets.get(id); if (!s) return -107;
      if ((ipv4 >>> 0) !== 0x7f000001 || port !== 80) { s.error = 101; events(s); return -101; }
      s.peer = ipv4 >>> 0; s.port = port; events(s); return 0;
    },
    send(id, buffer, length) {
      const s = sockets.get(id); if (!s || s.closed || s.outClosed) return -107;
      if (s.ws?.bufferedAmount > MAX) return -11;
      if (s.tx.length + length > MAX || length < 0) { fail(s); return -104; }
      const merged = new Uint8Array(s.tx.length + length);
      merged.set(s.tx); merged.set(api.heap().subarray(buffer, buffer + length), s.tx.length); s.tx = merged;
      pump(s); return length;
    },
    recv(id, buffer, length, flags) {
      const s = sockets.get(id); if (!s) return -107;
      if (!s.rxBytes) return s.error ? -s.error : s.closed || s.inClosed ? 0 : -11;
      let written = 0, index = 0;
      while (written < length && index < s.rx.length) {
        const part = s.rx[index], n = Math.min(part.length, length - written);
        api.heap().set(part.subarray(0, n), buffer + written); written += n;
        if (flags & 2) index++;
        else { s.rxBytes -= n; if (n === part.length) s.rx.shift(); else s.rx[0] = part.subarray(n); }
      }
      events(s); return written;
    },
    close(id) { const s = sockets.get(id); if (s) { s.abort?.abort(); try { s.ws?.close(1000); } catch {} sockets.delete(id); } return 0; },
    shutdown(id, how) { const s = sockets.get(id); if (!s) return -107; if (how < 0 || how > 2) return -22; if (how !== 1) { s.inClosed = true; s.rx = []; s.rxBytes = 0; } if (how !== 0) s.outClosed = true; if (how === 2) { s.ws?.close(1000); s.closed = true; } events(s); return 0; },
    getEvents(id) { return sockets.get(id)?.events ?? 16; },
    getError(id) { return sockets.get(id)?.error ?? 101; },
    readableBytes(id) { return sockets.get(id)?.rxBytes ?? 0; },
    getPeerIpv4(id) { return sockets.get(id)?.peer ?? 0; },
    getPeerPort(id) { return sockets.get(id)?.port ?? 0; },
    getLocalIpv4() { return 0x7f000001; },
    getLocalPort(id) { return 40000 + (id % 10000); },
    setsockopt() { return 0; }, bind() { return -97; }, listen() { return -97; }, accept() { return -97; },
  };
};
