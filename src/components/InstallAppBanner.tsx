"use client";
import { useEffect, useState } from "react";
import { Icon, Sheet } from "./ui";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e as BIPEvent; listeners.forEach((l) => l()); });
  window.addEventListener("appinstalled", () => { deferred = null; listeners.forEach((l) => l()); });
}

function useInstallState() {
  const [, force] = useState(0);
  const [env, setEnv] = useState({ standalone: false, ios: false });
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura do ambiente do navegador
    setEnv({ standalone, ios });
    return () => { listeners.delete(l); };
  }, []);
  return { ...env, canPrompt: !!deferred };
}

/** Botão "Instalar Champz": usa beforeinstallprompt no Android/Chromium; no iOS mostra o passo a passo. */
export function InstallAppBanner({ variant = "card" }: { variant?: "card" | "row" }) {
  const { standalone, ios, canPrompt } = useInstallState();
  const [help, setHelp] = useState(false);
  if (standalone) return null;
  if (!canPrompt && !ios) {
    return variant === "row" ? (
      <p className="text-sm text-muted">Para instalar, abra o Champz no Chrome do Android ou no Safari do iPhone.</p>
    ) : null;
  }
  const install = async () => {
    if (deferred) {
      await deferred.prompt();
      await deferred.userChoice;
      deferred = null;
      listeners.forEach((l) => l());
    } else setHelp(true);
  };
  return (
    <>
      <div className={variant === "card" ? "card flex items-center gap-3 p-4" : "flex items-center gap-3"} data-reveal>
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-lime font-display text-2xl font-black italic text-lime-ink">Z</div>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Instalar Champz</p>
          <p className="text-xs text-muted">Abre em tela cheia, direto da tela inicial.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={install}>Instalar</button>
      </div>
      <Sheet open={help} onClose={() => setHelp(false)} title="Instalar no iPhone">
        <ol className="flex flex-col gap-4 text-[15px]">
          <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2"><Icon name="share" /></span><span>No Safari, toque em <b>Compartilhar</b> na barra inferior.</span></li>
          <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2"><Icon name="plus" /></span><span>Role e escolha <b>Adicionar à Tela de Início</b>.</span></li>
          <li className="flex gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lime font-black italic text-lime-ink">Z</span><span>Confirme em <b>Adicionar</b>. O Champz aparece com o ícone na tela inicial.</span></li>
        </ol>
        <p className="mt-5 text-xs text-muted">Em outros navegadores do iPhone essa opção pode não existir; use o Safari.</p>
      </Sheet>
    </>
  );
}
