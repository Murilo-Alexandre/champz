import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins/username";
import { nextCookies } from "better-auth/next-js";
import { APIError } from "better-auth/api";
import { getPrisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";

const googleConfigured = !!env("GOOGLE_CLIENT_ID") && !!env("GOOGLE_CLIENT_SECRET");

/**
 * URL pública do app. Ordem: BETTER_AUTH_URL explícita > domínio de produção da Vercel > localhost.
 * VERCEL_* são variáveis automáticas da Vercel (sem segredo).
 */
const withHttps = (host?: string) => (host ? `https://${host}` : undefined);
const baseURL =
  env("BETTER_AUTH_URL") ||
  (env("VERCEL_ENV") === "production" ? withHttps(env("VERCEL_PROJECT_PRODUCTION_URL")) : withHttps(env("VERCEL_URL"))) ||
  "http://localhost:3000";

/** Origens aceitas (CSRF/redirect): app configurado + deploy atual da Vercel + localhost só fora de produção. */
const trustedOrigins = [
  baseURL,
  env("NEXT_PUBLIC_APP_URL"),
  withHttps(env("VERCEL_PROJECT_PRODUCTION_URL")),
  withHttps(env("VERCEL_URL")),
  ...(env("VERCEL_ENV") === "production" ? [] : ["http://localhost:3000"]),
].filter((o, i, all): o is string => !!o && all.indexOf(o) === i);

export function isGoogleConfigured() {
  return googleConfigured;
}

/**
 * Better Auth auto-hospedado (Prisma + plugin username + Google opcional).
 * Regras: sem cadastro público (contas só via administração/bootstrap); Google nunca cria conta nem entra
 * em conta não vinculada; vincular Google exige estar logado (linkSocial), nunca por coincidência de e-mail.
 */
export const auth = betterAuth({
  appName: "Champz",
  baseURL,
  secret: env("BETTER_AUTH_SECRET"),
  database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
  // Endpoints nativos desligados: cadastro, troca/recuperação por e-mail (sem provedor) e autoexclusão.
  disabledPaths: ["/sign-up/email", "/change-email", "/delete-user", "/request-password-reset", "/reset-password", "/set-password"],
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Recuperação de senha depende de provedor de e-mail (pendente no MVP); sem envio simulado.
  },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: env("GOOGLE_CLIENT_ID")!,
          clientSecret: env("GOOGLE_CLIENT_SECRET")!,
          prompt: "select_account",
          disableSignUp: true,
          disableImplicitSignUp: true,
        },
      }
    : {},
  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      trustedProviders: [],
      // Vínculo só por ação explícita do usuário autenticado (linkSocial); o e-mail do Google pode diferir do cadastro.
      allowDifferentEmails: true,
    },
  },
  user: {
    additionalFields: {
      avatarMediaId: { type: "string", required: false, input: false },
      role: { type: "string", required: false, input: false },
      banned: { type: "boolean", required: false, input: false },
      mustChangePassword: { type: "boolean", required: false, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Defesa em profundidade: nenhum fluxo do Better Auth (cadastro, OAuth) cria usuários.
        before: async () => {
          throw new APIError("FORBIDDEN", { message: "Cadastro público desativado. Peça a um administrador.", code: "SIGNUP_DISABLED" });
        },
      },
    },
    session: {
      create: {
        before: async (session) => {
          const user = await getPrisma().user.findUnique({ where: { id: session.userId }, select: { banned: true } });
          if (!user || user.banned) throw new APIError("FORBIDDEN", { message: "Conta bloqueada", code: "USER_BANNED" });
        },
      },
    },
    account: {
      update: {
        // Troca de senha pelo próprio usuário (change-password) encerra a troca obrigatória.
        after: async (account) => {
          if (account.providerId === "credential" && account.password) {
            await getPrisma().user.updateMany({ where: { id: account.userId, mustChangePassword: true }, data: { mustChangePassword: false } });
          }
        },
      },
    },
  },
  rateLimit: {
    enabled: process.env.NODE_ENV !== "test",
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-in/username": { window: 60, max: 10 },
      "/change-password": { window: 60, max: 5 },
    },
  },
  trustedOrigins,
  advanced: {
    // Cookies Secure em HTTPS (produção/preview); localhost continua funcionando em HTTP.
    useSecureCookies: baseURL.startsWith("https://"),
  },
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 24,
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
