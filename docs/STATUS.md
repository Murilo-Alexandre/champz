# Champz — Status de execução

Última atualização: **26/10/2026** — backend implementado e testado localmente (Postgres local via PGlite). **Neon, Google OAuth e Object Storage reais ainda não configurados/testados.** Nada commitado.

## Backend (26/10)

- [x] **B1** Next.js 16.4 (App Router) + TS + Tailwind + ESLint, preservando `gsap`/`echarts`. Prisma 7.10 (`prisma.config.ts`, adapter `pg`), migração versionada `prisma/migrations/20261026000000_init`, Better Auth 1.7 self-hosted (e-mail/senha + username; Google preparado), `.env.example`, seed.
- [x] **B2** Campeonato (LEAGUE/GROUPS_ONLY/KNOCKOUT/GROUPS_KNOCKOUT), entradas 1v1/2v2 (usuário ou convidado sem conta), grupos/rodadas round-robin (folga p/ N ímpar, ida e volta), placar, classificação no servidor.
- [x] **B3** Mata-mata com BYEs e avanço automático, classificados top N + K melhores sem duplicata, seeding com prevenção de reencontro do mesmo grupo, confrontos manuais validados, pênaltis/decisão manual, W.O. configurável, bônus de melhor saldo, desempates configuráveis + ordem manual, clubes por partida/fase (sorteio, escolha, manual, repetição on/off), permissões granulares, audit log append-only (trigger no banco), versão otimista, bloqueio de correção com impacto.
- [~] **B4** Fotos: adapter S3 (Neon Object Storage) + upload presigned + confirmação + galeria/URL assinada/moderação **testados com storage em memória**; **não testado com bucket real** (sem credenciais). APIs de estatísticas e retrospectiva prontas.

## Frontend (27/10)

- [ ] F1 fluxo completo das telas mobile-first
- [ ] F2 GSAP/ScrollTrigger/ScrollSmoother/ECharts
- [ ] F3 galeria, câmera, ZIP, slideshow/campeão
- [ ] F4 PWA Android/iPhone, build e deploy preparado

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

## Próximo passo único

Executar `/champz-frontend` (27/10) consumindo estas APIs; em paralelo, o proprietário provisiona Neon/Google/bucket para validar integrações reais.
