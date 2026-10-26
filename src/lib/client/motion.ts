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
  const items = scope.querySelectorAll("[data-reveal]");
  if (!items.length) return;
  if (reducedMotion()) { gsap.set(items, { opacity: 1, y: 0 }); return; }
  gsap.fromTo(items, { opacity: 0, y: opts.y ?? 18 }, { opacity: 1, y: 0, duration: 0.55, ease: "power3.out", stagger: opts.stagger ?? 0.05, delay: opts.delay ?? 0, clearProps: "transform" });
}

export { gsap, ScrollTrigger, useGSAP };
