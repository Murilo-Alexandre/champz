import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, cookieFrom, jsonRequest, params } from "./helpers";

// Módulos do app importados depois de DATABASE_URL apontar para o banco de teste.
type Mods = {
  auth: typeof import("@/server/auth/auth").auth;
  prisma: import("@/lib/db/prisma").Db;
  t: typeof import("@/server/services/tournaments");
  s: typeof import("@/server/services/stages");
  m: typeof import("@/server/services/matches");
  i: typeof import("@/server/services/insights");
  media: typeof import("@/server/services/media");
  storage: typeof import("@/lib/storage");
  resultRoute: typeof import("@/app/api/matches/[matchId]/result/route");
  auditRoute: typeof import("@/app/api/tournaments/[id]/audit/route");
  tournamentRoute: typeof import("@/app/api/tournaments/[id]/route");
};
let M: Mods;
let stopDb: () => Promise<void>;

async function signUp(username: string, name: string) {
  const res = await M.auth.api.signUpEmail({
    body: { email: `${username}@champz.test`, password: "senha-forte-123", name, username },
    returnHeaders: true,
  });
  return { id: res.response.user.id, cookie: cookieFrom(res.headers) };
}

beforeAll(async () => {
  const db = await startTestDatabase(5434);
  stopDb = db.stop;
  const { getPrisma } = await import("@/lib/db/prisma");
  M = {
    auth: (await import("@/server/auth/auth")).auth,
    prisma: getPrisma(),
    t: await import("@/server/services/tournaments"),
    s: await import("@/server/services/stages"),
    m: await import("@/server/services/matches"),
    i: await import("@/server/services/insights"),
    media: await import("@/server/services/media"),
    storage: await import("@/lib/storage"),
    resultRoute: await import("@/app/api/matches/[matchId]/result/route"),
    auditRoute: await import("@/app/api/tournaments/[id]/audit/route"),
    tournamentRoute: await import("@/app/api/tournaments/[id]/route"),
  };
});

afterAll(async () => {
  await M?.prisma.$disconnect();
  await stopDb?.();
});

const GROUPS = {
  A: ["Everson", "Murilo", "Bruno", "Jailton"],
  B: ["Gabriel", "Felipe", "Miguel", "Alan"],
  C: ["Danilo", "Guilherme", "Igor", "Pedro"],
};

describe("FIFA 2026 — homologação ponta a ponta (12 participantes, 3x4, quartas)", () => {
  let owner: { id: string; cookie: string };
  let everson: { id: string; cookie: string };
  let outsider: { id: string; cookie: string };
  let tournamentId: string;
  let groupStageId: string;
  const entryByName = new Map<string, string>();

  const findMatch = async (a: string, b: string) => {
    const ea = entryByName.get(a)!;
    const eb = entryByName.get(b)!;
    return M.prisma.match.findFirstOrThrow({
      where: { tournamentId, OR: [{ homeEntryId: ea, awayEntryId: eb }, { homeEntryId: eb, awayEntryId: ea }] },
      orderBy: { createdAt: "desc" },
    });
  };
  /** Lança "a x b" respeitando o mando real gravado. */
  const play = async (actor: string, a: string, b: string, ga: number, gb: number, extra: Record<string, unknown> = {}) => {
    const match = await findMatch(a, b);
    const aHome = match.homeEntryId === entryByName.get(a);
    return M.m.recordResult(M.prisma, actor, match.id, { homeScore: aHome ? ga : gb, awayScore: aHome ? gb : ga, ...extra });
  };

  it("cadastro por usuário/senha e login por username", async () => {
    owner = await signUp("murilo", "Murilo");
    everson = await signUp("everson", "Everson");
    outsider = await signUp("intruso", "Intruso");
    const login = await M.auth.api.signInUsername({ body: { username: "murilo", password: "senha-forte-123" }, returnHeaders: true });
    expect(login.response?.user.id).toBe(owner.id);
    await expect(M.auth.api.signInUsername({ body: { username: "murilo", password: "errada-errada" } })).rejects.toThrow();
  });

  it("cria campeonato privado, OWNER automático e 12 entradas", async () => {
    const t = await M.t.createTournament(M.prisma, owner.id, {
      name: "1º Campeonato de FIFA", sportCode: "FIFA", edition: "2026", format: "GROUPS_KNOCKOUT", entryType: "SOLO", visibility: "PRIVATE",
      settings: { groupStage: { groupCount: 3, legs: 1, qualifiersPerGroup: 2, bestOfRest: 2 } },
    });
    tournamentId = t.id;
    for (const name of Object.values(GROUPS).flat()) {
      const player = name === "Murilo" ? { userId: owner.id } : name === "Everson" ? { username: "everson" } : { guestName: name };
      const e = await M.t.addEntry(M.prisma, owner.id, tournamentId, { name, players: [player] });
      entryByName.set(name, e.id);
    }
    expect(entryByName.size).toBe(12);
    const ev = await M.prisma.tournamentMember.findFirstOrThrow({ where: { tournamentId, userId: everson.id } });
    expect([ev.role, ev.canEditResult, ev.canEditRules]).toEqual(["PARTICIPANT", true, false]);
    await expect(M.t.addEntry(M.prisma, owner.id, tournamentId, { players: [{ username: "everson" }] })).rejects.toMatchObject({ code: "PLAYER_ALREADY_ENTERED" });
  });

  it("campeonato privado não é visível a quem não é membro (nem via API)", async () => {
    const res = await M.tournamentRoute.GET(jsonRequest(`/api/tournaments/${tournamentId}`, "GET", outsider.cookie), params({ id: tournamentId }));
    expect(res.status).toBe(404);
    const ok = await M.tournamentRoute.GET(jsonRequest(`/api/tournaments/${tournamentId}`, "GET", everson.cookie), params({ id: tournamentId }));
    expect(ok.status).toBe(200);
  });

  it("grupos manuais geram exatamente 18 jogos em 3 rodadas de 6", async () => {
    const ids = (names: string[]) => names.map((n) => entryByName.get(n)!);
    const res = await M.s.generateInitialStage(M.prisma, owner.id, tournamentId, { mode: "MANUAL", groups: [ids(GROUPS.A), ids(GROUPS.B), ids(GROUPS.C)] });
    groupStageId = res.stageId;
    expect(res.matchCount).toBe(18);
    const rounds = await M.prisma.round.findMany({ where: { stageId: groupStageId }, include: { _count: { select: { matches: true } } }, orderBy: { number: "asc" } });
    expect(rounds.map((r) => r._count.matches)).toEqual([6, 6, 6]);
    expect((await M.prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } })).status).toBe("ACTIVE");
  });

  it("rodadas 1 e 2 produzem a classificação esperada (Felipe 1x0 Alan = fixture hipotética)", async () => {
    const r12: [string, string, number, number][] = [
      ["Everson", "Jailton", 2, 0], ["Gabriel", "Alan", 6, 1], ["Danilo", "Pedro", 7, 0], ["Murilo", "Bruno", 5, 0], ["Miguel", "Felipe", 7, 0], ["Igor", "Guilherme", 8, 2],
      ["Everson", "Bruno", 6, 0], ["Gabriel", "Miguel", 3, 5], ["Danilo", "Igor", 3, 3], ["Murilo", "Jailton", 2, 1], ["Guilherme", "Pedro", 2, 3], ["Felipe", "Alan", 1, 0],
    ];
    for (const [a, b, ga, gb] of r12) await play(owner.id, a, b, ga, gb);
    const tournament = await M.prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    const standings = await M.s.loadGroupStandings(M.prisma, groupStageId, M.t.settingsOf(tournament));
    const name = new Map([...entryByName].map(([k, v]) => [v, k]));
    const view = standings.map((g) => g.rows.map((r) => [name.get(r.entryId), r.played, r.goalDiff, r.points]));
    expect(view[0]).toEqual([["Everson", 2, 8, 6], ["Murilo", 2, 6, 6], ["Jailton", 2, -3, 0], ["Bruno", 2, -11, 0]]);
    expect(view[1]).toEqual([["Miguel", 2, 9, 6], ["Gabriel", 2, 3, 3], ["Felipe", 2, -6, 3], ["Alan", 2, -6, 0]]);
    expect(view[2]).toEqual([["Danilo", 2, 7, 4], ["Igor", 2, 6, 4], ["Pedro", 2, -6, 3], ["Guilherme", 2, -7, 0]]);
  });

  it("participante edita placar por padrão; sem permissão é bloqueado mesmo chamando a API", async () => {
    const match = await findMatch("Everson", "Murilo");
    // Everson (participante) pode lançar.
    const okRes = await M.resultRoute.PUT(jsonRequest(`/api/matches/${match.id}/result`, "PUT", everson.cookie, { homeScore: 1, awayScore: 1 }), params({ matchId: match.id }));
    expect(okRes.status).toBe(200);
    // Intruso, sem vínculo: nem enxerga o campeonato.
    const outsiderRes = await M.resultRoute.PUT(jsonRequest(`/api/matches/${match.id}/result`, "PUT", outsider.cookie, { homeScore: 9, awayScore: 0 }), params({ matchId: match.id }));
    expect(outsiderRes.status).toBe(404);
    // Sem sessão.
    const anon = await M.resultRoute.PUT(jsonRequest(`/api/matches/${match.id}/result`, "PUT", null, { homeScore: 9, awayScore: 0 }), params({ matchId: match.id }));
    expect(anon.status).toBe(401);
    // Dono desativa a permissão do Everson: servidor passa a negar.
    const member = await M.prisma.tournamentMember.findFirstOrThrow({ where: { tournamentId, userId: everson.id } });
    await M.t.updateMember(M.prisma, owner.id, tournamentId, member.id, { canEditResult: false });
    const denied = await M.resultRoute.PUT(jsonRequest(`/api/matches/${match.id}/result`, "PUT", everson.cookie, { homeScore: 5, awayScore: 0 }), params({ matchId: match.id }));
    expect(denied.status).toBe(403);
    // Participante não altera permissões.
    await expect(M.t.updateMember(M.prisma, everson.id, tournamentId, member.id, { canEditResult: true })).rejects.toMatchObject({ status: 403 });
    const after = await M.prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect([after.homeScore, after.awayScore]).toEqual([1, 1]);
  });

  it("duas alterações sucessivas ficam no histórico e o log é imutável", async () => {
    const match = await findMatch("Everson", "Murilo");
    await M.m.recordResult(M.prisma, owner.id, match.id, { homeScore: 2, awayScore: 1, reason: "Correção do placar" });
    const res = await M.auditRoute.GET(jsonRequest(`/api/tournaments/${tournamentId}/audit?targetType=MATCH&targetId=${match.id}`, "GET", owner.cookie), params({ id: tournamentId }));
    const history = (await res.json()) as { items: { action: string; actorUserId: string; reason: string | null }[] };
    expect(history.items.map((h) => h.action)).toEqual(["RESULT_UPDATE", "RESULT"]);
    expect(history.items[0]).toMatchObject({ actorUserId: owner.id, reason: "Correção do placar" });
    expect(history.items[1].actorUserId).toBe(everson.id);
    await expect(M.prisma.auditEvent.deleteMany({ where: { targetId: match.id } })).rejects.toThrow();
    await expect(M.prisma.auditEvent.updateMany({ where: { targetId: match.id }, data: { action: "X" } })).rejects.toThrow();
    // Versão otimista: salvar com versão antiga é rejeitado.
    await expect(M.m.recordResult(M.prisma, owner.id, match.id, { homeScore: 0, awayScore: 0, expectedVersion: 0 })).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("clubes por partida: lista restrita, sorteio por rodada e troca auditada", async () => {
    const names = ["Real Madrid", "Arsenal", "Barcelona", "PSG", "Liverpool", "Bayern", "Inter", "Milan", "Juventus", "Chelsea", "Man City", "Atlético"];
    const clubs = [];
    for (const name of names) clubs.push(await M.i.createClub(M.prisma, owner.id, { name }));
    await M.s.updateStageClubs(M.prisma, owner.id, groupStageId, { mode: "RANDOM", allowRepeat: false, allowedClubIds: clubs.map((c) => c.id) });
    const round3 = await M.prisma.round.findFirstOrThrow({ where: { stageId: groupStageId, number: 3 } });
    const drawn = await M.m.drawRoundClubs(M.prisma, owner.id, round3.id, { overwrite: false });
    expect(drawn.assignments.length).toBe(12); // 6 jogos da rodada 3, 2 lados cada
    expect(new Set(drawn.assignments.map((a) => a.clubId)).size).toBe(drawn.assignments.length);
    const match = await findMatch("Bruno", "Jailton");
    const other = await M.prisma.club.create({ data: { name: "Clube Fora da Lista" } });
    await expect(M.m.setMatchClub(M.prisma, owner.id, match.id, { side: "HOME", clubId: other.id })).rejects.toMatchObject({ code: "CLUB_NOT_ALLOWED" });
    await expect(M.m.setMatchClub(M.prisma, everson.id, match.id, { side: "HOME", clubId: clubs[0].id })).rejects.toMatchObject({ status: 403 });
  });

  it("rodada 3, classificação e mata-mata com 8 classificados distintos (gerado uma única vez)", async () => {
    const r3: [string, string, number, number][] = [["Gabriel", "Felipe", 2, 0], ["Danilo", "Guilherme", 4, 1], ["Bruno", "Jailton", 1, 1], ["Miguel", "Alan", 3, 0], ["Igor", "Pedro", 2, 0]];
    for (const [a, b, ga, gb] of r3) await play(owner.id, a, b, ga, gb);
    const res = await M.s.advanceToKnockout(M.prisma, owner.id, groupStageId, {});
    const ids = res.qualifiers.map((q) => q.entryId);
    expect(ids.length).toBe(8);
    expect(new Set(ids).size).toBe(8);
    const ko = await M.prisma.match.findMany({ where: { stageId: res.stageId } });
    expect(ko.length).toBe(7);
    const first = ko.filter((m) => m.homeEntryId && m.awayEntryId);
    expect(first.length).toBe(4);
    expect(first.every((m) => m.homeEntryId !== m.awayEntryId)).toBe(true);
    await expect(M.s.advanceToKnockout(M.prisma, owner.id, groupStageId, {})).rejects.toMatchObject({ code: "ALREADY_ADVANCED" });
    // Fase de grupos fechada: placares antigos não mudam silenciosamente.
    const old = await findMatch("Everson", "Jailton");
    await expect(M.m.recordResult(M.prisma, owner.id, old.id, { homeScore: 0, awayScore: 3 })).rejects.toMatchObject({ code: "STAGE_CLOSED" });
  });

  it("mata-mata: empate exige pênaltis, avanço único, correção que afeta jogo seguinte é bloqueada, campeão definido", async () => {
    const ko = await M.prisma.stage.findFirstOrThrow({ where: { tournamentId, type: "KNOCKOUT" } });
    const qf = await M.prisma.match.findMany({ where: { stageId: ko.id, homeEntryId: { not: null }, awayEntryId: { not: null } }, orderBy: { bracketPosition: "asc" } });
    await expect(M.m.recordResult(M.prisma, owner.id, qf[0].id, { homeScore: 2, awayScore: 2 })).rejects.toMatchObject({ code: "NEEDS_DECISION" });
    await M.m.recordResult(M.prisma, owner.id, qf[0].id, { homeScore: 2, awayScore: 2, homePenalties: 5, awayPenalties: 4 });
    for (const m of qf.slice(1)) await M.m.recordResult(M.prisma, owner.id, m.id, { homeScore: 1, awayScore: 0 });

    const semis = await M.prisma.match.findMany({ where: { stageId: ko.id, round: { name: "Semifinal" } }, orderBy: { bracketPosition: "asc" } });
    expect(semis.every((s) => s.status === "READY")).toBe(true);
    expect(semis[0].homeEntryId).toBe(qf[0].homeEntryId);
    await M.m.recordResult(M.prisma, owner.id, semis[0].id, { homeScore: 3, awayScore: 1 });
    // Mudar o vencedor da 1ª quarta agora afetaria a semifinal já jogada.
    await expect(M.m.recordResult(M.prisma, owner.id, qf[0].id, { homeScore: 0, awayScore: 1 })).rejects.toMatchObject({ code: "DOWNSTREAM_PLAYED" });
    // W.O. na outra semifinal (decisão administrativa com motivo).
    await M.m.recordWalkover(M.prisma, owner.id, semis[1].id, { absent: "AWAY", reason: "Não compareceu no horário" });

    const final = await M.prisma.match.findFirstOrThrow({ where: { stageId: ko.id, nextMatchId: null } });
    expect(final.status).toBe("READY");
    await M.m.recordResult(M.prisma, owner.id, final.id, { homeScore: 4, awayScore: 2 });
    const t = await M.prisma.tournament.findUniqueOrThrow({ where: { id: tournamentId } });
    expect(t.status).toBe("FINISHED");
    expect(t.championEntryId).toBe(final.homeEntryId);

    const retro = await M.i.getRetrospective(M.prisma, owner.id, tournamentId);
    expect(retro.championEntryId).toBe(final.homeEntryId);
    expect(retro.runnerUpEntryId).toBe(final.awayEntryId);
    expect(retro.stats.biggestWins[0].margin).toBe(7); // Danilo 7x0 Pedro
  });
});

describe("formatos menores, duplas, W.O. em liga e fotos", () => {
  let owner: { id: string; cookie: string };
  let ana: { id: string; cookie: string };
  let bia: { id: string; cookie: string };

  it("3 participantes em mata-mata: BYE, final e campeão", async () => {
    owner = await signUp("dono3", "Dono");
    const t = await M.t.createTournament(M.prisma, owner.id, { name: "Copa de 3", sportCode: "FIFA", format: "KNOCKOUT", entryType: "SOLO", visibility: "PUBLIC" });
    const ids = [];
    for (const n of ["A", "B", "C"]) ids.push((await M.t.addEntry(M.prisma, owner.id, t.id, { players: [{ guestName: n }] })).id);
    const gen = await M.s.generateInitialStage(M.prisma, owner.id, t.id, { mode: "MANUAL", seeding: ids });
    expect(gen.matchCount).toBe(3);
    const matches = await M.prisma.match.findMany({ where: { stageId: gen.stageId }, include: { round: true } });
    const bye = matches.find((m) => m.status === "BYE")!;
    expect(bye.winnerEntryId).toBe(ids[0]);
    const semi = matches.find((m) => m.round.number === 1 && m.status === "READY")!;
    await M.m.recordResult(M.prisma, owner.id, semi.id, { homeScore: 1, awayScore: 3 });
    const final = await M.prisma.match.findFirstOrThrow({ where: { stageId: gen.stageId, nextMatchId: null } });
    expect([final.homeEntryId, final.awayEntryId].sort()).toEqual([ids[0], semi.awayEntryId].sort());
    await M.m.recordResult(M.prisma, owner.id, final.id, { homeScore: 2, awayScore: 0 });
    expect((await M.prisma.tournament.findUniqueOrThrow({ where: { id: t.id } })).championEntryId).toBe(final.homeEntryId);
  });

  it("liga de 3 (folga por rodada), W.O. configurado, bônus de saldo e encerramento", async () => {
    const t = await M.t.createTournament(M.prisma, owner.id, {
      name: "Liga Triangular", sportCode: "FIFA", format: "LEAGUE", entryType: "SOLO", visibility: "PRIVATE",
      settings: { walkover: { presentPoints: 3, absentPoints: -1, symbolicScore: { present: 3, absent: 0 }, countStats: true }, bonus: { bestGoalDiff: { enabled: true, points: 1, tiePolicy: "NONE" } } },
    });
    const ids = [];
    for (const n of ["X", "Y", "Z"]) ids.push((await M.t.addEntry(M.prisma, owner.id, t.id, { players: [{ guestName: n }] })).id);
    const gen = await M.s.generateInitialStage(M.prisma, owner.id, t.id, { mode: "MANUAL", seeding: ids });
    expect(gen.matchCount).toBe(3);
    expect(await M.prisma.round.count({ where: { stageId: gen.stageId } })).toBe(3);
    const ms = await M.prisma.match.findMany({ where: { stageId: gen.stageId } });
    await M.m.recordResult(M.prisma, owner.id, ms[0].id, { homeScore: 4, awayScore: 0 });
    await M.m.recordResult(M.prisma, owner.id, ms[1].id, { homeScore: 1, awayScore: 1 });
    await expect(M.s.finishRoundRobinTournament(M.prisma, owner.id, t.id)).rejects.toMatchObject({ code: "MATCHES_PENDING" });
    await M.m.recordWalkover(M.prisma, owner.id, ms[2].id, { absent: "HOME", reason: "Desistência" });
    const done = await M.s.finishRoundRobinTournament(M.prisma, owner.id, t.id);
    expect(done.status).toBe("FINISHED");
    const view = await M.s.getStageView(M.prisma, owner.id, gen.stageId);
    const rows = view.standings[0].rows;
    expect(rows.reduce((s, r) => s + r.bonusPoints, 0)).toBe(1);
    expect(done.championEntryId).toBe(rows[0].entryId);
    const absentId = ms[2].homeEntryId!;
    expect(rows.find((r) => r.entryId === absentId)!.walkovers).toBe(1);
    const stats = await M.i.getTournamentStats(M.prisma, owner.id, t.id);
    expect(stats.evolution.length).toBeGreaterThan(0);
  });

  it("2v2: dupla com dois usuários, sem repetir usuário", async () => {
    ana = await signUp("ana", "Ana");
    bia = await signUp("bia", "Bia");
    const caio = await signUp("caio", "Caio");
    const t = await M.t.createTournament(M.prisma, owner.id, { name: "Duplas", sportCode: "FIFA", format: "KNOCKOUT", entryType: "DUO", visibility: "PRIVATE" });
    await expect(M.t.addEntry(M.prisma, owner.id, t.id, { players: [{ userId: ana.id }] })).rejects.toMatchObject({ code: "PLAYER_COUNT" });
    await expect(M.t.addEntry(M.prisma, owner.id, t.id, { players: [{ userId: ana.id }, { userId: ana.id }] })).rejects.toMatchObject({ code: "DUPLICATE_PLAYER" });
    const duo = await M.t.addEntry(M.prisma, owner.id, t.id, { players: [{ userId: ana.id }, { userId: bia.id }] });
    expect(duo.name).toBe("Ana & Bia");
    await expect(M.t.addEntry(M.prisma, owner.id, t.id, { players: [{ userId: bia.id }, { userId: caio.id }] })).rejects.toMatchObject({ code: "PLAYER_ALREADY_ENTERED" });
    const members = await M.prisma.tournamentMember.count({ where: { tournamentId: t.id, role: "PARTICIPANT" } });
    expect(members).toBe(2);
  });

  it("fotos: tipo/tamanho validados, upload só vale após conferência, acesso só para membros", async () => {
    const mem = new M.storage.MemoryStorage();
    M.storage.setStorageForTests(mem);
    const t = await M.t.createTournament(M.prisma, owner.id, { name: "Com fotos", sportCode: "FIFA", format: "LEAGUE", entryType: "SOLO", visibility: "PRIVATE" });
    await M.t.addEntry(M.prisma, owner.id, t.id, { players: [{ userId: ana.id }] });
    const { uploadRequestSchema } = await import("@/server/validators");
    expect(() => uploadRequestSchema.parse({ mimeType: "application/pdf", byteSize: 10 })).toThrow();
    await expect(M.media.requestUpload(M.prisma, ana.id, t.id, uploadRequestSchema.parse({ mimeType: "image/jpeg", byteSize: 9_000_000 }))).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    await expect(M.media.requestUpload(M.prisma, bia.id, t.id, uploadRequestSchema.parse({ mimeType: "image/jpeg", byteSize: 1000 }))).rejects.toMatchObject({ status: 404 });

    const up = await M.media.requestUpload(M.prisma, ana.id, t.id, uploadRequestSchema.parse({ mimeType: "image/webp", byteSize: 120_000, caption: "Comemoração" }));
    expect(up.uploadUrl).toContain("memory://put/t/");
    await expect(M.media.confirmUpload(M.prisma, ana.id, up.media.id)).rejects.toMatchObject({ code: "UPLOAD_MISSING" });
    mem.objects.set(up.media.objectKey, { byteSize: 50, mimeType: "image/webp" });
    await expect(M.media.confirmUpload(M.prisma, ana.id, up.media.id)).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
    expect((await M.media.listMedia(M.prisma, ana.id, t.id, {})).items.length).toBe(0);
    mem.objects.set(up.media.objectKey, { byteSize: 120_000, mimeType: "image/webp" });
    const ready = await M.media.confirmUpload(M.prisma, ana.id, up.media.id);
    expect(ready.status).toBe("READY");
    expect((await M.media.listMedia(M.prisma, owner.id, t.id, {})).items.length).toBe(1);
    expect((await M.media.getMediaUrl(M.prisma, ana.id, up.media.id, { download: true })).url).toContain("memory://get/");
    await expect(M.media.getMediaUrl(M.prisma, bia.id, up.media.id)).rejects.toMatchObject({ status: 404 });
    await expect(M.media.listMedia(M.prisma, bia.id, t.id, {})).rejects.toMatchObject({ status: 404 });
    await M.media.setMediaHidden(M.prisma, owner.id, up.media.id, true, "Foto indevida");
    expect((await M.media.listMedia(M.prisma, ana.id, t.id, {})).items.length).toBe(0);
    M.storage.setStorageForTests(null);
  });
});
