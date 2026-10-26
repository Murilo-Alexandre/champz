import { Suspense } from "react";
import { Retrospective } from "./Retrospective";

export default function RetrospectivePage() {
  return (
    <Suspense>
      <Retrospective />
    </Suspense>
  );
}
