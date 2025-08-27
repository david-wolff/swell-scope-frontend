"use client";
import { useId, useMemo } from "react";
import useSWR from "swr";
import { api, fetchJSONWithRetry } from "@/lib/api";

type TideItem = { ts: string; height?: number | null; type?: string | null };

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalISO(dateStr: string, end = false) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0);
  const offMin = -dt.getTimezoneOffset();
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const hh = pad(Math.floor(abs / 60));
  const mm = pad(abs % 60);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`
       + `T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}${sign}${hh}:${mm}`;
}

function parseDateFlexible(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v > 1e12 ? v : v * 1000);
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) return new Date(s.replace(" ", "T"));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00`);
  const d = new Date(s);
  return isNaN(+d) ? null : d;
}

function normalizeType(v: unknown): "Alta" | "Baixa" | string {
  if (v == null) return "—";
  const s = String(v).toLowerCase();
  if (/high|alta|pre[aá]-?mar/.test(s)) return "Alta";
  if (/low|baixa|baix[aá]-?mar/.test(s)) return "Baixa";
  return String(v).slice(0, 1).toUpperCase() + String(v).slice(1);
}

// Catmull-Rom → Bezier (tension controla suavidade)
function smoothPath(points: Array<{x:number; y:number}>, tension = 0.5) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  const segs: string[] = [];
  segs.push(`M${points[0].x},${points[0].y}`);
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1.x + ((p2.x - p0.x) / 6) * tension;
    const cp1y = p1.y + ((p2.y - p0.y) / 6) * tension;
    const cp2x = p2.x - ((p3.x - p1.x) / 6) * tension;
    const cp2y = p2.y - ((p3.y - p1.y) / 6) * tension;

    segs.push(`C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`);
  }
  return segs.join(" ");
}

export function TidesMiniChart() {
  const gradId = useId(); // evita conflito de ids do SVG
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const start = toLocalISO(todayStr, false);
  const end = toLocalISO(todayStr, true);

  const { data, error, isLoading } = useSWR(
    api(`/tides/?start=${start}&end=${end}`),
    fetchJSONWithRetry,
    { revalidateOnFocus: false }
  );

  // normaliza + dedup + ordena
  const items: TideItem[] = useMemo(() => {
    const raw = data?.items ?? data ?? [];
    if (!Array.isArray(raw)) return [];
    const map = new Map<string, TideItem>();
    for (const it of raw) {
      const ts = typeof it.ts === "string" ? it.ts : it.time ?? it.datetime ?? null;
      if (!ts) continue;
      const key = parseDateFlexible(ts)?.toISOString() ?? String(ts);
      if (!map.has(key)) {
        map.set(key, { ts, height: it.height ?? it.value ?? null, type: it.type ?? null });
      } else {
        const cur = map.get(key)!;
        map.set(key, { ts, height: cur.height ?? (it.height ?? null), type: cur.type ?? (it.type ?? null) });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => (parseDateFlexible(a.ts)?.getTime() ?? 0) - (parseDateFlexible(b.ts)?.getTime() ?? 0)
    );
  }, [data]);

  // viewBox + escalas
  const vb = { w: 720, h: 200, padX: 36, padY: 20 };
  const { pts, yTicks, pathLine, pathArea, firstT, lastT, minH, maxH } = useMemo(() => {
    if (items.length === 0) {
      return { pts: [] as any[], yTicks: [] as number[], pathLine: "", pathArea: "", firstT: null as Date | null, lastT: null as Date | null, minH: 0, maxH: 0 };
    }
    const first = parseDateFlexible(items[0].ts) ?? new Date();
    const last = parseDateFlexible(items[items.length - 1].ts) ?? first;
    const t0 = first.getTime(), t1 = Math.max(t0 + 1, last.getTime());
    const vals = items.map((it) => (typeof it.height === "number" ? it.height : null)).filter((v) => v != null) as number[];
    const vMin = Math.min(...vals), vMax = Math.max(...vals);
    const padV = (vMax - vMin) * 0.18 || 0.2;
    const yMin = vMin - padV, yMax = vMax + padV;

    const xScale = (t: number) => vb.padX + ((t - t0) / (t1 - t0)) * (vb.w - vb.padX * 2);
    const yScale = (v: number) => vb.padY + (1 - (v - yMin) / Math.max(1e-9, (yMax - yMin))) * (vb.h - vb.padY * 2);

    const points = items.map((it) => {
      const t = parseDateFlexible(it.ts)?.getTime() ?? t0;
      const h = typeof it.height === "number" ? it.height : vals[0];
      return { x: xScale(t), y: yScale(h), t: new Date(parseDateFlexible(it.ts) ?? new Date()), h, type: it.type ? normalizeType(it.type) : null };
    });

    const baselineY = vb.h - vb.padY;
    const dLine = smoothPath(points, 0.6);
    const dArea = dLine + ` L${points[points.length - 1].x},${baselineY} L${points[0].x},${baselineY} Z`;

    // 3 ticks (min, mid, max) bonitos
    const mid = (vMin + vMax) / 2;
    const nice = (v: number) => Math.round(v * 100) / 100;
    const ticks = [nice(vMin), nice(mid), nice(vMax)];

    return { pts: points, yTicks: ticks, pathLine: dLine, pathArea: dArea, firstT: first, lastT: last, minH: vMin, maxH: vMax };
  }, [items]);

  if (error) return <p className="text-sm text-red-500">Erro ao carregar marés.</p>;
  if (isLoading) return <p className="text-sm opacity-70">Carregando marés…</p>;
  if (pts.length === 0) return <p className="text-sm opacity-70">Sem dados de marés para hoje.</p>;

  // próximos 2 eventos (Alta/Baixa)
  const nowT = now.getTime();
  const upcoming = pts.filter(p => p.type && p.t.getTime() >= nowT).slice(0, 2);

  return (
    <div className="space-y-3">
      <div className="aspect-[16/5] w-full">
        <svg viewBox={`0 0 ${vb.w} ${vb.h}`} className="h-full w-full">
          <defs>
            {/* gradiente usa currentColor com opacidades distintas */}
            <linearGradient id={`grad-${gradId}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
            </linearGradient>
            <filter id={`shadow-${gradId}`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="currentColor" floodOpacity="0.22" />
            </filter>
          </defs>

          {/* grade sutil (3 linhas) */}
          {yTicks.map((v, i) => {
            const y = (() => {
              const span = (vb.h - vb.padY * 2);
              const ratio = (v - minH) / Math.max(1e-9, (maxH - minH));
              return vb.padY + (1 - ratio) * span;
            })();
            return (
              <g key={i}>
                <line x1={vb.padX} x2={vb.w - vb.padX} y1={y} y2={y} stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" />
                <text x={8} y={y - 2} className="text-[10px] fill-current" style={{opacity:0.45}}>
                  {v.toFixed(2)} m
                </text>
              </g>
            );
          })}

          {/* área + linha */}
          <path d={pathArea} fill={`url(#grad-${gradId})`} />
          <path d={pathLine} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" filter={`url(#shadow-${gradId})`} />

          {/* pontos + labels de evento */}
          {pts.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={2.6} className="fill-current" opacity={0.8}>
                <title>{`${pad(p.t.getHours())}:${pad(p.t.getMinutes())} • ${p.h.toFixed(2)} m${p.type ? ` • ${p.type}` : ""}`}</title>
              </circle>
              {p.type && (
                <text x={p.x} y={p.y - 10} textAnchor="middle" className="text-[10px] fill-current" style={{opacity:0.7}}>
                  {p.type}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* faixa de info mínima */}
      <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          {firstT ? `${pad(firstT.getDate())}/${pad(firstT.getMonth()+1)} ${pad(firstT.getHours())}:${pad(firstT.getMinutes())}` : ""}
        </span>
        {upcoming.length > 0 && (
          <div className="flex gap-3">
            {upcoming.map((u, i) => (
              <span key={i} className="tabular-nums">
                {u.type ?? ""}: {pad(u.t.getHours())}:{pad(u.t.getMinutes())} · {u.h.toFixed(2)} m
              </span>
            ))}
          </div>
        )}
        <span>
          {lastT ? `${pad(lastT.getDate())}/${pad(lastT.getMonth()+1)} ${pad(lastT.getHours())}:${pad(lastT.getMinutes())}` : ""}
        </span>
      </div>
    </div>
  );
}
