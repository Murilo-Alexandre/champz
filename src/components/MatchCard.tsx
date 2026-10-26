"use client";
import { useEffect, useRef } from "react";
import type { Entry, Match } from "@/lib/client/types";
import { gsap, reducedMotion } from "@/lib/client/motion";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { ClubBadge } from "./ClubBadge";

export function matchState(m: Match) {
  if (m.status === "BYE") return { label: "Folga", tone: "text-muted" };
  if (m.status === "CANCELLED") return { label: "Cancelada", tone: "text-danger" };
  if (m.status === "WALKOVER") return { label: "W.O.", tone: "text-gold" };
  if (m.status === "COMPLETED") return { label: "Encerrado", tone: "text-muted" };
  if (!m.homeEntryId || !m.awayEntryId) return { label: "Aguardando", tone: "text-muted" };
  return { label: "A jogar", tone: "text-lime" };
}

function Side({ entry, club, align, winner, score, pens }: { entry: Entry | null; club: Match["clubs"][number]["club"] | undefined; align: "left" | "right"; winner: boolean; score: number | null; pens: number | null }) {
  const right = align === "right";
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-2.5 ${right ? "flex-row-reverse text-right" : ""}`}>
      <div className="relative">
        <ParticipantAvatar entry={entry} size={42} />
        {club && <span className={`absolute -bottom-1.5 ${right ? "-left-2" : "-right-2"}`}><ClubBadge club={club} size={20} /></span>}
      </div>
      <div className="min-w-0">
        <p className={`truncate text-[15px] font-bold ${winner ? "text-text" : entry ? "text-text/80" : "text-muted"}`}>{entry?.name ?? "A definir"}</p>
        <p className="truncate text-xs text-muted">{club?.name ?? (entry ? "Clube a definir" : "")}{pens != null ? ` · pên. ${pens}` : ""}</p>
      </div>
      <span className="sr-only">{score ?? ""}</span>
    </div>
  );
}

/** Card do confronto: participantes + clube de cada lado + placar animado ao mudar. */
export function MatchCard({ match, onOpen, compact = false }: { match: Match; onOpen?: (m: Match) => void; compact?: boolean }) {
  const scoreRef = useRef<HTMLDivElement>(null);
  const prev = useRef(`${match.homeScore}-${match.awayScore}`);
  const home = match.clubs.find((c) => c.side === "HOME")?.club;
  const away = match.clubs.find((c) => c.side === "AWAY")?.club;
  const st = matchState(match);
  const done = match.status === "COMPLETED" || match.status === "WALKOVER";

  useEffect(() => {
    const key = `${match.homeScore}-${match.awayScore}`;
    if (key !== prev.current && !reducedMotion()) {
      gsap.fromTo(scoreRef.current, { scale: 1.35, color: "#c6ff3d" }, { scale: 1, color: "#eef2fb", duration: 0.7, ease: "elastic.out(1, 0.5)" });
    }
    prev.current = key;
  }, [match.homeScore, match.awayScore]);

  const clickable = !!onOpen && match.status !== "BYE";
  return (
    <button
      type="button"
      data-reveal
      disabled={!clickable}
      onClick={() => onOpen?.(match)}
      className={`card group block w-full text-left transition-transform ${compact ? "p-3" : "p-4"} ${clickable ? "active:scale-[0.985] hover:border-lime/40" : ""}`}
    >
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
        <span className={st.tone}>{st.label}</span>
        {match.status === "WALKOVER" && <span className="text-gold">{match.walkoverBoth ? "Ausência dupla" : `Ausente: ${match.walkoverAbsent === "HOME" ? match.homeEntry?.name : match.awayEntry?.name}`}</span>}
      </div>
      <div className="flex items-center gap-2">
        <Side entry={match.homeEntry} club={home} align="left" winner={match.winnerEntryId === match.homeEntryId && !!match.winnerEntryId} score={match.homeScore} pens={match.homePenalties} />
        <div ref={scoreRef} className="font-display tabular shrink-0 px-1 text-center text-3xl font-extrabold">
          {done && match.homeScore != null ? (
            <span>{match.homeScore}<span className="mx-1 text-muted">:</span>{match.awayScore}</span>
          ) : (
            <span className="text-lg text-muted">vs</span>
          )}
        </div>
        <Side entry={match.awayEntry} club={away} align="right" winner={match.winnerEntryId === match.awayEntryId && !!match.winnerEntryId} score={match.awayScore} pens={match.awayPenalties} />
      </div>
    </button>
  );
}
