"use client";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

let registered = false;
export function registerGsap() {
  if (registered || typeof window === "undefined") return;
  gsap.registerPlugin(ScrollTrigger, useGSAP);
  registered = true;
}
registerGsap();

export const reducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Entrada em cascata dos elementos [data-reveal] dentro do escopo. */
export function revealChildren(scope: Element | null, opts: { y?: number; stagger?: number; delay?: number } = {}) {
  if (!scope) return;
  // Só elementos novos: o que já está na tela não volta a ficar invisível quando os dados são recarregados.
  const items = [...scope.querySelectorAll<HTMLElement>("[data-reveal]:not([data-revealed])")];
  if (!items.length) return;
  items.forEach((el) => el.setAttribute("data-revealed", ""));
  if (reducedMotion()) return;
  gsap.fromTo(items, { opacity: 0, y: opts.y ?? 18 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out", stagger: Math.min(opts.stagger ?? 0.05, 0.6 / items.length), delay: opts.delay ?? 0, clearProps: "transform,opacity" });
}

export { gsap, ScrollTrigger, useGSAP };
