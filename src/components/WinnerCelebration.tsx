"use client";
import { useEffect, useRef } from "react";
import type { Entry } from "@/lib/client/types";
import { gsap, reducedMotion } from "@/lib/client/motion";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { Icon } from "./ui";

/** Confete em canvas com orçamento fixo de partículas; para sozinho e respeita reduced-motion. */
export function Confetti({ active, count = 140, duration = 4200 }: { active: boolean; count?: number; duration?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!active || reducedMotion() || !canvas.current) return;
    const c = canvas.current;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { c.width = c.offsetWidth * dpr; c.height = c.offsetHeight * dpr; };
    resize();
    const colors = ["#c6ff3d", "#35e0ff", "#ffc94a", "#ffffff", "#ff7ab6"];
    const parts = Array.from({ length: count }, () => ({
      x: c.width / 2 + (Math.random() - 0.5) * c.width * 0.3,
      y: c.height * 0.35,
      vx: (Math.random() - 0.5) * 14 * dpr,
      vy: (-Math.random() * 14 - 6) * dpr,
      r: (Math.random() * 4 + 3) * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[(Math.random() * colors.length) | 0],
    }));
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - start;
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.globalAlpha = Math.max(0, 1 - elapsed / duration);
      for (const p of parts) {
        p.vy += 0.35 * dpr; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore();
      }
      if (elapsed < duration) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, count, duration]);
  return <canvas ref={canvas} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />;
}

/** Destaque do campeão: taça, nome, avatar e confete. */
export function WinnerCelebration({ champion, subtitle }: { champion: Entry; subtitle?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (reducedMotion() || !ref.current) return;
    const tl = gsap.timeline();
    tl.fromTo(ref.current.querySelector("[data-trophy]"), { scale: 0, rotate: -25 }, { scale: 1, rotate: 0, duration: 0.9, ease: "back.out(2)" })
      .fromTo(ref.current.querySelectorAll("[data-win]"), { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.12, duration: 0.5 }, "-=0.4");
    gsap.to(ref.current.querySelector("[data-glow]"), { opacity: 0.9, scale: 1.08, repeat: -1, yoyo: true, duration: 1.6, ease: "sine.inOut" });
    return () => { tl.kill(); };
  }, []);
  return (
    <div ref={ref} className="card relative overflow-hidden border-gold/50 px-5 py-8 text-center">
      <Confetti active />
      <div data-glow className="absolute left-1/2 top-6 h-40 w-40 -translate-x-1/2 rounded-full bg-gold/25 opacity-60 blur-3xl" />
      <div data-trophy className="relative mx-auto mb-3 grid h-20 w-20 place-items-center rounded-3xl bg-gold text-bg shadow-[0_10px_40px_-8px_rgba(255,201,74,.7)]">
        <Icon name="trophy" size={44} />
      </div>
      <p data-win className="relative text-xs font-bold uppercase tracking-[0.3em] text-gold">Campeão</p>
      <div data-win className="relative mt-3 flex items-center justify-center gap-3">
        <ParticipantAvatar entry={champion} size={52} />
        <p className="font-display text-4xl font-extrabold">{champion.name}</p>
      </div>
      {subtitle && <p data-win className="relative mt-2 text-sm text-muted">{subtitle}</p>}
    </div>
  );
}
