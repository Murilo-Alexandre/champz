import { shuffle } from "./rng";
import { TournamentRuleError } from "./knockout";

export type ClubSlot = { matchId: string; side: "HOME" | "AWAY" };
export type ClubAssignment = ClubSlot & { clubId: string };

/**
 * Sorteia clubes para os lados de partidas (normalmente uma rodada) a partir da lista permitida da fase.
 * allowRepeat=false: nenhum clube repetido entre os lados sorteados. allowRepeat=true: só evita o mesmo clube dos dois lados de uma partida.
 */
export function drawClubs(
  slots: readonly ClubSlot[],
  allowedClubIds: readonly string[],
  allowRepeat: boolean,
  seed: string,
): ClubAssignment[] {
  const pool = [...new Set(allowedClubIds)];
  if (pool.length === 0) throw new TournamentRuleError("Nenhum clube permitido para sorteio", "NO_CLUBS");
  if (!allowRepeat && pool.length < slots.length) {
    throw new TournamentRuleError(
      `Clubes insuficientes: ${pool.length} para ${slots.length} lados sem repetição`,
      "NOT_ENOUGH_CLUBS",
    );
  }
  if (pool.length < 2 && slots.length > 1) {
    throw new TournamentRuleError("São necessários ao menos 2 clubes", "NOT_ENOUGH_CLUBS");
  }

  if (!allowRepeat) {
    const order = shuffle(pool, seed);
    return slots.map((s, i) => ({ ...s, clubId: order[i] }));
  }

  const out: ClubAssignment[] = [];
  let bag: string[] = [];
  let k = 0;
  for (const slot of slots) {
    const opponent = out.find((a) => a.matchId === slot.matchId)?.clubId;
    if (bag.length === 0) bag = shuffle(pool, `${seed}:${k++}`);
    let idx = bag.findIndex((c) => c !== opponent);
    if (idx === -1) {
      bag = shuffle(pool, `${seed}:${k++}`);
      idx = bag.findIndex((c) => c !== opponent);
    }
    out.push({ ...slot, clubId: bag.splice(idx, 1)[0] });
  }
  return out;
}
