import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { username } from "better-auth/plugins/username";
import { nextCookies } from "better-auth/next-js";
import { getPrisma } from "@/lib/db/prisma";

const googleConfigured = !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export function isGoogleConfigured() {
  return googleConfigured;
}

/**
 * Better Auth auto-hospedado (Prisma + plugin username + Google opcional).
 * Vinculação automática por e-mail desativada: vincular Google exige estar logado (linkSocial).
 */
export const auth = betterAuth({
  appName: "Champz",
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(getPrisma(), { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // Recuperação de senha depende de provedor de e-mail (pendente no MVP); sem envio simulado.
  },
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: "select_account",
        },
      }
    : {},
  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
      allowDifferentEmails: false,
    },
  },
  user: {
    additionalFields: {
      avatarMediaId: { type: "string", required: false, input: false },
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-in/username": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
  trustedOrigins: [process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"],
  plugins: [
    username({
      minUsernameLength: 3,
      maxUsernameLength: 24,
    }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
