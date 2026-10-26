"use client";
import { useEffect, useRef, useState } from "react";
import { gsap, reducedMotion } from "@/lib/client/motion";
import type { Club } from "@/lib/client/types";
import { ClubBadge } from "./ClubBadge";

export type DrawReveal = { key: string; who: string; club: Club };

/** Revela o resultado do sorteio (já feito e auditado no servidor) com efeito de roleta, item a item. */
export function DrawAnimation({ reveals, pool, onDone }: { reveals: DrawReveal[]; pool: Club[]; onDone?: () => void }) {
  const [shown, setShown] = useState(0);
  const [spinning, setSpinning] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const done = shown >= reveals.length;

  useEffect(() => {
    if (done) { onDone?.(); return; }
    if (reducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sem animação: revela tudo
      setShown(reveals.length);
      return;
    }
    let i = 0;
    const names = pool.length ? pool : reveals.map((r) => r.club);
    const timer = setInterval(() => {
      setSpinning(names[(Math.random() * names.length) | 0].name);
      if (++i > 11) {
        clearInterval(timer);
        setSpinning(null);
        setShown((s) => s + 1);
      }
    }, 55);
    return () => clearInterval(timer);
  }, [shown, done, reveals, pool, onDone]);

  useEffect(() => {
    const last = list.current?.querySelector(`[data-idx="${shown - 1}"]`);
    if (last && !reducedMotion()) gsap.fromTo(last, { scale: 0.85, opacity: 0, y: 10 }, { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: "back.out(2.2)" });
  }, [shown]);

  return (
    <div className="flex flex-col gap-2" ref={list}>
      {reveals.map((r, i) => (
        <div key={r.key} data-idx={i} className={`flex min-h-14 items-center gap-3 rounded-2xl border px-3 ${i < shown ? "border-lime/40 bg-surface" : "border-line bg-bg-2"}`}>
          <span className="min-w-0 flex-1 truncate font-semibold">{r.who}</span>
          {i < shown ? (
            <span className="flex items-center gap-2 font-display text-lg font-bold"><ClubBadge club={r.club} size={24} />{r.club.name}</span>
          ) : i === shown && spinning ? (
            <span className="font-display text-lg font-bold text-muted blur-[0.5px]">{spinning}</span>
          ) : (
            <span className="text-muted">···</span>
          )}
        </div>
      ))}
    </div>
  );
}
