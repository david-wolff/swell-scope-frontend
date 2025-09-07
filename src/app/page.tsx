"use client";
import useSWR from "swr";
import { api, fetchJSONWithRetry } from "@/lib/api";
import { Card } from "@/components/Card";
import { SummaryGrid } from "@/components/SummaryGrid";
import { TidesMiniChart } from "@/components/TidesMiniChart";
import { WavesMiniChart } from "@/components/WavesMiniChart";

export default function HomePage() {
  const { data, error, isLoading, mutate } = useSWR(api("/waves/summary"), fetchJSONWithRetry, {
    revalidateOnFocus: false,
  });

  return (
    <main id="home" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-8 py-6">
      <header className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Resumo do dia em "Leme - Rio de Janeiro"</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Média dos dados obtidos através da Open-Meteo Marine API
          </p>
        </div>
        <button
          onClick={() => mutate()}
          className="rounded-xl border px-3 py-1 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Atualizar
        </button>
      </header>

      <Card title="Visão geral" description={error ? "Falha ao carregar" : "Valores principais do dia"}>
        {isLoading && <p className="text-sm opacity-70">Carregando…</p>}
        {error && <div className="text-red-600 dark:text-red-400 text-sm">Erro ao buscar summary.</div>}
        {data && <SummaryGrid summary={data} />}
      </Card>

      <section id="tides" className="space-y-3">
        <h2 className="text-lg font-medium opacity-80">Marés</h2>
        <div className="rounded-2xl border border-neutral-200/70 p-4 dark:border-neutral-800">
          <Card title="Marés hoje" description="Altura (m) e eventos de alta/baixa">
            <TidesMiniChart />
          </Card>
        </div>
      </section>

      <section id="waves" className="space-y-3">
        <h2 className="text-lg font-medium opacity-80">Ondas</h2>
        <div className="rounded-2xl border border-neutral-200/70 p-4 dark:border-neutral-800">
          <Card title="Ondas hoje" description="Altura (m) e período (s)">
            <WavesMiniChart />
          </Card>
        </div>
      </section>
    </main>
  );
}
