"use client";
import { initials } from "@/lib/client/labels";
import type { Entry } from "@/lib/client/types";
import { useSignedUrl } from "./MediaImage";

const HUES = [96, 190, 210, 260, 320, 25, 45, 160];
function hueOf(text: string) {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

function Face({ name, mediaId, size }: { name: string; mediaId?: string | null; size: number }) {
  const { url } = useSignedUrl(mediaId ?? null, true);
  const hue = hueOf(name);
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full font-display font-bold ring-2 ring-bg"
      style={{ width: size, height: size, fontSize: size * 0.4, background: `linear-gradient(140deg, hsl(${hue} 70% 32%), hsl(${hue} 60% 18%))`, color: `hsl(${hue} 90% 85%)` }}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        initials(name)
      )}
    </span>
  );
}

/** Avatar do participante; em duplas mostra os dois rostos sobrepostos. */
export function ParticipantAvatar({ entry, size = 40 }: { entry: Pick<Entry, "name" | "players" | "type"> | null; size?: number }) {
  if (!entry) return <span className="grid shrink-0 place-items-center rounded-full border border-dashed border-line text-xs text-muted" style={{ width: size, height: size }}>?</span>;
  const faces = (entry.players ?? []).slice(0, 2).map((p) => ({ name: p.user?.name ?? p.guestName ?? entry.name, mediaId: p.user?.avatarMediaId }));
  if (entry.type === "DUO" && faces.length === 2) {
    const s = Math.round(size * 0.74);
    return (
      <span className="relative shrink-0" style={{ width: size, height: size }} aria-label={entry.name}>
        <span className="absolute left-0 top-0"><Face {...faces[0]} size={s} /></span>
        <span className="absolute bottom-0 right-0"><Face {...faces[1]} size={s} /></span>
      </span>
    );
  }
  return <Face name={faces[0]?.name ?? entry.name} mediaId={faces[0]?.mediaId} size={size} />;
}

export function UserAvatar({ name, mediaId, size = 40 }: { name: string; mediaId?: string | null; size?: number }) {
  return <Face name={name} mediaId={mediaId} size={size} />;
}
