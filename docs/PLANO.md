# Champz — Plano de execução em 2 dias

## Meta

**Segunda, 26/10/2026: BACKEND**. **Terça, 27/10/2026: FRONTEND + PWA + validação/publicação preparada**. Objetivo: software utilizável entre amigos; evitar planejamento eterno. Não prometer acabamento de produto maduro em 48h — cortar polimento secundário se necessário, sem ocultar falhas.

## Hoje — 26/10: backend

- [ ] **B1 Fundação curta**: verificar projeto, estruturar Next.js/TS, Prisma, Neon, env example, migrations, usuário/Google+username/senha preparado. *Pronto quando*: app inicia, banco conecta, sessão e proteção básica passam em teste.
- [ ] **B2 Núcleo jogável**: campeonato, participantes e duplas, formatos (liga/grupos/mata-mata), grupos/rodadas, placares, pontos/saldo/classificação. *Pronto quando*: campeonato real de 12/3x4 gera 18 jogos e tabela correta.
- [ ] **B3 Regras e integridade**: sorteios/manual, clubes por fase e partida, BYEs/3 participantes, classificações/oitavas/quartas, W.O./desistência, permissão, audit log. *Pronto quando*: não duplica qualificado, previne writes não autorizados, guarda histórico.
- [ ] **B4 Fotos + contratos**: bucket privado/presigned upload, metadados, leitura autorizada, APIs para galeria e retrospectiva, fixtures e testes. *Pronto quando*: upload/listagem/download funcionam ou pendência de provisionamento externo está explicitada.

**No fim do dia:** banco/schema, rotas e funções puras prontas, testes de cálculo e API, `docs/STATUS.md` atualizado; não passar o dia criando UI.

## Amanhã — 27/10: frontend

- [ ] **F1 Interfaces funcionais**: login, home, wizard criação, participantes/duplas, grupos e tabela, jogos, edição com log, gestão de membros. UI real mobile-first.
- [ ] **F2 Experiência animada**: GSAP/ScrollTrigger/ScrollSmoother, sorteios/transições, brackets animados, ECharts estatísticas e pontos corridos, campeão com confete.
- [ ] **F3 Fotos e espetáculo**: câmera/galeria, timeline, comprovantes, downloads, ZIP no cliente, retrospectiva/slideshow com foto do vencedor.
- [ ] **F4 PWA, testes, implantação**: ícones/manifest/SW, instalar Android/guia iPhone, fluxos E2E essenciais, build e deploy preparado; publicar somente com autorização do dono do repo.

## Definição de pronto — mínima e objetiva

1. Um usuário cadastra, entra com usuário/senha; Google funciona **depois de credenciais configuradas e verificadas**.
2. Cria FIFA 2026, adiciona 12 jogadores, 3 grupos x 4, obtém 18 partidas, registra resultados e vê classificações corretas.
3. Constrói quartas com **8 entradas únicas**, avança até final e identifica campeão; suporta também liga/pontos corridos e um torneio de 3 com BYE ou triangular.
4. Modo dupla funciona; clube por partida pode variar; config de pontos/W.O. aplica corretamente.
5. Resultado tem histórico permanente e permissões são respeitadas na API; fotos sob controle de acesso.
6. App funciona bem no celular; animações GSAP/ECharts visíveis, retrospectiva exibível, PWA instalável (Android suportado) e guia no iPhone.
7. `typecheck`, testes core e build sem erros; URLs e features não testadas são declaradas pendentes.

## Corte de escopo quando necessário (para não atrasar tudo)

- Priorizar **correção matemática e segurança dos placares** > variedade de efeitos especiais.
- Entregar gallery com slideshow básico antes de montar exportação de vídeo.
- Implementar catálogo de bônus conhecidos (não engine de fórmulas arbitrárias).
- Fazer 1 sport bem implementado (FIFA) + coluna/contrato para outros esportes; nada de módulos de vôlei e tênis hoje.
- Não construir pagamentos, mensageria, push, realtime, microserviços, painel superadmin global ou recursos desnecessários.
- Dependências/credenciais externas ausentes são pendências de infraestrutura, não motivo para abandonar todo o backend.

## Ritual mínimo de acompanhamento

A cada bloco terminado, atualizar `docs/STATUS.md` com ✅ comprovado, ⏳ restante e ⚠️ bloqueios. Não fazer cronograma minuto a minuto, não pedir aprovação de cada classe, não abrir dezenas de tickets.
