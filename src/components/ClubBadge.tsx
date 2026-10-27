"use client";
import { useState } from "react";
import type { Club } from "@/lib/client/types";
import { useSignedUrl } from "./MediaImage";

function abbr(club: Pick<Club, "name" | "shortName">) {
  if (club.shortName) return club.shortName.slice(0, 3).toUpperCase();
  const words = club.name.replace(/[^\p{L}\s]/gu, "").split(/\s+/).filter((w) => w.length > 1);
  return (words.length > 1 ? words.map((w) => w[0]).join("") : club.name).slice(0, 3).toUpperCase();
}

function hue(name: string) {
  let h = 7;
  for (const c of name) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  return h % 360;
}

/** Escudo do clube: imagem real quando houver; senão um escudo com sigla. */
export function ClubBadge({ club, size = 28 }: { club: Pick<Club, "name" | "shortName" | "crestMediaId" | "crestPath"> | null | undefined; size?: number }) {
  const { url } = useSignedUrl(club?.crestPath ? null : club?.crestMediaId ?? null, true);
  const [broken, setBroken] = useState<string | null>(null);
  if (!club) return null;
  const h = hue(club.name);
  if (club.crestPath && broken !== club.crestPath)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- escudo estático otimizado (WebP 128px)
      <img src={club.crestPath} alt={club.name} title={club.name} width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(club.crestPath!)} className="shrink-0 object-contain" style={{ width: size, height: size }} />
    );
  if (url)
    return (
      // eslint-disable-next-line @next/next/no-img-element -- URL assinada
      <img src={url} alt={club.name} title={club.name} width={size} height={size} className="shrink-0 object-contain" />
    );
  return (
    <svg width={size} height={size * 1.15} viewBox="0 0 40 46" className="shrink-0" role="img" aria-label={club.name}>
      <title>{club.name}</title>
      <path d="M20 2 37 8v14c0 11-7.5 18.5-17 22C10.5 40.5 3 33 3 22V8z" fill={`hsl(${h} 65% 30%)`} stroke={`hsl(${h} 80% 62%)`} strokeWidth="2.5" />
      <text x="20" y="27" textAnchor="middle" fontSize={abbr(club).length > 2 ? 11 : 13} fontWeight="800" fill="#fff" fontFamily="var(--font-display), sans-serif">{abbr(club)}</text>
    </svg>
  );
}
