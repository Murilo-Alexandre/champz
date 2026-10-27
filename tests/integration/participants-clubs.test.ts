import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, cookieFrom } from "./helpers";
import { plannedPhases } from "@/lib/tournament/clubRules";

type Mods = {
  auth: typeof import("@/server/auth/auth").auth;
  prisma: import("@/lib/db/prisma").Db;
  admin: typeof import("@/server/services/admin");
  users: typeof import("@/server/services/users");
  t: typeof import("@/server/services/tournaments");
  s: typeof import("@/server/services/stages");
  m: typeof import("@/server/services/matches");
};
let M: Mods;
let stopDb: () => Promise<void>;

async function user(username: string, name: string, email?: string) {
  const u = await M.admin.provisionUserWithPassword(M.prisma, { email: email ?? `${username}@champz.test`, password: "senha-boa-1", name, username });
  return u.id;
}

beforeAll(async () => {
  const db = await startTestDatabase(5436);
  stopDb = db.stop;
  const { getPrisma } = await import("@/lib/db/prisma");
  M = {
    auth: (await import("@/server/auth/auth")).auth,
    prisma: getPrisma(),
    admin: await import("@/server/services/admin"),
    users: await import("@/server/services/users"),
    t: await import("@/server/services/tournaments"),
    s: await import("@/server/services/stages"),
    m: await import("@/server/services/matches"),
  };
});

afterAll(async () => {
  await M?.prisma.$disconnect();
  await stopDb?.();
});

describe("busca de participantes e duplicidade", () => {
  let owner: string, everson: string, joao: string, banned: string;
  beforeAll(async () => {
    owner = await user("dono.busca", "Dono da Busca");
    everson = await user("everson.santos", "Everson Santos", "everson@empresa.test");
    joao = await user("joao.silva", "João Silva");
    banned = await user("bloqueado", "Jogador Bloqueado");
    await M.prisma.user.update({ where: { id: banned }, data: { banned: true } });
  });

  it("busca parcial por nome, usuário ou e-mail, sem maiúsculas/acentos e sem devolver e-mail", async () => {
    expect((await M.users.searchUsers(M.prisma, "joao")).map((u) => u.id)).toEqual([joao]);
    expect((await M.users.searchUsers(M.prisma, "SILVA")).map((u) => u.id)).toEqual([joao]);
    expect((await M.users.searchUsers(M.prisma, "Everson.S")).map((u) => u.id)).toEqual([everson]);
    const byEmail = await M.users.searchUsers(M.prisma, "everson@empresa");
    expect(byEmail.map((u) => u.id)).toEqual([everson]);
    expect(Object.keys(byEmail[0])).not.toContain("email");
    expect(await M.users.searchUsers(M.prisma, "bloq")).toEqual([]);
    expect(await M.users.searchUsers(M.prisma, "j")).toEqual([]);
  });

  it("a mesma conta não entra duas vezes, nem com outra capitalização; convidados repetidos são barrados", async () => {
    const t = await M.t.createTournament(M.prisma, owner, { name: "Busca Cup", sportCode: "FIFA", format: "KNOCKOUT", entryType: "SOLO", visibility: "PRIVATE" });
    await M.t.addEntry(M.prisma, owner, t.id, { players: [{ userId: everson }] });
    await expect(M.t.addEntry(M.prisma, owner, t.id, { players: [{ username: "Everson.Santos" }] })).rejects.toMatchObject({ code: "PLAYER_ALREADY_ENTERED" });
    await expect(M.t.addEntry(M.prisma, owner, t.id, { players: [{ userId: everson }] })).rejects.toMatchObject({ code: "PLAYER_ALREADY_ENTERED" });
    // "everson.santos" digitado como convidado = conta já inscrita.
    await expect(M.t.addEntry(M.prisma, owner, t.id, { players: [{ guestName: "Everson.santos" }] })).rejects.toMatchObject({ code: "PLAYER_ALREADY_ENTERED" });
    await M.t.addEntry(M.prisma, owner, t.id, { players: [{ guestName: "Carlos Souza" }] });
    await expect(M.t.addEntry(M.prisma, owner, t.id, { players: [{ guestName: "  carlos   souza " }] })).rejects.toMatchObject({ code: "PLAYER_ALREADY_ENTERED" });
    await expect(M.t.addEntry(M.prisma, owner, t.id, { players: [{ guestName: "Cárlos Souza" }] })).rejects.toMatchObject({ code: "PLAYER_ALREADY_ENTERED" });
    // Convidado com o usuário de uma conta existente: deve ser adicionado pela busca (vínculo real).
    await expect(M.t.addEntry(M.prisma, owner, t.id, { players: [{ guestName: "joao.silva" }] })).rejects.toMatchObject({ code: "GUEST_IS_ACCOUNT" });
    await M.t.addEntry(M.prisma, owner, t.id, { players: [{ username: "JOAO.SILVA" }] });
    const players = await M.prisma.entryPlayer.findMany({ where: { tournamentId: t.id } });
    expect(players.map((p) => p.userId).filter(Boolean).sort()).toEqual([everson, joao].sort());
    expect(players).toHaveLength(3);
    expect(await M.prisma.tournamentMember.count({ where: { tournamentId: t.id, userId: { in: [everson, joao] } } })).toBe(2);
  });
});

describe("troca de senha: política mais leve e erros específicos", () => {
  it("6 caracteres bastam; curta, igual à atual e senha atual errada têm códigos próprios", async () => {
    await user("troca.senha", "Troca Senha");
    const login = await M.auth.api.signInUsername({ body: { username: "troca.senha", password: "senha-boa-1" }, returnHeaders: true });
    const headers = new Headers({ cookie: cookieFrom(login.headers) });
    await expect(M.auth.api.changePassword({ body: { currentPassword: "errada", newPassword: "outra1" }, headers })).rejects.toMatchObject({ body: { code: "INVALID_PASSWORD" } });
    await expect(M.auth.api.changePassword({ body: { currentPassword: "senha-boa-1", newPassword: "12345" }, headers })).rejects.toMatchObject({ body: { code: "PASSWORD_TOO_SHORT" } });
    await expect(M.auth.api.changePassword({ body: { currentPassword: "senha-boa-1", newPassword: "senha-boa-1" }, headers })).rejects.toMatchObject({ body: { code: "PASSWORD_REUSED" } });
    await M.auth.api.changePassword({ body: { currentPassword: "senha-boa-1", newPassword: "abc123" }, headers });
    const again = await M.auth.api.signInUsername({ body: { username: "troca.senha", password: "abc123" }, returnHeaders: true });
    expect(cookieFrom(again.headers)).toContain("session_token");
  });
});

describe("regras de clube por fase", () => {
  it("planeja fases e vagas por rodada para cada formato", () => {
    expect(plannedPhases("GROUPS_KNOCKOUT", 12, { groupCount: 3, qualifiersPerGroup: 2, bestOfRest: 2 })).toEqual([
      { key: "GROUPS", label: "Fase de grupos", slotsPerRound: 12 },
      { key: "KO_8", label: "Quartas de final", slotsPerRound: 8 },
      { key: "KO_4", label: "Semifinal", slotsPerRound: 4 },
      { key: "KO_2", label: "Final", slotsPerRound: 2 },
    ]);
    expect(plannedPhases("KNOCKOUT", 6, { groupCount: 1, qualifiersPerGroup: 2, bestOfRest: 0 })[0]).toEqual({ key: "KO_8", label: "Quartas de final", slotsPerRound: 4 });
    expect(plannedPhases("LEAGUE", 5, { groupCount: 1, qualifiersPerGroup: 2, bestOfRest: 0 })).toEqual([{ key: "GROUPS", label: "Pontos corridos", slotsPerRound: 4 }]);
  });

  it("sorteio na semi, escolha do adversário na final, lista permitida, repetição, permissões, auditoria e bloqueio retroativo", async () => {
    const owner = await user("dono.fase", "Dono Fase");
    const ps = [await user("p.um", "Pedro Um"), await user("p.dois", "Paulo Dois"), await user("p.tres", "Pietro Tres"), await user("p.quatro", "Plinio Quatro")];
    const mk = (name: string, category: "NATIONAL" | "INTERNATIONAL" | "NATIONAL_TEAM") => M.prisma.club.create({ data: { name, category } });
    const intl = [await mk("Intl A", "INTERNATIONAL"), await mk("Intl B", "INTERNATIONAL"), await mk("Intl C", "INTERNATIONAL"), await mk("Intl D", "INTERNATIONAL")];
    const nat = await mk("Nacional A", "NATIONAL");
    const sel = [await mk("Seleção A", "NATIONAL_TEAM"), await mk("Seleção B", "NATIONAL_TEAM")];

    const base = { name: "Copa das Fases", sportCode: "FIFA" as const, format: "KNOCKOUT" as const, entryType: "SOLO" as const, visibility: "PRIVATE" as const };
    await expect(M.t.createTournament(M.prisma, owner, { ...base, settings: { clubRules: { default: { mode: "RANDOM", allowRepeat: false, pool: "CUSTOM", clubIds: ["nao-existe", intl[0].id] }, phases: {} } } }))
      .rejects.toMatchObject({ code: "INVALID_CLUB" });

    // Seleções (2) sem repetição não cabem numa semi com 4 lados: validação clara, sem sorteio inválido.
    const impossible = await M.t.createTournament(M.prisma, owner, { ...base, settings: { clubRules: { default: { mode: "RANDOM", allowRepeat: false, pool: "NATIONAL_TEAM", clubIds: [] }, phases: {} } } });
    for (const p of ps) await M.t.addEntry(M.prisma, owner, impossible.id, { players: [{ userId: p }] });
    await expect(M.s.generateInitialStage(M.prisma, owner, impossible.id, { mode: "RANDOM" })).rejects.toMatchObject({ code: "CLUB_RULE_IMPOSSIBLE" });

    const t = await M.t.createTournament(M.prisma, owner, {
      ...base,
      settings: {
        clubRules: {
          default: { mode: "RANDOM", allowRepeat: false, pool: "INTERNATIONAL", clubIds: [] },
          phases: { KO_2: { mode: "OPPONENT_CHOICE", allowRepeat: false, pool: "CUSTOM", clubIds: [sel[0].id, sel[1].id, intl[0].id] } },
        },
      },
    });
    const entryOf = new Map<string, string>();
    for (const p of ps) entryOf.set(p, (await M.t.addEntry(M.prisma, owner, t.id, { players: [{ userId: p }] })).id);
    const gen = await M.s.generateInitialStage(M.prisma, owner, t.id, { mode: "MANUAL", seeding: ps.map((p) => entryOf.get(p)!) });

    const semiRound = await M.prisma.round.findFirstOrThrow({ where: { stageId: gen.stageId, number: 1 }, include: { matches: true } });
    const view = await M.s.getStageView(M.prisma, owner, gen.stageId);
    expect(view.rounds.map((r) => [r.clubRule.key, r.clubRule.mode])).toEqual([["KO_4", "RANDOM"], ["KO_2", "OPPONENT_CHOICE"]]);
    expect(view.rounds[1].clubRule.poolClubIds.sort()).toEqual([sel[0].id, sel[1].id, intl[0].id].sort());

    // Semi (sorteio): jogador não escolhe; sorteio usa só internacionais, sem repetir.
    await expect(M.m.setMatchClub(M.prisma, ps[0], semiRound.matches[0].id, { side: "HOME", clubId: intl[0].id })).rejects.toMatchObject({ status: 403 });
    const drawn = await M.m.drawRoundClubs(M.prisma, owner, semiRound.id, { overwrite: false });
    expect(drawn.assignments).toHaveLength(4);
    expect(new Set(drawn.assignments.map((a) => a.clubId))).toEqual(new Set(intl.map((c) => c.id)));

    for (const m of semiRound.matches) await M.m.recordResult(M.prisma, owner, m.id, { homeScore: 2, awayScore: 0 });
    const final = await M.prisma.match.findFirstOrThrow({ where: { stageId: gen.stageId, nextMatchId: null } });
    expect(final.status).toBe("READY");
    const homePlayer = ps.find((p) => entryOf.get(p) === final.homeEntryId)!;
    const awayPlayer = ps.find((p) => entryOf.get(p) === final.awayEntryId)!;
    const loser = ps.find((p) => p !== homePlayer && p !== awayPlayer)!;

    // Final (adversário escolhe): o próprio lado não escolhe; o adversário escolhe dentro da lista.
    await expect(M.m.setMatchClub(M.prisma, homePlayer, final.id, { side: "HOME", clubId: sel[0].id })).rejects.toMatchObject({ status: 403 });
    await expect(M.m.setMatchClub(M.prisma, loser, final.id, { side: "HOME", clubId: sel[0].id })).rejects.toMatchObject({ status: 403 });
    await expect(M.m.setMatchClub(M.prisma, awayPlayer, final.id, { side: "HOME", clubId: nat.id })).rejects.toMatchObject({ code: "CLUB_NOT_ALLOWED" });
    const set = await M.m.setMatchClub(M.prisma, awayPlayer, final.id, { side: "HOME", clubId: sel[0].id });
    expect(set).toMatchObject({ source: "OPPONENT_CHOICE", clubId: sel[0].id });
    await expect(M.m.setMatchClub(M.prisma, homePlayer, final.id, { side: "AWAY", clubId: sel[0].id })).rejects.toMatchObject({ code: "CLUB_TAKEN" });
    await M.m.setMatchClub(M.prisma, homePlayer, final.id, { side: "AWAY", clubId: sel[1].id });
    const audits = await M.prisma.auditEvent.findMany({ where: { tournamentId: t.id, targetType: "MATCH_CLUB", targetId: final.id } });
    expect(audits.map((a) => a.action)).toEqual(["CLUB_SET", "CLUB_SET"]);

    // Semi já disputada: mudar a regra padrão (que vale para a semi) é bloqueado; mudar só a final é permitido.
    const current = await M.prisma.tournament.findUniqueOrThrow({ where: { id: t.id } });
    const rules = (current.settings as { clubRules: import("@/lib/tournament/clubRules").ClubRules }).clubRules;
    await expect(M.t.updateSettings(M.prisma, owner, t.id, { settings: { clubRules: { ...rules, default: { mode: "PLAYER_CHOICE", allowRepeat: true, pool: "ALL", clubIds: [] } } } }))
      .rejects.toMatchObject({ code: "PHASE_PLAYED" });
    const updated = await M.t.updateSettings(M.prisma, owner, t.id, { settings: { clubRules: { ...rules, phases: { KO_2: { mode: "MANUAL", allowRepeat: true, pool: "ALL", clubIds: [] } } } }, reason: "Final pelo organizador" });
    expect(updated.settings.clubRules?.phases.KO_2.mode).toBe("MANUAL");
    await expect(M.m.setMatchClub(M.prisma, awayPlayer, final.id, { side: "HOME", clubId: sel[1].id })).rejects.toMatchObject({ status: 403 });
    expect(await M.prisma.auditEvent.count({ where: { tournamentId: t.id, targetType: "SETTINGS", action: "UPDATE" } })).toBe(1);
  });
});
