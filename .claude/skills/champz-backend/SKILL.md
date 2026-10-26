---
name: champz-backend
description: Implementa o backend do Champz, seus modelos, autenticação, regras de FIFA, grupos, mata-mata, APIs, logs, permissões, fotos e testes. Use ao construir ou corrigir lógica do servidor e banco do projeto Champz.
---

# Champz Backend — 26/10/2026

Leia `CLAUDE.md`, `docs/ESPECIFICACAO.md`, `docs/ARQUITETURA.md`, `docs/PLANO.md` e `docs/TESTES.md`. O objetivo é o backend funcional de um app de campeonatos até o fim do dia; não faça semanas de arquitetura.

## Modo de trabalho

1. Inspecione rapidamente `git status`, `package.json` e estrutura de pastas. Respeite o projeto existente (Claude já pode ter instalado `gsap` e `echarts`). Se só houver npm básico, configure Next.js App Router, Tailwind, TypeScript e ESLint sem perder dependências nem reinicializar `.git`.
2. Implemente a **primeira fatia ponta a ponta**: auth -> campeonato -> entrada de participantes -> grupos/rodadas -> partida -> resultado -> tabela. Depois expanda com mata-mata, regras, auditoria, fotos e controles.
3. Use migrações Prisma versionadas; conexão Neon pooled no runtime e direct para migração, conforme versão Prisma efetivamente instalada. Nunca `db push` destrutivo em produção.
4. Use Better Auth **self-hosted** com Prisma, `username` plugin, login por email ou nome de usuário e Google OAuth. Identidade única; vinculação de provedores somente de forma verificada/segura. Quem entra pelo Google deve poder escolher um nome de usuário. Proteja sessões, CSRF e permissões.
5. Não criar APIs sem checar sessão, vínculo com campeonato e direito de escrita. Criador vira OWNER; novos participantes vêm com permissão de inserir/editar placares **ativada**, mas não podem alterar regras/roles, salvo delegação explícita. Permissões separadas (`RESULT_EDIT`, `TEAM_EDIT`, `DRAW_EDIT`, `RULE_EDIT`, `MEDIA_UPLOAD`, `MANAGE_MEMBERS`). Mudanças sensíveis sempre auditadas.
6. Nunca gravar placar sem identificar o autor. Registre histórico append-only: antes/depois, entidade, ação, autor, data, motivo quando necessário e referências de anexos. Não dar endpoint de apagar auditoria.
7. Roda geração/sorteio/avanço de fase no servidor; transação onde necessário; evite sorteios/avanços duplicados. Persistir seed/resultado dos sorteios e ordem dos participantes; edição posterior cria auditoria.
8. Estabeleça adaptador para Neon Object Storage S3 compatível. Bucket de fotos/comprovantes **privado**, nomes aleatórios e URLs temporárias. Validar tipo, tamanho e autorização; usar upload direto com URL assinada para evitar limites da Vercel. Salvar metadados PostgreSQL. Implementar fluxo de foto pela câmera/galeria no frontend depois; no backend suportar origem/associação à competição, fase, rodada, partida e profile.
9. Testes automatizados sobre matemática, ordenação, tiebreakers, classificações, W.O., brackets, 2v2, número ímpar, permissão e histórico; `npm run typecheck`, lint e testes; adicionar scripts necessários.

## Regra de negócio do MVP

- Campeonato suporta GROUPS_KNOCKOUT, GROUPS_ONLY, KNOCKOUT, LEAGUE. Fases sequenciais. Para knockout: uma árvore com lados A/B como configuração visual; **não** implementar eliminação dupla sem pedido explícito.
- Participantes: um perfil individual ou uma dupla formada por dois usuários. Oponente é sempre um `entry`, não uma pessoa solta. Toda pontuação de competição referida a `entryId`.
- Cada partida tem `homeEntryId`, `awayEntryId`, eventual BYE, `homeScore`, `awayScore`, status, clube escolhido de cada lado e prova opcional. `team` (dupla) ≠ `club` (Real Madrid no FIFA).
- Com grupos: aplicar round-robin, qualquer N >= 2; número ímpar recebe folga por rodada. Classificação: pontos, saldo, gols pró e desempates em ordem editável; persistir regras da competição e versões quando mudam.
- Vitória/empate/derrota com pontos ajustáveis. Bônus configuráveis **pré-definidos e seguros**, não execução arbitrária de código. Exemplo: +1 para maior saldo ao fechar grupo; empates na liderança devem ter política definida (todos / desempate / ninguém).
- W.O.: resultado administrativo independente do placar normal; definir em regulamento pontos de cada lado, placar simbólico e impacto em estatísticas. Empate em eliminatória requer política de prorrogação/pênaltis/decisão manual, nunca avançar por saldo arbitrário.
- Classificados: top N de cada grupo + K melhores posições seguintes; seleção consistente e sem repetição. Seed geral e seeding customizável com restrições; brackets com BYEs para potências de dois e prevenção opcional de reencontro da mesma chave quando possível; impossível => explicar e solicitar decisão, não gerar duplicatas.
- Sorteios: clubes permitidos por fase, ou por partida, fixados/selecionados pelo jogador ou sorteados. Repetição de clubes permitida conforme configuração. Registrar clube em **cada lado de cada partida**; muda por rodada.
- Durante campeonato, mudanças em chaveamento/formato com resultados têm prevenção de impacto e reconfirmação administrativa; fazer transação e auditoria; não sobrescrever placares silenciosamente.
- Sem presença ou desistência: registrar motivo, quem foi afetado, quem avançou e aplicação da regra definida. Não excluir jogadores retroativamente.

## Ordem de implementação

1. Next.js/config e banco/Prisma/seed + auth (local e Google preparado).
2. Campeonato, papel/permissões, entradas 1v1/2v2, grupos, rodadas, resultado e classificação.
3. Mata-mata, sorteios, times por partida/fase, W.O., desempates, auditoria.
4. Fotos, uploads e APIs de galeria/retrospectiva; testes de integração.

Se Google/Neon requerer configuração humana, não interrompa toda a entrega: faça `.env.example`, métodos e fluxo preparados, com instrução mínima e clara. Não simule sucesso de integração não testada. Não faça push.

## Condição de aceitação

Execute os cenários de `docs/TESTES.md`. Um campeonato real de 12 pessoas com 3 grupos de 4 tem exatamente 18 jogos e classificação coerente; o serviço não duplica participantes nas quartas; 3 participantes organizam torneio válido; um participante desautorizado não consegue editar placar mesmo chamando API diretamente. Registre o que foi realmente aprovado em `docs/STATUS.md`.
