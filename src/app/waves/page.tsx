"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { api, fetchJSONWithRetry } from "@/lib/api";
import { Card } from "@/components/Card";

// helpers ──────────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");

function toLocalISO(dateStr: string, end = false) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0);

  const offMin = -dt.getTimezoneOffset(); // minutos adiantados vs UTC
  const sign = offMin >= 0 ? "+" : "-";
  const abs = Math.abs(offMin);
  const hh = pad(Math.floor(abs / 60));
  const mm = pad(abs % 60);

  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}` +
         `T${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}${sign}${hh}:${mm}`;
}


function degToCompass16(deg: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"] as const;
  const idx = Math.floor(((deg + 11.25) % 360) / 22.5) % 16;
  return dirs[idx];
}

function fmtNum(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
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

function fmtTime(v: unknown): string {
  const d = parseDateFlexible(v);
  if (!d) return "—";
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// acha automaticamente o campo de tempo
function extractTimeValue(row: any): unknown {
  if (!row || typeof row !== "object") return null;

  // 1) preferências fortes (inclui seu schema: ts)
  const preferred = [
    "ts", "timestamp", "datetime", "time", "date_time",
    "datetime_utc", "time_utc", "dt", "ts_epoch", "epoch"
  ];
  for (const k of preferred) {
    if (k in row) return (row as any)[k];
  }

  // 2) reconstruir se vierem campos separados (date + hour/minute/second)
  const dateKey = Object.keys(row).find(k => /^date$/i.test(k));
  if (dateKey) {
    const hKey = Object.keys(row).find(k => /(hour|hr|h)$/i.test(k));
    const mKey = Object.keys(row).find(k => /(minute|min|m)$/i.test(k));
    const sKey = Object.keys(row).find(k => /(second|sec|s)$/i.test(k));
    if (hKey || mKey || sKey) {
      const d = String((row as any)[dateKey]).trim();
      const h = Number((row as any)[hKey ?? ""]) || 0;
      const m = Number((row as any)[mKey ?? ""]) || 0;
      const s = Number((row as any)[sKey ?? ""]) || 0;
      return `${d} ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
    }
  }

  // 3) qualquer chave que contenha time/date
  for (const [k, v] of Object.entries(row)) {
    if (/(time|date)/i.test(k) && (typeof v === "string" || typeof v === "number")) return v;
  }

  // 4) tenta um nível aninhado
  for (const [, v] of Object.entries(row)) {
    if (v && typeof v === "object") {
      const nested = extractTimeValue(v);
      if (nested) return nested;
    }
  }
  return null;
}

type StdRow = {
  time: unknown;
  hs?: number | null;
  tp?: number | null;
  dp?: number | null;
  sst?: number | null;
  air?: number | null;
  ws?: number | null;
  wd?: number | null;
};

// component ────────────────────────────────────────────────────────────────────
export default function WavesPage() {
  // defaults: hoje
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
    const end = toLocalISO(endDate, true);
    setPath(`/waves/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
  }

  // normaliza possíveis estruturas
  const rows: any[] = useMemo(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if (Array.isArray((data as any).items)) return (data as any).items;
    if (Array.isArray((data as any).data)) return (data as any).data;
    return [];
  }, [data]);

  // mapeia para chaves padronizadas
  const stdRows: StdRow[] = useMemo(
    () =>
      rows.map((r) => ({
        time: extractTimeValue(r),
        hs: r.hs ?? r.waveHeight ?? null,
        tp: r.tp ?? r.wavePeriod ?? null,
        dp: r.dp ?? r.waveDirection ?? null,
        sst: r.sst ?? r.waterTemperature ?? null,
        air: r.air_temp ?? r.airTemperature ?? null,
        ws: r.wind_speed ?? r.windSpeed ?? null,
        wd: r.wind_dir ?? r.windDirection ?? null,
      })),
    [rows]
  );

  function timeKey(v: unknown): string | null {
    const d = parseDateFlexible(v);
    if (!d) return null;
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
      d.getMinutes()
    )}:${pad(d.getSeconds())}`;
  }

  // dedup SEMPRE ligado (preenche campos faltantes)
  const uniqueRows: StdRow[] = useMemo(() => {
    const sorted = [...stdRows].sort(
      (a, b) => (parseDateFlexible(a.time)?.getTime() ?? 0) - (parseDateFlexible(b.time)?.getTime() ?? 0)
    );
    const map = new Map<string, StdRow>();
    for (const r of sorted) {
      const key = timeKey(r.time) ?? `row-${map.size}`;
      const cur = map.get(key);
      if (!cur) map.set(key, r);
      else {
        map.set(key, {
          ...cur,
          hs:  cur.hs  ?? r.hs,
          tp:  cur.tp  ?? r.tp,
          dp:  cur.dp  ?? r.dp,
          sst: cur.sst ?? r.sst,
          air: cur.air ?? r.air,
          ws:  cur.ws  ?? r.ws,
          wd:  cur.wd  ?? r.wd,
        });
      }
    }
    return Array.from(map.values());
  }, [stdRows]);

  const collapsedInfo = useMemo(
    () => ({ total: stdRows.length, unique: uniqueRows.length }),
    [stdRows.length, uniqueRows.length]
  );

  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-8 py-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Ondas</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Selecione um período e busque os dados.</p>
        </div>
        <Link href="/" className="text-sm opacity-70 hover:opacity-100 underline">
          ← Voltar à Home
        </Link>
      </header>

      <Card title="Período">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-col">
            <span className="text-xs mb-1 opacity-70">Início</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-xl border bg-transparent px-3 py-2 outline-none border-neutral-300 dark:border-neutral-700"
            />
          </label>
          <label className="flex flex-col">
            <span className="text-xs mb-1 opacity-70">Fim</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-xl border bg-transparent px-3 py-2 outline-none border-neutral-300 dark:border-neutral-700"
            />
          </label>
          <div className="flex gap-2">
            <button
              onClick={buscar}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Buscar
            </button>
            <button
              onClick={() => {
                const t = new Date();
                const todayStr = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
                setStartDate(todayStr);
                setEndDate(todayStr);
              }}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
            >
              Hoje
            </button>
          </div>
        </div>
      </Card>

      <Card title="Resultados">
        <div className="mb-3 flex items-center gap-3">
          {isLoading && <p className="text-sm opacity-70">Carregando…</p>}
          {error && <p className="text-sm text-red-500">Erro ao buscar dados.</p>}
          {!path && <p className="text-sm opacity-70">Selecione o período e clique em “Buscar”.</p>}
          {collapsedInfo.total !== collapsedInfo.unique && (
            <span className="ml-auto text-xs opacity-60">
              {collapsedInfo.total} registros → {collapsedInfo.unique} instantes (duplicatas colapsadas)
            </span>
          )}
        </div>

        {uniqueRows.length > 0 && (
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
                {uniqueRows.map((r, i) => {
                  const dpStr = typeof r.dp === "number" ? `${Math.round(r.dp)}° ${degToCompass16(r.dp)}` : (r.dp ?? "—");
                  const wdStr = typeof r.wd === "number" ? `${Math.round(r.wd)}° ${degToCompass16(r.wd)}` : (r.wd ?? "—");
                  return (
                    <tr key={i} className="border-b border-neutral-100 dark:border-neutral-900">
                      <td className="py-2 pr-4">{fmtTime(r.time)}</td>
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
