# Champz — Status de execução

Última atualização: **26/10/2026** — backend + autenticação restrita/administração implementados e testados localmente (Postgres local via PGlite). **Neon, Google OAuth e Object Storage reais ainda não configurados/testados.** Nada commitado.

## Backend (26/10)

- [x] **B1** Next.js 16.4 (App Router) + TS + Tailwind + ESLint, preservando `gsap`/`echarts`. Prisma 7.10 (`prisma.config.ts`, adapter `pg`), migração versionada `prisma/migrations/20261026000000_init`, Better Auth 1.7 self-hosted (e-mail/senha + username; Google preparado), `.env.example`, seed.
- [x] **B2** Campeonato (LEAGUE/GROUPS_ONLY/KNOCKOUT/GROUPS_KNOCKOUT), entradas 1v1/2v2 (usuário ou convidado sem conta), grupos/rodadas round-robin (folga p/ N ímpar, ida e volta), placar, classificação no servidor.
- [x] **B3** Mata-mata com BYEs e avanço automático, classificados top N + K melhores sem duplicata, seeding com prevenção de reencontro do mesmo grupo, confrontos manuais validados, pênaltis/decisão manual, W.O. configurável, bônus de melhor saldo, desempates configuráveis + ordem manual, clubes por partida/fase (sorteio, escolha, manual, repetição on/off), permissões granulares, audit log append-only (trigger no banco), versão otimista, bloqueio de correção com impacto.
- [~] **B4** Fotos: adapter S3 (Neon Object Storage) + upload presigned + confirmação + galeria/URL assinada/moderação **testados com storage em memória**; **não testado com bucket real** (sem credenciais). APIs de estatísticas e retrospectiva prontas.

## Frontend (27/10)

- [x] F1 telas mobile-first ligadas às APIs reais (landing, login, home, assistente de criação, campeonato, perfil, admin, convite)
- [x] F2 GSAP (`useGSAP`), ScrollTrigger, ScrollSmoother (só ponteiro fino, `smoothTouch: 0`), ECharts sob demanda
- [~] F3 galeria/câmera/ZIP/retrospectiva/campeão implementados; **upload real não testado** (Object Storage com 403)
- [~] F4 PWA (manifest, ícones 192/512/maskable, service worker mínimo, botão Instalar + tutorial iOS); **sem teste em Android/iPhone reais**; deploy não feito

## Evidências de execução (26/10/2026)

- `npm run typecheck` (next typegen + tsc): **passou**
- `npm run lint`: **passou** (0 erros, 0 avisos)
- `npm test`: **passou — 45/45** (31 regras puras em `tests/tournament`, 14 integração com Postgres/PGlite + rotas HTTP reais em `tests/integration`)
- `npm run build`: **passou** (33 rotas de API)
- Smoke HTTP com `next start` + banco local: cadastro, login por username, `/api/me`, criar liga, inscrições, sorteio, placar, classificação, 401 anônimo, 404 privado, 400 placar negativo, 503 upload sem storage, auditoria: **passou**
- `npm run db:seed` (local): **passou** (24 clubes + campeonato `[TESTE]` com 18 jogos)
- Neon real / Google OAuth / bucket real / deploy: **NÃO EXECUTADO** (sem credenciais)

### Cenários de `docs/TESTES.md` cobertos por teste automatizado

| # | Cenário | Resultado |
|---|---|---|
| Homologação | 3x4 => 18 jogos, 3 rodadas x 6; tabelas A, B (Felipe 1x0 Alan **hipotético**) e C conferem | passou |
| 1 | Round-robin N=2,3,4,5,12 sem autojogo/duplicação, BYEs | passou |
| 2 | 1v1 e 2v2; usuário repetido na dupla / em duas entradas rejeitado | passou |
| 3 | Pontos V2/E1/D0, bônus +1 melhor SG (ALL/TIEBREAK/NONE), confronto direto, empate sinalizado | passou |
| 4 | 2 por grupo + 2 melhores 3º => 8 distintos; fórmulas manuais conflitantes rejeitadas | passou |
| 5 | Mata-mata com 3, 5 e 6; avanço único; empate exige pênaltis/decisão | passou |
| 6 | W.O. com pontos configurados, placar simbólico, sem double count, auditado | passou |
| 7 | Correção que muda vencedor com jogo seguinte já disputado => 409; grupo fechado => 409; mudança de classificados => 409 | passou |
| 8 | Clubes: lista restrita, sorteio por rodada sem repetição, fora da lista rejeitado | passou |
| 9 | Participante edita placar por padrão; toggle desligado => 403 via HTTP; intruso => 404; anônimo => 401 | passou |
| 10 | Duas edições ficam no log; UPDATE/DELETE no log bloqueados pelo banco | passou |
| 11 | MIME inválido e arquivo grande rejeitados; upload ausente/divergente não vira válido; não-membro sem acesso | passou (storage em memória) |
| 12–13 | PWA / responsivo | frontend (27/10) |

## Como rodar localmente

```bash
npm install
npm run db:local          # Postgres local (PGlite) na porta 5433, dados em .pglite/
npx prisma migrate deploy # em outro terminal
npm run db:seed           # opcional: SEED_DEMO_PASSWORD=... cria campeonato [TESTE]
npm run dev
```

`.env.local` (não versionado) aponta para o banco local. Testes de integração sobem seu próprio banco em memória (porta 5434).

## Decisões de implementação (relevantes para o frontend)

- W.O., cancelamento, decisão manual de empate e encerramento de liga exigem `RULE_EDIT` + motivo.
- Inscrições só em DRAFT/OPEN. Sorteio pode ser refeito enquanto não houver resultado nem foto vinculada.
- Desistência desativa a entrada e lista jogos pendentes; W.O. deve ser lançado nesses jogos (não é automático).
- Campeonato privado responde 404 a não-membros (não revela existência). Galeria só para membros.
- Vinculação Google por e-mail desativada: vincular exige estar logado (`linkSocial`). Usuário Google define username em `PATCH /api/me`.
- Mata-mata de ida e volta não implementado (só jogo único).

## Bloqueios / o que o proprietário deve configurar

1. **Neon**: criar projeto e preencher `DATABASE_URL` (pooled) e `DIRECT_URL` (direta); rodar `npm run db:deploy`.
2. **Google OAuth**: criar credenciais no Google Cloud Console; callback `http://localhost:3000/api/auth/callback/google` e o domínio da Vercel; preencher `GOOGLE_CLIENT_ID/SECRET`.
3. **Neon Object Storage**: criar bucket **privado** `champz-media`, preencher `S3_*` e configurar CORS do bucket permitindo `PUT`/`GET` da origem do app (necessário para upload direto do navegador). Confirmar cota.
4. `BETTER_AUTH_SECRET` forte em produção.
5. Recuperação de senha por e-mail: **pendente** (sem provedor de e-mail configurado; nenhum envio simulado).
6. Placar real Felipe x Alan: **não confirmado**; nos testes usado como fixture hipotética 1x0.

## Preparação para produção (26/10/2026)

- Infra informada pelo proprietário: GitHub `Murilo-Alexandre/champz`, Vercel `champz` (https://champz-six.vercel.app), Neon `champz-db` (Free) conectado à Vercel com `DATABASE_URL` e `DATABASE_URL_UNPOOLED` em Production.
- Migrações: `DIRECT_URL` > `DATABASE_URL_UNPOOLED` > `DATABASE_URL`. Build da Vercel roda `prisma generate && next build` (não migra). Validado localmente: generate sem variáveis, typecheck, lint, 45/45 testes e build **passaram**.
- Better Auth: URL base por `BETTER_AUTH_URL` ou domínio de produção da Vercel; localhost aceito fora de produção; cookies Secure em HTTPS.
- Migração no Neon real, deploy e login em produção: **NÃO EXECUTADOS**.

## Autenticação restrita e administração (26/10/2026)

- ✅ Cadastro público bloqueado (endpoint desligado + hook). Contas criadas por administração com senha temporária e troca obrigatória.
- ✅ Google: não cria conta, não entra sem vínculo (mesmo com e-mail igual), vínculo pelo perfil logado, login após vínculo, desvinculação preservando acesso. **Testado com o fluxo OAuth real do Better Auth e token do Google simulado**; com credenciais reais do Google: **NÃO EXECUTADO**.
- ✅ Papéis SUPERADMIN/ADMIN/USER; Superadmin único e protegido; APIs `/api/admin/*` (listar/pesquisar/criar/editar, reset de senha, desvincular Google, bloquear/desbloquear, revogar sessões, promover/rebaixar, log).
- ✅ Bootstrap idempotente do Superadmin (`npm run superadmin:bootstrap`), testado no banco local 3x (criou 1, depois "já existe").
- Migração nova: `20261026120000_system_roles` (aplicada só no banco local). Neon: **NÃO EXECUTADO**.
- Pendências: troca do próprio e-mail e recuperação de senha por e-mail dependem de provedor de e-mail; tela administrativa fica para o frontend.

Evidências: `npm run typecheck` passou; `npm run lint` passou (0 problemas); `npm test` **56/56** (45 anteriores + 11 de auth/admin); `npm run build` passou (43 rotas de API).

## Integrações reais (26/10/2026)

| Item | Resultado |
|---|---|
| Conexão direta Neon (sem pooler) — `neondb`/`neondb_owner`, PG 18.6, banco vazio antes | passou |
| Conexão pooled Neon | passou |
| `prisma migrate deploy` no Neon (`init` + `system_roles`, 25 tabelas, sem reset/seed) | passou |
| App (`next start` local) usando o Neon pooled: leitura OK, cadastro público 404, anônimo 401 em `/api/me` e `/api/admin/users` | passou |
| Superadmin no Neon — `murilo.alexandre`, SUPERADMIN, ID persistente; senha ajustável via `npm run superadmin:reset-password` (mesmo ID, revoga sessões, audita) | passou |
| E2E HTTP real (servidor local → Neon): login usuário/senha, sessão SUPERADMIN, `/api/me`, admin 200/401, cadastro público 404, logout invalida cookie, relogin, senha errada 401 | 10/10 passou |
| Google OAuth real (Chrome do proprietário, localhost): vinculação ao Superadmin, logout, login Google na mesma conta; Neon com 1 usuário e contas `credential` + `google` no mesmo ID | passou |
| Variáveis Vercel Production (CLI autenticada): DATABASE_URL(_UNPOOLED), BETTER_AUTH_SECRET/URL, NEXT_PUBLIC_APP_URL, GOOGLE_CLIENT_ID/SECRET presentes (valores sensíveis, não legíveis) | conferido (nomes) |
| Neon Object Storage (bucket, CORS, upload real) | **pendente** — 403 `SignatureDoesNotMatch` (retestado); uploads respondem 503 até corrigir a credencial no Console e cadastrar `S3_*` na Vercel |
| Testes automatizados / typecheck / lint | 56/56, OK, OK |

Banco de produção: 1 usuário (Superadmin), 0 campeonatos, nenhum seed. Deploy na Vercel ainda não executado (aguarda autorização).

## Frontend — validado em 26/10/2026 (noite)

Telas: `/` (landing), `/entrar`, `/app` (meus/públicos), `/app/novo` (assistente em 6 passos com rascunho local), `/app/t/[id]` (Jogos, Tabela, Chave, Números, Fotos, Histórico, Gestão), `/app/t/[id]/retrospectiva`, `/app/perfil`, `/app/admin`, `/convite/[token]`.
Componentes: `ParticipantAvatar` (2v2 sobreposto), `ClubBadge`, `MatchCard`, `StandingTable`, `Bracket`, `DrawAnimation`, `AuditTimeline`, `PhotoGallery`, `WinnerCelebration`/`Confetti`, `InstallAppBanner`, `StatChart`.

| Verificação | Resultado |
|---|---|
| `npm run typecheck`, `eslint .` | OK, 0 avisos |
| `npm test` | 56/56 |
| `npm run build` (produção) | OK; ícones PWA e manifest gerados |
| Navegador 375px, banco local (PGlite, seed `[TESTE]`): login usuário/senha → home → campeonato → definir clube por lado → placar 3x1 → tabela recalculada pelo servidor | passou |
| Assistente: criar mata-mata com 4 participantes → sorteio do chaveamento → sorteio de clubes com animação | passou |
| Semi + semi nos pênaltis + final (via API com a sessão do navegador) → status FINISHED, campeão exibido, retrospectiva com números corretos | passou |
| Rolagem horizontal em 360px: `/`, `/entrar`, `/app`, `/app/novo`, `/app/perfil`, `/app/t/[id]` | nenhuma |
| Bugs corrigidos nos testes: folha do placar fechava ao definir clube; folha reanimava a cada render; `champion` da API sem `players` quebrava o avatar; ordem instável dos jogos na rodada | corrigidos |

Não verificado: upload/galeria/ZIP com bucket real; instalação PWA em Android/iPhone físicos; 430px e desktop só em inspeção parcial; Google pelo botão da nova tela de login (o fluxo OAuth em si foi validado antes). Em dev, o Next mostra avisos de "instant navigation" porque a área logada aguarda `/api/me` no cliente (não afeta o build).

## Produção — publicado em 26/10/2026

URL: https://champz-six.vercel.app (projeto Vercel `champz`, deploy automático de `main`, status Ready).

| Teste em produção | Resultado |
|---|---|
| `/`, `/entrar`, `/app` | 200 |
| Manifest, `/sw.js`, ícones 192/512/maskable (PNG) | 200; service worker registrado no navegador |
| Login do Superadmin `murilo.alexandre` (Neon real) | 200; `/api/me` = SUPERADMIN, provedores senha + Google |
| `/api/admin/users`, `/api/admin/audit` com sessão / sem sessão | 200 / 401 |
| `/api/tournaments`, `/api/clubs` | 200 |
| Cadastro público | 404 |
| Logout invalida a sessão | 401 após sair |
| Início do OAuth Google: `redirect_uri` = `https://champz-six.vercel.app/api/auth/callback/google` | OK (login com conta Google não testado por mim) |
| Catálogo de clubes no Neon (seed só de clubes, sem campeonato de demonstração) | 24 clubes |
| 375px: sem rolagem horizontal, sem erros no console | OK |

Correção aplicada no deploy: `BETTER_AUTH_URL` na Vercel tinha um TAB inicial que corrompia o `redirect_uri` do Google; o código agora ignora espaços nas variáveis (`src/lib/env.ts`). Recomenda-se também limpar o valor no painel.

## Marca oficial, e-mail opcional e storage (26/10/2026, noite)

**Marca** (`branding/champz-logo-original.png` → `scripts/generate-brand-assets.mjs`, reexecutável):
- `src/app/favicon.ico` (16/32/48, símbolo da taça sem o nome, legível em tamanho pequeno), `public/icons/favicon-32.png`.
- PWA: `icon-192.png`, `icon-512.png` (logo completa em fundo escuro), `icon-maskable-192/512.png` (margem de segurança), `apple-touch-icon.png` (180, símbolo), atalho 96px.
- `src/app/opengraph-image.jpg` (1200×630), logo WebP para a UI (`public/brand/*`, 11–74 KB).
- Aplicada em: landing (cabeçalho + destaque animado), login, splash da área logada, cabeçalho da home, banner/tutorial de instalação.
- Removidos: rota de ícone gerado com "Z", SVGs do Next. `manifest`: nome Champz, ícones `?v=2`, atalhos; service worker `champz-static-v2` limpa o cache antigo.

**E-mail opcional** (sem migração; Superadmin intacto):
- Admin cria conta com nome + usuário + senha (opcional; vazia = temporária exibida uma vez) e e-mail opcional.
- O Better Auth exige `user.email` único: contas sem e-mail recebem identificador interno `<id>@sem-email.champz.invalid` (TLD reservado, não entregável). Nunca exibido (APIs devolvem `email: null`), bloqueado no login por e-mail, sem recuperação de senha, sem correspondência com Google.
- Google segue só por vínculo explícito do titular logado (`linkSocial`), e-mail do Google pode diferir.
- Teste de integração novo cobre: criar sem e-mail → login → uso sem Google → Google sem vínculo recusado → vincular → login Google na mesma conta → criar com e-mail / remover / reinformar → bloqueio e reset → Superadmin inalterado → cadastro público 404. **57/57 testes.**
- Validado no navegador (360px): formulário cria conta sem e-mail; login 200; `/api/me` com `email: null`.

**Neon Object Storage — FUNCIONANDO (26/10/2026):**
- Causa do 403 original: o secret salvo localmente tinha um caractere faltando (`SignatureDoesNotMatch` com chave reconhecida). Com o secret correto do Console, a credencial tem leitura e escrita.
- Segundo bug (nosso): a URL assinada da miniatura usava o tamanho da foto principal; o Neon valida `content-length` assinado e recusava. Agora o cliente envia `thumbByteSize` e o servidor assina com o tamanho real.
- SDK sem checksum CRC32 automático nas URLs assinadas (`requestChecksumCalculation: "WHEN_REQUIRED"`).
- Bucket privado `champz-media` (não existia; criado). CORS: `https://champz-six.vercel.app` e `http://localhost:3000`, PUT/GET/HEAD.
- `scripts/storage-check.mts`: credencial, bucket, CORS, upload assinado, HEAD, leitura assinada, anônimo negado, remoção — tudo OK.
- Fluxo no app (servidor local + Neon Storage real + banco local de teste): upload de 2 fotos pela galeria → READY → miniaturas exibidas → download individual (`response-content-disposition`) → álbum ZIP no aparelho (2 arquivos íntegros) → 2 fotos na retrospectiva → não membro 404, anônimo 401, URL sem assinatura 403. Objetos e registros de teste removidos (bucket vazio).
- Vercel Production: `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` cadastradas como sensíveis (sem `NEXT_PUBLIC_`). Valem no próximo deploy.

## Melhorias de UX e regras de clube (26/10/2026, noite) — commit local, não publicado

Verificado com: `npm run typecheck` OK, `npm run lint` OK (0 problemas), `npx vitest run` **62/62** (5 novos em `tests/integration/participants-clubs.test.ts`), `npm run build` OK. Navegador local em 375px (banco PGlite local, contas de teste locais).

- **Busca de participantes:** `GET /api/users/search?q=` (com sessão; nome, usuário ou e-mail; parcial; ignora maiúsculas e acentos; não devolve e-mail; contas bloqueadas ficam de fora). No assistente: busca dinâmica com foto, nome e @usuário; conta já adicionada aparece como "Adicionado"; duplas montadas por dois toques; convidado sem conta em opção separada, com nome normalizado. Servidor: usuário por `username` sem diferenciar maiúsculas; convidado repetido (maiúsculas/acentos/espaços) ou igual a uma conta inscrita → 409; convidado com o @usuário de uma conta existente → 409 `GUEST_IS_ACCOUNT`. Testado no navegador: "EVERS" e "joao" encontram as contas; conta repetida bloqueada; "Everson.santos" como convidado bloqueado.
- **Senha:** mínimo de 6 caracteres, sem exigir tipos de caractere (`src/lib/password-policy.ts`; Better Auth e criação pelo admin). Nova senha igual à atual → `PASSWORD_REUSED`. Formulário com confirmação e mensagens por campo: senha atual incorreta, curta, igual, confirmação diferente, limite de tentativas, sessão expirada, falha genérica. Bootstrap/reset do Superadmin por script segue exigindo 12. Testado: integração + navegador.
- **Desempate com arrastar e soltar:** `SortableList` (alça ≡ com `touch-action: none`, GSAP para elevação/deslocamento, numeração atualizada durante o gesto, setas do teclado + anúncio para leitor de tela). Testado com eventos de ponteiro de toque e teclado; ordem persistida.
- **Catálogo:** 80 clubes (`prisma/club-catalog.json`): 24 nacionais, 34 internacionais, 22 seleções; os 24 antigos mantêm o ID (upsert pelo nome). Migração `20261027000000_club_catalog_rules` (só adiciona `category`, `slug`, `crestPath` e o modo `OPPONENT_CHOICE`). Escudos: 79 em `public/crests/*.webp` (128px, ~700 KB no total), baixados por `scripts/fetch-crests.mjs` da imagem principal do artigo na Wikipédia; origem de cada arquivo em `prisma/crest-sources.json` (Wikimedia Commons ou arquivo local da Wikipédia, de uso restrito). **Escudos são marcas dos clubes/federações**: uso interno, não comercial. Sem escudo (sigla como reserva): França (artigo sem imagem). Seletor com abas Nacionais | Internacionais | Seleções, busca, marcar/desmarcar e limpar.
- **Regras de clube por fase:** `settings.clubRules = { default, phases }` (fases `GROUPS`, `KO_n`; fase sem personalização herda a padrão). Modo (sorteio, jogador, organizador, adversário) e clubes permitidos (catálogo, nacionais, internacionais, seleções, lista) são independentes. Servidor valida a lista, a viabilidade sem repetição por fase ao sortear (`CLUB_RULE_IMPOSSIBLE`), registra no histórico e bloqueia mudança em fase com partidas disputadas (`PHASE_PLAYED`). Campeonatos antigos sem `clubRules` continuam usando a configuração gravada na fase. Editável na criação e depois em Gestão → Clubes por fase.
- **Clube na partida:** cada rodada traz a regra efetiva (`round.clubRule`). Escolha pelo jogador, pelo adversário ou pelo organizador (quem tem permissão de clubes sempre pode). Valida a lista e a repetição, audita `CLUB_SET`/`CLUB_CHANGE`. O sorteio da rodada ignora partidas já encerradas. Seletor visual com escudos e "em uso". Testado: integração (semi por sorteio → final com escolha do adversário) + navegador (sorteio da rodada e troca de clube).
- **Piscadas na navegação — causa:** (1) `revealChildren` escondia e reanimava **todos** os elementos da tela a cada recarga de dados ou troca de aba; agora anima só elementos novos. (2) Cada visita refazia as buscas e voltava ao esqueleto: `useApi` passou a reaproveitar a última resposta e revalidar em segundo plano, inclusive as fases do campeonato. (3) O perfil carregado fica em memória para a área logada não voltar ao splash; é limpo no login e no logout. Medido no navegador local (5 navegações entre início, campeonato e perfil): 0 esqueletos visíveis em revisitas, menu inferior sempre presente, nenhum splash. Não foi reproduzido em produção antes da correção (exigiria login na produção).
- Service worker `champz-static-v3` também guarda os escudos estáticos.

## Publicado em 26/10/2026 (noite) — `cbeda65`

- Neon: migração `20261027000000_club_catalog_rules` aplicada (`migrate deploy`); seed só do catálogo (sem demonstração). 80 clubes (24 nacionais, 34 internacionais, 22 seleções), 79 com escudo; os 24 IDs antigos foram preservados e não há nomes duplicados. Contagens de usuários e auditoria inalteradas; não havia campeonatos.
- Vercel: deploy de produção Ready em https://champz-six.vercel.app.
- Verificado no domínio: `sw.js` em `champz-static-v3` (`must-revalidate`; cache antigo apagado na ativação), `/api/clubs` com 80 itens, escudos WebP 200, `/api/users/search` sem sessão → 401, tela de login sem erros no console, service worker ativo.
- Busca no Neon testada só com leituras (nome, usuário e e-mail encontram a conta; e-mail não é devolvido).
- Não testado em produção (exige entrar com a conta do usuário): telas logadas, inscrição duplicada, regras por fase salvas e arrastar e soltar. Cobertos pelos testes automatizados e pelo navegador local.

## Próximo passo único

Testar no celular (Chrome e app instalado): busca de participantes, arrastar e soltar, regras por fase, escolha de clubes e navegação.
