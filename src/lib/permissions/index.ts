export const PERMISSIONS = [
  "RESULT_EDIT",
  "TEAM_EDIT",
  "DRAW_EDIT",
  "RULE_EDIT",
  "MEDIA_UPLOAD",
  "MANAGE_MEMBERS",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export type MemberLike = {
  role: "OWNER" | "ADMIN" | "PARTICIPANT" | "VIEWER";
  canEditResult: boolean;
  canEditClubs: boolean;
  canDraw: boolean;
  canEditRules: boolean;
  canUploadMedia: boolean;
  canManageMembers: boolean;
};

export const PERMISSION_FIELD: Record<Permission, keyof Omit<MemberLike, "role">> = {
  RESULT_EDIT: "canEditResult",
  TEAM_EDIT: "canEditClubs",
  DRAW_EDIT: "canDraw",
  RULE_EDIT: "canEditRules",
  MEDIA_UPLOAD: "canUploadMedia",
  MANAGE_MEMBERS: "canManageMembers",
};

/** OWNER e ADMIN têm tudo; VIEWER nada; PARTICIPANT conforme flags individuais. */
export function hasPermission(member: MemberLike | null | undefined, permission: Permission): boolean {
  if (!member) return false;
  if (member.role === "OWNER" || member.role === "ADMIN") return true;
  if (member.role === "VIEWER") return false;
  return member[PERMISSION_FIELD[permission]];
}

/** Padrão do produto: participante entra com placar e upload ativados, sem regras/sorteio/membros. */
export const DEFAULT_PARTICIPANT_FLAGS = {
  canEditResult: true,
  canEditClubs: false,
  canDraw: false,
  canEditRules: false,
  canUploadMedia: true,
  canManageMembers: false,
};
