"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

/** Última resposta de cada GET nesta aba (só memória; some ao recarregar a página). */
const cache = new Map<string, unknown>();
/** Dados derivados que as telas guardam entre visitas (ex.: fases de um campeonato). */
export const pageCache = new Map<string, unknown>();
export function clearApiCache() { cache.clear(); pageCache.clear(); }

/**
 * Busca com recarga manual. `path = null` não busca. Mostra na hora a última resposta conhecida do mesmo
 * endereço e revalida em segundo plano, então navegar entre telas não volta para o esqueleto de carregamento.
 */
export function useApi<T>(path: string | null) {
  const [data, setDataState] = useState<T | null>(() => (path ? (cache.get(path) as T | undefined) ?? null : null));
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(!!path && !cache.has(path));
  const [shownPath, setShownPath] = useState(path);
  if (shownPath !== path) {
    // Troca de endereço (ex.: aba Meus/Públicos): usa o cache do novo endereço sem esperar efeito.
    setShownPath(path);
    setDataState(path ? (cache.get(path) as T | undefined) ?? null : null);
    setLoading(!!path && !cache.has(path));
  }
  const setData = useCallback((v: T | null | ((prev: T | null) => T | null)) => {
    setDataState((prev) => {
      const next = typeof v === "function" ? (v as (p: T | null) => T | null)(prev) : v;
      if (path && next !== null) cache.set(path, next);
      return next;
    });
  }, [path]);
  const ctrl = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(!cache.has(path));
    try {
      const d = await api<T>(path, { signal: c.signal });
      cache.set(path, d);
      if (!c.signal.aborted) { setDataState(d); setError(null); }
    } catch (e) {
      if (!c.signal.aborted) setError(e as Error);
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial
    load();
    return () => ctrl.current?.abort();
  }, [load]);

  return { data, error, loading, reload: load, setData };
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza com a mídia
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}
