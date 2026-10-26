"use client";
import { useRef } from "react";
import type { Entry, GroupStanding } from "@/lib/client/types";
import { gsap, useGSAP, reducedMotion } from "@/lib/client/motion";
import { ParticipantAvatar } from "./ParticipantAvatar";

/** Tabela de classificação; linhas animam ao reordenar (FLIP simples por posição). */
export function StandingTable({ group, entries, qualifiers = 0, onTiebreak }: { group: GroupStanding; entries: Map<string, Entry>; qualifiers?: number; onTiebreak?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const order = group.rows.map((r) => r.entryId).join(",");

  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.fromTo(ref.current!.querySelectorAll("[data-row]"), { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.45, stagger: 0.04, ease: "power2.out" });
  }, { scope: ref, dependencies: [order] });

  const hasTie = group.rows.some((r) => r.tied);
  return (
    <div ref={ref} className="card overflow-hidden" data-reveal>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h3 className="font-display text-xl font-bold">{group.label.length <= 2 ? `Grupo ${group.label}` : group.label}</h3>
        {group.closedAt && <span className="chip">Encerrado</span>}
      </div>
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="text-[11px] uppercase tracking-wider text-muted">
            <th className="w-8 py-2 pl-3 text-left">#</th>
            <th className="py-2 text-left">Participante</th>
            <th className="w-9 py-2" title="Pontos">P</th>
            <th className="w-8 py-2" title="Jogos">J</th>
            <th className="hidden w-8 py-2 min-[400px]:table-cell" title="Vitórias">V</th>
            <th className="w-10 py-2" title="Saldo">SG</th>
            <th className="w-9 py-2 pr-3" title="Gols pró">GP</th>
          </tr>
        </thead>
        <tbody>
          {group.rows.map((r) => {
            const e = entries.get(r.entryId);
            const q = qualifiers > 0 && r.position <= qualifiers;
            return (
              <tr key={r.entryId} data-row className={`border-t border-line/60 ${e && !e.active ? "opacity-50" : ""}`}>
                <td className="py-2.5 pl-3">
                  <span className={`grid h-6 w-6 place-items-center rounded-md text-xs font-bold ${q ? "bg-lime text-lime-ink" : "bg-surface-2 text-muted"}`}>{r.position}</span>
                </td>
                <td className="py-2.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <ParticipantAvatar entry={e ?? null} size={26} />
                    <span className="truncate font-semibold">{e?.name ?? "—"}</span>
                    {r.tied && <span className="text-[10px] font-bold text-gold" title="Empate não resolvido pelos critérios">EMP</span>}
                  </div>
                </td>
                <td className="text-center font-display text-lg font-extrabold">{r.points}{r.bonusPoints ? <sup className="text-[10px] text-cyan">+{r.bonusPoints}</sup> : null}</td>
                <td className="text-center text-muted">{r.played}</td>
                <td className="hidden text-center text-muted min-[400px]:table-cell">{r.wins}</td>
                <td className={`text-center font-semibold ${r.goalDiff > 0 ? "text-lime" : r.goalDiff < 0 ? "text-danger" : "text-muted"}`}>{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                <td className="pr-3 text-center text-muted">{r.goalsFor}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hasTie && onTiebreak && (
        <button className="w-full border-t border-line px-4 py-3 text-left text-sm font-semibold text-gold" onClick={onTiebreak}>
          Empate sem critério definido — definir ordem manualmente
        </button>
      )}
    </div>
  );
}
