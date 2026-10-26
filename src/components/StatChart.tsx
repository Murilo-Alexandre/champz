"use client";
import { useEffect, useRef, useState } from "react";
import type { EChartsCoreOption } from "echarts/core";

type ECharts = typeof import("echarts/core");
let loader: Promise<ECharts> | null = null;

/** Carrega só os módulos usados do ECharts, sob demanda. */
function loadEcharts() {
  loader ??= (async () => {
    const [core, charts, comps, renderers] = await Promise.all([
      import("echarts/core"),
      import("echarts/charts"),
      import("echarts/components"),
      import("echarts/renderers"),
    ]);
    core.use([charts.BarChart, charts.LineChart, charts.PieChart, comps.GridComponent, comps.TooltipComponent, comps.LegendComponent, renderers.CanvasRenderer]);
    return core;
  })();
  return loader;
}

export const chartTheme = {
  text: "#8d98b3",
  line: "#222c42",
  palette: ["#c6ff3d", "#35e0ff", "#ffc94a", "#ff7ab6", "#9b8cff", "#4dffb4", "#ff9f43", "#5ab0ff", "#ff4d6d", "#d4ff8a", "#7ef0ff", "#ffd98a"],
};

/** Gráfico ECharts: inicializa só quando visível, anima ao atualizar e respeita redução de movimento. */
export function StatChart({ option, height = 260, label }: { option: EChartsCoreOption; height?: number; label: string }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ReturnType<ECharts["init"]> | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "120px" });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !el.current) return;
    let disposed = false;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    loadEcharts().then((echarts) => {
      if (disposed || !el.current) return;
      chart.current ??= echarts.init(el.current, undefined, { renderer: "canvas" });
      chart.current.setOption({ animation: !reduce, animationDuration: 900, animationEasing: "cubicOut", animationDurationUpdate: 600, textStyle: { fontFamily: "inherit" }, color: chartTheme.palette, ...option }, { notMerge: false });
    });
    const onResize = () => chart.current?.resize();
    window.addEventListener("resize", onResize);
    return () => { disposed = true; window.removeEventListener("resize", onResize); };
  }, [visible, option]);

  useEffect(() => () => { chart.current?.dispose(); chart.current = null; }, []);

  return <div ref={el} role="img" aria-label={label} style={{ height }} className="w-full" />;
}
