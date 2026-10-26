import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  const googleEnabled = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5" style={{ paddingTop: "var(--safe-top)", paddingBottom: "calc(24px + var(--safe-bottom))" }}>
      <Suspense>
        <LoginForm googleEnabled={googleEnabled} />
      </Suspense>
    </main>
  );
}
