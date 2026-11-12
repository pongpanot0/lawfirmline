import { IncomingMessage, ServerResponse } from 'node:http';
import { Duplex } from 'node:stream';
import type { RequestListener } from 'node:http';
import type { Socket } from 'node:net';

/** Exercise the real HTTP middleware without opening a port (also works in restricted CI). */
export function injectHttp(handler: RequestListener, url: string, init: RequestInit = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const socket = new Duplex({ read() {}, write(_chunk, _encoding, callback) { callback(); } });
    Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1' });
    const req = new IncomingMessage(socket as Socket);
    const parsed = new URL(url, 'http://localhost');
    const headers = new Headers(init.headers);
    const body = init.body?.toString() ?? '';
    if (!headers.has('host')) headers.set('host', parsed.host);
    if (body) headers.set('content-length', String(Buffer.byteLength(body)));
    req.method = init.method ?? 'GET';
    req.url = parsed.pathname + parsed.search;
    req.httpVersion = '1.1'; req.httpVersionMajor = 1; req.httpVersionMinor = 1;
    req.headers = Object.fromEntries(headers.entries());
    req.rawHeaders = [...headers.entries()].flat();
    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    const write = res.write.bind(res);
    const end = res.end.bind(res);
    res.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
      chunks.push(Buffer.from(chunk));
      return Reflect.apply(write, res, [chunk, ...args]);
    }) as typeof res.write;
    res.end = ((chunk?: string | Uint8Array, ...args: unknown[]) => {
      if (chunk && typeof chunk !== 'function') chunks.push(Buffer.from(chunk));
      return Reflect.apply(end, res, [chunk, ...args]);
    }) as typeof res.end;
    res.assignSocket(socket as Socket);
    req.on('error', reject); res.on('error', reject);
    res.on('finish', () => {
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(res.getHeaders())) {
        if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : String(value));
      }
      resolve(new Response([204, 205, 304].includes(res.statusCode) ? null : Buffer.concat(chunks), { status: res.statusCode, headers: responseHeaders }));
      socket.destroy();
    });
    handler(req, res);
    if (body) req.push(body);
    req.complete = true;
    req.push(null);
  });
}
