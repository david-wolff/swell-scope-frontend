import { NextResponse } from "next/server";

const BASE = (process.env.NEXT_PUBLIC_API_BASE_URL || "").replace(/\/$/, "");

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path") || "/";
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;

  // retry/backoff para quando o Render estiver “acordando”
  let lastErr: unknown;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      return new NextResponse(text, {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") || "application/json" },
      });
    } catch (e) {
      lastErr = e;
      await sleep(600 * 2 ** i);
    }
  }
  return NextResponse.json({ error: "upstream unreachable", detail: String(lastErr) }, { status: 502 });
}
