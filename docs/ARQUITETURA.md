# Champz — Arquitetura técnica e hospedagem R$ 0

## Decisão confirmada

**Uma única aplicação Next.js (App Router) + TypeScript + Tailwind**, hospedada na **Vercel Hobby**, com **Neon Free PostgreSQL** e **Neon Object Storage**. Sem servidor dedicado, sem Supabase. **Better Auth auto-hospedado nas APIs Next.js**, usando Prisma adapter + plugin oficial username + Google OAuth, de forma que o login realmente aceite `usuário + senha` e `Google`.

> Nota: Neon também fornece Managed Better Auth, mas aqui a escolha é **self-hosted Better Auth com Prisma** para controle do plugin de username e da integração direta. Não instalar as duas modalidades em paralelo.

### Por que esta opção

- A Vercel não mantém MySQL/Postgres dentro do container do app; usa banco separado provisionado externamente, porém integrado ao fluxo do deploy.
- Neon Free: em outubro de 2026, plano divulgado com **1 GB PostgreSQL**, **5 GB Object Storage**, **100 CU-hours/ mês por projeto**; banco hiberna e reativa automaticamente. Confirmar cota vigente na conta antes de assumir consumo/limites.
- Vercel Hobby atende uso pessoal/não comercial. Se Champz virar produto comercial, avaliar licença/plano/hospedagem.
- Fotos não devem ser guardadas no disco local de funções serverless; usar bucket de objetos privado.

## Estrutura sugerida — manter simples

```text
src/
  app/
    (public)/            # apresentação, login/cadastro
    (app)/               # área autenticada, campeonatos, perfil, galeria
    api/                 # routes handlers para auth, upload e operações
    manifest.ts          # PWA
  components/
    ui/                  # botões, menus, modal
    champz/              # partidas, grupos, avatars, escudos
    charts/              # ECharts client-side
    motion/              # GSAP + hooks
  server/
    auth/                # Better Auth
    repositories/        # Prisma persistence
    services/            # matches, standings, seeding, media, audit
    validators/          # validações Zod e autorização
  lib/
    db/                  # Prisma Client
    storage/             # Neon S3 client / URLs assinadas
    tournament/          # funções puras de cálculo testáveis
    permissions/
  types/
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/
  tournament/
public/
  icons/                 # ícones PWA
  sw.js                  # SW mínimo sem cache privado
.claude/skills/
docs/
```

Não criar monorepo/microserviço desnecessariamente. APIs finas delegam a services/repositories; serviços fazem transações e controle de acesso. Unificar validações de payload com Zod ou equivalente. Reservar `api/auth/[...all]` para Better Auth conforme documentação atual.

## Modelo de dados conceitual (nome final pode variar)

- `User`, `Session`, `Account`, `Verification`: **tabelas geradas pelo Better Auth** + plugin username; evitar duplicar usuários.
- `UserProfile`: userId, avatarMediaId, preferências e nome visível extra se necessário; pode estender User do auth em vez de segunda tabela se mais simples.
- `Sport`: código FIFA inicialmente; futuro catálogo plugável, sem engine genérica prematura.
- `Club`: id, name, crestMediaId, stars?, active.
- `Tournament`: id, ownerId, name, sportCode, year/edition, status, visibility, settings JSON versionado, dates.
- `TournamentMember`: tournamentId, userId, role, canEditResult, canEditClubs, canDraw, canEditRules, canUploadMedia, canManageMembers, timestamps.
- `Entry`: id, tournamentId, name?, type SOLO/DUO, active; `EntryPlayer`: entryId + userId; impedir dupla com duplicações/usuário em duas entries salvo regra explícita.
- `Stage`: id, tournamentId, order, type GROUP/LEAGUE/KNOCKOUT, status, rulesSnapshot, clubPolicy, allowedClubs.
- `Group`: id, stageId, label, order; `GroupEntry` groupId/entryId.
- `Round`: id, stageId, groupId?, number, name; `Match`: id, stageId, roundId, homeEntryId?, awayEntryId?, schedule, status, scores, administrativeDecision, winnerEntryId?, version.
- `MatchClub`: matchId, side HOME/AWAY, clubId (ou campos nas partidas se mais simples). Não confundir clube com dupla.
- `StandingAdjustment`: entryId, stage/group, reason, pointsDelta, policy, source; bônus de regras aplicado deterministicamente, evitar duplicidade.
- `AuditEvent`: id, tournamentId, actorUserId, targetType, targetId, action, beforeJSON, afterJSON, createdAt, reason?; somente INSERT, acesso controlado.
- `Media`: id, ownerUserId, tournamentId?, stageId?, roundId?, matchId?, type, objectKey, mimeType, byteSize, dimensions?, createdAt, visibility/status; fotos de avatar e escudo podem usar mesmo storage.
- `TournamentSettingsRevision` ou `rulesSnapshot`/`version` para rastrear alterações de regulamento.

Indexes: tournamentId em quase todas as tabelas; unique onde necessário, unique de usuário/entry em cada fase/grupo, unique de relações e identificadores de sorteio; constraints no banco e validação no servidor.

## Regras computacionais

- Calcular tabela de jogos COMPLETED e WALKOVER que contam para classificação, com regra consistente; guardá-la em cache só se necessário, não como fonte de verdade divergente.
- Round-robin por rotação, com BYE para N ímpar; grupos e rodadas persistidos. Chaveamento com BYEs, qualificados **únicos**, seeding/impedimentos validados. Mudança posterior não pode gerar reprocessamento invisível.
- Usar transações Prisma para gravar placar + auditoria + efeitos na classificação/progressão, com controle de concorrência quando útil.
- ECharts consome estatísticas derivadas do backend; animações GSAP nunca alteram o resultado oficial.

## Auth, segurança e fotos

- Better Auth + Prisma adapter + username plugin. Cadastro com email, username, nome e senha; Google OAuth com credenciais do Google Cloud Console. Configurar linking somente com verificação/conta autenticada; **não vincular apenas por e-mail de origem não verificada**.
- Proteção de rotas + APIs por sessão; papéis/permissões por campeonato sempre verificados no backend. Limitar rate de login/uploads, validar entrada, fechar endpoints de administração.
- Armazenamento de provas e fotos em **bucket privado**. URL temporária assinada após autenticação e checagem de vínculo. Download individual autorizado; ZIP client-side em lotes (limite e progresso). Upload presigned diretamente de browser para storage, restrição MIME/tamanho, conferência de objeto antes de aceitar metadados; imagens redimensionadas e sem dados EXIF privados quando possível.
- Restringir service worker a arquivos estáticos seguros; não cachear URLs assinadas nem fotos privadas em caches persistentes da PWA.

## Autenticação restrita e administração do sistema (decisão de 26/10/2026)

- **Sem cadastro público.** Contas são criadas por ADMIN/SUPERADMIN (`POST /api/admin/users`) com senha temporária devolvida uma única vez e `mustChangePassword=true`. Endpoints nativos desligados: `/sign-up/email`, `/change-email`, `/delete-user`, `/request-password-reset`, `/reset-password`, `/set-password`; e um hook impede qualquer criação de usuário pelo Better Auth (inclusive OAuth).
- **Login:** usuário/e-mail + senha. **Google** nunca cria conta (`disableSignUp`) nem entra em conta não vinculada (`disableImplicitLinking`); vínculo só pelo usuário logado via `/api/auth/link-social` (OAuth validado; e-mail do Google pode diferir). Desvincular: o próprio usuário em `/api/auth/unlink-account` (Better Auth impede remover o último método) ou ADMIN em `/api/admin/users/:id/unlink-google` (exige senha ativa).
- **Troca obrigatória:** com senha temporária, as APIs respondem `403 PASSWORD_CHANGE_REQUIRED` (exceto `GET /api/me`) até `/api/auth/change-password`.
- **Papéis globais** (`User.role`), independentes das permissões por campeonato: `SUPERADMIN` (único; índice parcial no banco; identificado pelo ID gravado em `SystemSetting.superadminUserId`, imutável por trigger), `ADMIN` (gerencia somente USER), `USER`.
- **Proteções:** ninguém altera/bloqueia/reseta/desvincula/revoga sessões/rebaixa o Superadmin pelas APIs administrativas; ninguém atua sobre si mesmo por elas (usa o perfil); só o Superadmin promove/rebaixa ADMIN e cria ADMIN; `SUPERADMIN` nunca é atribuível por API; não existe impersonação. Campos `role`, `banned`, `mustChangePassword` não são aceitos pelos endpoints nativos.
- **Sessões:** reset de senha, troca de e-mail pelo admin, bloqueio, desvinculação do Google e mudança de papel revogam todas as sessões do alvo. Conta bloqueada não cria sessão.
- **Auditoria:** ações administrativas gravadas em `AuditEvent` (`tournamentId` nulo, `targetType=USER`), append-only por trigger; senhas nunca são registradas. Leitura em `GET /api/admin/audit`.
- **Bootstrap:** `npm run superadmin:bootstrap` (idempotente) lê `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD` do ambiente do terminal; nunca imprime nem grava a senha.

## Variáveis sugeridas — nomes podem variar conforme SDK

```dotenv
# Neon (NUNCA colocar valores reais no Git)
DATABASE_URL=
DIRECT_URL=

# Better Auth app
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Neon Object Storage (SDK S3, provisionar no painel/CLI)
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=champz-media
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=

# app
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Criar `.env.example` no repositório como documentação, sem secrets; `.env.local` ignorado pelo Git. Usar `DIRECT_URL` em `prisma.config.ts` na versão nova do Prisma (o `directUrl` antigo pode não existir). Não mandar segredos para `NEXT_PUBLIC_`.

## Publicação e PWA

- Vercel: importar repo `Murilo-Alexandre/Champz`, framework Next.js, configurar variáveis acima, migrations separadas, build validado; somente quando autorizado.
- Google OAuth: whitelisting de callback local e domínio de produção; domínio temporário Vercel exato.
- `manifest.ts` + ícones 192/512/maskable + HTTPS + `display:standalone`, e SW seguro mínimo. Android/Chromium: prompt programático condicional; iPhone Safari: modal instructivo de compartilhamento/adicionar à tela inicial. Não prometer clique único iOS.
- Não renderizar MP4 no servidor em tier gratuito; slideshow HTML/GSAP no navegador.

## Links oficiais de referência

- Vercel Hobby e políticas: https://vercel.com/docs/plans/hobby
- Neon Free: https://neon.com/blog/neon-free-plan-1-gb-per-project
- Neon Object Storage: https://neon.com/blog/building-neon-object-storage
- Better Auth username: https://better-auth.com/docs/plugins/username
- Better Auth Prisma: https://better-auth.com/docs/adapters/prisma
- Prisma Neon: https://docs.prisma.io/docs/orm/v6/overview/databases/neon
- PWA Next: https://nextjs.org/docs/app/guides/progressive-web-apps
- GSAP ScrollSmoother: https://gsap.com/docs/v3/Plugins/ScrollSmoother/
