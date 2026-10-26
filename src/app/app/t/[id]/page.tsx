import { Suspense } from "react";
import { TournamentScreen } from "./TournamentScreen";

export default function TournamentPage() {
  return (
    <Suspense>
      <TournamentScreen />
    </Suspense>
  );
}
