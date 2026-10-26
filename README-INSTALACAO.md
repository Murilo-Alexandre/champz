# Champz — Kit de skills e execução (26–27/10/2026)

**Este pacote contém SOMENTE orientações para o Claude Code; não altera o aplicativo, instala dependências, acessa o GitHub ou faz deploy.** É seguro extrair por cima da pasta do repositório: não inclui `package.json`, código, `.git` ou `.env`.

## Pasta do projeto

Repositório: `https://github.com/Murilo-Alexandre/Champz`

Caminho esperado: `C:\dev\Champz`. Você executou clone para `Champz` e `champz`: em instalações Windows comuns, esses nomes podem apontar para a mesma pasta. Confirme a pasta existente e o remoto antes de extrair. **Não reclone nem reinicialize o Git desnecessariamente**.

## Instalação pelo PowerShell

1. Baixe `Champz_Kit_Skills_e_Plano.zip`.
2. No PowerShell, partindo da pasta Downloads (ajuste o caminho se necessário):

```powershell
Get-ChildItem C:\dev -Directory | Where-Object Name -match '^champz$'
Set-Location C:\dev\Champz
Get-Location
Git remote -v
Git status --short
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\Champz_Kit_Skills_e_Plano.zip" -DestinationPath . -Force
Get-ChildItem .claude\skills -Recurse -Filter SKILL.md
```

Se o ZIP estiver em outro lugar, ajuste somente o caminho após `-LiteralPath`. Se `Champz` não existir, localize a pasta correta; não faça checkout em lugar errado. Como o repositório estava vazio, o Claude deve inspecionar a instalação anterior de `gsap` e `echarts` e inicializar Next.js **sem sobrescrever trabalho existente**.

3. Abra essa pasta no Claude Code/Desktop com acesso ao workspace. Claude Code reconhece `.claude/skills/<nome>/SKILL.md`.
4. Cole o primeiro prompt da seção abaixo.

## Prompts prontos

### HOJE — backend (26/10/2026)

> Abra `CLAUDE.md`, `docs/PLANO.md`, `docs/ESPECIFICACAO.md`, `docs/ARQUITETURA.md` e aplique a skill `/champz-backend`. O repositório `C:\dev\Champz` está praticamente vazio; já podem existir pacotes GSAP e ECharts instalados. **Comece a implementar agora**, sem auditoria prolongada nem pedir aprovações a cada etapa. Prioridade: banco, autenticação, perfis, grupos, rodadas, partidas, pontuação, W.O., chaveamento, times por jogo/fase, permissões, audit logs e upload de fotos. Entregue backend funcional com testes e APIs, sem UI sofisticada. Atualize `docs/STATUS.md` ao concluir cada bloco. Se faltarem credenciais do Neon ou Google, implemente os adapters e `.env.example`, valide o máximo possível localmente e liste precisamente só o que eu devo configurar. Não faça push ou deploy sem meu pedido.

### AMANHÃ — frontend (27/10/2026)

> Leia `CLAUDE.md`, `docs/STATUS.md`, `docs/ESPECIFICACAO.md`, `docs/ARQUITETURA.md` e aplique `/champz-frontend`. Use o backend real: nenhuma tela mockada como funcional. Produza um PWA mobile-first impecável, com GSAP, ScrollTrigger, ScrollSmoother quando apropriado, ECharts, sorteios, transições, galeria e retrospectiva do campeão. Faça Android/iPhone conseguirem instalar o app facilmente. Valide fluxos e prepare produção via `/champz-deploy` sem publicar sem autorização.

## Arquivos do pacote

- `CLAUDE.md` — regra mestre curta, lida no projeto.
- `.claude/skills/champz-backend/SKILL.md` — execução de backend.
- `.claude/skills/champz-frontend/SKILL.md` — UI, animação e PWA.
- `.claude/skills/champz-deploy/SKILL.md` — validação e hospedagem grátis.
- `docs/ESPECIFICACAO.md` — funcionalidades e regras do produto.
- `docs/ARQUITETURA.md` — stack, entidades, segurança e hospedagem.
- `docs/PLANO.md` — plano enxuto de dois dias.
- `docs/TESTES.md` — homologação com o campeonato real.
- `docs/STATUS.md` — progresso breve e persistente.

## Regras de tempo

Objetivo: primeira versão utilizável até **27/10/2026**, não perfeição absoluta. Não prometer que tudo caberá no prazo sem testar. Implementar o núcleo primeiro e registrar melhorias posteriores sem bloquear o deploy.
