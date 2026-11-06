# Modelos de e-mail do login (Supabase)

Gerados por `npm run emails-auth` a partir de `src/core/automacoes/email.ts`. Não edite o HTML à mão.

No painel do Supabase: Authentication › Emails › Templates. Para cada um, cole o assunto e o HTML do arquivo.

O link usa `{{ .SiteURL }}`: em Authentication › URL Configuration, o Site URL tem de ser `https://app.quattro.finance`.

| Modelo no painel | Assunto | Arquivo |
| --- | --- | --- |
| Confirm signup | Confirme seu e-mail na Quattro | `confirmacao.html` |
| Reset password | Crie uma nova senha na Quattro | `recuperar-senha.html` |
| Magic link | Seu link de acesso à Quattro | `link-magico.html` |
| Change email address | Confirme o novo e-mail da sua conta Quattro | `troca-email.html` |
| Invite user | Você foi convidado para a Quattro | `convite.html` |
| Reauthentication | Seu código de confirmação da Quattro | `reautenticacao.html` |
