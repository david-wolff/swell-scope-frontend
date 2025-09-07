"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { api, fetchJSONWithRetry } from "@/lib/api";
import { Card } from "@/components/Card";
import { CHART } from "@/lib/chartTheme";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ── helpers ───────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");

function toLocalISO(dateStr: string, end = false) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(
    dt.getHours()
  )}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
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
const hhmm = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const ddmmyy_hhmm = (t: number) => {
  const d = new Date(t);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
function degToCompass16(deg: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"] as const;
  const idx = Math.floor(((deg + 11.25) % 360) / 22.5) % 16;
  return dirs[idx];
}
function fmtNum(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string") return v;
  return String(v);
}

// ── componente ────────────────────────────────────────────────────────────────
export default function WavesPage() {
  const today = useMemo(() => new Date(), []);
  const defaultDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [path, setPath] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR(path ? api(path) : null, fetchJSONWithRetry, {
    revalidateOnFocus: false,
  });

  function buscar() {
    if (!startDate || !endDate) return;
    const start = toLocalISO(startDate, false);
    const end   = toLocalISO(endDate,   true);
    setPath(`/waves/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  }

  // normaliza payload
  const rows: any[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray((data as any).items)) return (data as any).items;
    if (Array.isArray((data as any).data)) return (data as any).data;
    return [];
  }, [data]);

  // padroniza e deduplica por timestamp (sempre escondemos duplicados)
  type StdRow = { time: unknown; hs?: number|null; tp?: number|null; dp?: number|null; sst?: number|null; air?: number|null; ws?: number|null; wd?: number|null; };
  const stdRows: StdRow[] = useMemo(() => rows.map(r => ({
    time: r.time ?? r.ts ?? r.timestamp ?? r.datetime,
    hs: r.hs ?? r.waveHeight ?? null,
    tp: r.tp ?? r.wavePeriod ?? null,
    dp: r.dp ?? r.waveDirection ?? null,
    sst: r.sst ?? r.waterTemperature ?? null,
    air: r.air_temp ?? r.airTemperature ?? null,
    ws: r.wind_speed ?? r.windSpeed ?? null,
    wd: r.wind_dir ?? r.windDirection ?? null,
  })), [rows]);

  const displayRows: StdRow[] = useMemo(() => {
    const sorted = [...stdRows].sort((a,b)=>
      (parseDateFlexible(a.time)?.getTime() ?? 0) - (parseDateFlexible(b.time)?.getTime() ?? 0)
    );
    const map = new Map<string, StdRow>();
    for (const r of sorted) {
      const d = parseDateFlexible(r.time);
      const key = d ? d.toISOString().slice(0,19) : `row-${map.size}`;
      if (!map.has(key)) map.set(key, r);
      else {
        const cur = map.get(key)!;
        map.set(key, { ...cur,
          hs: cur.hs ?? r.hs, tp: cur.tp ?? r.tp, dp: cur.dp ?? r.dp,
          sst: cur.sst ?? r.sst, air: cur.air ?? r.air, ws: cur.ws ?? r.ws, wd: cur.wd ?? r.wd
        });
      }
    }
    return Array.from(map.values());
  }, [stdRows]);

  // dados para o gráfico
  const chartData = useMemo(() => {
    const arr = displayRows.map(r => {
      const d = parseDateFlexible(r.time);
      if (!d) return null;
      return { t: d.getTime(), hs: r.hs ?? null, tp: r.tp ?? null };
    }).filter(Boolean) as {t:number;hs:number|null;tp:number|null}[];

    return arr;
  }, [displayRows]);

  const multiDay = useMemo(() => {
    if (chartData.length < 2) return false;
    const a = new Date(chartData[0].t); const b = new Date(chartData[chartData.length-1].t);
    return a.getDate() !== b.getDate() || a.getMonth() !== b.getMonth();
  }, [chartData]);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-8 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ondas</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Selecione um período e busque os dados.</p>
        </div>
        <Link href="/" className="text-sm opacity-70 hover:opacity-100 underline">← Voltar à Home</Link>
      </header>

      <Card title="Período">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col">
            <span className="text-xs mb-1 opacity-70">Início</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="rounded-xl border bg-transparent px-3 py-2 outline-none border-neutral-300 dark:border-neutral-700"/>
          </label>
          <label className="flex flex-col">
            <span className="text-xs mb-1 opacity-70">Fim</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="rounded-xl border bg-transparent px-3 py-2 outline-none border-neutral-300 dark:border-neutral-700"/>
          </label>
          <div className="flex gap-2">
            <button onClick={buscar}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Buscar
            </button>
            <button onClick={() => {
              const t = new Date(); const d = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;
              setStartDate(d); setEndDate(d);
            }} className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Hoje
            </button>
          </div>
        </div>
      </Card>

      {/* Gráfico do intervalo */}
      {chartData.length > 0 && (
        <Card title="Gráfico do período" description="Altura (m) e período (s) ao longo do intervalo selecionado">
          <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 28, left: 4, bottom: 8 }}>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t) => (multiDay ? ddmmyy_hhmm(Number(t)) : hhmm(Number(t)))}
                  tick={{ fill: CHART.axis, fontSize: 12 }}
                  axisLine={{ stroke: CHART.grid }}
                  tickLine={{ stroke: CHART.grid }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: CHART.axis, fontSize: 12 }}
                  axisLine={{ stroke: CHART.grid }}
                  tickLine={{ stroke: CHART.grid }}
                  width={52}
                  tickFormatter={(v) => `${Number(v).toFixed(2)} m`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: CHART.axis, fontSize: 12 }}
                  axisLine={{ stroke: CHART.grid }}
                  tickLine={{ stroke: CHART.grid }}
                  width={44}
                  tickFormatter={(v) => `${Number(v).toFixed(1)} s`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const hs = payload.find((p: any) => p.dataKey === "hs");
                    const tp = payload.find((p: any) => p.dataKey === "tp");
                    return (
                      <div style={{
                        background: CHART.tooltipBg, color: CHART.tooltipText, padding: "8px 10px",
                        borderRadius: 8, border: "1px solid #333", fontSize: 12
                      }}>
                        <div><strong>{multiDay ? ddmmyy_hhmm(Number(label)) : hhmm(Number(label))}</strong></div>
                        {hs && <div style={{ color: CHART.height }}>Altura: <strong>{Number(hs.value).toFixed(2)} m</strong></div>}
                        {tp && <div style={{ color: CHART.period }}>Período: <strong>{Number(tp.value).toFixed(2)} s</strong></div>}
                      </div>
                    );
                  }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="hs"
                  stroke={CHART.height}
                  strokeWidth={2.4}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="tp"
                  stroke={CHART.period}
                  strokeWidth={2.2}
                  strokeDasharray="6 6"
                  dot={false}
                  activeDot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* Tabela (já existia) */}
      <Card title="Resultados">
        {isLoading && <p className="text-sm opacity-70">Carregando…</p>}
        {error && <p className="text-sm text-red-500">Erro ao buscar dados.</p>}
        {!path && <p className="text-sm opacity-70">Selecione o período e clique em “Buscar”.</p>}
        {displayRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-neutral-500 dark:text-neutral-400">
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left py-2 pr-4">Data/Hora</th>
                  <th className="text-right py-2 pr-4">Altura (m)</th>
                  <th className="text-right py-2 pr-4">Período (s)</th>
                  <th className="text-right py-2 pr-4">Dir. Onda</th>
                  <th className="text-right py-2 pr-4">Temp. Água (°C)</th>
                  <th className="text-right py-2 pr-4">Temp. Ar (°C)</th>
                  <th className="text-right py-2 pr-4">Vento (m/s)</th>
                  <th className="text-right py-2">Dir. Vento</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map((r, i) => {
                  const d = parseDateFlexible(r.time);
                  const timeStr = d ? `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : "—";
                  const dpStr = typeof r.dp === "number" ? `${Math.round(r.dp)}° ${degToCompass16(r.dp)}` : (r.dp ?? "—");
                  const wdStr = typeof r.wd === "number" ? `${Math.round(r.wd)}° ${degToCompass16(r.wd)}` : (r.wd ?? "—");
                  return (
                    <tr key={i} className="border-b border-neutral-100 dark:border-neutral-900">
                      <td className="py-2 pr-4">{timeStr}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(r.hs)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(r.tp)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{dpStr}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(r.sst)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(r.air)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{fmtNum(r.ws)}</td>
                      <td className="py-2 text-right tabular-nums">{wdStr}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
