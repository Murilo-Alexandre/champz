import { Suspense } from "react";
import { AcceptInvite } from "./AcceptInvite";

export default function InvitePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <Suspense>
        <AcceptInvite />
      </Suspense>
    </main>
  );
}
