import { ImageResponse } from "next/og";

/** Ícones PWA gerados em PNG: /icons/180, /icons/192, /icons/512 e /icons/maskable (com área segura). */
const SIZES: Record<string, { px: number; maskable: boolean }> = {
  "180": { px: 180, maskable: false },
  "192": { px: 192, maskable: false },
  "512": { px: 512, maskable: false },
  maskable: { px: 512, maskable: true },
};

export async function generateStaticParams() {
  return Object.keys(SIZES).map((size) => ({ size }));
}

export async function GET(_req: Request, ctx: RouteContext<"/icons/[size]">) {
  const { size } = await ctx.params;
  const spec = SIZES[size] ?? SIZES["192"];
  const s = spec.px;
  const inner = spec.maskable ? s * 0.62 : s * 0.8;
  return new ImageResponse(
    (
      <div
        style={{
          width: s, height: s, display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(145deg, #0d1424 0%, #07090f 70%)",
          borderRadius: spec.maskable ? 0 : s * 0.22,
        }}
      >
        <div
          style={{
            width: inner, height: inner, borderRadius: inner * 0.28, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #c6ff3d 0%, #35e0ff 100%)",
            boxShadow: "0 0 60px rgba(198,255,61,.45)",
          }}
        >
          <div style={{ fontSize: inner * 0.72, fontWeight: 900, color: "#07090f", fontStyle: "italic", marginTop: -inner * 0.06, display: "flex" }}>Z</div>
        </div>
      </div>
    ),
    { width: s, height: s },
  );
}
