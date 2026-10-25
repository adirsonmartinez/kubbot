// Reads a request body without trusting it: a declared Content-Length over the limit is refused before
// reading anything, and the stream is counted so a chunked body (no length) stops at the limit too.
// No React, no I/O besides the request itself.

export type BodyRead = { ok: true; bytes: Uint8Array } | { ok: false; status: 400 | 413 };

export async function readBody(request: Request, maxBytes: number): Promise<BodyRead> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (!Number.isFinite(n) || n < 0) return { ok: false, status: 400 };
    if (n > maxBytes) return { ok: false, status: 413 };
  }
  if (!request.body) return { ok: true, bytes: new Uint8Array(0) };
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, status: 413 };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400 };
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    bytes.set(c, at);
    at += c.byteLength;
  }
  return { ok: true, bytes };
}

export async function readText(request: Request, maxBytes: number): Promise<{ ok: true; text: string } | { ok: false; status: 400 | 413 }> {
  const body = await readBody(request, maxBytes);
  return body.ok ? { ok: true, text: new TextDecoder().decode(body.bytes) } : body;
}
