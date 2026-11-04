/**
 * OS E-MAILS DE LOGIN (Supabase Auth) NO DESENHO DA QUATTRO.
 *
 *   npm run emails-auth              # gera supabase/templates/*.html
 *   npm run emails-auth -- --conferir # reprova se o arquivo não for o gerado
 *
 * ⚠️ Pedido do dono (04/11/2026): o "Reset your password" chegava em inglês e
 * sem nada da marca, porque o Supabase usa o modelo padrão dele. Os modelos
 * saem do MESMO `montarHtml` dos e-mails do app (`core/automacoes/email`), um
 * escritor só: mudar o desenho lá muda aqui ao gerar de novo, e a conferência
 * (dentro do `npm test`) reprova o arquivo editado à mão ou esquecido.
 *
 * O Supabase hospedado lê o modelo do painel (Authentication › Emails): o
 * dono cola o assunto e o HTML de cada arquivo. `{{ .ConfirmationURL }}` é a
 * variável do Supabase e tem de sair intacta.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { montarHtml } from "../src/core/automacoes/email.ts";

const APP = "https://app.quattro.finance";
const LINK = "{{ .ConfirmationURL }}";
const RODAPE = "Quattro · app.quattro.finance. Este é um e-mail automático; respostas não são lidas.";

interface Modelo { arquivo: string; painel: string; assunto: string; titulo: string; abertura: string; botao: string; aviso: string }

export const MODELOS: Modelo[] = [
  { arquivo: "confirmacao", painel: "Confirm signup", assunto: "Confirme seu e-mail na Quattro",
    titulo: "Confirme seu e-mail", abertura: "Falta um passo para abrir sua conta na Quattro: confirmar que este e-mail é seu.",
    botao: "Confirmar e-mail", aviso: "Se você não criou uma conta na Quattro, ignore este e-mail." },
  { arquivo: "recuperar-senha", painel: "Reset password", assunto: "Crie uma nova senha na Quattro",
    titulo: "Crie uma nova senha", abertura: "Recebemos um pedido para trocar a senha da sua conta. O link vale por uma hora.",
    botao: "Criar nova senha", aviso: "Se não foi você, ignore este e-mail. Sua senha continua a mesma." },
  { arquivo: "link-magico", painel: "Magic link", assunto: "Seu link de acesso à Quattro",
    titulo: "Entre na Quattro", abertura: "Use o botão abaixo para entrar sem digitar a senha. O link vale por uma hora e só funciona uma vez.",
    botao: "Entrar", aviso: "Se você não pediu este acesso, ignore este e-mail." },
  { arquivo: "troca-email", painel: "Change email address", assunto: "Confirme o novo e-mail da sua conta Quattro",
    titulo: "Confirme o novo e-mail", abertura: "Você pediu para trocar o e-mail da sua conta na Quattro. Confirme para a troca valer.",
    botao: "Confirmar novo e-mail", aviso: "Se você não pediu a troca, ignore este e-mail e o endereço antigo continua valendo." },
  { arquivo: "convite", painel: "Invite user", assunto: "Você foi convidado para a Quattro",
    titulo: "Você foi convidado", abertura: "Alguém da sua empresa convidou você para usar a Quattro, a gestão financeira da empresa.",
    botao: "Aceitar convite", aviso: "Se você não esperava este convite, ignore este e-mail." },
];

export function gerar(m: Modelo): string {
  return montarHtml({
    preheader: m.abertura,
    titulo: m.titulo,
    abertura: m.abertura,
    link: { rotulo: m.botao, url: LINK },
    avisos: [m.aviso],
    // Há leitor de e-mail que esconde botão: o endereço vai escrito no pé.
    rodape: `Se o botão não abrir, copie este endereço no navegador: ${LINK} · ${RODAPE}`,
    appUrl: APP,
  }) + "\n";
}

const DIR = "supabase/templates";
const conferir = process.argv.includes("--conferir");
const falhas: string[] = [];

for (const m of MODELOS) {
  const html = gerar(m);
  if (!html.includes(`href="${LINK}"`)) falhas.push(`${m.arquivo}: o botão não leva a variável ${LINK} intacta`);
  if (/[A-Za-z]{4,} your|Follow the link|Reset password</.test(html)) falhas.push(`${m.arquivo}: texto em inglês no modelo`);
  const caminho = `${DIR}/${m.arquivo}.html`;
  if (conferir) {
    const atual = existsSync(caminho) ? readFileSync(caminho, "utf8") : null;
    if (atual === null) falhas.push(`${caminho} não existe — rode npm run emails-auth`);
    else if (atual !== html) falhas.push(`${caminho} difere do gerado por core/automacoes/email — editado à mão ou esquecido; rode npm run emails-auth`);
  } else {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(caminho, html);
  }
}

if (!conferir) {
  const guia = ["# Modelos de e-mail do login (Supabase)", "",
    "Gerados por `npm run emails-auth` a partir de `src/core/automacoes/email.ts`. Não edite o HTML à mão.", "",
    "No painel do Supabase: Authentication › Emails › Templates. Para cada um, cole o assunto e o HTML do arquivo.", "",
    "| Modelo no painel | Assunto | Arquivo |", "| --- | --- | --- |",
    ...MODELOS.map((m) => `| ${m.painel} | ${m.assunto} | \`${m.arquivo}.html\` |`), ""].join("\n");
  writeFileSync(`${DIR}/LEIA.md`, guia);
}

// Defeito plantado: um modelo com o link trocado tem de ser acusado.
const plantado = gerar(MODELOS[1]).replaceAll(LINK, "https://exemplo.invalid");
if (plantado.includes(`href="${LINK}"`)) falhas.push("(defeito plantado) o link trocado passou despercebido — a guarda está cega");

if (falhas.length) {
  console.error("✗ emails-auth:\n  " + falhas.join("\n  "));
  process.exit(1);
}
console.log(conferir ? `✓ emails-auth: ${MODELOS.length} modelos iguais ao gerado` : `✓ emails-auth: ${MODELOS.length} modelos gravados em ${DIR}/`);
