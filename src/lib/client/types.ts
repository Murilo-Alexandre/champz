/** Formas das respostas das APIs (subconjunto usado pela UI). */
export type Format = "LEAGUE" | "GROUPS_ONLY" | "KNOCKOUT" | "GROUPS_KNOCKOUT";
export type TournamentStatus = "DRAFT" | "OPEN" | "ACTIVE" | "FINISHED" | "CANCELLED";

export type Me = {
  user: { id: string; name: string; email: string | null; username: string | null; displayUsername: string | null; image: string | null; avatarMediaId: string | null; role: "SUPERADMIN" | "ADMIN" | "USER"; createdAt: string };
  isSuperadmin: boolean;
  providers: string[];
  mustChangePassword: boolean;
  needsUsername: boolean;
  googleEnabled: boolean;
};

export type PublicUser = { id: string; name: string; username: string | null; image?: string | null; avatarMediaId: string | null };

export type EntryPlayer = { id: string; userId: string | null; guestName: string | null; user: PublicUser | null };
export type Entry = { id: string; name: string; type: "SOLO" | "DUO"; active: boolean; withdrawnAt: string | null; withdrawNote: string | null; seed: number | null; players: EntryPlayer[] };

export type ClubMode = "RANDOM" | "PLAYER_CHOICE" | "MANUAL" | "OPPONENT_CHOICE";
export type ClubPool = "ALL" | "NATIONAL" | "INTERNATIONAL" | "NATIONAL_TEAM" | "CUSTOM";
export type ClubRule = { mode: ClubMode; allowRepeat: boolean; pool: ClubPool; clubIds: string[] };
export type ClubRules = { default: ClubRule; phases: Record<string, ClubRule> };
/** Regra efetiva de uma rodada, calculada pelo servidor. */
export type RoundClubRule = ClubRule & { key: string; label: string; poolClubIds: string[]; legacy: boolean };

export type Settings = {
  points: { win: number; draw: number; loss: number };
  tiebreakers: string[];
  bonus: { bestGoalDiff: { enabled: boolean; points: number; tiePolicy: "ALL" | "TIEBREAK" | "NONE" } };
  walkover: { presentPoints: number; absentPoints: number; symbolicScore: { present: number; absent: number } | null; countStats: boolean };
  groupStage: { groupCount: number; legs: 1 | 2; qualifiersPerGroup: number; bestOfRest: number };
  knockout: { legs: 1; drawResolution: "PENALTIES" | "MANUAL"; seeding: "RANKED" | "MANUAL"; avoidSameGroup: boolean };
  media: { maxUploadBytes: number; quotaBytes: number };
  clubRules?: ClubRules;
};

export type Tournament = {
  id: string; ownerId: string; name: string; sportCode: string; edition: string | null; description: string | null; coverMediaId: string | null;
  format: Format; entryType: "SOLO" | "DUO"; status: TournamentStatus; visibility: "PUBLIC" | "PRIVATE"; settings: Settings; settingsVersion: number;
  championEntryId: string | null; startsAt: string | null; finishedAt: string | null; createdAt: string;
};

export type Membership = {
  id: string; userId: string; role: "OWNER" | "ADMIN" | "PARTICIPANT" | "VIEWER";
  canEditResult: boolean; canEditClubs: boolean; canDraw: boolean; canEditRules: boolean; canUploadMedia: boolean; canManageMembers: boolean;
};

export type TournamentListItem = Tournament & { members: { role: Membership["role"] }[]; _count: { entries: number } };

export type StageSummary = { id: string; order: number; type: "GROUP" | "LEAGUE" | "KNOCKOUT"; name: string; status: string };

export type TournamentView = { tournament: Tournament; myMembership: Membership | null; entries: Entry[]; stages: StageSummary[]; champion: Entry | null };

export type Club = { id: string; name: string; shortName: string | null; country: string | null; stars: number | null; crestMediaId: string | null; crestPath?: string | null; slug?: string | null; category?: "NATIONAL" | "INTERNATIONAL" | "NATIONAL_TEAM"; active: boolean };

export type MatchClub = { side: "HOME" | "AWAY"; clubId: string; source: string; club: Club };

export type Match = {
  id: string; stageId: string; roundId: string; groupId: string | null; homeEntryId: string | null; awayEntryId: string | null;
  status: "SCHEDULED" | "READY" | "COMPLETED" | "WALKOVER" | "BYE" | "CANCELLED";
  homeScore: number | null; awayScore: number | null; homePenalties: number | null; awayPenalties: number | null;
  walkoverAbsent: "HOME" | "AWAY" | null; walkoverBoth: boolean; adminDecision: string | null; winnerEntryId: string | null;
  bracketPosition: number | null; nextMatchId: string | null; nextMatchSide: "HOME" | "AWAY" | null; bracketHalf: string | null;
  completedAt: string | null; version: number; homeEntry: Entry | null; awayEntry: Entry | null; clubs: MatchClub[];
};

export type Round = { id: string; number: number; name: string | null; matches: Match[]; clubRule?: RoundClubRule };

export type StandingRow = {
  entryId: string; played: number; wins: number; draws: number; losses: number; goalsFor: number; goalsAgainst: number;
  basePoints: number; bonusPoints: number; walkovers: number; position: number; goalDiff: number; points: number; efficiency: number; tied: boolean; tiedWith: string[];
};
export type GroupStanding = { groupId: string; label: string; closedAt: string | null; rows: StandingRow[] };

export type StageView = {
  stage: StageSummary & { clubAssignmentMode: ClubMode; allowClubRepeat: boolean; allowedClubs: { club: Club }[]; sourceStageId: string | null };
  rounds: Round[];
  standings: GroupStanding[];
};

export type Stats = {
  entries: { id: string; name: string }[];
  stats: {
    sample: { matchesCounted: number; criteria: string };
    bestAttack: { entryId: string; goalsFor: number }[];
    bestDefense: { entryId: string; goalsAgainst: number; played: number }[];
    biggestWins: { matchId: string; winnerEntryId: string; loserEntryId: string; score: string; margin: number }[];
    highestScoring: { matchId: string; totalGoals: number; score: string }[];
    longestWinStreak: { entryId: string; streak: number }[];
    longestUnbeaten: { entryId: string; streak: number }[];
    totalGoals: number; averageGoals: number;
  };
  evolution: { round: number; rows: { entryId: string; position: number; points: number }[] }[];
};

export type Media = { id: string; caption: string | null; takenAt: string | null; createdAt: string; matchId: string | null; width: number | null; height: number | null; ownerUserId: string; hiddenReason?: string | null; kind?: string };

export type AuditItem = {
  id: string; targetType: string; targetId: string; action: string; before: unknown; after: unknown; reason: string | null; mediaIds: string[]; createdAt: string;
  actor: { id: string; name: string; username: string | null } | null;
};

export type Retrospective = {
  tournament: { id: string; name: string; edition: string | null; format: Format; startsAt: string | null; finishedAt: string | null };
  championEntryId: string | null; runnerUpEntryId: string | null; entries: Entry[]; standings: GroupStanding[];
  stats: Stats["stats"]; evolution: Stats["evolution"]; matchCount: number; photos: Media[];
};
