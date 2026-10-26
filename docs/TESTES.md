# Champz — Cenários de teste indispensáveis

## Campeonato de homologação FIFA 2026 — dados finais confirmáveis

**Grupos da configuração mais recente de domingo 25/10/2026:**

- A: Everson, Murilo, Bruno, Jailton
- B: Gabriel, Felipe, Miguel, Alan
- C: Danilo, Guilherme, Igor, Pedro

A conversa registra versões mais antigas dos grupos (João Pedro em vez de Guilherme; Pedro no B etc.). **Usar a composição final acima**, mantendo alterações em logs de teste quando simuladas. Não misturar resultados das versões antigas com a nova.

**Rodada 1 (seis jogos):**

- Everson 2 x 0 Jailton
- Gabriel 6 x 1 Alan
- Danilo 7 x 0 Pedro
- Murilo 5 x 0 Bruno
- Miguel 7 x 0 Felipe
- Igor 8 x 2 Guilherme

**Rodada 2 (seis jogos):**

- Everson 6 x 0 Bruno
- Gabriel 3 x 5 Miguel
- Danilo 3 x 3 Igor
- Murilo 2 x 1 Jailton
- Guilherme 2 x 3 Pedro
- Felipe x Alan: aparece como `1 x 0` numa versão e `1 x [faltante]` na última mensagem. **Não inferir placar definitivo sem confirmar; teste pode fixar explicitamente 1x0 como fixture hipotética/versão anterior e rotular.**

**Rodada 3 (seis jogos, pendentes):**

- Everson x Murilo
- Gabriel x Felipe
- Danilo x Guilherme
- Bruno x Jailton
- Miguel x Alan
- Igor x Pedro

**Esperado:** 3 grupos x 4 => **18 jogos** em 3 rodadas, 6 jogos por rodada. Rodada 1 e 2 parcial => classificações:

Grupo A:
- Everson: J2, SG +8, 6 pontos
- Murilo: J2, SG +6, 6 pontos
- Jailton: J2, SG -3, 0 pontos
- Bruno: J2, SG -11, 0 pontos

Grupo C:
- Danilo: J2, SG +7, 4 pontos
- Igor: J2, SG +6, 4 pontos
- Pedro: J2, SG -6, 3 pontos
- Guilherme: J2, SG -7, 0 pontos

Grupo B, **somente se** o teste fixar Felipe 1 x 0 Alan:
- Miguel: J2, SG +9, 6 pontos
- Gabriel: J2, SG +3, 3 pontos
- Felipe: J2, SG -6, 3 pontos
- Alan: J2, SG -6, 0 pontos

## Testes de regressão críticos

1. Round-robin: N=3, N=4, N=5, N=12; confrontos sem autojogo nem duplicação; BYEs corretos.
2. 1v1 e 2v2: não cadastrar usuário repetido na mesma dupla; atribuir vitória e ranking à entrada correta.
3. Classificação: gols pró/contra, saldo, pontos customizados (ex. V2/E1/D0), bônus de +1 por melhor SG ao encerrar o grupo, empates nos critérios.
4. Qualificação 3 grupos: 2 de cada + 2 melhores terceiros => 8 IDs **distintos**, sem enfrentar a si próprio; aplicar seeding sem duplicação. As quatro fórmulas de quartas do WhatsApp podem colidir! **Validar e rejeitar conflitos** antes de publicar, sugerindo ordenação consistente.
5. Mata-mata com 3, 5 e 6 entradas: BYEs válidos; avanço 1 vez só; placar empatado não define vencedor sem penalidades/critério.
6. W.O.: pontos do presente e faltante definidos, placar administrativo opcional, sem double count de jogos, alteração/reversão auditada.
7. Mudança de placar após qualificação: impede atualizar silenciosamente adversários de partidas futuras já jogadas; sinaliza impacto.
8. Clubes: sorteio de lista restrita, troca por fase, escolha manual, clubes repetidos permitidos/desabilitados. Clube é vínculo por partida, não fixo no usuário.
9. Papéis: participante novo pode editar placar por padrão; toggle desativado é aplicado no servidor; OWNER tem controle; convidado sem acesso não lê galeria privada.
10. Logs: registrar inclusão/edição de resultado e time; duas alterações sucessivas mantêm ambas com timestamps; não disponibilizar DELETE no audit log.
11. Storage: MIME inválido e arquivo acima do tamanho rejeitados; foto privada só com URL assinada e permissão; upload parcialmente falho não aparece como válido.
12. PWA: HTTPS, manifest, ícones 192/512, Android quando prompt suportado, iOS com guia, não cacheia autenticação/fotos privadas.
13. Responsivo e motion: 360px e 390px sem scroll lateral; reduzir movimento não quebra UX; gráficos ECharts ajustam container após resize.

## Padrão de qualidade

Testes automatizados nas funções puras de regras de pontuação/sorteio + testes de autorização onde houver infraestrutura. Fixtures devem ser determinísticas; usar sorteador com seed ou mock. `docs/STATUS.md` deve diferenciar `passou`, `não executado`, `falhou` e `bloqueado`.
