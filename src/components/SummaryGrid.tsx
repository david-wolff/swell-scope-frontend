// src/components/SummaryGrid.tsx
const LABELS: Record<string, string> = {
  date: "Data",
  hs_avg: "Altura",
  tp_avg: "Período",
  dp_avg: "Direção da Onda",
  sst_avg: "Temp. da Água",
  air_temp_avg: "Temp. do Ar",
  wind_speed_avg: "Vento",
  wind_dir_avg: "Dir. do Vento",
};

const UNITS: Record<string, string> = {
  hs_avg: "m",
  tp_avg: "s",
  dp_avg: "°",           // mostrado com cardeal
  sst_avg: "°C",
  air_temp_avg: "°C",
  wind_speed_avg: "m/s",
  wind_dir_avg: "°",     // mostrado com cardeal
};

// 8 pontos cardeais
function degToCompass16(deg: number) {
  const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"] as const;
  const idx = Math.floor(((deg + 11.25) % 360) / 22.5) % 16;
  return dirs[idx];
}


const fmtNumber = (x: number) =>
  Number.isInteger(x) ? `${x}` : x.toFixed(2);

function formatValue(key: string, value: unknown) {
  if (value == null) return "—";

  // direções: mostrar "156° SE"
  if ((key === "dp_avg" || key === "wind_dir_avg") && typeof value === "number") {
    const deg = Math.round(value);
    return `${deg}° ${degToCompass16(deg)}`;
  }

  if (typeof value === "number") {
    const unit = UNITS[key];
    const num = fmtNumber(value);
    return unit ? `${num} ${unit}` : num;
  }

  // datas/strings em geral
  return String(value);
}

export function SummaryGrid({ summary }: { summary: Record<string, any> }) {
  // pega o primeiro nível "rico" do objeto (plano ou um subobjeto com >=3 chaves)
  const source = (() => {
    if (!summary || typeof summary !== "object") return {};
    const entries = Object.entries(summary);
    const flat = entries.filter(([, v]) => typeof v !== "object" || v === null);
    if (flat.length >= 3) return summary;
    for (const [, v] of entries) if (v && typeof v === "object" && Object.keys(v).length >= 3) return v;
    return summary;
  })() as Record<string, any>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Object.entries(source).map(([k, v]) => (
        <div key={k} className="rounded-xl border border-neutral-200/70 p-4 dark:border-neutral-800">
          <div className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatValue(k, v)}
          </div>
          <div className="text-xs uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            {LABELS[k] ?? k}
          </div>
        </div>
      ))}
    </div>
  );
}
