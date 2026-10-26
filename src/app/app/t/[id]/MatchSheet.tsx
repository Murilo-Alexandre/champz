"use client";
import { useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import type { AuditItem, Club, Entry, Match, Membership, StageView, Tournament } from "@/lib/client/types";
import { hasPermission } from "@/lib/permissions";
import { Icon, ScoreStepper, Segmented, Sheet, Spinner, useToast } from "@/components/ui";
import { ParticipantAvatar } from "@/components/ParticipantAvatar";
import { ClubBadge } from "@/components/ClubBadge";
import { AuditTimeline } from "@/components/AuditTimeline";
import { PhotoGallery } from "@/components/PhotoGallery";
import { Confetti } from "@/components/WinnerCelebration";

type Mode = "score" | "wo" | "history" | "photos";

export function MatchSheet({
  match, stage, tournament, member, entries, myUserId, onClose, onSaved, onRefresh,
}: {
  match: Match | null; stage: StageView["stage"] | null; tournament: Tournament; member: Membership | null; entries: Map<string, Entry>; myUserId: string;
  onClose: () => void; onSaved: (opts?: { finished?: boolean }) => void; onRefresh: () => Promise<void>;
}) {
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("score");
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [hp, setHp] = useState(0);
  const [ap, setAp] = useState(0);
  const [winner, setWinner] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [absent, setAbsent] = useState<"HOME" | "AWAY" | "BOTH">("AWAY");
  const [busy, setBusy] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  const matchId = match?.id;
  useEffect(() => {
    if (!match) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia formulário ao abrir outra partida
    setMode("score"); setHome(match.homeScore ?? 0); setAway(match.awayScore ?? 0); setHp(match.homePenalties ?? 0); setAp(match.awayPenalties ?? 0);
    setWinner(null); setReason(""); setCelebrate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reinicia só ao trocar de partida
  }, [matchId]);

  const { data: clubs } = useApi<Club[]>(match ? "/api/clubs" : null);
  const audit = useApi<{ items: AuditItem[] }>(match && mode === "history" ? `/api/tournaments/${tournament.id}/audit?targetType=MATCH&targetId=${match.id}` : null);

  if (!match || !stage) return <Sheet open={false} onClose={onClose}>{null}</Sheet>;

  const canResult = hasPermission(member, "RESULT_EDIT");
  const canClubs = hasPermission(member, "TEAM_EDIT");
  const canPhotos = hasPermission(member, "MEDIA_UPLOAD");
  const isAdmin = member?.role === "OWNER" || member?.role === "ADMIN";
  const ready = !!match.homeEntryId && !!match.awayEntryId && match.status !== "CANCELLED" && match.status !== "BYE";
  const already = match.status === "COMPLETED" || match.status === "WALKOVER";
  const ko = stage.type === "KNOCKOUT";
  const tie = home === away;
  const usePens = ko && tie && tournament.settings.knockout.drawResolution === "PENALTIES";
  const manual = ko && tie && tournament.settings.knockout.drawResolution === "MANUAL";
  const isPlayer = (e: Entry | null) => !!e?.players.some((p) => p.userId === myUserId);

  const pool = stage.allowedClubs.length ? stage.allowedClubs.map((a) => a.club) : (clubs ?? []).filter((c) => c.active);

  async function save() {
    if (already && reason.trim().length < 3) return toast("Informe o motivo da correção", "err");
    if (usePens && hp === ap) return toast("Pênaltis não podem empatar", "err");
    if (manual && !winner) return toast("Escolha quem avança", "err");
    setBusy(true);
    try {
      await api(`/api/matches/${match!.id}/result`, {
        method: "PUT",
        body: {
          homeScore: home, awayScore: away,
          homePenalties: usePens ? hp : null, awayPenalties: usePens ? ap : null,
          manualWinnerEntryId: manual ? winner : null,
          expectedVersion: match!.version, reason: reason.trim() || undefined,
        },
      });
      const final = ko && !match!.nextMatchId;
      toast(already ? "Placar corrigido" : "Placar registrado");
      if (final) { setCelebrate(true); setTimeout(() => onSaved({ finished: true }), 1800); } else onSaved();
    } catch (e) {
      toast(e instanceof ApiError && e.code === "VERSION_CONFLICT" ? "Alguém alterou esse jogo agora. Recarregamos os dados." : errorMessage(e), "err");
      if (e instanceof ApiError && e.code === "VERSION_CONFLICT") onSaved();
    } finally { setBusy(false); }
  }

  async function walkover() {
    if (reason.trim().length < 3) return toast("Informe o motivo do W.O.", "err");
    if (absent === "BOTH" && ko && !winner) return toast("Escolha quem avança", "err");
    setBusy(true);
    try {
      await api(`/api/matches/${match!.id}/walkover`, { method: "PUT", body: { absent, reason: reason.trim(), manualWinnerEntryId: absent === "BOTH" && ko ? winner : null, expectedVersion: match!.version } });
      toast("W.O. registrado"); onSaved();
    } catch (e) { toast(errorMessage(e), "err"); } finally { setBusy(false); }
  }

  async function setClub(side: "HOME" | "AWAY", clubId: string) {
    try {
      await api(`/api/matches/${match!.id}/clubs`, { method: "PUT", body: { side, clubId } });
      toast("Clube definido"); await onRefresh();
    } catch (e) { toast(errorMessage(e), "err"); }
  }

  const sides = [
    { side: "HOME" as const, entry: match.homeEntry },
    { side: "AWAY" as const, entry: match.awayEntry },
  ];
  const tabs: { id: Mode; label: string }[] = [
    { id: "score", label: "Placar" },
    ...(isAdmin && ready ? [{ id: "wo" as Mode, label: "W.O." }] : []),
    { id: "photos", label: "Fotos" },
    { id: "history", label: "Histórico" },
  ];

  return (
    <Sheet open onClose={onClose} title={already ? "Resultado" : "Lançar placar"} wide>
      <div className="relative flex flex-col gap-4">
        {celebrate && <Confetti active />}
        <Segmented options={tabs} value={mode} onChange={setMode} />

        {mode === "score" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {sides.map(({ side, entry }) => {
                const club = match.clubs.find((c) => c.side === side)?.club;
                const canPick = canClubs || (stage.clubAssignmentMode === "PLAYER_CHOICE" && isPlayer(entry));
                return (
                  <div key={side} className="card flex flex-col items-center gap-2 p-3 text-center">
                    <ParticipantAvatar entry={entry} size={56} />
                    <p className="line-clamp-2 font-bold leading-tight">{entry?.name ?? "A definir"}</p>
                    {canPick && ready ? (
                      <label className="flex w-full items-center gap-1.5 rounded-xl bg-bg-2 px-2">
                        {club && <ClubBadge club={club} size={18} />}
                        <select className="min-h-11 w-full bg-transparent text-sm font-semibold outline-none" value={club?.id ?? ""} onChange={(e) => e.target.value && setClub(side, e.target.value)} aria-label={`Clube de ${entry?.name}`}>
                          <option value="">Escolher clube</option>
                          {pool.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </label>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-muted">{club ? <><ClubBadge club={club} size={18} />{club.name}</> : "Clube a definir"}</span>
                    )}
                  </div>
                );
              })}
            </div>

            {ready && canResult ? (
              <>
                <div className="flex items-center justify-center gap-6 py-2">
                  <ScoreStepper value={home} onChange={setHome} label={match.homeEntry?.name ?? "mandante"} />
                  <span className="font-display text-4xl text-muted">:</span>
                  <ScoreStepper value={away} onChange={setAway} label={match.awayEntry?.name ?? "visitante"} />
                </div>
                {usePens && (
                  <div className="card flex flex-col items-center gap-2 p-3">
                    <p className="text-xs font-bold uppercase tracking-widest text-gold">Pênaltis</p>
                    <div className="flex items-center gap-6"><ScoreStepper value={hp} onChange={setHp} label="pênaltis mandante" /><span className="text-muted">:</span><ScoreStepper value={ap} onChange={setAp} label="pênaltis visitante" /></div>
                  </div>
                )}
                {manual && (
                  <div><span className="label">Empate: quem avança (decisão administrativa)</span>
                    <Segmented options={sides.map((s) => ({ id: s.entry?.id ?? s.side, label: s.entry?.name ?? s.side }))} value={winner ?? ""} onChange={setWinner} />
                  </div>
                )}
                {already && (
                  <div><label className="label" htmlFor="reason">Motivo da correção (fica no histórico)</label><input id="reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></div>
                )}
                <button className="btn btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner /> : already ? "Salvar correção" : "Confirmar placar"}</button>
              </>
            ) : ready ? (
              <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">Você pode ver este jogo, mas não tem permissão para lançar o placar.</p>
            ) : (
              <p className="rounded-xl bg-surface-2 p-3 text-center text-sm text-muted">{match.status === "CANCELLED" ? "Partida cancelada." : "Aguardando os dois participantes."}</p>
            )}
          </>
        )}

        {mode === "wo" && (
          <>
            <span className="label">Quem não compareceu?</span>
            <Segmented options={[{ id: "HOME", label: match.homeEntry?.name ?? "Mandante" }, { id: "AWAY", label: match.awayEntry?.name ?? "Visitante" }, { id: "BOTH", label: "Os dois" }]} value={absent} onChange={setAbsent} />
            {absent === "BOTH" && ko && (
              <div><span className="label">Quem avança (decisão administrativa)</span>
                <Segmented options={sides.map((s) => ({ id: s.entry?.id ?? s.side, label: s.entry?.name ?? s.side }))} value={winner ?? ""} onChange={setWinner} />
              </div>
            )}
            <p className="text-xs text-muted">Regra do campeonato: {tournament.settings.walkover.presentPoints} pts para quem compareceu, {tournament.settings.walkover.absentPoints} para o ausente{tournament.settings.walkover.symbolicScore ? `, placar ${tournament.settings.walkover.symbolicScore.present} x ${tournament.settings.walkover.symbolicScore.absent}` : ""}.</p>
            <div><label className="label" htmlFor="wo-reason">Motivo</label><input id="wo-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Ex.: não apareceu no horário combinado" /></div>
            <button className="btn btn-danger w-full" onClick={walkover} disabled={busy}>{busy ? <Spinner /> : "Registrar W.O."}</button>
          </>
        )}

        {mode === "photos" && <PhotoGallery tournamentId={tournament.id} matchId={match.id} canUpload={canPhotos} title="Fotos do jogo" />}

        {mode === "history" && (
          audit.loading && !audit.data ? <div className="grid place-items-center py-8"><Spinner /></div>
            : audit.data?.items.length ? <AuditTimeline items={audit.data.items} entries={entries} />
            : <p className="flex items-center gap-2 text-sm text-muted"><Icon name="history" size={18} />Sem alterações registradas neste jogo.</p>
        )}
      </div>
    </Sheet>
  );
}
