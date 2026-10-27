"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { gsap, reducedMotion } from "@/lib/client/motion";

// ───────── Ícones (traço único, 24px) ─────────
const paths: Record<string, ReactNode> = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  trophy: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M16 5h3v2a3 3 0 0 1-3 3M8 5H5v2a3 3 0 0 0 3 3M12 13v4M8 21h8M9 17h6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  shield: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  back: <path d="M15 5l-7 7 7 7" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="M5 12.5 10 17l9-10" />,
  camera: <><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-8 8" /></>,
  download: <path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14" />,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" fill="currentColor" /><circle cx="15" cy="15" r="1" fill="currentColor" /><circle cx="15" cy="9" r="1" fill="currentColor" /><circle cx="9" cy="15" r="1" fill="currentColor" /></>,
  history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>,
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  bracket: <path d="M3 5h5v6h5M3 17h5v-6M13 11h3v-4h5M16 11v6h5" />,
  ball: <><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10z" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  play: <path d="M7 4v16l13-8z" />,
  pause: <path d="M7 4h4v16H7zM14 4h4v16h-4z" />,
  next: <path d="m9 5 7 7-7 7" />,
  prev: <path d="m15 5-7 7 7 7" />,
  share: <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v7h14v-7" /></>,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  logout: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />,
  google: <path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5a4.4 4.4 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2zM12 21c2.5 0 4.6-.8 6.1-2.3l-3-2.3c-.8.6-1.9.9-3.1.9a5.4 5.4 0 0 1-5-3.7H4v2.4A9 9 0 0 0 12 21zM7 13.6a5.4 5.4 0 0 1 0-3.4V7.8H4a9 9 0 0 0 0 8.2zM12 6.6c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9 9 0 0 0 4 7.8l3 2.4a5.4 5.4 0 0 1 5-3.6z" />,
  warn: <><path d="M12 3 2 21h20z" /><path d="M12 10v5M12 18v.5" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20a7 7 0 0 1 14 0M16 4.5a3.5 3.5 0 0 1 0 7M22 20a7 7 0 0 0-4-6.3" /></>,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  edit: <path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4" />,
  grip: <path d="M5 8h14M5 12h14M5 16h14" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
};

export function Icon({ name, size = 22, className = "", filled = false }: { name: keyof typeof paths | string; size?: number; className?: string; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      {paths[name] ?? null}
    </svg>
  );
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <span className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent" style={{ width: size, height: size }} aria-label="Carregando" />;
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

export function EmptyState({ icon = "ball", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center" data-reveal>
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-lime"><Icon name={icon} size={28} /></div>
      <p className="font-display text-xl font-bold">{title}</p>
      {children && <div className="text-sm text-muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 border-danger/40 px-6 py-8 text-center" role="alert">
      <Icon name="warn" className="text-danger" size={28} />
      <p className="text-sm">{message}</p>
      {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>Tentar de novo</button>}
    </div>
  );
}

// ───────── Bottom sheet / modal ─────────
export function Sheet({ open, onClose, title, children, wide = false }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(open);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- monta antes de animar
      setMounted(true);
      return;
    }
    if (!mounted) return;
    if (reducedMotion() || !panel.current) { setMounted(false); return; }
    gsap.to(backdrop.current, { opacity: 0, duration: 0.2 });
    gsap.to(panel.current, { yPercent: 100, duration: 0.28, ease: "power3.in", onComplete: () => setMounted(false) });
  }, [open, mounted]);

  useEffect(() => {
    if (!open || !mounted || !panel.current) return;
    if (!reducedMotion()) {
      gsap.fromTo(backdrop.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      gsap.fromTo(panel.current, { yPercent: 100 }, { yPercent: 0, duration: 0.45, ease: "expo.out" });
    }
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current.querySelector<HTMLElement>("input,button,select,textarea")?.focus({ preventScroll: true });
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open, mounted]);

  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div ref={backdrop} className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div
        ref={panel}
        className={`relative max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-line bg-bg-2 px-5 pt-3 sm:rounded-3xl ${wide ? "sm:max-w-2xl" : "sm:max-w-md"}`}
        style={{ paddingBottom: "calc(20px + var(--safe-bottom))" }}
      >
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        {title && (
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold">{title}</h2>
            <button className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2" onClick={onClose} aria-label="Fechar"><Icon name="close" /></button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ───────── Toasts ─────────
type Toast = { id: number; text: string; tone: "ok" | "err" };
const ToastCtx = createContext<(text: string, tone?: Toast["tone"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setItems((x) => [...x, { id, text, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 px-4" style={{ paddingTop: "calc(12px + var(--safe-top))" }} aria-live="polite">
        {items.map((t) => <ToastItem key={t.id} toast={t} />)}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!reducedMotion()) gsap.fromTo(ref.current, { y: -30, opacity: 0, scale: 0.95 }, { y: 0, opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.7)" });
  }, []);
  return (
    <div ref={ref} className={`pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-semibold shadow-2xl ${toast.tone === "ok" ? "border-lime/40 bg-surface text-text" : "border-danger/50 bg-surface text-danger"}`}>
      <Icon name={toast.tone === "ok" ? "check" : "warn"} size={18} className={toast.tone === "ok" ? "text-lime" : ""} />
      {toast.text}
    </div>
  );
}

// ───────── Abas com indicador animado ─────────
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; icon?: string }[]; value: T; onChange: (v: T) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
    if (!el || !bar.current) return;
    el.scrollIntoView({ block: "nearest", inline: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    gsap.to(bar.current, { x: el.offsetLeft, width: el.offsetWidth, duration: reducedMotion() ? 0 : 0.4, ease: "power3.out" });
  }, [value, tabs.length]);
  return (
    <div ref={wrap} className="no-scrollbar relative flex gap-1 overflow-x-auto" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          data-tab={t.id}
          role="tab"
          aria-selected={t.id === value}
          onClick={() => onChange(t.id)}
          className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition-colors ${t.id === value ? "text-lime" : "text-muted"}`}
        >
          {t.icon && <Icon name={t.icon} size={18} />}
          {t.label}
        </button>
      ))}
      <div ref={bar} className="absolute bottom-0 left-0 h-0.5 rounded-full bg-lime" style={{ width: 0 }} />
    </div>
  );
}

// ───────── Contador numérico com passo (placar) ─────────
export function ScoreStepper({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  const num = useRef<HTMLSpanElement>(null);
  const bump = (d: number) => {
    const n = Math.max(0, Math.min(99, value + d));
    if (n === value) return;
    onChange(n);
    if (!reducedMotion()) gsap.fromTo(num.current, { y: d > 0 ? 14 : -14, opacity: 0, scale: 0.8 }, { y: 0, opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" });
  };
  return (
    <div className="flex flex-col items-center gap-2">
      <button className="grid h-12 w-16 place-items-center rounded-2xl bg-surface-2 text-2xl font-bold active:scale-95" onClick={() => bump(1)} aria-label={`Mais um gol para ${label}`}>+</button>
      <span ref={num} className="font-display tabular text-6xl font-extrabold leading-none" aria-live="polite">{value}</span>
      <button className="grid h-12 w-16 place-items-center rounded-2xl bg-surface-2 text-2xl font-bold active:scale-95" onClick={() => bump(-1)} aria-label={`Menos um gol para ${label}`}>−</button>
    </div>
  );
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 py-2">
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <span className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? "bg-lime" : "bg-line"}`}>
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-bg transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-1 rounded-2xl border border-line bg-bg-2 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" onClick={() => onChange(o.id)} className={`min-h-11 rounded-xl px-2 text-sm font-bold transition-colors ${o.id === value ? "bg-lime text-lime-ink" : "text-muted"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function NumberField({ label, value, onChange, min = 0, max = 99 }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <span className="text-[15px] font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <button type="button" className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-xl" onClick={() => onChange(Math.max(min, value - 1))} aria-label={`Diminuir ${label}`}>−</button>
        <span className="tabular w-8 text-center font-display text-2xl font-bold">{value}</span>
        <button type="button" className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-xl" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Aumentar ${label}`}>+</button>
      </div>
    </div>
  );
}
