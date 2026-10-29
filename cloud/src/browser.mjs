// Browser access to the same room protocol used by the native companions.
const MOBILE_ORIGIN = 'https://haliosproto.github.io';
export function browserRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  let permitted = !origin || origin === url.origin || origin === MOBILE_ORIGIN;
  if (!permitted && ['127.0.0.1', 'localhost'].includes(url.hostname)) {
    try { permitted = ['127.0.0.1', 'localhost'].includes(new URL(origin).hostname); } catch {}
  }
  if (!permitted) return Response.json({ error: 'Origin is not allowed' }, { status: 403 });
  if (request.method === 'OPTIONS') {
    const method = request.headers.get('Access-Control-Request-Method');
    const headers = (request.headers.get('Access-Control-Request-Headers') || '').split(',').map(h => h.trim().toLowerCase()).filter(Boolean);
    if (!origin || !['GET', 'POST'].includes(method) || headers.some(h => h !== 'content-type')) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', 'Vary': 'Origin',
    } });
  }
  let protocol = null;
  if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
    const offered = request.headers.get('Sec-WebSocket-Protocol') || '';
    if (offered.length > 1024) return new Response(null, { status: 400 });
    const protocols = offered.split(',').map(p => p.trim()).filter(Boolean);
    const credentials = protocols.filter(p => p.startsWith('joey-auth.'));
    if (credentials.length > 1 || (credentials.length && (!protocols.includes('joey-online-v1') || !/^joey-auth\.[a-f0-9]{64}$/.test(credentials[0])))) return new Response(null, { status: 403 });
    protocol = protocols.includes('joey-online-v1') ? 'joey-online-v1' : null;
    if (credentials.length) {
      const authorization = 'Bearer ' + credentials[0].slice(10);
      const existing = request.headers.get('Authorization');
      if (existing && existing !== authorization) return new Response(null, { status: 403 });
      const headers = new Headers(request.headers);
      headers.set('Authorization', authorization);
      headers.delete('Sec-WebSocket-Protocol');
      request = new Request(request, { headers });
    }
  }
  return { request, origin, protocol };
}
export function browserResponse(response, origin, protocol) {
  if (!origin && !protocol) return response;
  const headers = new Headers(response.headers);
  if (origin) { headers.set('Access-Control-Allow-Origin', origin); headers.append('Vary', 'Origin'); }
  if (response.status === 101) {
    if (protocol) headers.set('Sec-WebSocket-Protocol', protocol);
    return new Response(null, { status: 101, headers, webSocket: response.webSocket });
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
