---
name: champz-deploy
description: Prepara e valida a implantação gratuita do Champz na Vercel com banco e Object Storage Neon, autenticação Google, fotos e PWA. Use antes de publicar, revisar variáveis ou testar instalações Android/iPhone.
---

# Champz Deploy — Vercel Hobby + Neon Free

Consulte `docs/ARQUITETURA.md` e `docs/STATUS.md`. **Somente efetue deploy/commit/push quando o usuário autorizar explicitamente.** Preparar não significa publicar.

## Checklist pré-deploy

1. Confirmar uso **pessoal/não comercial** compatível com Vercel Hobby. Garantir orçamento 0, cotas mensais conhecidas; nada pago habilitado inadvertidamente.
2. Neon: criar/provisionar Postgres e bucket privado `champz-media`; checar se plano/conta/região têm Storage disponível. Diferenciar `DATABASE_URL` pooled runtime e `DIRECT_URL` migração. Ambiente de preview/teste isolado do banco de produção, se viável.
3. Better Auth self-hosted: credenciais `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`/origins; `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`; callbacks OAuth com domínio final da Vercel. Nunca logar senha, token ou segredo.
4. Object Storage: endpoint/bucket/região/acesso com SDK S3. Upload com URL pré-assinada curta; bucket privado; rotas de autorização antes de emissão da URL. Testar download e expiração. Não usar diretório `public/uploads` nem disco local persistente da Vercel.
5. Gerar `.env.example` **sem valores secretos**; colocar secrets reais só no ambiente local ignorado por Git e no painel Vercel. Ajustar domínio/cookies/redirect de auth em produção.
6. Executar `npm run typecheck`, lint, testes, `npm run build`; migrar banco por comando controlado, jamais migrar destrutivamente durante build. Verificar se build passa sem depender de segredos ausentes em contexto de CI quando possível.
7. Testes reais: cadastro por senha, login por username, login Google, vínculo de contas, foto/câmera, permissão sem autorização, lançamento de placar, log, tabela, sorteio, mata-mata, PWA Android e iPhone (ou indicar quais testes exigem aparelhos).
8. Configurar repo correto `Murilo-Alexandre/Champz`, vercel import e deploy automático só **após autorização**, e manter repositório sem duplicatas `Champz`/`champz`.
9. Validar `/manifest.webmanifest`, service worker, ícones, HTTPS, install prompt em Chrome/Android onde disponível e tutorial de instalar no Safari/iOS. Offline do MVP se limita a assets/cache seguro.

## Se houver bloqueios

- Neon Object Storage indisponível na conta/região: relatar o bloqueio e pedir decisão antes de substituir por outro provedor (ex.: Cloudflare R2 ou serviço gratuito comprovado); manter `StorageProvider` trocável. Não prometer 5GB sem confirmar quota atual.
- Google OAuth ainda não criado: concluir login email/username e integração preparada; usuário terá que criar credenciais Google. Não fingir que OAuth está funcionando.
- Consumo de cotas: aplicar limites de foto, upload, requests e downloads; alertar o administrador.

## Resultado

Emitir resumo curto: URL (apenas se publicada e confirmada), deploy id/status, DB e storage testados, rotas básicas, status PWA Android/iOS e pendências. Atualizar `docs/STATUS.md`.
