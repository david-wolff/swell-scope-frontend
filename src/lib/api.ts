export const api = (path: string) => `/api/proxy?path=${encodeURIComponent(path)}`;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export async function fetchJSONWithRetry(url: string, init?: RequestInit) {
  let err: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { ...init, cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) { err = e; await sleep(600 * 2 ** i); }
  }
  throw err ?? new Error("network error");
}
