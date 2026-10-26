"use client";
import { useRef } from "react";
import type { Match, Round } from "@/lib/client/types";
import { gsap, useGSAP, reducedMotion } from "@/lib/client/motion";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { ClubBadge } from "./ClubBadge";

function roundName(index: number, total: number, fallback: string | null) {
  const fromEnd = total - index;
  if (fromEnd === 1) return "Final";
  if (fromEnd === 2) return "Semifinal";
  if (fromEnd === 3) return "Quartas";
  if (fromEnd === 4) return "Oitavas";
  return fallback ?? `Rodada ${index + 1}`;
}

function Slot({ m, side }: { m: Match; side: "HOME" | "AWAY" }) {
  const entry = side === "HOME" ? m.homeEntry : m.awayEntry;
  const id = side === "HOME" ? m.homeEntryId : m.awayEntryId;
  const score = side === "HOME" ? m.homeScore : m.awayScore;
  const pens = side === "HOME" ? m.homePenalties : m.awayPenalties;
  const club = m.clubs.find((c) => c.side === side)?.club;
  const won = !!m.winnerEntryId && m.winnerEntryId === id;
  const lost = !!m.winnerEntryId && !won;
  return (
    <div className={`flex items-center gap-2 px-2.5 py-2 ${lost ? "opacity-45" : ""}`}>
      <ParticipantAvatar entry={entry} size={24} />
      {club && <ClubBadge club={club} size={14} />}
      <span className={`min-w-0 flex-1 truncate text-[13px] ${won ? "font-extrabold text-text" : "font-semibold"}`}>
        {entry?.name ?? (m.status === "BYE" ? "Folga" : "A definir")}
      </span>
      <span className={`tabular font-display text-base font-bold ${won ? "text-lime" : "text-muted"}`}>
        {score ?? ""}{pens != null ? <sup className="ml-0.5 text-[10px]">({pens})</sup> : null}
      </span>
    </div>
  );
}

/** Chaveamento horizontal com rolagem lateral no celular; conectores desenhados em CSS. */
export function Bracket({ rounds, onOpen }: { rounds: Round[]; onOpen?: (m: Match) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.fromTo(ref.current!.querySelectorAll("[data-col]"), { opacity: 0, x: 24 }, { opacity: 1, x: 0, duration: 0.5, stagger: 0.12, ease: "power3.out" });
  }, { scope: ref, dependencies: [rounds.length] });

  const total = rounds.length;
  return (
    <div ref={ref} className="no-scrollbar -mx-4 overflow-x-auto px-4 pb-2">
      <div className="flex min-w-max gap-5">
        {rounds.map((r, i) => (
          <div key={r.id} data-col className="flex w-[230px] flex-col">
            <p className={`mb-3 text-center font-display text-sm font-bold uppercase tracking-widest ${i === total - 1 ? "text-gold" : "text-muted"}`}>{roundName(i, total, r.name)}</p>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {r.matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onOpen?.(m)}
                  disabled={!onOpen || m.status === "BYE"}
                  className={`relative overflow-hidden rounded-2xl border bg-surface text-left transition-colors ${i === total - 1 ? "border-gold/50" : "border-line"} ${onOpen && m.status !== "BYE" ? "hover:border-lime/50 active:scale-[0.98]" : ""}`}
                >
                  <Slot m={m} side="HOME" />
                  <div className="h-px bg-line" />
                  <Slot m={m} side="AWAY" />
                  {i < total - 1 && <span className="pointer-events-none absolute -right-5 top-1/2 h-px w-5 bg-line" />}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
