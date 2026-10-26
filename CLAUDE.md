# Champz — instruções permanentes de desenvolvimento

**Projeto:** Champz | `Murilo-Alexandre/Champz` | app de campeonatos internos, FIFA primeiro, extensível para outros esportes.

## Missão e ritmo

- Hoje, **26/10/2026**, implementar e testar o **backend**. Amanhã, **27/10/2026**, construir **frontend, animações, PWA e preparar publicação**.
- Agir no código após uma inspeção **curta e objetiva** do estado real. Não transformar o projeto em planejamento infinito. Não elaborar documentos extras ou auditorias extensas. Não iniciar várias novas frentes sem terminar uma vertical funcional.
- Priorização: (1) usuário cria campeonato; (2) registra/sorteia participantes e grupos ou mata-mata; (3) lança placares; (4) tabela, classificação e fases calculadas; (5) permissão e log; (6) fotos; (7) UI/PWA/retrospectiva. Avançados sem acabar podem ficar explicitamente anotados no status.
- Sempre implementar validação **no servidor**, nunca confiar em permissões, pontos ou vencedores calculados pelo frontend.
- No início de cada sessão ler `docs/STATUS.md` e as partes relevantes de `docs/ESPECIFICACAO.md` e `docs/ARQUITETURA.md`; atualizar `docs/STATUS.md` somente com fatos testados.
- **Não afirmar concluído** com base apenas em código escrito; mostrar comandos e resultados de testes/build. Não inventar execução de testes nem funcionalidades não verificadas.
- Não incluir segredos, credenciais, fotos reais de pessoas nem `.env` no Git. Não fazer commit, push nem deploy de produção sem solicitação explícita do usuário.

## Skills disponíveis

- `/champz-backend` — modelos, migrações, serviços, auth, sorteios, APIs, logs, fotos, testes.
- `/champz-frontend` — Next.js mobile-first, GSAP, ECharts, PWA, galeria e retrospectiva.
- `/champz-deploy` — testes finais, Neon/Vercel gratuito, upload e instalação Android/iOS.

## Padrões

- Uma única aplicação Next.js/TypeScript (App Router); `src/lib` e `src/server` contêm regras/serviços. Prisma + PostgreSQL Neon. Auth: **Better Auth hospedado no Next.js**, com plugin username, email/senha + Google OAuth. Usar Neon para DB e Object Storage; **não instalar simultaneamente Neon Managed Auth** (duas fontes de identidade).
- Código e nomes técnicos em inglês; interface, mensagens e documentação de produto em português brasileiro.
- Para FIFA, preferir lógica explícita e testável a um interpretador genérico de regras/esportes. Dados com `sport` para expansão futura, mas implementar só futebol eletrônico agora.
- Não adicionar Redux, microserviços, filas, WebSocket, GraphQL, Docker obrigatório ou design system externo grande sem necessidade demonstrável.
- Auth restrita: sem cadastro público; Google só para contas já vinculadas; papéis globais SUPERADMIN (único, protegido) / ADMIN / USER, separados das permissões de campeonato. Regras em `docs/ARQUITETURA.md`.
- GSAP, ScrollTrigger, ScrollSmoother, ECharts obrigatórios na UX, mas sem prejudicar acessibilidade/performance mobile.
- Não exibir telas fake como concluídas; usar dados de banco real ou indicar claramente se são seeds de teste.
