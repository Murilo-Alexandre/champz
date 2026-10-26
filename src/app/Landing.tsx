"use client";
import Link from "next/link";
import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, reducedMotion } from "@/lib/client/motion";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { BrandLogo } from "@/components/BrandLogo";

const FEATURES = [
  { k: "01", t: "Grupos e mata-mata", d: "Tabela calculada no servidor, desempates configuráveis, melhores terceiros e chaveamento sem reencontro do mesmo grupo." },
  { k: "02", t: "Clube a cada jogo", d: "Sorteio auditável de clubes por rodada ou escolha do jogador. O escudo aparece ao lado do rosto no confronto." },
  { k: "03", t: "Placar com histórico", d: "Quem lançou, quando, o que mudou e por quê. Correções nunca apagam o passado." },
  { k: "04", t: "Fotos e retrospectiva", d: "Câmera direto no app, álbum para baixar e uma retrospectiva com o campeão no fim." },
];

const DEMO_ROWS = [
  { n: "Felipe", p: 7, sg: "+5" },
  { n: "Alan", p: 6, sg: "+3" },
  { n: "Everson", p: 4, sg: "0" },
  { n: "Jailton", p: 0, sg: "−8" },
];

export function Landing() {
  const wrap = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    if (reducedMotion()) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    let smoother: ScrollSmoother | undefined;
    if (fine) {
      gsap.registerPlugin(ScrollSmoother);
      smoother = ScrollSmoother.create({ wrapper: "#smooth-wrapper", content: "#smooth-content", smooth: 1.1, smoothTouch: 0, effects: true });
    }
    gsap.timeline()
      .fromTo("[data-hero]", { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power4.out" })
      .fromTo("[data-board-row]", { x: 30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, stagger: 0.08, ease: "power3.out" }, "-=0.4");
    gsap.to("[data-logo-hero]", { y: -8, repeat: -1, yoyo: true, duration: 2.6, ease: "sine.inOut" });
    gsap.to("[data-ball]", { y: -14, rotate: 25, repeat: -1, yoyo: true, duration: 1.4, ease: "sine.inOut" });
    gsap.utils.toArray<HTMLElement>("[data-feature]").forEach((el) => {
      gsap.fromTo(el, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } });
    });
    gsap.fromTo("[data-cta]", { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "back.out(1.6)", scrollTrigger: { trigger: "[data-cta]", start: "top 90%" } });
    ScrollTrigger.refresh();
    return () => smoother?.kill();
  }, { scope: wrap });

  return (
    <div ref={wrap}>
      <div id="smooth-wrapper">
        <div id="smooth-content">
          <header className="mx-auto flex max-w-5xl items-center justify-between px-5" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
            <span className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <BrandLogo variant="symbol" height={34} priority />Champz
            </span>
            <Link href="/entrar" className="btn btn-ghost btn-sm">Entrar</Link>
          </header>

          <section className="mx-auto grid max-w-5xl items-center gap-10 px-5 pb-16 pt-12 md:grid-cols-[1.1fr_1fr] md:pt-20">
            <div>
              <div data-hero data-logo-hero className="mx-auto mb-6 w-fit md:mx-0 drop-shadow-[0_24px_60px_rgba(255,201,74,.35)]"><BrandLogo height={190} priority /></div>
              <p data-hero className="mb-4 text-xs font-bold uppercase tracking-[0.3em] text-gold">FIFA entre amigos</p>
              <h1 data-hero className="font-display text-[clamp(3rem,13vw,6rem)] font-extrabold uppercase leading-[0.88]">
                O campeonato<br />da galera,<br /><span className="text-lime">levado a sério.</span>
              </h1>
              <p data-hero className="mt-5 max-w-md text-[17px] text-muted">Grupos, mata-mata, clube sorteado a cada jogo, placar com histórico e retrospectiva com o campeão. Tudo no celular.</p>
              <div data-hero className="mt-8 flex flex-wrap gap-3">
                <Link href="/entrar" className="btn btn-primary">Entrar no Champz</Link>
                <a href="#como-funciona" className="btn btn-ghost">Como funciona</a>
              </div>
            </div>

            <div data-hero className="card relative overflow-hidden p-5" aria-label="Exemplo ilustrativo de tabela de grupo">
              <span data-ball className="absolute -right-5 -top-5 text-7xl opacity-20" aria-hidden>⚽</span>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-muted">Exemplo ilustrativo</p>
              <p className="mb-4 font-display text-2xl font-bold">Grupo A</p>
              {DEMO_ROWS.map((r, i) => (
                <div key={r.n} data-board-row className="flex items-center gap-3 border-t border-line/60 py-3">
                  <span className={`grid h-7 w-7 place-items-center rounded-lg text-sm font-bold ${i < 2 ? "bg-lime text-lime-ink" : "bg-surface-2 text-muted"}`}>{i + 1}</span>
                  <span className="flex-1 font-semibold">{r.n}</span>
                  <span className="tabular w-10 text-right text-sm text-muted">{r.sg}</span>
                  <span className="tabular w-8 text-right font-display text-xl font-extrabold">{r.p}</span>
                </div>
              ))}
            </div>
          </section>

          <section id="como-funciona" className="mx-auto grid max-w-5xl gap-4 px-5 pb-16 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <article key={f.k} data-feature className="card p-6">
                <p className="font-display text-5xl font-extrabold text-line">{f.k}</p>
                <h2 className="mt-2 font-display text-2xl font-bold">{f.t}</h2>
                <p className="mt-2 text-muted">{f.d}</p>
              </article>
            ))}
          </section>

          <section className="mx-auto max-w-5xl px-5" style={{ paddingBottom: "calc(48px + var(--safe-bottom))" }}>
            <div data-cta className="card glow-lime flex flex-col items-start gap-4 p-7 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="font-display text-3xl font-extrabold">Seu próximo campeonato começa aqui.</h2>
                <p className="mt-1 text-muted">Acesso com conta criada pelo administrador.</p>
              </div>
              <Link href="/entrar" className="btn btn-primary">Entrar</Link>
            </div>
            <div className="mt-6"><InstallAppBanner /></div>
          </section>
        </div>
      </div>
    </div>
  );
}
