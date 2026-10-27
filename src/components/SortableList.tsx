"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { gsap, reducedMotion } from "@/lib/client/motion";
import { Icon } from "./ui";

type Drag = { id: string; from: number; over: number; startY: number; pointerId: number; slot: number; tops: number[] };

/**
 * Lista reordenável: pressione e arraste a alça (toque ou mouse) ou use as setas do teclado com a alça em foco.
 * Só a alça captura o gesto (touch-action: none); o restante da linha continua rolando a página normalmente.
 */
export function SortableList<T>({ items, keyOf, label, onChange }: {
  items: T[]; keyOf: (item: T) => string; label: (item: T) => string; onChange: (next: T[]) => void;
}) {
  const rows = useRef(new Map<string, HTMLLIElement>());
  const handles = useRef(new Map<string, HTMLButtonElement>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [live, setLive] = useState("");
  const focusAfter = useRef<string | null>(null);
  const motion = () => !reducedMotion();

  // Depois de reordenar no estado, remove os deslocamentos antes da pintura (sem salto visual).
  useLayoutEffect(() => {
    rows.current.forEach((el) => gsap.set(el, { y: 0, clearProps: "transform,zIndex,boxShadow" }));
    if (focusAfter.current) { handles.current.get(focusAfter.current)?.focus(); focusAfter.current = null; }
  }, [items]);

  const ordered = (d: Drag | null) => {
    if (!d) return items;
    const next = [...items];
    const [moved] = next.splice(d.from, 1);
    next.splice(d.over, 0, moved);
    return next;
  };

  function shiftOthers(d: Drag) {
    items.forEach((it, i) => {
      if (i === d.from) return;
      const el = rows.current.get(keyOf(it));
      if (!el) return;
      let y = 0;
      if (d.from < d.over && i > d.from && i <= d.over) y = -d.slot;
      if (d.from > d.over && i < d.from && i >= d.over) y = d.slot;
      gsap.to(el, { y, duration: motion() ? 0.2 : 0, ease: "power2.out", overwrite: "auto" });
    });
  }

  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>, index: number) {
    if (e.button !== 0) return;
    const id = keyOf(items[index]);
    const el = rows.current.get(id);
    if (!el) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
    const tops = items.map((it) => rows.current.get(keyOf(it))!.getBoundingClientRect().top);
    const slot = tops.length > 1 ? tops[1] - tops[0] : el.getBoundingClientRect().height;
    const d: Drag = { id, from: index, over: index, startY: e.clientY, pointerId: e.pointerId, slot, tops };
    dragRef.current = d;
    setDrag(d);
    gsap.to(el, { scale: motion() ? 1.03 : 1, zIndex: 5, boxShadow: "0 14px 34px -12px rgba(0,0,0,.7), 0 0 0 1.5px var(--color-lime)", duration: 0.18 });
    navigator.vibrate?.(8);
  }

  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dy = e.clientY - d.startY;
    const min = (0 - d.from) * d.slot - d.slot * 0.4;
    const max = (items.length - 1 - d.from) * d.slot + d.slot * 0.4;
    gsap.set(rows.current.get(d.id)!, { y: Math.max(min, Math.min(max, dy)) });
    const over = Math.max(0, Math.min(items.length - 1, d.from + Math.round(dy / d.slot)));
    if (over !== d.over) {
      const nd = { ...d, over };
      dragRef.current = nd;
      setDrag(nd);
      shiftOthers(nd);
      navigator.vibrate?.(4);
    }
  }

  function finish(e: React.PointerEvent<HTMLButtonElement>) {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    dragRef.current = null;
    const el = rows.current.get(d.id)!;
    gsap.to(el, {
      y: (d.over - d.from) * d.slot, scale: 1, boxShadow: "0 0 0 0 rgba(0,0,0,0)", duration: motion() ? 0.18 : 0, ease: "power3.out",
      onComplete: () => {
        setDrag(null);
        if (d.over !== d.from) {
          onChange(ordered(d));
          setLive(`${label(items[d.from])} agora em ${d.over + 1}º`);
        } else gsap.set(el, { y: 0, clearProps: "transform,zIndex,boxShadow" });
      },
    });
  }

  function onKey(e: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const by = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (!by) return;
    e.preventDefault();
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    const next = [...items];
    [next[index], next[to]] = [next[to], next[index]];
    focusAfter.current = keyOf(items[index]);
    onChange(next);
    setLive(`${label(items[index])} agora em ${to + 1}º`);
  }

  const view = ordered(drag);
  return (
    <>
      <ol className="relative flex select-none flex-col gap-1.5">
        {items.map((it, i) => {
          const id = keyOf(it);
          const pos = view.indexOf(it);
          const active = drag?.id === id;
          return (
            <li key={id} ref={(el) => { if (el) rows.current.set(id, el); else rows.current.delete(id); }}
              className={`relative flex min-h-12 items-center gap-3 rounded-xl border bg-bg-2 pl-3 transition-colors ${active ? "border-lime" : "border-line"}`}>
              <span className={`tabular w-7 font-display text-lg font-bold transition-colors ${pos === 0 ? "text-lime" : "text-muted"}`}>{pos + 1}º</span>
              <span className="flex-1 font-semibold">{label(it)}</span>
              <button type="button" ref={(el) => { if (el) handles.current.set(id, el); else handles.current.delete(id); }}
                className={`grid h-12 w-12 shrink-0 cursor-grab touch-none select-none place-items-center rounded-xl text-muted active:cursor-grabbing ${active ? "text-lime" : ""}`}
                style={{ touchAction: "none" }}
                aria-label={`Mover ${label(it)}, posição ${i + 1} de ${items.length}. Arraste ou use as setas para cima e para baixo.`}
                onPointerDown={(e) => onPointerDown(e, i)} onPointerMove={onPointerMove} onPointerUp={finish} onPointerCancel={finish}
                onKeyDown={(e) => onKey(e, i)}>
                <Icon name="grip" size={22} />
              </button>
            </li>
          );
        })}
      </ol>
      <p className="sr-only" aria-live="polite">{live}</p>
    </>
  );
}

