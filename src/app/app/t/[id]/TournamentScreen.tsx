"use client";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import type { Club, Entry, StageView, TournamentView } from "@/lib/client/types";
import { FORMAT_LABEL, STATUS_LABEL } from "@/lib/client/labels";
import { hasPermission } from "@/lib/permissions";
import { gsap, useGSAP, revealChildren, reducedMotion } from "@/lib/client/motion";
import { useMe } from "@/components/AppShell";
import { EmptyState, ErrorState, Icon, Sheet, Skeleton, Spinner, Tabs, useToast } from "@/components/ui";
import { MatchCard } from "@/components/MatchCard";
import { StandingTable } from "@/components/StandingTable";
import { Bracket } from "@/components/Bracket";
import { PhotoGallery } from "@/components/PhotoGallery";
import { WinnerCelebration } from "@/components/WinnerCelebration";
import { DrawAnimation, type DrawReveal } from "@/components/DrawAnimation";
import { MatchSheet } from "./MatchSheet";
import { StatsPanel } from "./StatsPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ManagePanel } from "./ManagePanel";

type Tab = "games" | "table" | "bracket" | "stats" | "photos" | "history" | "manage";

export function TournamentScreen() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { me } = useMe();
  const view = useApi<TournamentView>(`/api/tournaments/${id}`);
  const [stages, setStages] = useState<StageView[] | null>(null);
  const [tab, setTab] = useState<Tab>("games");
  const [openId, setOpenId] = useState<string | null>(null);
  const [roundIdx, setRoundIdx] = useState<number | null>(null);
  const [draw, setDraw] = useState<{ reveals: DrawReveal[]; pool: Club[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);

  const loadStages = useCallback(async (v: TournamentView) => {
    const list = await Promise.all(v.stages.map((s) => api<StageView>(`/api/stages/${s.id}`)));
    // Ordem estável dentro da rodada (posição na chave, depois ordem de criação).
    for (const st of list) for (const r of st.rounds) r.matches.sort((a, b) => (a.bracketPosition ?? 0) - (b.bracketPosition ?? 0) || a.id.localeCompare(b.id));
    setStages(list);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca das fases após o campeonato
    if (view.data) loadStages(view.data).catch(() => setStages([]));
  }, [view.data, loadStages]);

  const reloadAll = useCallback(async () => { await view.reload(); }, [view]);

  useGSAP(() => {
    if (!view.data || reducedMotion()) return;
    gsap.fromTo(head.current!.querySelectorAll("[data-h]"), { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.07, ease: "power3.out" });
  }, { scope: head, dependencies: [!!view.data] });
  useGSAP(() => revealChildren(body.current), { scope: body, dependencies: [tab, stages, roundIdx] });

  const entries = useMemo(() => new Map<string, Entry>((view.data?.entries ?? []).map((e) => [e.id, e])), [view.data]);

  if (view.error) return <div className="pt-10"><ErrorState message={view.error.message} onRetry={view.reload} /></div>;
  if (!view.data) return <div className="flex flex-col gap-4"><Skeleton className="h-28" /><Skeleton className="h-12" /><Skeleton className="h-40" /><Skeleton className="h-40" /></div>;

  const { tournament: t, myMembership: member } = view.data;
  const champion = t.championEntryId ? entries.get(t.championEntryId) ?? null : null;
  const rr = stages?.find((s) => s.stage.type !== "KNOCKOUT") ?? null;
  const ko = stages?.find((s) => s.stage.type === "KNOCKOUT") ?? null;
  const canDraw = hasPermission(member, "DRAW_EDIT");
  const canManage = hasPermission(member, "MANAGE_MEMBERS") || hasPermission(member, "RULE_EDIT");
  const playStage = ko ?? rr;

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: "games", label: "Jogos", icon: "ball" },
    ...(rr ? [{ id: "table" as Tab, label: "Tabela", icon: "grid" }] : []),
    ...(ko || t.format === "GROUPS_KNOCKOUT" ? [{ id: "bracket" as Tab, label: "Chave", icon: "bracket" }] : []),
    { id: "stats", label: "Números", icon: "chart" },
    ...(member ? [{ id: "photos" as Tab, label: "Fotos", icon: "camera" }] : []),
    { id: "history", label: "Histórico", icon: "history" },
    ...(member ? [{ id: "manage" as Tab, label: canManage ? "Gestão" : "Membros", icon: "settings" }] : []),
  ];

  const qualifiers = t.format === "GROUPS_KNOCKOUT" ? t.settings.groupStage.qualifiersPerGroup : 0;
  const rrDone = !!rr && rr.rounds.every((r) => r.matches.every((m) => ["COMPLETED", "WALKOVER", "BYE", "CANCELLED"].includes(m.status)));
  const open = openId ? stages?.flatMap((x) => x.rounds.flatMap((r) => r.matches)).find((m) => m.id === openId) ?? null : null;
  const openMatchStage = open ? stages?.find((s) => s.stage.id === open.stageId)?.stage ?? null : null;

  async function generateFirstStage() {
    setBusy(true);
    try {
      await api(`/api/tournaments/${t.id}/stages`, { body: { mode: "RANDOM", clubs: { mode: "RANDOM", allowRepeat: false, allowedClubIds: [] } } });
      toast("Sorteio feito!");
      await reloadAll();
    } catch (e) { toast(errorMessage(e), "err"); } finally { setBusy(false); }
  }

  async function advance() {
    if (!rr) return;
    setBusy(true);
    try {
      await api(`/api/stages/${rr.stage.id}/advance`, { body: { clubs: { mode: rr.stage.clubAssignmentMode, allowRepeat: rr.stage.allowClubRepeat, allowedClubIds: rr.stage.allowedClubs.map((a) => a.club.id) } } });
      toast("Mata-mata gerado!");
      await reloadAll();
      setTab("bracket");
    } catch (e) { toast(errorMessage(e), "err"); } finally { setBusy(false); }
  }

  async function finishLeague() {
    setBusy(true);
    try {
      await api(`/api/tournaments/${t.id}/finish`, { body: {} });
      toast("Campeonato encerrado!");
      await reloadAll();
    } catch (e) { toast(errorMessage(e), "err"); } finally { setBusy(false); }
  }

  async function drawClubs(stage: StageView, roundId: string) {
    setBusy(true);
    try {
      const r = await api<{ assignments: { matchId: string; side: "HOME" | "AWAY"; clubId: string }[] }>(`/api/rounds/${roundId}/draw-clubs`, { body: {} });
      if (!r.assignments.length) { toast("Todos já têm clube nesta rodada"); return; }
      const clubs = await api<Club[]>("/api/clubs");
      const byId = new Map(clubs.map((c) => [c.id, c]));
      const matches = new Map(stage.rounds.flatMap((x) => x.matches).map((m) => [m.id, m]));
      setDraw({
        pool: stage.stage.allowedClubs.length ? stage.stage.allowedClubs.map((a) => a.club) : clubs,
        reveals: r.assignments.map((a) => {
          const m = matches.get(a.matchId);
          const e = a.side === "HOME" ? m?.homeEntry : m?.awayEntry;
          return { key: `${a.matchId}-${a.side}`, who: e?.name ?? "—", club: byId.get(a.clubId)! };
        }).filter((x) => x.club),
      });
      await reloadAll();
    } catch (e) { toast(errorMessage(e), "err"); } finally { setBusy(false); }
  }

  const rounds = playStage?.rounds ?? [];
  const firstOpen = rounds.findIndex((r) => r.matches.some((m) => m.status === "READY"));
  const ri = Math.min(roundIdx ?? (firstOpen >= 0 ? firstOpen : Math.max(0, rounds.length - 1)), Math.max(0, rounds.length - 1));
  const round = rounds[ri];

  return (
    <div className="flex flex-col gap-5">
      <div ref={head} className="flex flex-col gap-3">
        <div data-h className="flex items-center gap-3">
          <Link href="/app" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-2" aria-label="Voltar"><Icon name="back" /></Link>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted">{STATUS_LABEL[t.status]} · {FORMAT_LABEL[t.format]}{t.edition ? ` · ${t.edition}` : ""}</p>
            <h1 className="truncate font-display text-3xl font-extrabold leading-tight">{t.name}</h1>
          </div>
        </div>
        {champion && (
          <div data-h className="flex flex-col gap-2">
            <WinnerCelebration champion={champion} subtitle={search.get("final") ? "Final encerrada agora!" : undefined} />
            <Link href={`/app/t/${t.id}/retrospectiva`} className="btn btn-primary w-full"><Icon name="play" size={18} /> Ver retrospectiva</Link>
          </div>
        )}
        <div data-h><Tabs tabs={tabs} value={tab} onChange={setTab} /></div>
      </div>

      <div ref={body} className="flex flex-col gap-3">
        {stages === null ? (
          <><Skeleton className="h-28" /><Skeleton className="h-28" /></>
        ) : tab === "games" ? (
          !playStage ? (
            <EmptyState icon="dice" title="Ainda sem jogos">
              {view.data.entries.length < 2 ? "Adicione participantes na aba de gestão." : canDraw ? (
                <button className="btn btn-primary mt-3" onClick={generateFirstStage} disabled={busy}>{busy ? <Spinner /> : <><Icon name="dice" /> Sortear e gerar jogos</>}</button>
              ) : "Aguardando o sorteio do organizador."}
            </EmptyState>
          ) : (
            <>
              {rounds.length > 1 && (
                <div data-reveal className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
                  {rounds.map((r, i) => {
                    const done = r.matches.every((m) => m.status !== "READY" && m.status !== "SCHEDULED");
                    return (
                      <button key={r.id} onClick={() => setRoundIdx(i)} className={`min-h-11 shrink-0 rounded-xl border px-4 text-sm font-bold transition-colors ${i === ri ? "border-lime bg-lime text-lime-ink" : done ? "border-line text-muted" : "border-line text-text"}`}>
                        {playStage.stage.type === "KNOCKOUT" ? (i === rounds.length - 1 ? "Final" : i === rounds.length - 2 ? "Semi" : r.name ?? `Fase ${i + 1}`) : `R${r.number}`}
                      </button>
                    );
                  })}
                </div>
              )}
              {round && hasPermission(member, "TEAM_EDIT") && playStage.stage.clubAssignmentMode === "RANDOM" && round.matches.some((m) => m.homeEntryId && m.awayEntryId && m.clubs.length < 2 && m.status === "READY") && (
                <button data-reveal className="btn btn-ghost w-full" onClick={() => drawClubs(playStage, round.id)} disabled={busy}>{busy ? <Spinner /> : <><Icon name="dice" /> Sortear clubes da rodada</>}</button>
              )}
              {round?.matches.filter((m) => m.status !== "BYE" || m.homeEntryId || m.awayEntryId).map((m) => <MatchCard key={m.id} match={m} onOpen={(m) => setOpenId(m.id)} />)}
              {rrDone && t.format === "GROUPS_KNOCKOUT" && !ko && canDraw && (
                <div data-reveal className="card glow-lime flex flex-col gap-3 p-5 text-center">
                  <p className="font-display text-2xl font-bold">Fase de grupos concluída</p>
                  <p className="text-sm text-muted">Gere o mata-mata com os classificados calculados pelo servidor.</p>
                  <button className="btn btn-primary" onClick={advance} disabled={busy}>{busy ? <Spinner /> : <><Icon name="bracket" /> Gerar mata-mata</>}</button>
                </div>
              )}
              {rrDone && (t.format === "LEAGUE" || t.format === "GROUPS_ONLY") && t.status === "ACTIVE" && canDraw && (
                <div data-reveal className="card glow-lime flex flex-col gap-3 p-5 text-center">
                  <p className="font-display text-2xl font-bold">Todos os jogos concluídos</p>
                  <button className="btn btn-primary" onClick={finishLeague} disabled={busy}>{busy ? <Spinner /> : <><Icon name="trophy" /> Encerrar e definir campeão</>}</button>
                </div>
              )}
            </>
          )
        ) : tab === "table" && rr ? (
          rr.standings.length ? rr.standings.map((g) => <StandingTable key={g.groupId} group={g} entries={entries} qualifiers={qualifiers} />) : <EmptyState title="Sem classificação ainda" />
        ) : tab === "bracket" ? (
          ko ? <div data-reveal><Bracket rounds={ko.rounds} onOpen={(m) => setOpenId(m.id)} /></div> : (
            <EmptyState icon="bracket" title="Mata-mata ainda não gerado">
              {t.format === "GROUPS_KNOCKOUT" && `Classificam ${t.settings.groupStage.qualifiersPerGroup} por grupo${t.settings.groupStage.bestOfRest ? ` + ${t.settings.groupStage.bestOfRest} melhores entre os demais` : ""}.`}
            </EmptyState>
          )
        ) : tab === "stats" ? (
          <StatsPanel tournamentId={t.id} entries={entries} />
        ) : tab === "photos" ? (
          <PhotoGallery tournamentId={t.id} canUpload={hasPermission(member, "MEDIA_UPLOAD")} />
        ) : tab === "history" ? (
          <HistoryPanel tournamentId={t.id} entries={entries} />
        ) : tab === "manage" ? (
          <ManagePanel view={view.data} onChanged={reloadAll} />
        ) : null}
      </div>

      <MatchSheet
        match={open}
        stage={openMatchStage}
        tournament={t}
        member={member}
        entries={entries}
        myUserId={me.user.id}
        onClose={() => setOpenId(null)}
        onRefresh={reloadAll}
        onSaved={async (o) => { setOpenId(null); await reloadAll(); if (o?.finished) router.replace(`/app/t/${t.id}?final=1`); }}
      />

      <Sheet open={!!draw} onClose={() => setDraw(null)} title="Sorteio de clubes">
        {draw && <DrawAnimation reveals={draw.reveals} pool={draw.pool} />}
        <button className="btn btn-primary mt-4 w-full" onClick={() => setDraw(null)}>Fechar</button>
      </Sheet>
    </div>
  );
}
