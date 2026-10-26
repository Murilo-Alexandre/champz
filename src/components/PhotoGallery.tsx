"use client";
import { useRef, useState } from "react";
import type { Media } from "@/lib/client/types";
import { useApi } from "@/lib/client/hooks";
import { errorMessage } from "@/lib/client/api";
import { uploadPhoto } from "@/lib/client/upload";
import { buildZip, saveBlob } from "@/lib/client/zip";
import { gsap, useGSAP, reducedMotion } from "@/lib/client/motion";
import { MediaImage, signedUrl } from "./MediaImage";
import { EmptyState, ErrorState, Icon, Sheet, Skeleton, Spinner, useToast } from "./ui";

const ZIP_LIMIT = 60;

/** Galeria do campeonato: câmera/galeria, envio múltiplo, visualização, download individual e álbum ZIP no aparelho. */
export function PhotoGallery({ tournamentId, matchId, canUpload, title = "Galeria" }: { tournamentId: string; matchId?: string; canUpload: boolean; title?: string }) {
  const q = new URLSearchParams({ limit: "60" });
  if (matchId) q.set("matchId", matchId);
  const { data, error, loading, reload } = useApi<{ items: Media[] }>(`/api/tournaments/${tournamentId}/media?${q}`);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const [queue, setQueue] = useState<{ name: string; p: number; err?: string }[]>([]);
  const [open, setOpen] = useState<Media | null>(null);
  const [zip, setZip] = useState<number | null>(null);

  useGSAP(() => {
    if (reducedMotion() || !grid.current) return;
    gsap.fromTo(grid.current.children, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.4, stagger: 0.03, ease: "power2.out" });
  }, { scope: grid, dependencies: [data?.items.length] });

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, 20);
    setQueue(list.map((f) => ({ name: f.name, p: 0 })));
    let ok = 0;
    for (let i = 0; i < list.length; i++) {
      try {
        await uploadPhoto(list[i], { tournamentId, kind: "PHOTO", matchId }, (p) => setQueue((q) => q.map((x, j) => (j === i ? { ...x, p } : x))));
        ok++;
      } catch (e) {
        setQueue((q) => q.map((x, j) => (j === i ? { ...x, err: errorMessage(e) } : x)));
      }
    }
    if (ok) { toast(`${ok} foto(s) enviada(s)`); reload(); }
    setTimeout(() => setQueue((q) => q.filter((x) => x.err)), 1500);
  }

  async function downloadOne(m: Media) {
    try { window.location.href = await signedUrl(m.id, { download: true }); } catch (e) { toast(errorMessage(e), "err"); }
  }

  async function downloadAll() {
    const items = (data?.items ?? []).slice(0, ZIP_LIMIT);
    if (!items.length) return;
    setZip(0);
    try {
      const files: { name: string; data: Uint8Array }[] = [];
      for (let i = 0; i < items.length; i++) {
        const url = await signedUrl(items[i].id);
        const buf = new Uint8Array(await (await fetch(url)).arrayBuffer());
        files.push({ name: `champz-${String(i + 1).padStart(3, "0")}.webp`, data: buf });
        setZip((i + 1) / items.length);
      }
      saveBlob(buildZip(files), "champz-album.zip");
    } catch (e) {
      toast(errorMessage(e), "err");
    } finally {
      setZip(null);
    }
  }

  const items = data?.items ?? [];
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-2xl font-bold">{title}</h2>
        {items.length > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={downloadAll} disabled={zip !== null}>
            {zip !== null ? <><Spinner size={16} /> {Math.round(zip * 100)}%</> : <><Icon name="download" size={18} /> Álbum</>}
          </button>
        )}
      </div>

      {canUpload && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary" onClick={() => camRef.current?.click()}><Icon name="camera" /> Câmera</button>
          <button className="btn btn-ghost" onClick={() => fileRef.current?.click()}><Icon name="image" /> Galeria</button>
          <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
        </div>
      )}

      {queue.length > 0 && (
        <div className="card flex flex-col gap-2 p-3">
          {queue.map((q, i) => (
            <div key={i} className="text-sm">
              <div className="flex justify-between gap-2"><span className="truncate">{q.name}</span><span className={q.err ? "text-danger" : "text-muted"}>{q.err ? "falhou" : `${Math.round(q.p * 100)}%`}</span></div>
              {q.err ? <p className="text-xs text-danger">{q.err}</p> : <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-lime transition-all" style={{ width: `${q.p * 100}%` }} /></div>}
            </div>
          ))}
        </div>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-3 gap-1.5">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square" />)}</div>
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : !items.length ? (
        <EmptyState icon="camera" title="Nenhuma foto ainda">{canUpload ? "Registre os momentos do campeonato pela câmera ou pela galeria." : "As fotos enviadas pelos participantes aparecem aqui."}</EmptyState>
      ) : (
        <div ref={grid} className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {items.map((m) => (
            <button key={m.id} onClick={() => setOpen(m)} className="overflow-hidden rounded-xl active:scale-95" aria-label={m.caption ?? "Abrir foto"}>
              <MediaImage mediaId={m.id} alt={m.caption ?? "Foto do campeonato"} className="aspect-square" />
            </button>
          ))}
        </div>
      )}
      {items.length > ZIP_LIMIT && <p className="text-xs text-muted">O álbum ZIP inclui as {ZIP_LIMIT} fotos mais recentes.</p>}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.caption ?? "Foto"} wide>
        {open && (
          <div className="flex flex-col gap-3">
            <MediaImage mediaId={open.id} alt={open.caption ?? "Foto"} thumb={false} className="max-h-[65dvh] min-h-60 rounded-2xl [&_img]:object-contain" />
            <button className="btn btn-ghost" onClick={() => downloadOne(open)}><Icon name="download" /> Baixar foto</button>
          </div>
        )}
      </Sheet>
    </section>
  );
}
