/**
 * Panorama loader + tiny cache.
 *
 * We download panoramas ourselves (fetch with streaming progress, timeout and
 * one retry) and hand Photo Sphere Viewer a local blob: URL. This
 *  - makes next-round preloading real: the bytes are already in memory when
 *    the round starts,
 *  - avoids a three.js FileLoader quirk where two viewers requesting the same
 *    URL share one request, so destroying one viewer could leave the other
 *    waiting forever,
 *  - gives us a reliable error signal so a broken image can be swapped out.
 */
const cache = new Map<string, Promise<string>>();
const MAX_ENTRIES = 4;

async function download(url: string, onProgress?: (pct: number) => void, timeoutMs = 45000): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !total) {
      const blob = await res.blob();
      onProgress?.(100);
      return URL.createObjectURL(blob);
    }
    // Stream the body so the loader can show real progress.
    const reader = res.body.getReader();
    const chunks: BlobPart[] = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.(Math.min(99, (received / total) * 100));
    }
    onProgress?.(100);
    return URL.createObjectURL(new Blob(chunks, { type: res.headers.get('content-type') ?? 'image/jpeg' }));
  } finally {
    clearTimeout(timer);
  }
}

/** Resolves to a blob: URL for the panorama. Concurrent/repeated calls share the same download. */
export function loadPanorama(url: string, onProgress?: (pct: number) => void): Promise<string> {
  const hit = cache.get(url);
  if (hit) {
    // Already downloading or downloaded: report completion when it lands.
    hit.then(() => onProgress?.(100)).catch(() => {});
    return hit;
  }
  const p = download(url, onProgress).catch(() => download(url, onProgress)); // one retry
  cache.set(url, p);
  p.catch(() => cache.delete(url)); // never cache failures

  // Evict the oldest entries (their textures are already on the GPU by then).
  while (cache.size > MAX_ENTRIES) {
    const [oldUrl, oldP] = cache.entries().next().value!;
    cache.delete(oldUrl);
    oldP.then((blobUrl) => setTimeout(() => URL.revokeObjectURL(blobUrl), 30000)).catch(() => {});
  }
  return p;
}

/** Fire-and-forget preload for the next round. */
export function preloadPanorama(url: string): void {
  loadPanorama(url).catch(() => {});
}
