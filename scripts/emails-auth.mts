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
 * dono cola o assunto e o HTML de cada arquivo. `{{ .SiteURL }}` e
 * `{{ .TokenHash }}` são variáveis do Supabase e têm de sair intactas.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { montarHtml, esc } from "../src/core/automacoes/email.ts";
import { TIPOS_DO_LINK } from "../src/core/recuperacao/index.ts";

const APP = "https://app.quattro.finance";
// O link leva o token (`token_hash`), não o `{{ .ConfirmationURL }}` do PKCE:
// o teste do dono (05/11/2026) mostrou que o link PKCE aberto em outro
// navegador — o celular, o Gmail de outro perfil — cai em "outro-navegador".
// Com o token, a rota /api/auth/recuperar confere por verifyOtp em qualquer um.
const linkDe = (tipo: keyof typeof TIPOS_DO_LINK) =>
  `{{ .SiteURL }}/api/auth/recuperar?token_hash={{ .TokenHash }}&type=${tipo}`;
const RODAPE = "Quattro · app.quattro.finance. Este é um e-mail automático; respostas não são lidas.";

interface Modelo { arquivo: string; tipo: keyof typeof TIPOS_DO_LINK; painel: string; assunto: string; titulo: string; abertura: string; botao: string; aviso: string }

export const MODELOS: Modelo[] = [
  { arquivo: "confirmacao", tipo: "signup", painel: "Confirm signup", assunto: "Confirme seu e-mail na Quattro",
    titulo: "Confirme seu e-mail", abertura: "Falta um passo para abrir sua conta na Quattro: confirmar que este e-mail é seu.",
    botao: "Confirmar e-mail", aviso: "Se você não criou uma conta na Quattro, ignore este e-mail." },
  { arquivo: "recuperar-senha", tipo: "recovery", painel: "Reset password", assunto: "Crie uma nova senha na Quattro",
    titulo: "Crie uma nova senha", abertura: "Recebemos um pedido para trocar a senha da sua conta. O link vale por uma hora.",
    botao: "Criar nova senha", aviso: "Se não foi você, ignore este e-mail. Sua senha continua a mesma." },
  { arquivo: "link-magico", tipo: "magiclink", painel: "Magic link", assunto: "Seu link de acesso à Quattro",
    titulo: "Entre na Quattro", abertura: "Use o botão abaixo para entrar sem digitar a senha. O link vale por uma hora e só funciona uma vez.",
    botao: "Entrar", aviso: "Se você não pediu este acesso, ignore este e-mail." },
  { arquivo: "troca-email", tipo: "email_change", painel: "Change email address", assunto: "Confirme o novo e-mail da sua conta Quattro",
    titulo: "Confirme o novo e-mail", abertura: "Você pediu para trocar o e-mail da sua conta na Quattro. Confirme para a troca valer.",
    botao: "Confirmar novo e-mail", aviso: "Se você não pediu a troca, ignore este e-mail e o endereço antigo continua valendo." },
  { arquivo: "convite", tipo: "invite", painel: "Invite user", assunto: "Você foi convidado para a Quattro",
    titulo: "Você foi convidado", abertura: "Alguém da sua empresa convidou você para usar a Quattro, a gestão financeira da empresa.",
    botao: "Aceitar convite", aviso: "Se você não esperava este convite, ignore este e-mail." },
];

export function gerar(m: Modelo): string {
  return montarHtml({
    preheader: m.abertura,
    titulo: m.titulo,
    abertura: m.abertura,
    link: { rotulo: m.botao, url: linkDe(m.tipo) },
    avisos: [m.aviso],
    // Há leitor de e-mail que esconde botão: o endereço vai escrito no pé.
    rodape: `Se o botão não abrir, copie este endereço no navegador: ${linkDe(m.tipo)} · ${RODAPE}`,
    appUrl: APP,
  }) + "\n";
}

const DIR = "supabase/templates";
const conferir = process.argv.includes("--conferir");
const falhas: string[] = [];

for (const m of MODELOS) {
  const html = gerar(m);
  if (!html.includes(`href="${esc(linkDe(m.tipo))}"`)) falhas.push(`${m.arquivo}: o botão não leva o link com token (${linkDe(m.tipo)}) intacto`);
  if (html.includes("ConfirmationURL")) falhas.push(`${m.arquivo}: usa {{ .ConfirmationURL }} — o link PKCE não abre em outro navegador`);
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
    "O link usa `{{ .SiteURL }}`: em Authentication › URL Configuration, o Site URL tem de ser `https://app.quattro.finance`.", "",
    "| Modelo no painel | Assunto | Arquivo |", "| --- | --- | --- |",
    ...MODELOS.map((m) => `| ${m.painel} | ${m.assunto} | \`${m.arquivo}.html\` |`), ""].join("\n");
  writeFileSync(`${DIR}/LEIA.md`, guia);
}

// Defeito plantado: um modelo com o link trocado tem de ser acusado.
const plantado = gerar(MODELOS[1]).replaceAll(esc(linkDe("recovery")), "{{ .ConfirmationURL }}");
if (plantado.includes(`href="${esc(linkDe("recovery"))}"`) || !plantado.includes("ConfirmationURL")) falhas.push("(defeito plantado) o link trocado passou despercebido — a guarda está cega");

// A rota que o link abre: o tipo só vale pela lista, o destino é fixo e
// nada da URL escolhe para onde ir (âncoras literais, sem importar a rota).
export function conferirRota(fonte: string): string[] {
  const f: string[] = [];
  if (!/searchParams\.get\("token_hash"\)/.test(fonte)) f.push("rota: não lê token_hash — o link dos modelos cai em erro");
  if (!/lerTipoDoLink\(url\.searchParams\.get\("type"\)\)/.test(fonte)) f.push("rota: o type da URL não passa pela lista TIPOS_DO_LINK");
  if (!/verifyOtp\(\{ type: tipo, token_hash: tokenHash \}\)/.test(fonte)) f.push("rota: não confere o token por verifyOtp");
  if (!/para\(TIPOS_DO_LINK\[tipo\]\)/.test(fonte)) f.push("rota: o destino não sai da lista fixa");
  if (/searchParams\.get\("(next|redirect_to|redirect|destino)"\)/.test(fonte)) f.push("rota: lê destino da URL — redirecionamento aberto");
  return f;
}
const rota = readFileSync("src/app/api/auth/recuperar/route.ts", "utf8");
falhas.push(...conferirRota(rota));
if (conferirRota(rota.replace("para(TIPOS_DO_LINK[tipo])", 'para(url.searchParams.get("next") ?? "/")')).length < 2)
  falhas.push("(defeito plantado) destino lido da URL passou — a guarda da rota está cega");

if (falhas.length) {
  console.error("✗ emails-auth:\n  " + falhas.join("\n  "));
  process.exit(1);
}
console.log(conferir ? `✓ emails-auth: ${MODELOS.length} modelos iguais ao gerado` : `✓ emails-auth: ${MODELOS.length} modelos gravados em ${DIR}/`);
