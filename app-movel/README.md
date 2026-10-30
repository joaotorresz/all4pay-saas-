# Quattro · app móvel (iOS e Android)

Casca nativa do ERP feita com **Capacitor 8**. O app abre `https://app.quattro.finance`
dentro de uma WebView nativa: toda tela, regra e correção publicada no site chega ao app
na hora, sem nova versão na loja. O código do produto continua um só (`src/`).

Por que remoto e não exportado: o ERP é Next.js com rotas de API, middleware de sessão e
segundo fator no servidor. Não existe versão estática dele para empacotar.

## O que já está aqui (etapa 2)

| Item | Valor |
| --- | --- |
| Identificador | `finance.quattro.app` (iOS e Android; trocar exige novo cadastro na loja) |
| Nome na tela | Quattro |
| Endereço | `server.url` em `capacitor.config.json` |
| Sem internet | `www/sem-conexao.html`, com "Tentar de novo" |
| Permissões | câmera (boleto/nota), fotos, microfone e fala (lançamento falado) |
| Criptografia | `ITSAppUsesNonExemptEncryption = false` (só HTTPS) |

## Como gerar os apps

```bash
cd app-movel
npm ci
npx cap sync
npx cap open android   # Android Studio → Build → Generate Signed Bundle (.aab)
npx cap open ios       # Xcode (Mac) → Product → Archive → enviar ao App Store Connect
```

## O que falta, por etapa

- **Biometria** (feito): "Destravar com biometria" em Segurança da conta, só no app;
  plugin `@aparajita/capacitor-biometric-auth`, chamado pela ponte global.
- **Notificações push** (falta): exige o projeto no Firebase (`google-services.json`) e a
  chave APNs da Apple.
- **Exigências da Apple que o ERP precisa atender** (cada uma é motivo comum de recusa):
  - *Entrar com a Apple* (diretriz 4.8): o login oferece Google, então precisa oferecer Apple também.
  - *Excluir a conta dentro do app* (5.1.1(v)).
  - *Compra de plano* (3.1.1): no iOS, a tela de planos não pode levar a pagamento fora da loja.
- **Etapa 4 · material da loja**: ícone 1024, prints, textos, política de privacidade e conta de teste.
- **Etapa 5 · envio**: TestFlight e teste interno do Google Play, depois publicação.
