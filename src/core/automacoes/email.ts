/**
 * O E-MAIL NA PALETA QUATTRO — HTML de tabela, estilo em linha.
 *
 * ⚠️ E-mail não lê variável CSS (a maioria dos clientes ignora `var()` e
 * `<style>`), então os tokens do design system entram aqui como HEX — é um
 * ESPELHO declarado da paleta, do mesmo jeito que o Laboratório espelha os
 * tokens, e a guarda `npm run paleta` conhece este arquivo como declarante.
 * Nenhum hex fora da paleta da marca; o branco puro só como superfície do card.
 *
 * ⚠️ Número não tem cor por sinal (decisão do dono, 30/09/2026): todo valor
 * sai na tinta do texto, e o sinal escrito diz a direção.
 */

/** Os tokens, espelhados. */
const E = {
  fundo: "#F3F1EE",       // --a4p-app-bg · cinza claro de página
  cardBg: "#FFFFFF",      // --color-white · a superfície do card
  borda: "#D6D8CA",       // --color-border · cinza médio
  ink: "#3B4332",         // --color-ink · verde-base
  secundario: "#6B7060",  // --color-text-secondary
  lime: "#ECFD52",        // --color-lime · só o fio da marca, nunca fundo
} as const;

const FONTE = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Escapa texto para HTML — um `<` num nome de cliente não pode virar tag. */
export function esc(s: string | number | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface LinhaEmail { rotulo: string; valor: string; detalhe?: string }
export interface SecaoEmail { titulo: string; linhas: LinhaEmail[]; nota?: string }

export interface CorpoEmail {
  /** O que aparece na caixa de entrada antes de abrir. */
  preheader: string;
  titulo: string;
  /** Frase de abertura (o que este e-mail responde). */
  abertura?: string;
  destaques?: LinhaEmail[];
  secoes?: SecaoEmail[];
  /** Avisos que pedem atenção — texto, sem cor de sinal. */
  avisos?: string[];
  link?: { rotulo: string; url: string };
  rodape: string;
}

const linha = (l: LinhaEmail) => `
  <tr>
    <td style="padding:8px 0;border-top:1px solid ${E.borda};font:400 14px/20px ${FONTE};color:${E.ink};">
      ${esc(l.rotulo)}${l.detalhe ? `<br><span style="font:400 12px/18px ${FONTE};color:${E.secundario};">${esc(l.detalhe)}</span>` : ""}
    </td>
    <td align="right" style="padding:8px 0;border-top:1px solid ${E.borda};font:500 14px/20px ${FONTE};color:${E.ink};white-space:nowrap;font-variant-numeric:tabular-nums;">
      ${esc(l.valor)}
    </td>
  </tr>`;

/** Monta o HTML completo do e-mail. Determinístico: a mesma entrada, os mesmos bytes. */
export function montarHtml(c: CorpoEmail): string {
  const destaques = (c.destaques ?? []).map((d) => `
      <td valign="top" style="padding:0 16px 0 0;">
        <div style="font:500 11px/15px ${FONTE};letter-spacing:0.44px;text-transform:none;color:${E.secundario};">${esc(d.rotulo)}</div>
        <div style="font:700 22px/28px ${FONTE};color:${E.ink};font-variant-numeric:tabular-nums;">${esc(d.valor)}</div>
        ${d.detalhe ? `<div style="font:400 12px/18px ${FONTE};color:${E.secundario};">${esc(d.detalhe)}</div>` : ""}
      </td>`).join("");

  const secoes = (c.secoes ?? []).map((s) => `
    <tr><td style="padding:20px 28px 0 28px;">
      <div style="font:500 11px/15px ${FONTE};letter-spacing:0.44px;text-transform:none;color:${E.secundario};padding-bottom:4px;">${esc(s.titulo)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${s.linhas.map(linha).join("")}</table>
      ${s.nota ? `<div style="font:400 12px/18px ${FONTE};color:${E.secundario};padding-top:6px;">${esc(s.nota)}</div>` : ""}
    </td></tr>`).join("");

  const avisos = (c.avisos ?? []).map((a) => `
    <tr><td style="padding:12px 28px 0 28px;">
      <div style="border-left:3px solid ${E.lime};padding:8px 12px;background:${E.fundo};font:400 14px/20px ${FONTE};color:${E.ink};">${esc(a)}</div>
    </td></tr>`).join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.titulo)}</title></head>
<body style="margin:0;padding:0;background:${E.fundo};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${E.fundo};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${E.cardBg};border:1px solid ${E.borda};border-radius:26px;">
      <tr><td style="padding:24px 28px 0 28px;">
        <div style="width:40px;height:4px;background:${E.lime};border-radius:2px;"></div>
        <div style="font:500 12px/18px ${FONTE};color:${E.secundario};padding-top:12px;">Quattro</div>
        <h1 style="margin:4px 0 0 0;font:900 20px/26px ${FONTE};letter-spacing:-0.02em;text-transform:none;color:${E.ink};">${esc(c.titulo)}</h1>
        ${c.abertura ? `<p style="margin:8px 0 0 0;font:400 14px/20px ${FONTE};color:${E.ink};">${esc(c.abertura)}</p>` : ""}
      </td></tr>
      ${destaques ? `<tr><td style="padding:20px 28px 0 28px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${destaques}</tr></table></td></tr>` : ""}
      ${avisos}
      ${secoes}
      ${c.link ? `<tr><td style="padding:24px 28px 0 28px;"><a href="${esc(c.link.url)}" style="display:inline-block;background:${E.lime};color:${E.ink};font:500 14px/20px ${FONTE};text-decoration:none;padding:12px 24px;border-radius:999px;">${esc(c.link.rotulo)}</a></td></tr>` : ""}
      <tr><td style="padding:24px 28px 24px 28px;font:400 12px/18px ${FONTE};color:${E.secundario};">${esc(c.rodape)}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/* ========================================================================== */
/* O E-MAIL DE COBRANÇA — no modelo da Asaas (decisão do dono, 28/10/2026)      */
/* ========================================================================== */

/** A empresa que cobra, como o e-mail a mostra (já formatada). */
export interface EmpresaDoEmail {
  nome: string;
  razaoSocial?: string | null;
  /** "CNPJ 12.345.678/0001-95" — já legível. */
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  endereco?: string[] | null;
}

export interface CorpoCobranca {
  preheader: string;
  titulo: string;
  empresa: EmpresaDoEmail;
  saudacao: string;
  paragrafos: string[];
  /** Os títulos (vencimento → valor). */
  linhas: LinhaEmail[];
  /** "Total R$ …" quando há mais de um título. */
  total?: LinhaEmail;
  link?: { rotulo: string; url: string };
  /** Os blocos que seguem o botão (links de cada título, Pix copia e cola). */
  extras?: SecaoEmail[];
  /** O "se já pagou" — em destaque, como no modelo. */
  aviso: string;
  /** A linha da plataforma no pé ("enviado pela plataforma Quattro"). */
  plataforma: string;
}

/**
 * O e-mail que o CLIENTE da empresa recebe: cabeçalho com a empresa que cobra
 * (nome, razão social e documento), a frase, o valor e o vencimento, o botão
 * que abre a página de pagamento, o endereço escrito por extenso (há leitor de
 * e-mail que esconde botão) e o rodapé com os dados da empresa e da plataforma.
 *
 * ⚠️ O cabeçalho é a faixa ESCURA da marca (verde-base) com o texto no branco
 * do card — nunca o vermelho do modelo: a paleta não tem vermelho de marca, e o
 * único vermelho do sistema é o de ERRO. O lime fica só no botão da ação.
 */
export function montarHtmlCobranca(c: CorpoCobranca): string {
  const emp = c.empresa;
  const linhaDoc = [emp.razaoSocial && emp.razaoSocial !== emp.nome ? emp.razaoSocial : "", emp.documento ?? ""].filter(Boolean).join(" · ");
  const contato = [emp.email ?? "", emp.telefone ?? ""].filter(Boolean);
  const rodapeEmpresa = [
    emp.razaoSocial || emp.nome,
    emp.documento ?? "",
    ...contato,
    ...(emp.endereco ?? []),
  ].filter(Boolean).map((l) => `<div>${esc(l)}</div>`).join("");
  const extras = (c.extras ?? []).map((s) => `
      <tr><td style="padding:20px 32px 0 32px;">
        <div style="font:500 13px/18px ${FONTE};color:${E.secundario};padding-bottom:4px;">${esc(s.titulo)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${s.linhas.map(linhaQuebrando).join("")}</table>
      </td></tr>`).join("");

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.titulo)}</title></head>
<body style="margin:0;padding:0;background:${E.fundo};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${E.fundo};">
  <tr><td align="center" style="padding:24px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:${E.cardBg};border-radius:24px;overflow:hidden;">
      <tr><td align="center" style="background:${E.ink};padding:28px 32px;">
        <div style="font:700 20px/26px ${FONTE};letter-spacing:-0.01em;color:${E.cardBg};">${esc(emp.nome)}</div>
        ${linhaDoc ? `<div style="font:400 13px/18px ${FONTE};color:${E.cardBg};padding-top:4px;">${esc(linhaDoc)}</div>` : ""}
      </td></tr>
      <tr><td style="padding:32px 32px 0 32px;">
        <h1 style="margin:0;font:700 22px/28px ${FONTE};letter-spacing:-0.02em;color:${E.ink};">${esc(c.titulo)}</h1>
        <p style="margin:16px 0 0 0;font:500 15px/22px ${FONTE};color:${E.ink};">${esc(c.saudacao)}</p>
        ${c.paragrafos.map((p) => `<p style="margin:12px 0 0 0;font:400 15px/22px ${FONTE};color:${E.ink};">${esc(p)}</p>`).join("")}
      </td></tr>
      <tr><td style="padding:20px 32px 0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${c.linhas.map(linha).join("")}${c.total ? linha(c.total) : ""}</table>
      </td></tr>
      ${c.link ? `<tr><td align="center" style="padding:28px 32px 0 32px;">
        <a href="${esc(c.link.url)}" style="display:inline-block;background:${E.lime};color:${E.ink};font:500 15px/20px ${FONTE};text-decoration:none;padding:15px 32px;border-radius:999px;">${esc(c.link.rotulo)}</a>
        <div style="font:400 13px/18px ${FONTE};color:${E.secundario};padding-top:14px;">Ou acesse <a href="${esc(c.link.url)}" style="color:${E.ink};word-break:break-all;">${esc(c.link.url)}</a></div>
      </td></tr>` : ""}
      ${extras}
      <tr><td style="padding:24px 32px 0 32px;">
        <div style="background:${E.fundo};border-radius:12px;padding:14px 16px;font:400 14px/20px ${FONTE};color:${E.ink};">${esc(c.aviso)}</div>
      </td></tr>
      <tr><td style="padding:28px 32px 28px 32px;">
        <div style="border-top:1px solid ${E.borda};padding-top:20px;font:400 12px/18px ${FONTE};color:${E.secundario};">
          ${rodapeEmpresa}
          <div style="padding-top:12px;">${esc(c.plataforma)}</div>
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

/** Linha cujo valor é texto longo (um endereço, um Pix copia e cola): quebra, não estoura o card. */
const linhaQuebrando = (l: LinhaEmail) => `
  <tr>
    <td style="padding:8px 0;border-top:1px solid ${E.borda};font:400 13px/18px ${FONTE};color:${E.ink};">
      ${esc(l.rotulo)}
      <div style="font:400 12px/18px ${FONTE};color:${E.secundario};word-break:break-all;padding-top:2px;">${esc(l.valor)}</div>
    </td>
  </tr>`;
