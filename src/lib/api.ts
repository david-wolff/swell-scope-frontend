export const api = (path: string) => `/api/proxy?path=${encodeURIComponent(path)}`;
export async function fetchJSONWithRetry(input: string, init?: RequestInit, retries = 1) {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(input, { ...init, cache: "no-store" });
    if (res.ok) return res.json();
    if (i === retries) throw new Error(`HTTP ${res.status}`);
    await new Promise(r => setTimeout(r, 400 * (i + 1)));
  }
  throw new Error("unreachable");
}
