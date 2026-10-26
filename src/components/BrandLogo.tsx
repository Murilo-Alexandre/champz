import Image from "next/image";

/**
 * Marca oficial do Champz (branding/champz-logo-original.png → public/brand/*).
 * `full`: taça com o nome na base (proporção 1048×1198). `symbol`: taça, mãos e coroa, para tamanhos pequenos.
 */
export function BrandLogo({ variant = "full", height, priority = false, className = "" }: { variant?: "full" | "symbol"; height: number; priority?: boolean; className?: string }) {
  if (variant === "symbol") {
    const width = Math.round(height * (1048 / 752));
    return <Image src="/brand/champz-symbol-160.webp" alt="Champz" width={width} height={height} priority={priority} className={className} />;
  }
  const width = Math.round(height * (1048 / 1198));
  return <Image src={height > 120 ? "/brand/champz-logo-480.webp" : "/brand/champz-logo-240.webp"} alt="Champz" width={width} height={height} priority={priority} className={className} />;
}
