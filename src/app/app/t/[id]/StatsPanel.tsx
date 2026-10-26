"use client";
import { useMemo } from "react";
import { useApi } from "@/lib/client/hooks";
import type { Entry, Stats } from "@/lib/client/types";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { StatChart, chartTheme } from "@/components/StatChart";
import { ParticipantAvatar } from "@/components/ParticipantAvatar";

const axis = { axisLine: { lineStyle: { color: chartTheme.line } }, axisLabel: { color: chartTheme.text }, splitLine: { lineStyle: { color: chartTheme.line, type: "dashed" as const } } };
const tooltip = { trigger: "axis" as const, backgroundColor: "#111725", borderColor: "#222c42", textStyle: { color: "#eef2fb" } };

function barOption(names: string[], values: number[], color: string, label: string) {
  return {
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip,
    xAxis: { type: "value", minInterval: 1, ...axis },
    yAxis: { type: "category", data: names, inverse: true, ...axis, splitLine: { show: false } },
    series: [{ type: "bar", name: label, data: values, barWidth: 16, itemStyle: { color, borderRadius: [0, 8, 8, 0] }, label: { show: true, position: "right", color: "#eef2fb", fontWeight: 700 } }],
  };
}

/** Estatísticas derivadas exclusivamente de partidas concluídas (critério informado pelo servidor). */
export function StatsPanel({ tournamentId, entries }: { tournamentId: string; entries: Map<string, Entry> }) {
  const { data, error, loading, reload } = useApi<Stats>(`/api/tournaments/${tournamentId}/stats`);
  const name = (id: string) => entries.get(id)?.name ?? "—";

  const options = useMemo(() => {
    if (!data) return null;
    const s = data.stats;
    const attack = s.bestAttack.slice(0, 8);
    const defense = s.bestDefense.slice(0, 8);
    const evo = data.evolution;
    const ids = evo.length ? evo[evo.length - 1].rows.slice(0, 8).map((r) => r.entryId) : [];
    return {
      attack: barOption(attack.map((r) => name(r.entryId)), attack.map((r) => r.goalsFor), "#c6ff3d", "Gols pró"),
      defense: barOption(defense.map((r) => name(r.entryId)), defense.map((r) => r.goalsAgainst), "#35e0ff", "Gols sofridos"),
      evolution: evo.length > 1 ? {
        grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
        tooltip,
        legend: { top: 0, textStyle: { color: chartTheme.text }, type: "scroll" },
        xAxis: { type: "category", data: evo.map((e) => `R${e.round}`), boundaryGap: false, ...axis },
        yAxis: { type: "value", minInterval: 1, ...axis },
        series: ids.map((id) => ({ type: "line", name: name(id), smooth: true, symbolSize: 7, data: evo.map((e) => e.rows.find((r) => r.entryId === id)?.points ?? null) })),
      } : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (loading && !data) return <><Skeleton className="h-24" /><Skeleton className="h-64" /></>;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data || !options) return null;
  const s = data.stats;
  if (!s.sample.matchesCounted) return <EmptyState icon="chart" title="Sem números ainda">As estatísticas aparecem quando houver partidas concluídas.</EmptyState>;

  const tiles = [
    { k: "Jogos", v: s.sample.matchesCounted },
    { k: "Gols", v: s.totalGoals },
    { k: "Média/jogo", v: s.averageGoals.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) },
  ];
  const leader = (list: { entryId: string }[], value: (x: never) => string, label: string) => {
    const top = list[0];
    if (!top) return null;
    return (
      <div className="card flex items-center gap-3 p-3" data-reveal>
        <ParticipantAvatar entry={entries.get(top.entryId) ?? null} size={40} />
        <div className="min-w-0 flex-1"><p className="text-xs text-muted">{label}</p><p className="truncate font-bold">{name(top.entryId)}</p></div>
        <span className="font-display text-2xl font-extrabold text-lime">{value(top as never)}</span>
      </div>
    );
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-2" data-reveal>
        {tiles.map((t) => (
          <div key={t.k} className="card p-3 text-center"><p className="font-display tabular text-3xl font-extrabold">{t.v}</p><p className="text-xs text-muted">{t.k}</p></div>
        ))}
      </div>
      {leader(s.longestWinStreak, (x: { streak: number }) => `${x.streak}V`, "Maior sequência de vitórias")}
      {leader(s.longestUnbeaten, (x: { streak: number }) => `${x.streak}J`, "Maior invencibilidade")}
      {options.evolution && (
        <section className="card p-4" data-reveal><h3 className="mb-2 font-display text-xl font-bold">Pontos por rodada</h3><StatChart option={options.evolution} height={280} label="Evolução de pontos por rodada" /></section>
      )}
      <section className="card p-4" data-reveal><h3 className="mb-2 font-display text-xl font-bold">Melhor ataque</h3><StatChart option={options.attack} height={Math.max(160, s.bestAttack.slice(0, 8).length * 34)} label="Ranking de gols marcados" /></section>
      <section className="card p-4" data-reveal><h3 className="mb-1 font-display text-xl font-bold">Melhor defesa</h3><p className="mb-2 text-xs text-muted">Menos gols sofridos</p><StatChart option={options.defense} height={Math.max(160, s.bestDefense.slice(0, 8).length * 34)} label="Ranking de gols sofridos" /></section>
      {s.biggestWins.length > 0 && (
        <section className="card p-4" data-reveal>
          <h3 className="mb-3 font-display text-xl font-bold">Maiores goleadas</h3>
          {s.biggestWins.slice(0, 5).map((w) => (
            <div key={w.matchId} className="flex items-center gap-2 border-t border-line/60 py-2.5 text-sm">
              <span className="min-w-0 flex-1 truncate"><b>{name(w.winnerEntryId)}</b> <span className="text-muted">sobre</span> {name(w.loserEntryId)}</span>
              <span className="font-display text-lg font-bold">{w.score}</span>
            </div>
          ))}
        </section>
      )}
      <p className="text-xs text-muted" data-reveal>{s.sample.criteria}.</p>
    </>
  );
}
