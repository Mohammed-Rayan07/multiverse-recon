/**
 * localStorage helpers that never throw (private mode, blocked storage, SSR).
 * Only used for per-player conveniences: settings, tour seen, recent locations,
 * personal bests. The shared leaderboard lives on the server.
 */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`mr:${key}`);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(`mr:${key}`, JSON.stringify(value));
  } catch {
    /* storage unavailable – ignore */
  }
}
