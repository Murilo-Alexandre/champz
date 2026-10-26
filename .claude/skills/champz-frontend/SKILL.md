---
name: champz-frontend
description: Implementa UI mobile-first altamente animada, dashboards ECharts, chaveamentos, sorteios, galeria, retrospectiva e instalação PWA do Champz. Use ao criar ou refinar telas, transições e usabilidade do frontend do projeto.
---

# Champz Frontend — 27/10/2026

Leia `CLAUDE.md`, `docs/ESPECIFICACAO.md`, `docs/ARQUITETURA.md`, `docs/PLANO.md`, `docs/STATUS.md`. **Usar APIs reais; não redesenhar backend sem necessidade.**

## Identidade e direção

- **Mobile-first obrigatório**. Principal referência: smartphone de 360–430px. Depois ajustar tablet e desktop. Área de toque >= 44px, safe areas iPhone, teclado não obstruir formulário, bottom navigation compacta.
- Visual esportivo premium, moderno, dinâmico e consistente. Dar sensação de videogame/torneio, mas sem poluição visual que atrapalhe consultar placares.
- UX altamente animada em **todas as interações relevantes**: entrada de telas, tabs, modais, menus, mudanças de resultado, cards, tabelas, progressão de fase, sorteios, foto do campeão, confete, partículas e retrospectiva.
- Usar GSAP `useGSAP`/scoped context e cleanup; `ScrollTrigger` para reveals/estatísticas; `ScrollSmoother` somente nos trechos em que faz sentido. Em touch manter smoothTouch desativado ou muito leve, jamais quebrar scroll nativo, modais, fixed elements ou PWA.
- ECharts para classificação visual, ranking, melhor ataque/defesa, gols pró/contra, saldo, aproveitamento, sequência e placares, com animações de atualização. Montar só métricas matematicamente deriváveis de dados válidos; sem métricas inventadas. Lazy load dos gráficos e plugins pesados.
- Criar componentes reutilizáveis: `ParticipantAvatar`, `ClubBadge`, `MatchCard`, `StandingTable`, `Bracket`, `DrawAnimation`, `AuditTimeline`, `PhotoGallery`, `WinnerCelebration`, `InstallAppBanner`, `StatChart`.
- Fotos dos participantes e escudos dos clubes aparecem juntos nos confrontos quando clube foi definido. Usar tratamento visual apropriado para 2v2.

## Fluxos completos

1. Landing curta, login por usuário/e-mail e senha + Google, cadastro, completar perfil com avatar.
2. Home com meus campeonatos, criar, entrar como convidado/participante quando autorizado; destaque para jogos pendentes e campeonatos ativos.
3. Wizard de criação em etapas curtas: dados -> participantes/duplas -> formato/grupos/qualificações -> regras/W.O./pontos -> times/fases -> revisão e publicar. Salvar rascunho.
4. Sorteio e edição manual de grupos/chaves e de clubes; UX transparente para restrições, sorteio já realizado e impacto de reconfiguração.
5. Grupos, rodadas, confronto, placar, classificação, mata-mata e progressão automática, inclusive LEAGUE (pontos corridos). Fotos e audit-log acessíveis no contexto de cada resultado.
6. Galeria: selecionar arquivo ou câmera (`accept="image/*"`, `capture` opcional), múltiplos uploads, preview, associação à partida/fase/campeonato, download individual e download de álbum/ZIP no cliente com limite razoável e progresso; não colocar processamento de ZIP grande na função Vercel.
7. Tela de campeão e retrospectiva automatizada por slides: fotos, participantes, placares marcantes, rankings, campeão, confete/partículas. Apresentar em fullscreen, pausar/avançar/voltar, acesso após fim; downloads das fotos liberados conforme permissão.
8. Perfil/histórico de títulos e estatísticas por edição (somente métricas corretas) e telas de gestão de permissões pelo admin.

## PWA: requisito bloqueante para entrega

- Criar `app/manifest.ts` ou equivalente, com `name: Champz`, `short_name: Champz`, `display: standalone`, `start_url`, tema, `icons` 192/512 e maskable.
- Servir HTTPS em produção; service worker **mínimo e seguro**, sem cache persistente de respostas de API privadas, fotos privadas ou dados de autenticação. App instalável mesmo que inicialmente apenas shell/arquivos estáticos tenham offline.
- Mostrar botão **Instalar Champz** no onboarding/perfil/configurações em Android/Chromium **quando `beforeinstallprompt` estiver disponível**, acionado por clique; não prometer prompt universal. Se instalada, ocultar chamada.
- iOS Safari: instrução visual em pt-BR `Compartilhar -> Adicionar à Tela de Início`, pois não há `beforeinstallprompt` compatível. Exibir tutorial mesmo sem evento de instalação. iOS outros navegadores podem variar.
- Ícone bonito, splash/theme coerentes, app standalone sem barra do navegador quando instalado; testar Android e iPhone reais ou documentar impossibilidade de testar.

## Performance sem abrir mão da estética

- Animações com transform/opacity, budgets de partículas; `prefers-reduced-motion` respeitado; evitar dezenas de timelines simultâneas; só animar charts visíveis.
- Layout shifts mínimos, webp/avif responsivos, blur placeholder, avatares/escudos com fallback, loading/empty/error states animados.
- Testar navegabilidade em 360px, 390px, 430px e desktop; nada cortado, scroll horizontal indevido ou tabela ilegível.
- Segurança de UI: nunca assumir que esconder botão é autorização. Permissão do backend é a fonte da verdade.

## Entregas e validação

Fluxo feliz: login -> criar FIFA -> adicionar 12 -> grupos -> clube por jogo -> lançar placar -> tabela -> quartas -> campeão -> galeria -> slideshow -> instalar PWA. `npm run build`, typecheck, lint e testes. Deixar explicitamente registrado no `docs/STATUS.md` o que está funcionando de verdade. Não publicar sem ordem.
