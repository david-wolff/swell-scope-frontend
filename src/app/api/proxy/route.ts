// Rota proxy para o backend no Render
export const runtime = "nodejs";

function getBaseUrl() {
  return (
    process.env.BACKEND_URL ||
    process.env.NEXT_PUBLIC_BACKEND_URL ||
    "http://localhost:8000"
  );
}

function buildTargetUrl(rawPath: string): string {
  const once = decodeURIComponent(rawPath); // decodifica UMA vez
  let pathWithQuery = once;

  if (/^https?:\/\//i.test(once)) {
    const u = new URL(once);
    pathWithQuery = `${u.pathname}${u.search}`;
  }

  const safe = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  const base = getBaseUrl();
  return new URL(safe, base).toString();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("path") || "/health";

  try {
    const target = buildTargetUrl(raw);
    const res = await fetch(target, {
      cache: "no-store",
      headers: { accept: "application/json, text/plain;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout?.(8000),
    });

    const body = await res.text();
    const headers = new Headers({
      "content-type": res.headers.get("content-type") || "application/json",
    });
    return new Response(body, { status: res.status, headers });
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        error: "proxy_error",
        detail: String(err?.message || err),
        base: getBaseUrl(),
        got: raw,
        target: (() => { try { return buildTargetUrl(raw); } catch { return null; } })(),
      },
      { status: 502 }
    );
  }
}
