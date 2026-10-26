"use client";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useApi } from "@/lib/client/hooks";
import type { Entry, Retrospective as Retro } from "@/lib/client/types";
import { fmtDate, FORMAT_LABEL } from "@/lib/client/labels";
import { gsap, reducedMotion } from "@/lib/client/motion";
import { ErrorState, Icon, Spinner } from "@/components/ui";
import { ParticipantAvatar } from "@/components/ParticipantAvatar";
import { MediaImage } from "@/components/MediaImage";
import { Confetti } from "@/components/WinnerCelebration";
import { StatChart, chartTheme } from "@/components/StatChart";

const SLIDE_MS = 6000;

/** Retrospectiva em slides tela cheia: play/pausa, avançar/voltar, toque nas laterais e teclado. */
export function Retrospective() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data, error } = useApi<Retro>(`/api/tournaments/${id}/retrospective`);
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const stage = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  const entries = useMemo(() => new Map<string, Entry>((data?.entries ?? []).map((e) => [e.id, e])), [data]);
  const slides = useMemo(() => (data ? buildSlides(data, entries) : []), [data, entries]);
  const n = slides.length;
  const go = useCallback((to: number) => setI(Math.max(0, Math.min(n - 1, to))), [n]);

  useEffect(() => {
    if (!stage.current || !n) return;
    if (!reducedMotion()) {
      gsap.fromTo(stage.current, { opacity: 0, scale: 1.04 }, { opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" });
      gsap.fromTo(stage.current.querySelectorAll("[data-s]"), { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.12, delay: 0.15, ease: "power3.out" });
    }
    if (!bar.current) return;
    gsap.killTweensOf(bar.current);
    gsap.set(bar.current, { scaleX: 0 });
    if (!playing) return;
    const tw = gsap.to(bar.current, { scaleX: 1, duration: SLIDE_MS / 1000, ease: "none", onComplete: () => (i < n - 1 ? go(i + 1) : setPlaying(false)) });
    return () => { tw.kill(); };
  }, [i, playing, n, go]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === " ") { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key === "Escape") router.back();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [i, go, router]);

  const fullscreen = () => {
    const el = root.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el?.requestFullscreen) el.requestFullscreen().catch(() => {});
    else el?.webkitRequestFullscreen?.();
  };

  if (error) return <div className="pt-10"><ErrorState message={error.message} /></div>;
  if (!data) return <div className="grid min-h-[60dvh] place-items-center"><Spinner /></div>;

  return (
    <div ref={root} className="fixed inset-0 z-50 flex flex-col bg-bg" style={{ paddingTop: "var(--safe-top)", paddingBottom: "var(--safe-bottom)" }}>
      <div className="flex gap-1 px-3 pt-3" aria-hidden>
        {slides.map((_, k) => (
          <div key={k} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            {k < i ? <div className="h-full bg-text" /> : k === i ? <div ref={bar} className="h-full origin-left bg-text" /> : null}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between px-3 py-2">
        <p className="truncate text-sm font-bold">{data.tournament.name}</p>
        <div className="flex gap-1">
          <button className="grid h-11 w-11 place-items-center rounded-xl" onClick={fullscreen} aria-label="Tela cheia"><Icon name="grid" /></button>
          <button className="grid h-11 w-11 place-items-center rounded-xl" onClick={() => router.back()} aria-label="Fechar"><Icon name="close" /></button>
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden">
        <div ref={stage} key={i} className="absolute inset-0 flex flex-col items-center justify-center overflow-y-auto px-6 text-center">{slides[i]}</div>
        <button className="absolute inset-y-0 left-0 w-1/4" onClick={() => go(i - 1)} aria-label="Slide anterior" />
        <button className="absolute inset-y-0 right-0 w-1/4" onClick={() => go(i + 1)} aria-label="Próximo slide" />
      </div>

      <div className="flex items-center justify-center gap-3 p-4">
        <button className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Voltar"><Icon name="prev" /></button>
        <button className="grid h-14 w-14 place-items-center rounded-2xl bg-lime text-lime-ink" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pausar" : "Reproduzir"}><Icon name={playing ? "pause" : "play"} filled /></button>
        <button className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-2" onClick={() => go(i + 1)} disabled={i === n - 1} aria-label="Avançar"><Icon name="next" /></button>
      </div>
    </div>
  );
}

function buildSlides(d: Retro, entries: Map<string, Entry>): ReactNode[] {
  const name = (id: string | null) => (id ? entries.get(id)?.name ?? "—" : "—");
  const champion = d.championEntryId ? entries.get(d.championEntryId) ?? null : null;
  const s = d.stats;
  const slides: ReactNode[] = [];

  slides.push(
    <>
      <p data-s className="text-xs font-bold uppercase tracking-[0.35em] text-lime">Retrospectiva</p>
      <h1 data-s className="mt-3 font-display text-[clamp(2.8rem,12vw,5rem)] font-extrabold uppercase leading-[0.9]">{d.tournament.name}</h1>
      <p data-s className="mt-4 text-muted">{FORMAT_LABEL[d.tournament.format]}{d.tournament.finishedAt ? ` · encerrado em ${fmtDate(d.tournament.finishedAt)}` : ""}</p>
    </>,
  );

  slides.push(
    <>
      <p data-s className="text-sm text-muted">Foram</p>
      <p data-s className="font-display text-[8rem] font-extrabold leading-none text-lime">{d.matchCount}</p>
      <p data-s className="font-display text-3xl font-bold">jogos</p>
      <div data-s className="mt-8 flex gap-8">
        <div><p className="font-display text-5xl font-extrabold">{s.totalGoals}</p><p className="text-sm text-muted">gols</p></div>
        <div><p className="font-display text-5xl font-extrabold">{d.entries.length}</p><p className="text-sm text-muted">{d.entries[0]?.type === "DUO" ? "duplas" : "participantes"}</p></div>
      </div>
    </>,
  );

  if (s.bestAttack[0]) {
    const top = s.bestAttack.slice(0, 6);
    slides.push(
      <>
        <p data-s className="text-xs font-bold uppercase tracking-[0.3em] text-cyan">Melhor ataque</p>
        <div data-s className="mt-4 flex items-center gap-3"><ParticipantAvatar entry={entries.get(top[0].entryId) ?? null} size={64} /><p className="font-display text-4xl font-extrabold">{name(top[0].entryId)}</p></div>
        <p data-s className="mt-2 font-display text-2xl text-muted">{top[0].goalsFor} gols marcados</p>
        <div data-s className="mt-6 w-full max-w-md">
          <StatChart label="Gols marcados" height={220} option={{
            grid: { left: 8, right: 30, top: 0, bottom: 0, containLabel: true },
            xAxis: { type: "value", show: false }, yAxis: { type: "category", inverse: true, data: top.map((r) => name(r.entryId)), axisLabel: { color: chartTheme.text }, axisLine: { show: false }, axisTick: { show: false } },
            series: [{ type: "bar", data: top.map((r) => r.goalsFor), barWidth: 14, itemStyle: { color: "#35e0ff", borderRadius: [0, 8, 8, 0] }, label: { show: true, position: "right", color: "#eef2fb" } }],
          }} />
        </div>
      </>,
    );
  }

  if (s.bestDefense[0]) {
    slides.push(
      <>
        <p data-s className="text-xs font-bold uppercase tracking-[0.3em] text-cyan">Muralha</p>
        <div data-s className="mt-4"><ParticipantAvatar entry={entries.get(s.bestDefense[0].entryId) ?? null} size={88} /></div>
        <p data-s className="mt-3 font-display text-4xl font-extrabold">{name(s.bestDefense[0].entryId)}</p>
        <p data-s className="mt-2 text-muted">{s.bestDefense[0].goalsAgainst} gols sofridos em {s.bestDefense[0].played} jogos</p>
      </>,
    );
  }

  if (s.biggestWins[0]) {
    const w = s.biggestWins[0];
    slides.push(
      <>
        <p data-s className="text-xs font-bold uppercase tracking-[0.3em] text-danger">Maior goleada</p>
        <p data-s className="mt-4 font-display text-[6rem] font-extrabold leading-none">{w.score}</p>
        <p data-s className="mt-3 text-xl"><b>{name(w.winnerEntryId)}</b> <span className="text-muted">passou por</span> <b>{name(w.loserEntryId)}</b></p>
      </>,
    );
  }

  if (s.longestWinStreak[0]) {
    slides.push(
      <>
        <p data-s className="text-xs font-bold uppercase tracking-[0.3em] text-gold">Embalado</p>
        <p data-s className="mt-4 font-display text-[7rem] font-extrabold leading-none text-gold">{s.longestWinStreak[0].streak}</p>
        <p data-s className="font-display text-2xl font-bold">vitórias seguidas</p>
        <p data-s className="mt-3 text-xl">{name(s.longestWinStreak[0].entryId)}</p>
      </>,
    );
  }

  for (const p of d.photos.slice(0, 6)) {
    slides.push(
      <>
        <div data-s className="w-full max-w-lg overflow-hidden rounded-3xl"><MediaImage mediaId={p.id} alt={p.caption ?? "Foto do campeonato"} thumb={false} className="max-h-[60dvh] min-h-64 w-full [&_img]:object-contain" /></div>
        {p.caption && <p data-s className="mt-4 text-lg">{p.caption}</p>}
      </>,
    );
  }

  if (d.runnerUpEntryId) {
    slides.push(
      <>
        <p data-s className="text-xs font-bold uppercase tracking-[0.3em] text-muted">Vice-campeão</p>
        <div data-s className="mt-4"><ParticipantAvatar entry={entries.get(d.runnerUpEntryId) ?? null} size={88} /></div>
        <p data-s className="mt-3 font-display text-4xl font-extrabold">{name(d.runnerUpEntryId)}</p>
      </>,
    );
  }

  if (champion) {
    slides.push(
      <>
        <Confetti active count={180} duration={5500} />
        <div data-s className="mb-4 grid h-24 w-24 place-items-center rounded-[32px] bg-gold text-bg shadow-[0_20px_60px_-10px_rgba(255,201,74,.8)]"><Icon name="trophy" size={52} /></div>
        <p data-s className="text-xs font-bold uppercase tracking-[0.4em] text-gold">Campeão</p>
        <div data-s className="mt-4"><ParticipantAvatar entry={champion} size={110} /></div>
        <h2 data-s className="mt-4 font-display text-[clamp(3rem,13vw,5.5rem)] font-extrabold uppercase leading-none">{champion.name}</h2>
      </>,
    );
  }
  return slides;
}
