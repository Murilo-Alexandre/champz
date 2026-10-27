"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { normalizeName } from "@/lib/text";
import { UserAvatar } from "./ParticipantAvatar";
import { Icon, Spinner } from "./ui";

export type UserHit = { id: string; name: string; username: string | null; image: string | null; avatarMediaId: string | null };

/**
 * Busca dinâmica de contas do Champz (nome, usuário ou e-mail; parcial; sem diferenciar maiúsculas/acentos).
 * Toque no resultado para adicionar. Contas já adicionadas aparecem marcadas e não podem entrar de novo.
 */
export function ParticipantSearch({ takenUserIds, onPick, onNoMatch, placeholder = "Buscar por nome, usuário ou e-mail" }: {
  takenUserIds: Set<string>; onPick: (u: UserHit) => void; onNoMatch?: (q: string) => void; placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<UserHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const term = normalizeName(q);

  useEffect(() => {
    if (term.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api<UserHit[]>(`/api/users/search?q=${encodeURIComponent(q.trim())}`, { signal: ctrl.signal });
        if (!ctrl.signal.aborted) { setHits(r); setFailed(false); }
      } catch {
        if (!ctrl.signal.aborted) setFailed(true);
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 220);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, term]);

  const shown = term.length >= 2 ? hits : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <Icon name="search" size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input ref={input} className="input pl-11 pr-11" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="search" aria-label="Buscar participante" role="combobox" aria-expanded={!!shown?.length} aria-controls="participant-results" />
        <span className="absolute right-3.5 top-1/2 -translate-y-1/2">
          {loading ? <Spinner size={18} /> : q && <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted" onClick={() => { setQ(""); setHits(null); input.current?.focus(); }} aria-label="Limpar busca"><Icon name="close" size={16} /></button>}
        </span>
      </div>
      {term.length === 1 && <p className="px-1 text-xs text-muted">Digite mais uma letra…</p>}
      {failed && <p className="px-1 text-sm text-danger">Não foi possível buscar agora. Tente de novo.</p>}
      {shown && (
        <ul id="participant-results" role="listbox" className="flex flex-col overflow-hidden rounded-2xl border border-line bg-bg-2">
          {shown.map((u) => {
            const taken = takenUserIds.has(u.id);
            return (
              <li key={u.id} role="option" aria-selected={taken}>
                <button type="button" disabled={taken} onClick={() => { onPick(u); setQ(""); setHits(null); input.current?.focus(); }}
                  className="flex min-h-14 w-full items-center gap-3 border-t border-line/60 px-3 py-2 text-left transition-colors first:border-t-0 active:bg-surface-2 disabled:opacity-50">
                  <UserAvatar name={u.name} mediaId={u.avatarMediaId} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{u.name}</span>
                    {u.username && <span className="block truncate text-xs text-muted">@{u.username}</span>}
                  </span>
                  {taken ? <span className="chip shrink-0"><Icon name="check" size={14} />Adicionado</span> : <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lime text-lime-ink"><Icon name="plus" size={18} /></span>}
                </button>
              </li>
            );
          })}
          {!shown.length && !loading && (
            <li className="flex flex-col items-start gap-2 p-3 text-sm text-muted">
              Nenhuma conta encontrada para “{q.trim()}”.
              {onNoMatch && <button type="button" className="font-bold text-lime" onClick={() => { onNoMatch(q.trim()); setQ(""); setHits(null); }}>Adicionar “{q.trim()}” como convidado</button>}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
