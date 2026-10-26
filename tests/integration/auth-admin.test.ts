import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase, cookieFrom, jsonRequest, params } from "./helpers";

type Mods = {
  auth: typeof import("@/server/auth/auth").auth;
  prisma: import("@/lib/db/prisma").Db;
  admin: typeof import("@/server/services/admin");
  t: typeof import("@/server/services/tournaments");
  meRoute: typeof import("@/app/api/me/route");
  roleRoute: typeof import("@/app/api/admin/users/[userId]/role/route");
  resetRoute: typeof import("@/app/api/admin/users/[userId]/reset-password/route");
  usersRoute: typeof import("@/app/api/admin/users/route");
  tournamentsRoute: typeof import("@/app/api/tournaments/route");
};
let M: Mods;
let stopDb: () => Promise<void>;
const PASSWORD = "senha-forte-123";

// ───── Google simulado: só o endpoint de token é interceptado; o resto do fluxo OAuth é o real do Better Auth.
let googleProfile: { sub: string; email: string; name: string } = { sub: "0", email: "x@gmail.com", name: "X" };
const realFetch = globalThis.fetch;
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
function fakeIdToken() {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "RS256", typ: "JWT", kid: "test" })}.${b64({
    iss: "https://accounts.google.com", aud: "test-google-client", iat: now, exp: now + 3600,
    sub: googleProfile.sub, email: googleProfile.email, email_verified: true, name: googleProfile.name,
  })}.sig`;
}

async function call(path: string, method: string, cookie: string | null, body?: unknown) {
  return M.auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method,
      headers: { origin: "http://localhost:3000", ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    }),
  );
}

/** Executa o fluxo OAuth completo (início + callback). `link` usa /link-social com a sessão informada. */
async function googleFlow(opts: { link?: string } = {}) {
  const start = opts.link
    ? await call("/link-social", "POST", opts.link, { provider: "google", callbackURL: "/perfil", errorCallbackURL: "/erro" })
    : await call("/sign-in/social", "POST", null, { provider: "google", callbackURL: "/ok", errorCallbackURL: "/erro" });
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state")!;
  const startCookies = cookieFrom(start.headers);
  const cookie = [opts.link, startCookies].filter(Boolean).join("; ");
  const cb = await call(`/callback/google?code=fake-code&state=${encodeURIComponent(state)}`, "GET", cookie);
  return { status: cb.status, location: cb.headers.get("location") ?? "", sessionCookie: cookieFrom(cb.headers) };
}

async function login(username: string, password = PASSWORD) {
  const res = await M.auth.api.signInUsername({ body: { username, password }, returnHeaders: true });
  return cookieFrom(res.headers);
}
async function meStatus(cookie: string) {
  return (await M.meRoute.GET(jsonRequest("/api/me", "GET", cookie), params({}))).status;
}

let superId: string;
let superCookie: string;

beforeAll(async () => {
  const db = await startTestDatabase(5435);
  stopDb = db.stop;
  process.env.GOOGLE_CLIENT_ID = "test-google-client";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "at", id_token: fakeIdToken(), expires_in: 3600, token_type: "Bearer", scope: "openid email profile" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return realFetch(input, init);
  }) as typeof fetch;
  const { getPrisma } = await import("@/lib/db/prisma");
  M = {
    auth: (await import("@/server/auth/auth")).auth,
    prisma: getPrisma(),
    admin: await import("@/server/services/admin"),
    t: await import("@/server/services/tournaments"),
    meRoute: await import("@/app/api/me/route"),
    roleRoute: await import("@/app/api/admin/users/[userId]/role/route"),
    resetRoute: await import("@/app/api/admin/users/[userId]/reset-password/route"),
    usersRoute: await import("@/app/api/admin/users/route"),
    tournamentsRoute: await import("@/app/api/tournaments/route"),
  };
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  await M?.prisma.$disconnect();
  await stopDb?.();
});

describe("bootstrap do Superadmin", () => {
  it("cria uma vez e não duplica (nem com outro e-mail); banco impede segundo SUPERADMIN", async () => {
    const first = await M.admin.bootstrapSuperadmin(M.prisma, { email: "dono@champz.test", password: "senha-super-forte-1", name: "Murilo Alexandre", username: "murilo" });
    expect(first.status).toBe("created");
    superId = first.userId;
    const again = await M.admin.bootstrapSuperadmin(M.prisma, { email: "dono@champz.test", password: "outra-senha-forte-2", name: "X", username: "murilo" });
    expect(again).toEqual({ status: "already_exists", userId: superId });
    const other = await M.admin.bootstrapSuperadmin(M.prisma, { email: "outro@champz.test", password: "outra-senha-forte-3", name: "Y", username: "outro" });
    expect(other.status).toBe("already_exists");
    expect(await M.prisma.user.count({ where: { role: "SUPERADMIN" } })).toBe(1);
    // Senha não foi trocada pela 2ª execução.
    superCookie = await login("murilo", "senha-super-forte-1");
    expect(await meStatus(superCookie)).toBe(200);
    // Defesas no banco.
    await expect(M.prisma.user.create({ data: { id: "x2", name: "X", email: "x2@t.t", role: "SUPERADMIN" } })).rejects.toThrow();
    await expect(M.prisma.systemSetting.update({ where: { key: "superadminUserId" }, data: { value: "outro" } })).rejects.toThrow();
    await expect(M.prisma.systemSetting.delete({ where: { key: "superadminUserId" } })).rejects.toThrow();
  });
});

describe("autenticação restrita", () => {
  it("cadastro público é bloqueado", async () => {
    const before = await M.prisma.user.count();
    const res = await call("/sign-up/email", "POST", null, { email: "novo@champz.test", password: PASSWORD, name: "Novo", username: "novo" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    await expect(M.auth.api.signUpEmail({ body: { email: "novo2@champz.test", password: PASSWORD, name: "N", username: "novo2" } })).rejects.toThrow();
    expect(await M.prisma.user.count()).toBe(before);
  });

  it("Google não vinculado não entra nem cria conta (inclusive com e-mail igual ao de uma conta existente)", async () => {
    const before = await M.prisma.user.count();
    googleProfile = { sub: "g-desconhecido", email: "ninguem@gmail.com", name: "Ninguém" };
    const unknown = await googleFlow();
    expect(unknown.location).toContain("error");
    expect(unknown.sessionCookie).not.toContain("session_token=");

    await M.admin.provisionUserWithPassword(M.prisma, { name: "Ana", email: "ana@gmail.com", username: "ana", password: PASSWORD });
    googleProfile = { sub: "g-ana", email: "ana@gmail.com", name: "Ana" };
    const sameEmail = await googleFlow();
    expect(sameEmail.location).toContain("error");
    expect(sameEmail.sessionCookie).not.toContain("session_token=");
    expect(await M.prisma.account.count({ where: { providerId: "google" } })).toBe(0);
    expect(await M.prisma.user.count()).toBe(before + 1);
  });

  it("usuário logado vincula Google pelo perfil e depois entra pelo Google", async () => {
    const anaCookie = await login("ana");
    googleProfile = { sub: "g-ana", email: "ana.pessoal@gmail.com", name: "Ana" };
    const linked = await googleFlow({ link: anaCookie });
    expect(linked.location).toContain("/perfil");
    const ana = await M.prisma.user.findUniqueOrThrow({ where: { username: "ana" }, include: { accounts: true } });
    expect(ana.accounts.map((a) => a.providerId).sort()).toEqual(["credential", "google"]);

    const signIn = await googleFlow();
    expect(signIn.location).toContain("/ok");
    expect(signIn.sessionCookie).toContain("session_token=");
    const me = await M.meRoute.GET(jsonRequest("/api/me", "GET", signIn.sessionCookie), params({}));
    expect(((await me.json()) as { user: { id: string } }).user.id).toBe(ana.id);
  });

  it("campos de papel/bloqueio não podem ser alterados pelos endpoints nativos", async () => {
    const anaCookie = await login("ana");
    const escalate = await call("/update-user", "POST", anaCookie, { name: "Ana Maria", role: "SUPERADMIN", banned: false, mustChangePassword: false });
    expect(escalate.status).toBeGreaterThanOrEqual(400);
    const ok = await call("/update-user", "POST", anaCookie, { name: "Ana Maria" });
    expect(ok.status).toBe(200);
    const ana = await M.prisma.user.findUniqueOrThrow({ where: { username: "ana" } });
    expect([ana.name, ana.role]).toEqual(["Ana Maria", "USER"]);
  });

  it("desvincular Google exige outro método de acesso", async () => {
    await M.prisma.user.create({ data: { id: "so-google", name: "Só Google", email: "sg@gmail.com", username: "sogoogle", accounts: { create: { id: "acc-sg", accountId: "g-sg", providerId: "google" } } } });
    await expect(M.admin.unlinkGoogle(M.prisma, superId, "so-google")).rejects.toMatchObject({ code: "LAST_LOGIN_METHOD" });
    const ana = await M.prisma.user.findUniqueOrThrow({ where: { username: "ana" } });
    const res = await M.admin.unlinkGoogle(M.prisma, superId, ana.id);
    expect(res.unlinked).toBe(1);
    googleProfile = { sub: "g-ana", email: "ana.pessoal@gmail.com", name: "Ana" };
    expect((await googleFlow()).location).toContain("error");
  });
});

describe("hierarquia e administração", () => {
  let adminId: string;
  let adminCookie: string;
  let userId: string;

  it("Superadmin cria e promove administrador; promoção revoga sessões do alvo", async () => {
    const created = await M.admin.createUser(M.prisma, superId, { name: "Gestor", email: "gestor@champz.test", username: "gestor", role: "USER" });
    expect(created.temporaryPassword!.length).toBeGreaterThanOrEqual(16);
    adminId = created.user.id;
    const res = await M.roleRoute.PUT(jsonRequest(`/api/admin/users/${adminId}/role`, "PUT", superCookie, { role: "ADMIN" }), params({ userId: adminId }));
    expect(res.status).toBe(200);
    expect((await M.prisma.user.findUniqueOrThrow({ where: { id: adminId } })).role).toBe("ADMIN");
    // Primeiro acesso com senha temporária: troca obrigatória antes de usar o app.
    adminCookie = await login("gestor", created.temporaryPassword!);
    const blocked = await M.usersRoute.GET(jsonRequest("/api/admin/users", "GET", adminCookie), params({}));
    expect(blocked.status).toBe(403);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(await meStatus(adminCookie)).toBe(200);
    await M.auth.api.changePassword({ body: { currentPassword: created.temporaryPassword!, newPassword: "nova-senha-gestor-1" }, headers: new Headers({ cookie: adminCookie }) });
    expect((await M.prisma.user.findUniqueOrThrow({ where: { id: adminId } })).mustChangePassword).toBe(false);
    const ok = await M.usersRoute.GET(jsonRequest("/api/admin/users?search=ana", "GET", adminCookie), params({}));
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as { items: unknown[] }).items.length).toBe(1);
  });

  it("ADMIN gerencia USER, mas não promove nem cria administradores", async () => {
    const created = await M.admin.createUser(M.prisma, adminId, { name: "Comum", email: "comum@champz.test", username: "comum", role: "USER" });
    userId = created.user.id;
    await M.admin.updateUser(M.prisma, adminId, userId, { name: "Comum Editado" });
    await M.admin.setBanned(M.prisma, adminId, userId, true, "Teste de bloqueio");
    await expect(login("comum", created.temporaryPassword!)).rejects.toThrow();
    await M.admin.setBanned(M.prisma, adminId, userId, false);
    await expect(M.admin.setRole(M.prisma, adminId, userId, "ADMIN")).rejects.toMatchObject({ status: 403 });
    await expect(M.admin.createUser(M.prisma, adminId, { name: "Outro", email: "o@champz.test", username: "outroadm", role: "ADMIN" })).rejects.toMatchObject({ status: 403 });
    const viaApi = await M.roleRoute.PUT(jsonRequest(`/api/admin/users/${userId}/role`, "PUT", adminCookie, { role: "ADMIN" }), params({ userId }));
    expect(viaApi.status).toBe(403);
    // USER comum não acessa a administração.
    const comumCookie = await login("comum", created.temporaryPassword!);
    await M.auth.api.changePassword({ body: { currentPassword: created.temporaryPassword!, newPassword: "senha-comum-nova-1" }, headers: new Headers({ cookie: comumCookie }) });
    const denied = await M.usersRoute.GET(jsonRequest("/api/admin/users", "GET", await login("comum", "senha-comum-nova-1")), params({}));
    expect(denied.status).toBe(403);
  });

  it("ADMIN não modifica o Superadmin nem outro ADMIN, inclusive por chamada direta de API", async () => {
    for (const op of [
      () => M.admin.updateUser(M.prisma, adminId, superId, { name: "Hackeado" }),
      () => M.admin.resetPassword(M.prisma, adminId, superId),
      () => M.admin.setBanned(M.prisma, adminId, superId, true, "x"),
      () => M.admin.revokeSessions(M.prisma, adminId, superId),
      () => M.admin.unlinkGoogle(M.prisma, adminId, superId),
      () => M.admin.setRole(M.prisma, adminId, superId, "USER"),
    ]) {
      await expect(op()).rejects.toMatchObject({ status: 403 });
    }
    const viaApi = await M.resetRoute.POST(jsonRequest(`/api/admin/users/${superId}/reset-password`, "POST", adminCookie), params({ userId: superId }));
    expect(viaApi.status).toBe(403);
    const sup = await M.prisma.user.findUniqueOrThrow({ where: { id: superId } });
    expect([sup.name, sup.role, sup.banned]).toEqual(["Murilo Alexandre", "SUPERADMIN", false]);
    expect(await meStatus(superCookie)).toBe(200); // sessão do Superadmin intacta
    // Nem o Superadmin altera a si mesmo por estas APIs (usa o próprio perfil).
    await expect(M.admin.setRole(M.prisma, superId, superId, "USER")).rejects.toMatchObject({ status: 403 });
    // Rebaixamento pelo Superadmin funciona.
    const demoted = await M.admin.setRole(M.prisma, superId, adminId, "USER");
    expect(demoted.role).toBe("USER");
  });

  it("reset de senha: senha temporária, troca obrigatória e revogação de todas as sessões", async () => {
    const before = await login("comum", "senha-comum-nova-1");
    expect(await meStatus(before)).toBe(200);
    const { temporaryPassword, sessionsRevoked } = await M.admin.resetPassword(M.prisma, superId, userId);
    expect(sessionsRevoked).toBeGreaterThanOrEqual(1);
    expect(await meStatus(before)).toBe(401);
    await expect(login("comum", "senha-comum-nova-1")).rejects.toThrow();
    const fresh = await login("comum", temporaryPassword);
    const create = await M.tournamentsRoute.POST(jsonRequest("/api/tournaments", "POST", fresh, { name: "Bloqueado", format: "LEAGUE" }), params({}));
    expect(create.status).toBe(403);
  });

  it("conta sem e-mail: cria, entra por usuário/senha, vincula Google depois e o Google entra na mesma conta", async () => {
    const supBefore = await M.prisma.user.findUniqueOrThrow({ where: { id: superId }, include: { accounts: true } });
    // 1. ADMIN (aqui o Superadmin) cria USER só com nome, usuário e senha definida.
    const res = await M.usersRoute.POST(jsonRequest("/api/admin/users", "POST", superCookie, { name: "Sem Email", username: "semEmail", password: "senha-sem-email-1", mustChangePassword: false }), params({}));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { user: { id: string; email: string | null }; temporaryPassword: string | null };
    expect(body.user.email).toBeNull();
    expect(body.temporaryPassword).toBeNull();
    const stored = await M.prisma.user.findUniqueOrThrow({ where: { id: body.user.id } });
    expect(stored.email).toMatch(/@sem-email\.champz\.invalid$/); // identificador interno, nunca exibido

    // 2–3. Entra com usuário e senha e usa o app sem Google.
    const cookie = await login("sememail", "senha-sem-email-1");
    const me = await M.meRoute.GET(jsonRequest("/api/me", "GET", cookie), params({}));
    const meBody = (await me.json()) as { user: { email: string | null }; providers: string[] };
    expect(me.status).toBe(200);
    expect(meBody.user.email).toBeNull();
    expect(meBody.providers).toEqual(["credential"]);
    const t = await M.tournamentsRoute.POST(jsonRequest("/api/tournaments", "POST", cookie, { name: "Copa sem e-mail", format: "LEAGUE" }), params({}));
    expect(t.status).toBe(201);

    // O identificador interno não serve para login por e-mail.
    const viaEmail = await call("/sign-in/email", "POST", null, { email: stored.email, password: "senha-sem-email-1" });
    expect(viaEmail.status).toBe(401);

    // Google com e-mail qualquer não entra nem cria conta antes do vínculo.
    googleProfile = { sub: "g-sem-email", email: "qualquer.um@gmail.com", name: "Sem Email" };
    expect((await googleFlow()).location).toContain("error");

    // 4–5. Vincula Google pelo perfil (logado) e depois entra pelo Google na MESMA conta.
    expect((await googleFlow({ link: cookie })).location).toContain("/perfil");
    const viaGoogle = await googleFlow();
    expect(viaGoogle.sessionCookie).toContain("session_token=");
    const me2 = await M.meRoute.GET(jsonRequest("/api/me", "GET", viaGoogle.sessionCookie), params({}));
    expect(((await me2.json()) as { user: { id: string } }).user.id).toBe(body.user.id);

    // 6. Cadastro com e-mail continua funcionando; e-mail pode ser removido e reinformado.
    const withEmail = await M.admin.createUser(M.prisma, superId, { name: "Com Email", email: "com.email@champz.test", username: "comemail", role: "USER" });
    expect(withEmail.user.email).toBe("com.email@champz.test");
    expect((await M.admin.updateUser(M.prisma, superId, withEmail.user.id, { email: null })).email).toBeNull();
    expect((await M.admin.updateUser(M.prisma, superId, withEmail.user.id, { email: "novo@champz.test" })).email).toBe("novo@champz.test");

    // 7. Bloqueio e reset continuam valendo para conta sem e-mail.
    await M.admin.setBanned(M.prisma, superId, body.user.id, true, "Teste");
    await expect(login("sememail", "senha-sem-email-1")).rejects.toThrow();
    await M.admin.setBanned(M.prisma, superId, body.user.id, false);
    const reset = await M.admin.resetPassword(M.prisma, superId, body.user.id);
    expect(await meStatus(await login("sememail", reset.temporaryPassword))).toBe(200);

    // 8. Superadmin intacto. 9. Cadastro público segue bloqueado.
    const supAfter = await M.prisma.user.findUniqueOrThrow({ where: { id: superId }, include: { accounts: true } });
    expect([supAfter.email, supAfter.role, supAfter.accounts.length]).toEqual([supBefore.email, "SUPERADMIN", supBefore.accounts.length]);
    expect((await call("/sign-up/email", "POST", null, { email: "x@y.com", password: "senha-qualquer-1", name: "X" })).status).toBe(404);
  });

  it("ações administrativas ficam no log imutável, sem senhas", async () => {
    const log = await M.admin.listSystemAudit(M.prisma, superId, {});
    const actions = log.items.map((i) => i.action);
    for (const a of ["SUPERADMIN_BOOTSTRAP", "ADMIN_CREATE_USER", "ADMIN_PROMOTE", "ADMIN_DEMOTE", "ADMIN_BAN", "ADMIN_UNBAN", "ADMIN_RESET_PASSWORD", "ADMIN_UNLINK_GOOGLE", "ADMIN_UPDATE_USER"]) {
      expect(actions).toContain(a);
    }
    expect(JSON.stringify(log.items)).not.toMatch(/temporaryPassword|senha-|password"/);
    await expect(M.prisma.auditEvent.deleteMany({ where: { tournamentId: null } })).rejects.toThrow();
    await expect(M.admin.listSystemAudit(M.prisma, userId, {})).rejects.toMatchObject({ status: 403 });
  });
});
