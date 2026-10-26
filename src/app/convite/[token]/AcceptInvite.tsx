"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, errorMessage } from "@/lib/client/api";
import { Spinner } from "@/components/ui";

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ tournamentId: string }>(`/api/invites/${token}/accept`, { body: {} })
      .then((m) => router.replace(`/app/t/${m.tournamentId}`))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) router.replace(`/entrar?next=${encodeURIComponent(`/convite/${token}`)}`);
        else setErr(errorMessage(e));
      });
  }, [token, router]);
  return (
    <div className="card flex flex-col items-center gap-4 p-8 text-center">
      {err ? (
        <><p className="font-display text-2xl font-bold">Convite inválido</p><p className="text-sm text-muted">{err}</p><Link href="/app" className="btn btn-primary">Ir para o início</Link></>
      ) : (
        <><Spinner /><p className="font-semibold">Entrando no campeonato…</p></>
      )}
    </div>
  );
}
