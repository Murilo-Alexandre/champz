"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";

/** Cache em memória das URLs assinadas (expiram em 5 min; renovamos com folga). */
const cache = new Map<string, { url: string; at: number }>();
const TTL = 4 * 60 * 1000;

export async function signedUrl(mediaId: string, opts: { thumb?: boolean; download?: boolean } = {}) {
  const key = `${mediaId}:${opts.thumb ? 1 : 0}:${opts.download ? 1 : 0}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.url;
  const q = new URLSearchParams();
  if (opts.thumb) q.set("thumb", "1");
  if (opts.download) q.set("download", "1");
  const { url } = await api<{ url: string }>(`/api/media/${mediaId}/url?${q}`);
  cache.set(key, { url, at: Date.now() });
  return url;
}

export function useSignedUrl(mediaId: string | null | undefined, thumb = true) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!mediaId) return;
    let alive = true;
    signedUrl(mediaId, { thumb }).then((u) => alive && setUrl(u), () => alive && setFailed(true));
    return () => { alive = false; };
  }, [mediaId, thumb]);
  return { url: mediaId ? url : null, failed };
}

export function MediaImage({ mediaId, alt, className = "", thumb = true }: { mediaId: string; alt: string; className?: string; thumb?: boolean }) {
  const { url, failed } = useSignedUrl(mediaId, thumb);
  const [loaded, setLoaded] = useState(false);
  if (failed) return <div className={`grid place-items-center bg-surface-2 text-xs text-muted ${className}`}>Foto indisponível</div>;
  return (
    <div className={`relative overflow-hidden bg-surface-2 ${className}`}>
      {!loaded && <div className="skeleton absolute inset-0 rounded-none" />}
      {url && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada temporária do bucket privado
        <img src={url} alt={alt} loading="lazy" decoding="async" onLoad={() => setLoaded(true)} onError={() => { cache.clear(); }} className={`h-full w-full object-cover transition-opacity duration-500 ${loaded ? "opacity-100" : "opacity-0"}`} />
      )}
    </div>
  );
}
