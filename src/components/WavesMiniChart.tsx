"use client";
import useSWR from "swr";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api, fetchJSONWithRetry } from "@/lib/api";
import { CHART } from "@/lib/chartTheme";

type WavePoint = { time: string | number; hs: number | null; tp: number | null };

const pad = (n: number) => String(n).padStart(2, "0");
const tzOffset = () => {
  const m = -new Date().getTimezoneOffset();
  const sign = m >= 0 ? "+" : "-";
  const hh = pad(Math.floor(Math.abs(m) / 60));
  const mm = pad(Math.abs(m) % 60);
  return `${sign}${hh}:${mm}`;
};
const todayISO = (end = false) => {
  const t = new Date();
  const d = new Date(t.getFullYear(), t.getMonth(), t.getDate(), end ? 23 : 0, end ? 59 : 0, end ? 59 : 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}:${pad(d.getSeconds())}${tzOffset()}`;
};
const toDate = (x: string | number) =>
  typeof x === "number" ? new Date(x > 1e12 ? x : x * 1000) : new Date(String(x).replace(" ", "T"));
const hhmm = (x: string | number) => {
  const d = toDate(x);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

function WavesTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const hs = payload.find((p: any) => p.dataKey === "hs");
  const tp = payload.find((p: any) => p.dataKey === "tp");
  return (
    <div style={{
      background: CHART.tooltipBg, color: CHART.tooltipText, padding: "8px 10px",
      borderRadius: 8, border: "1px solid #333", fontSize: 12
    }}>
      <div><strong>{hhmm(label)}</strong></div>
      {hs && <div style={{ color: CHART.height }}>Altura: <strong>{Number(hs.value).toFixed(2)} m</strong></div>}
      {tp && <div style={{ color: CHART.period }}>Período: <strong>{Number(tp.value).toFixed(2)} s</strong></div>}
    </div>
  );
}

function LegendInline() {
  return (
    <div className="mt-1 mb-2 flex items-center gap-4 text-xs" style={{ color: CHART.axis }}>
      <span className="inline-flex items-center gap-1">
        <span style={{ width: 16, height: 2, background: CHART.height, display: "inline-block" }} />
        Altura (m)
      </span>
      <span className="inline-flex items-center gap-1">
        <span style={{ width: 16, height: 0, borderTop: `2px dashed ${CHART.period}`, display: "inline-block" }} />
        Período (s)
      </span>
    </div>
  );
}

export function WavesMiniChart() {
  const start = todayISO(false);
  const end = todayISO(true);

  const { data } = useSWR(api(`/waves/?start=${start}&end=${end}`), fetchJSONWithRetry, {
    revalidateOnFocus: false,
  });

  const raw: any[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
  const points: WavePoint[] = raw.map((r) => ({
    time: r.time ?? r.ts ?? r.timestamp ?? r.datetime,
    hs: r.hs ?? r.waveHeight ?? null,
    tp: r.tp ?? r.wavePeriod ?? null,
  }));

  return (
    <div className="w-full h-72">
      <LegendInline />
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 28, left: 4, bottom: 8 }}>
          <CartesianGrid stroke={CHART.grid} strokeDasharray="3 3" />
          <XAxis
            dataKey="time"
            tickFormatter={hhmm}
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
          <Tooltip content={<WavesTooltip />} />
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
  );
}
