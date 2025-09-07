"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { api, fetchJSONWithRetry } from "@/lib/api";
import { Card } from "@/components/Card";
import { CHART } from "@/lib/chartTheme";
import {
  Area, AreaChart, CartesianGrid, Label, ReferenceDot,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
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
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const tideLabel = (t?: string | null) => {
  if (!t) return null;
  const s = t.toString().toLowerCase();
  if (s.includes("high") || s.includes("alta")) return "Alta";
  if (s.includes("low") || s.includes("baixa")) return "Baixa";
  return t;
};

// ── componente ────────────────────────────────────────────────────────────────
export default function TidesPage() {
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
    setPath(`/tides/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  }

  // normaliza payload
  const rows: any[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray((data as any).items)) return (data as any).items;
    if (Array.isArray((data as any).data)) return (data as any).data;
    return [];
  }, [data]);

  type TP = { t:number; height:number; type?:string|null };
  const points: TP[] = useMemo(() => {
    const arr = rows.map(r => {
      const d = parseDateFlexible(r.time ?? r.ts ?? r.timestamp ?? r.datetime);
      if (!d) return null;
      return { t: d.getTime(), height: Number(r.height ?? r.tide ?? r.value ?? 0), type: r.type ?? r.event ?? null };
    }).filter(Boolean) as TP[];
    return arr.sort((a,b)=>a.t-b.t);
  }, [rows]);

  const extremes = useMemo(() => points.filter(p => p.type), [points]);
  const multiDay = useMemo(() => {
    if (points.length < 2) return false;
    const a = new Date(points[0].t), b = new Date(points[points.length-1].t);
    return a.getDate() !== b.getDate() || a.getMonth() !== b.getMonth();
  }, [points]);

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-8 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Marés</h1>
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
      {points.length > 0 && (
        <Card title="Gráfico do período" description="Altura (m) ao longo do intervalo selecionado">
          <div className="w-full h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 16, right: 20, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="tideArea-range" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART.areaFrom} />
                    <stop offset="100%" stopColor={CHART.areaTo} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
                <XAxis
                  dataKey="t"
                  tickFormatter={(t)=> multiDay ? ddmmyy_hhmm(Number(t)) : hhmm(Number(t))}
                  tick={{ fill: CHART.axis, fontSize: 12 }}
                  axisLine={{ stroke: CHART.grid }}
                  tickLine={{ stroke: CHART.grid }}
                />
                <YAxis
                  tick={{ fill: CHART.axis, fontSize: 12 }}
                  axisLine={{ stroke: CHART.grid }}
                  tickLine={{ stroke: CHART.grid }}
                  width={52}
                  tickFormatter={(v) => `${Number(v).toFixed(2)} m`}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0]?.payload as TP;
                    return (
                      <div style={{
                        background: CHART.tooltipBg, color: CHART.tooltipText, padding: "8px 10px",
                        borderRadius: 8, border: "1px solid #333", fontSize: 12
                      }}>
                        <div><strong>{multiDay ? ddmmyy_hhmm(Number(label)) : hhmm(Number(label))}</strong></div>
                        <div>Altura: <strong>{Number(p.height).toFixed(2)} m</strong></div>
                        {p.type && <div>Extremo: <strong>{tideLabel(p.type)}</strong></div>}
                      </div>
                    );
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="height"
                  stroke={CHART.height}
                  strokeWidth={2.4}
                  fill="url(#tideArea-range)"
                  activeDot={{ r: 4 }}
                  connectNulls
                />
                {extremes.map((e, i) => (
                  <ReferenceDot
                    key={i}
                    x={e.t}
                    y={e.height}
                    r={4.5}
                    stroke={CHART.axis}
                    fill={CHART.height}
                  >
                    <Label
                      value={tideLabel(e.type) ?? ""}
                      position="top"
                      fill={CHART.axis}
                      fontSize={12}
                    />
                  </ReferenceDot>
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {/* (Opcional) Pequena tabela dos extremos */}
      {rows.length > 0 && (
        <Card title="Extremos detectados">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-neutral-500 dark:text-neutral-400">
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className="text-left py-2 pr-4">Data/Hora</th>
                  <th className="text-left py-2 pr-4">Tipo</th>
                  <th className="text-right py-2 pr-0">Altura (m)</th>
                </tr>
              </thead>
              <tbody>
                {extremes.map((e, i) => (
                  <tr key={i} className="border-b border-neutral-100 dark:border-neutral-900">
                    <td className="py-2 pr-4">{ddmmyy_hhmm(e.t)}</td>
                    <td className="py-2 pr-4">{tideLabel(e.type)}</td>
                    <td className="py-2 pr-0 text-right tabular-nums">{Number(e.height).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
