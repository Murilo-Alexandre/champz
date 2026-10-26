import { shuffle } from "./rng";

export type Pairing = { home: string; away: string };
export type RoundSchedule = { number: number; pairings: Pairing[]; bye: string[] };

/**
 * Round-robin pelo método do círculo. N ímpar => uma folga (bye) por rodada, sem competidor fantasma persistido.
 * legs=2 repete o turno com mando invertido.
 */
export function roundRobin(entryIds: readonly string[], legs: 1 | 2 = 1): RoundSchedule[] {
  if (entryIds.length < 2) throw new Error("Round-robin exige ao menos 2 participantes");
  if (new Set(entryIds).size !== entryIds.length) throw new Error("Participante repetido no grupo");

  const BYE = "\u0000bye";
  const slots: string[] = [...entryIds];
  if (slots.length % 2 === 1) slots.push(BYE);
  const n = slots.length;
  const rounds: RoundSchedule[] = [];

  let arr = [...slots];
  for (let r = 0; r < n - 1; r++) {
    const pairings: Pairing[] = [];
    const bye: string[] = [];
    for (let i = 0; i < n / 2; i++) {
      let home = arr[i];
      let away = arr[n - 1 - i];
      // Alterna o mando do participante fixo para equilibrar.
      if (i === 0 && r % 2 === 1) [home, away] = [away, home];
      if (home === BYE) bye.push(away);
      else if (away === BYE) bye.push(home);
      else pairings.push({ home, away });
    }
    rounds.push({ number: r + 1, pairings, bye });
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }

  if (legs === 2) {
    const first = rounds.length;
    for (let r = 0; r < first; r++) {
      rounds.push({
        number: first + r + 1,
        pairings: rounds[r].pairings.map((p) => ({ home: p.away, away: p.home })),
        bye: rounds[r].bye,
      });
    }
  }
  return rounds;
}

/** Distribui participantes em grupos (serpentina sobre a ordem sorteada). Tamanhos diferem no máximo em 1. */
export function drawGroups(
  entryIds: readonly string[],
  groupCount: number,
  seed: string,
): string[][] {
  if (groupCount < 1) throw new Error("Quantidade de grupos inválida");
  if (entryIds.length < groupCount * 2) throw new Error("Cada grupo precisa de ao menos 2 participantes");
  const order = shuffle(entryIds, seed);
  const groups: string[][] = Array.from({ length: groupCount }, () => []);
  order.forEach((id, i) => groups[i % groupCount].push(id));
  return groups;
}

export function groupLabel(index: number): string {
  return String.fromCharCode(65 + index);
}
