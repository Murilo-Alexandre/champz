"use client";
import { useState } from "react";
import { api, errorMessage } from "@/lib/client/api";
import { useApi } from "@/lib/client/hooks";
import type { AuditItem, Entry } from "@/lib/client/types";
import { AuditTimeline } from "@/components/AuditTimeline";
import { EmptyState, ErrorState, Skeleton, Spinner, useToast } from "@/components/ui";

export function HistoryPanel({ tournamentId, entries }: { tournamentId: string; entries: Map<string, Entry> }) {
  const { data, error, loading, reload } = useApi<{ items: AuditItem[]; nextCursor: string | null }>(`/api/tournaments/${tournamentId}/audit?limit=40`);
  const [more, setMore] = useState<AuditItem[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  if (loading && !data) return <><Skeleton className="h-16" /><Skeleton className="h-16" /><Skeleton className="h-16" /></>;
  if (error) return <ErrorState message={error.message} onRetry={reload} />;
  if (!data?.items.length) return <EmptyState icon="history" title="Nada registrado ainda" />;
  const next = cursor === undefined ? data.nextCursor : cursor;

  async function loadMore() {
    if (!next) return;
    setBusy(true);
    try {
      const r = await api<{ items: AuditItem[]; nextCursor: string | null }>(`/api/tournaments/${tournamentId}/audit?limit=40&cursor=${next}`);
      setMore((m) => [...m, ...r.items]);
      setCursor(r.nextCursor);
    } catch (e) { toast(errorMessage(e), "err"); } finally { setBusy(false); }
  }

  return (
    <div data-reveal className="pt-2">
      <p className="mb-4 text-sm text-muted">Registro permanente: nenhuma alteração apaga o que veio antes.</p>
      <AuditTimeline items={[...data.items, ...more]} entries={entries} />
      {next && <button className="btn btn-ghost w-full" onClick={loadMore} disabled={busy}>{busy ? <Spinner /> : "Carregar mais"}</button>}
    </div>
  );
}
