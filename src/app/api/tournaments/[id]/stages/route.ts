import { authed, body } from "@/server/http";
import { generateStageSchema } from "@/server/validators";
import { generateInitialStage } from "@/server/services/stages";

/** Gera (ou refaz, sem resultados) a fase inicial: grupos, liga ou mata-mata. */
export const POST = authed<{ id: string }>(async ({ req, db, userId, params }) => generateInitialStage(db, userId, params.id, await body(req, generateStageSchema)), 201);
