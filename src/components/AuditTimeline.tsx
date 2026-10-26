"use client";
import { useRef } from "react";
import type { AuditItem, Entry } from "@/lib/client/types";
import { auditLabel, fmtDate } from "@/lib/client/labels";
import { gsap, useGSAP, reducedMotion } from "@/lib/client/motion";
import { UserAvatar } from "./ParticipantAvatar";

function describe(item: AuditItem, entries: Map<string, Entry>) {
  const after = (item.after ?? {}) as Record<string, unknown>;
  const before = (item.before ?? {}) as Record<string, unknown>;
  if (item.action.startsWith("RESULT") && after.homeScore != null) {
    const prev = before.homeScore != null ? ` (antes ${before.homeScore} x ${before.awayScore})` : "";
    return `${after.homeScore} x ${after.awayScore}${prev}`;
  }
  if (item.action.startsWith("WALKOVER")) return after.walkoverBoth ? "Ausência dos dois lados" : `Ausente: ${after.walkoverAbsent === "HOME" ? "mandante" : "visitante"}`;
  if ((item.action === "FINISH" || item.action === "CHAMPION_CHANGED") && typeof after.championEntryId === "string") return `Campeão: ${entries.get(after.championEntryId)?.name ?? "—"}`;
  if (item.action === "GENERATE" && typeof after.matchCount === "number") return `${after.matchCount} partidas geradas`;
  return null;
}

/** Linha do tempo do histórico (append-only, vinda do servidor). */
export function AuditTimeline({ items, entries }: { items: AuditItem[]; entries: Map<string, Entry> }) {
  const ref = useRef<HTMLOListElement>(null);
  useGSAP(() => {
    if (reducedMotion()) return;
    gsap.fromTo(ref.current!.children, { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.03 });
  }, { scope: ref, dependencies: [items.length] });

  return (
    <ol ref={ref} className="relative ml-4 border-l border-line">
      {items.map((it) => {
        const detail = describe(it, entries);
        return (
          <li key={it.id} className="relative pb-5 pl-6">
            <span className="absolute -left-[17px] top-0"><UserAvatar name={it.actor?.name ?? "Sistema"} size={32} /></span>
            <p className="text-sm"><span className="font-bold">{it.actor?.name ?? "Sistema"}</span> <span className="text-muted">{auditLabel(it.action).toLowerCase()}</span></p>
            {detail && <p className="mt-0.5 font-display text-lg font-bold">{detail}</p>}
            {it.reason && <p className="mt-1 rounded-xl bg-surface-2 px-3 py-2 text-sm text-muted">“{it.reason}”</p>}
            <p className="mt-1 text-xs text-muted">{fmtDate(it.createdAt, true)}</p>
          </li>
        );
      })}
    </ol>
  );
}
