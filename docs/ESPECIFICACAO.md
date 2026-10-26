# Champz — Especificação funcional enxuta

**Versão:** MVP 26–27/10/2026. **Produto:** campeonatos entre amigos, mobile-first, web/PWA, esportes extensíveis; primeiro módulo FIFA (futebol eletrônico). Idioma inicial pt-BR. Data/hora exibida conforme fuso do usuário, default Brasil.

## 1. Identidade, organização e permissões

- Usuário com perfil, nome, nome de usuário exclusivo, email, avatar, histórico de participações e títulos. Login Google e email/usuário + senha. Recuperação de senha com confirmação por email (caso provedor de email não esteja configurado no MVP, marcar pendência clara, nunca inventar envio).
- Ao criar campeonato, usuário vira OWNER e pode delegar administradores. Participante vinculado ao campeonato recebe **RESULT_EDIT=true por padrão**, conforme decisão do produto, além de upload de fotos; pode ser desativado individualmente a qualquer momento. Somente OWNER/admin autorizado pode dar ou retirar permissões. Preferir permissões granulares.
- Usuários podem ver campeonatos a que têm acesso; escolher opção público/listado ou privado/invite na criação. Se privado, proteger não somente UI, mas API, fotos, membros e logs. Convite por link com expiração opcional.
- Toda alteração relevante tem log imutável: autor, data, entidade, ação, antes/depois, anexos e motivo opcional. Ícone de histórico junto de partida, configuração, time, grupo e chaves. Fotografia serve como comprovante; não sobrescrever arquivo original por novos uploads.
- Auditoria e eventos administrativos devem ser legíveis pelos participantes autorizados; nunca permitir adulterar log via interface/API.

## 2. Campeonato

- Campos: nome (ex.: `1º Campeonato de FIFA`), modalidade, edição/ano, capa, descrição, data, status DRAFT/OPEN/ACTIVE/FINISHED/CANCELLED, configuração e regulamento versionado.
- Formatos: `LEAGUE` (pontos corridos), `GROUPS_ONLY`, `KNOCKOUT`, `GROUPS_KNOCKOUT`. Num grupo, round-robin de turno único inicial e opção return leg/ida e volta. Mata-mata 1 partida padrão, permitir opção de ida e volta **se concluível sem atrasar núcleo**.
- Wizard define participantes (1v1/2v2), distribuição manual ou sorteada, quantidade de grupos e partidas, classificados por grupo, melhores terceiros/colocados, sequência de fases e chaveamento. Possibilidade de duas metades visuais da mesma chave (esquerda/direita) que se encontram na final; não confundir com dupla eliminação.
- Qualquer quantidade válida de competidores: 2 -> final; 3 -> grupo triangular ou semi com BYE e final; não criar competidor fantasma; usar BYE apenas como avanço automático, com regras explícitas.
- O sorteio deve aceitar reexecução em rascunho, modo manual e limites/impedimentos. Sorteio publicado gera log e resultado reprodutível para auditoria. Se houver partida concluída, reembaralhamento só com confirmação do impacto e controle transacional.
- Abandono/desistência: desativar a entrada da fase seguinte ou registrar W.O. conforme regulamento, nunca apagar histórico ou resultados passados. Entrada tardia/substituição apenas enquanto permitida e registrada.

## 3. Entradas e clubes (diferença crucial)

- `Entry`: unidade competitiva: um usuário (1v1) ou uma dupla de exatamente dois usuários (2v2). Perfis continuam individuais; estatísticas e placares do campeonato pertencem à `Entry`.
- `Club`: clube usado dentro do FIFA (Real Madrid, Arsenal etc), com nome, escudo, classificação/estrelas opcionais, ativo/inativo. CRUD de clubes com autorização.
- Cada fase/rodada/partida define `clubAssignmentMode` = RANDOM/PLAYER_CHOICE/MANUAL e `allowedClubIds`. Pode permitir ou proibir repetição de clube. Configuração de fase é herdada pela partida, com overrides rastreáveis.
- O clube é salvo **por lado de partida**, e pode mudar a cada rodada. Se nenhuma escolha foi feita ainda, exibir `A definir`, nunca presumir clube fixo do usuário.
- Sorteios e escolha manual devem funcionar com listas variáveis por fase: ex. 20 clubes nos grupos, 10 nas quartas, livre na semifinal/final.

## 4. Jogos, pontuação e classificações

- Partida: rodada, fase, entradas, placar inteiro não negativo (quando final), clubes, status `SCHEDULED`, `READY`, `COMPLETED`, `WALKOVER`, `CANCELLED` ou `BYE`, data, autor e comprovantes.
- Vitória/empate/derrota: pontos configuráveis (default 3/1/0); saldo = gols pró − gols contra. Jogos, vitórias, empates, derrotas, gols pró, gols contra, saldo e pontos calculados no servidor a partir dos resultados válidos.
- Desempates com ordem configurável: pontos, número de vitórias, saldo, gols pró, confronto direto (se resultados suficientes), fair play/sorteio/decisão manual. Para classificação final empatada sem critério resolutivo: pedir desempate/regras, nunca usar ordem aleatória invisível.
- Bônus de pontuação: catálogo restrito de regras configuráveis, começando por bônus ao melhor SG de grupo após fechamento. Configurar quando se aplica, valor, e como resolver empate na liderança; bônus separado de pontos básicos no armazenamento/cálculo.
- W.O./no-show com configuração explícita para cada lado: placar administrativo (ou nenhum), pontos creditados ao presente e ausente, estatísticas contabilizadas sim/não, avanço na chave. Exibir badge e motivo. Evitar placares impossíveis e double count.
- Mata-mata pode ter disputa de pênaltis, prorrogação ou escolha administrativa do avançante em caso de empate. Não avançar com placar empatado sem regra/tiebreaker definida.
- Qualificam top N de cada grupo e K melhores posições remanescentes. Ranqueamento geral usa critérios comuns e valida unicidade. Configuração de seeding (melhor geral vs pior classificado / cruzamentos fixos / manual), evitar reencontro de grupo se possível.
- Progressão de fase gera vagas e confrontos **uma vez**; correção posterior de placar que altere classificado exige aviso, reprocessamento seguro e revisão de partidas futuras afetadas.

## 5. Estatísticas e ranking (calculadas, não inventadas)

- Por campeonato: tabela, SG, J, V, E, D, GP, GC, pontos, aproveitamento, melhor ataque (GP), melhor defesa (menor GC, observando jogos disputados), maior goleada, jogos com mais gols, melhor campanha, vitórias seguidas, invencibilidade.
- Por participante/dupla/edição: jogos disputados, gols, pontos, confrontos diretos, posições, títulos, vice e pódio. Em 2v2 discriminar histórico da dupla e do usuário; não atribuir gols individuais sem dado de autoria.
- Para LEAGUE/pontos corridos, ECharts mostra evolução das posições/pontos por rodada. Todas as estatísticas vêm de consultas/serviços reais e devem mostrar critério e amostra.

## 6. Fotos, galeria e retrospectiva

- Participantes autorizados enviam fotos via galeria de dispositivo ou câmera diretamente pelo app mobile. Foto associa-se ao campeonato e, opcionalmente, fase/rodada/partida, ou serve de prova de resultado. Metadados incluem autor, tipo, horário, tamanho, original e thumbnail.
- Galeria acessível a quem tem direito no campeonato; filtrar por fase/jogo/autor; preview, baixar uma foto ou álbum ZIP gerado no cliente, com limite de volume para evitar travamentos. Administradores podem ocultar fotos indevidas; manter log de moderação. Informar aos participantes que fotos serão compartilhadas com membros do campeonato; consentimento e remoção sob política clara.
- Para não estourar tier grátis: compressão no cliente, limites configuráveis (padrão recomendado ~3–5MB de upload original após otimização e ~1600–2000px lado maior), thumbnails e cota por campeonato. Não afirmar quantas fotos cabem sem medir. Não guardar bytes no Postgres nem `/public` do deploy.
- Campeonato FINISHED libera retrospectiva em slides full-screen: capa, participantes, melhores jogos, recordes, fotos cronológicas, estatísticas, campeão + partículas/confetes, encerramento. GSAP com controles `pausar`, `avançar`, `voltar`; fotos baixáveis. Renderizar em browser, não exigir MP4 no MVP.

## 7. PWA e UX

- Mobile-first de verdade, com uso natural no Android Chrome e iOS Safari. `manifest` com ícones de 192 e 512, maskable, standalone e HTTPS. Botão contextual `Instalar Champz` quando navegador suporta prompt; no iPhone, guia curto `Compartilhar > Adicionar à Tela de Início`.
- App shell estático pode ter caching seguro; **sem operações de edição offline** no MVP. Não salvar dados/fotos privados em caches públicos.
- Dashboard e microinterações muito animadas: GSAP, ScrollTrigger, ScrollSmoother em momentos apropriados, ECharts e comemoração com partículas. `prefers-reduced-motion` e desempenho do touch prevalecem sobre efeito visual.

## 8. Escopo e limites de prazo

**Obrigatório para primeira versão (27/10):** autenticação local e Google configurável, campeonato FIFA 1v1, 2v2 básico, participantes, grupos, liga, mata-mata, sorteios, clubes por jogo, placar/W.O., tabelas, permissões, logs, upload/galeria, slideshow simples, PWA instalável, deploy pronto.

**Prioridade após core, sem bloquear a publicação se prazo apertar:** editor visual de regras de bônus muito complexas, temporadas/ranking cruzado avançado, convites públicos completos, motor genérico de novos esportes, vídeos/MP4 da retrospectiva, realtime, notificações push, múltiplos níveis de administradores, importação automatizada de WhatsApp, algoritmos de chaveamento sofisticados de todas as federações. Se algo de escopo obrigatório não estiver concluído, marcar explicitamente como pendência, não esconder.
