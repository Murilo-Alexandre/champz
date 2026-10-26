"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { useApi } from "@/lib/client/hooks";
import type { TournamentListItem } from "@/lib/client/types";
import { FORMAT_LABEL, ROLE_LABEL, STATUS_LABEL } from "@/lib/client/labels";
import { useGSAP, revealChildren } from "@/lib/client/motion";
import { useMe } from "@/components/AppShell";
import { EmptyState, ErrorState, Icon, Segmented, Skeleton } from "@/components/ui";
import { InstallAppBanner } from "@/components/InstallAppBanner";

const STATUS_TONE: Record<string, string> = { ACTIVE: "text-lime", FINISHED: "text-gold", DRAFT: "text-muted", OPEN: "text-cyan", CANCELLED: "text-danger" };

function TournamentCard({ t }: { t: TournamentListItem }) {
  const live = t.status === "ACTIVE";
  return (
    <Link href={`/app/t/${t.id}`} data-reveal className={`card relative block overflow-hidden p-5 transition-transform active:scale-[0.98] ${live ? "glow-lime" : ""}`}>
      {t.status === "FINISHED" && <Icon name="trophy" size={90} className="absolute -right-4 -top-3 text-gold/10" />}
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
        {live && <span className="relative flex h-2 w-2"><span className="absolute h-full w-full animate-ping rounded-full bg-lime opacity-70" /><span className="h-2 w-2 rounded-full bg-lime" /></span>}
        <span className={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</span>
        <span className="text-muted">· {FORMAT_LABEL[t.format]}</span>
      </div>
      <h3 className="mt-2 font-display text-2xl font-bold leading-tight">{t.name}</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="chip"><Icon name="users" size={14} />{t._count.entries} {t.entryType === "DUO" ? "duplas" : "participantes"}</span>
        {t.edition && <span className="chip">{t.edition}</span>}
        {t.members[0] && <span className="chip">{ROLE_LABEL[t.members[0].role]}</span>}
      </div>
    </Link>
  );
}

export default function HomePage() {
  const { me } = useMe();
  const [scope, setScope] = useState<"mine" | "public">("mine");
  const { data, error, loading, reload } = useApi<TournamentListItem[]>(`/api/tournaments?scope=${scope}`);
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => revealChildren(ref.current), { scope: ref, dependencies: [data, scope] });

  const list = data ?? [];
  const active = list.filter((t) => t.status === "ACTIVE");
  const others = list.filter((t) => t.status !== "ACTIVE");
  const first = me.user.name.split(" ")[0];

  return (
    <div ref={ref} className="flex flex-col gap-6">
      <header data-reveal className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Fala, {first}</p>
          <h1 className="font-display text-4xl font-extrabold">Seus campeonatos</h1>
        </div>
        <Link href="/app/novo" className="grid h-12 w-12 place-items-center rounded-2xl bg-lime text-lime-ink" aria-label="Criar campeonato"><Icon name="plus" size={26} /></Link>
      </header>

      <div data-reveal><Segmented options={[{ id: "mine", label: "Meus" }, { id: "public", label: "Públicos" }]} value={scope} onChange={setScope} /></div>

      {loading && !data ? (
        <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !list.length ? (
        <EmptyState icon="trophy" title={scope === "mine" ? "Nenhum campeonato ainda" : "Nenhum campeonato público"}>
          {scope === "mine" && <Link href="/app/novo" className="btn btn-primary mt-3">Criar o primeiro</Link>}
        </EmptyState>
      ) : (
        <>
          {active.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 data-reveal className="text-xs font-bold uppercase tracking-widest text-lime">Em andamento</h2>
              {active.map((t) => <TournamentCard key={t.id} t={t} />)}
            </section>
          )}
          {others.length > 0 && (
            <section className="flex flex-col gap-3">
              {active.length > 0 && <h2 data-reveal className="text-xs font-bold uppercase tracking-widest text-muted">Outros</h2>}
              {others.map((t) => <TournamentCard key={t.id} t={t} />)}
            </section>
          )}
        </>
      )}

      <InstallAppBanner />
    </div>
  );
}
