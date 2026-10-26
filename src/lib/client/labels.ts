import type { Format, TournamentStatus, Membership } from "./types";

export const FORMAT_LABEL: Record<Format, string> = {
  GROUPS_KNOCKOUT: "Grupos + mata-mata",
  GROUPS_ONLY: "Só grupos",
  KNOCKOUT: "Mata-mata",
  LEAGUE: "Pontos corridos",
};

export const STATUS_LABEL: Record<TournamentStatus, string> = {
  DRAFT: "Rascunho",
  OPEN: "Inscrições",
  ACTIVE: "Em andamento",
  FINISHED: "Encerrado",
  CANCELLED: "Cancelado",
};

export const ROLE_LABEL: Record<Membership["role"], string> = {
  OWNER: "Dono",
  ADMIN: "Admin",
  PARTICIPANT: "Participante",
  VIEWER: "Espectador",
};

export const TIEBREAKER_LABEL: Record<string, string> = {
  POINTS: "Pontos",
  WINS: "Vitórias",
  GOAL_DIFF: "Saldo de gols",
  GOALS_FOR: "Gols pró",
  FEWEST_GOALS_AGAINST: "Menos gols sofridos",
  HEAD_TO_HEAD: "Confronto direto",
};

export const AUDIT_LABEL: Record<string, string> = {
  CREATE: "Criou",
  UPDATE: "Editou",
  ADD: "Inscreveu",
  GENERATE: "Gerou a fase",
  ADVANCE: "Avançou para o mata-mata",
  CLOSE: "Encerrou a fase",
  RESULT: "Lançou placar",
  RESULT_UPDATE: "Corrigiu placar",
  WALKOVER: "Registrou W.O.",
  WALKOVER_UPDATE: "Corrigiu W.O.",
  CANCEL: "Cancelou partida",
  CLUB_DRAW: "Sorteou clubes",
  BONUS: "Aplicou bônus",
  WITHDRAW: "Registrou desistência",
  FINISH: "Encerrou o campeonato",
  CHAMPION_CHANGED: "Campeão alterado",
  JOIN_BY_INVITE: "Entrou por convite",
  UPDATE_PERMISSIONS: "Alterou permissões",
  MANUAL_TIEBREAK: "Desempate manual",
  UPLOAD: "Enviou foto",
};

export function auditLabel(action: string) {
  return AUDIT_LABEL[action] ?? action.toLowerCase().replaceAll("_", " ");
}

export function fmtDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", withTime ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "short", year: "numeric" });
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
