"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { api, fetchJSONWithRetry } from "@/lib/api";
import { Card } from "@/components/Card";

/* Helpers comuns */
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

function fmtNum(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string") return v;
  return String(v);
}

/* Extrai o campo de tempo (prioriza ts e afins) */
function extractTimeValue(row: any): unknown {
  if (!row || typeof row !== "object") return null;
  const preferred = ["ts","timestamp","datetime","time","date_time","datetime_utc","time_utc","dt","epoch","ts_epoch"];
  for (const k of preferred) if (k in row) return (row as any)[k];

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
  for (const [k, v] of Object.entries(row)) {
    if (/(time|date)/i.test(k) && (typeof v === "string" || typeof v === "number")) return v;
  }
  for (const [, v] of Object.entries(row)) {
    if (v && typeof v === "object") {
      const nested = extractTimeValue(v);
      if (nested) return nested;
    }
  }
  return null;
}

/* Normaliza tipo da maré para Alta/Baixa quando possível */
function normalizeTideType(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).toLowerCase();
  if (/high|alta|pre[aá]-?mar/.test(s)) return "Alta";
  if (/low|baixa|baix[aá]-?mar/.test(s)) return "Baixa";
  if (/ebb|vazante/.test(s)) return "Vazante";
  if (/flood|enchente|subindo/.test(s)) return "Enchente";
  // fallback: capitaliza primeira letra
  return String(v).slice(0,1).toUpperCase() + String(v).slice(1);
}

type TideRow = {
  time: unknown;
  height?: number | null;   // metros
  type?: string | null;     // Alta/Baixa/etc
  source?: string | null;
  location?: string | null;
};

export default function TidesPage() {
  // período padrão: hoje
  const today = useMemo(() => new Date(), []);
  const defaultDate = `${today.getFullYear()}-${pad(today.getMonth()+1)}-${pad(today.getDate())}`;

  const [startDate, setStartDate] = useState(defaultDate);
  const [endDate, setEndDate] = useState(defaultDate);
  const [path, setPath] = useState<string | null>(null);

  const { data, error, isLoading } = useSWR(path ? api(path) : null, fetchJSONWithRetry, {
    revalidateOnFocus: false,
  });

  function buscar() {
    if (!startDate || !endDate) return;
    const start = toLocalISO(startDate, false);
    const end   = toLocalISO(endDate, true);
    setPath(`/tides/?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`);
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
  const stdRows: TideRow[] = useMemo(() => rows.map((r) => ({
    time: extractTimeValue(r),
    height: r.height ?? r.h ?? r.level ?? r.tide_height ?? r.amplitude ?? null,
    type: normalizeTideType(r.type ?? r.tide_type ?? r.kind ?? r.state ?? r.event ?? null),
    source: r.source ?? null,
    location: r.location ?? null,
  })), [rows]);

  // dedup por instante (preenche valores faltantes)
  function timeKey(v: unknown): string | null {
    const d = parseDateFlexible(v);
    if (!d) return null;
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  const uniqueRows: TideRow[] = useMemo(() => {
    const sorted = [...stdRows].sort((a,b) =>
      (parseDateFlexible(a.time)?.getTime() ?? 0) - (parseDateFlexible(b.time)?.getTime() ?? 0)
    );
    const map = new Map<string, TideRow>();
    for (const r of sorted) {
      const key = timeKey(r.time) ?? `row-${map.size}`;
      const cur = map.get(key);
      if (!cur) map.set(key, r);
      else {
        map.set(key, {
          ...cur,
          height: cur.height ?? r.height,
          type: cur.type ?? r.type,
          source: cur.source ?? r.source,
          location: cur.location ?? r.location,
        });
      }
    }
    return Array.from(map.values());
  }, [stdRows]);

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
            <input type="date" value={startDate} onChange={(e)=>setStartDate(e.target.value)}
              className="rounded-xl border bg-transparent px-3 py-2 outline-none border-neutral-300 dark:border-neutral-700"/>
          </label>
          <label className="flex flex-col">
            <span className="text-xs mb-1 opacity-70">Fim</span>
            <input type="date" value={endDate} onChange={(e)=>setEndDate(e.target.value)}
              className="rounded-xl border bg-transparent px-3 py-2 outline-none border-neutral-300 dark:border-neutral-700"/>
          </label>
          <div className="flex gap-2">
            <button onClick={buscar}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Buscar
            </button>
            <button onClick={()=>{
              const t = new Date();
              const todayStr = `${t.getFullYear()}-${pad(t.getMonth()+1)}-${pad(t.getDate())}`;
              setStartDate(todayStr); setEndDate(todayStr);
            }}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800">
              Hoje
            </button>
          </div>
        </div>
      </Card>

      <Card title="Resultados">
        {isLoading && <p className="text-sm opacity-70">Carregando…</p>}
        {error && <p className="text-sm text-red-500">Erro ao buscar dados.</p>}
        {!path && <p className="text-sm opacity-70">Selecione o período e clique em “Buscar”.</p>}

        {uniqueRows.length > 0 && (
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
                {uniqueRows.map((r, i) => (
                  <tr key={i} className="border-b border-neutral-100 dark:border-neutral-900">
                    <td className="py-2 pr-4">{fmtTime(r.time)}</td>
                    <td className="py-2 pr-4">{r.type ?? "—"}</td>
                    <td className="py-2 pr-0 text-right tabular-nums">{fmtNum(r.height)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </main>
  );
}
