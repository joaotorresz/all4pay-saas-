"use client";

/**
 * Laboratório de Design — editor VIVO, com SELEÇÃO INDIVIDUAL de elementos.
 *
 * A diferença central: ao clicar num elemento, o Lab calcula um SELETOR ÚNICO
 * daquele nó no DOM (caminho estrutural ancorado na sidebar ou no main) e aplica
 * os ajustes SÓ NELE. Cada seleção vira um cartão próprio no painel, com escopo
 * alternável:
 *   · "Só este"        → o elemento exato que você clicou (padrão)
 *   · "Todos do tipo"  → todos que seguem o mesmo padrão reconhecido
 *
 * Reconhecimento de padrão: título de página, subtítulo, título de card, KPI,
 * corpo, rótulo, legenda, item de menu, pílula ativa, card, chip, botão…
 *
 * Camadas do painel:
 *   1. Selecionados  — item a item, individual (o que você pediu)
 *   2. Por padrão    — mexe em todos de um tipo de uma vez (atalho)
 *   3. Global        — fonte/cores/tracking do sistema inteiro
 *
 * Tudo é sandbox: injeta um <style> e salva no navegador; nada vai pro código
 * sozinho. "Copiar para o Claude Code" exporta para eu promover ao design system.
 */
import * as React from "react";
import { Icon } from "@/components/ui";

const KEY = "a4p_designlab";
const STYLE_ID = "a4p-designlab-style";

/* ============================== FONTES ============================== */
const FONTS: { id: string; label: string; stack: string }[] = [
  { id: "", label: "— herdar —", stack: "" },
  { id: "hanken", label: "Hanken Grotesk", stack: '"Hanken Grotesk Variable","Hanken Grotesk",sans-serif' },
  { id: "roobert", label: "Roobert", stack: '"Roobert",sans-serif' },
  { id: "roobert-vf", label: "Roobert Variable", stack: '"Roobert Variable","Roobert",sans-serif' },
  { id: "roobert-semimono", label: "Roobert Semi Mono", stack: '"Roobert Semi Mono",ui-monospace,monospace' },
  { id: "roobert-mono", label: "Roobert Mono", stack: '"Roobert Mono",ui-monospace,monospace' },
  { id: "boldonse", label: "Boldonse", stack: '"Boldonse",sans-serif' },
  { id: "schibsted", label: "Schibsted Grotesk", stack: '"Schibsted Grotesk Variable",sans-serif' },
  // ⚠️ Corte único (Semibold, 600) e SEM `tnum` — o arquivo só traz `aalt` e
  // `liga`. Serve para avaliar texto; nos valores as colunas não alinham, que é
  // justamente o que o `tabular-nums` do sistema existe para garantir.
  { id: "knocky", label: "Knocky Semibold", stack: '"Knocky",sans-serif' },
  // ⚠️ DEMO de 66 caracteres: sem `$`, sem `%`, sem hífen/menos e sem NENHUM
  // acento pt-BR. O texto não some — sai misturado, alternando de fonte dentro
  // da mesma palavra ("Distribuição", "R$"). O rótulo avisa antes do clique.
  { id: "obviously", label: "Obviously Narrow (demo · sem acentos e sem R$)", stack: '"Obviously Narrow",sans-serif' },
  { id: "geist", label: "Geist Mono", stack: '"Geist Mono Variable",ui-monospace,monospace' },
  { id: "system", label: "Sistema", stack: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" },
];
const FONTS_GLOBAL = FONTS.filter((f) => f.id);
const stackDe = (id: string) => FONTS.find((f) => f.id === id)?.stack ?? "";

/* ========================= TOKENS DE COR (global) ========================= */
type CorCampo = { key: string; label: string; varName: string; dica?: string; secao: "Fundos" | "Texto" | "Marca" | "Status" };
const COR_CAMPOS: CorCampo[] = [
  // FUNDOS — os mais procurados, então vêm primeiro e com nome explícito.
  { key: "bg", label: "Fundo da PÁGINA", varName: "--color-surface-1", dica: "o canvas atrás de tudo", secao: "Fundos" },
  { key: "cardBg", label: "Fundo dos CARDS", varName: "--color-white", dica: "as caixas brancas", secao: "Fundos" },
  { key: "surface2", label: "Fundo de chips / seções", varName: "--color-surface-2", dica: "blocos internos", secao: "Fundos" },
  { key: "border", label: "Borda / divisor", varName: "--color-border", secao: "Fundos" },
  // TEXTO
  { key: "ink", label: "Títulos e valores", varName: "--color-ink", secao: "Texto" },
  { key: "body", label: "Texto corpo", varName: "--color-text-secondary", secao: "Texto" },
  { key: "muted", label: "Texto secundário", varName: "--color-text-tertiary", secao: "Texto" },
  // MARCA
  { key: "lime", label: "Lima (acento)", varName: "--color-lime", secao: "Marca" },
  { key: "onLime", label: "Texto sobre lima", varName: "--color-on-lime", secao: "Marca" },
  // STATUS
  { key: "positive", label: "Positivo (Pago)", varName: "--color-positive", secao: "Status" },
  { key: "negative", label: "Negativo (Falha)", varName: "--color-negative", secao: "Status" },
  { key: "warning", label: "Alerta", varName: "--color-warning", secao: "Status" },
];
const SECOES_COR = ["Fundos", "Texto", "Marca", "Status"] as const;

/* ===================== PADRÕES RECONHECIDOS ===================== */
interface Padrao { id: string; label: string; teste: string; seletorTipo: string; grupo: "Menu" | "Textos" | "Componentes" }
// Ordem = prioridade (específico → genérico).
const PADROES: Padrao[] = [
  { id: "menuActive", label: "Menu · item ativo", grupo: "Menu", teste: '.a4p-sidebar nav a[aria-current="page"]', seletorTipo: '.a4p-sidebar nav a[aria-current="page"]' },
  { id: "menuItem", label: "Menu · item", grupo: "Menu", teste: ".a4p-sidebar nav a", seletorTipo: ".a4p-sidebar nav a" },
  { id: "menuLabel", label: "Menu · rótulo de seção", grupo: "Menu", teste: ".a4p-sidebar nav > div > span", seletorTipo: ".a4p-sidebar nav > div > span" },
  { id: "menuBg", label: "Menu · fundo", grupo: "Menu", teste: ".a4p-sidebar", seletorTipo: ".a4p-sidebar" },
  // All 4 Pay AI — o FAB e o painel vivem FORA do <main>.ds-visor (são irmãos
  // dele no AppShell), então nada em `.ds-visor …` os alcança. Ganham âncora
  // própria (`.a4p-ia`) para serem editáveis como o resto.
  { id: "iaFab", label: "All 4 Pay AI · botão", grupo: "Componentes", teste: ".a4p-ia-fab", seletorTipo: ".a4p-ia-fab" },
  { id: "iaPergunta", label: "IA · pergunta", grupo: "Textos", teste: ".a4p-ia [data-ia='pergunta']", seletorTipo: ".a4p-ia [data-ia='pergunta']" },
  { id: "iaResposta", label: "IA · resposta", grupo: "Textos", teste: ".a4p-ia [data-ia='resposta']", seletorTipo: ".a4p-ia [data-ia='resposta']" },
  { id: "iaChip", label: "IA · sugestão", grupo: "Componentes", teste: ".a4p-ia [data-ia='chip']", seletorTipo: ".a4p-ia [data-ia='chip']" },
  { id: "iaChat", label: "All 4 Pay AI · painel", grupo: "Componentes", teste: ".a4p-ia", seletorTipo: ".a4p-ia" },
  { id: "kpi", label: "Valor / KPI", grupo: "Textos", teste: ".ds-visor .a4p-num,.ds-visor .text-value-lg", seletorTipo: ".ds-visor .a4p-num,.ds-visor .text-value-lg" },
  { id: "h1", label: "Título da página (H1)", grupo: "Textos", teste: ".ds-visor h1,.ds-visor .text-h1", seletorTipo: ".ds-visor h1,.ds-visor .text-h1" },
  { id: "h2", label: "Subtítulo (H2)", grupo: "Textos", teste: ".ds-visor h2,.ds-visor .text-h2", seletorTipo: ".ds-visor h2,.ds-visor .text-h2" },
  { id: "h3", label: "Título de card (H3)", grupo: "Textos", teste: ".ds-visor h3,.ds-visor .text-h3", seletorTipo: ".ds-visor h3,.ds-visor .text-h3" },
  { id: "iconTile", label: "Chip de ícone", grupo: "Componentes", teste: ".ds-visor [data-icontile]", seletorTipo: ".ds-visor [data-icontile]" },
  { id: "card", label: "Card", grupo: "Componentes", teste: '.ds-visor [data-card="1"]', seletorTipo: '.ds-visor [data-card="1"]' },
  { id: "button", label: "Botão", grupo: "Componentes", teste: ".ds-visor button", seletorTipo: ".ds-visor button" },
  { id: "label", label: "Rótulo", grupo: "Textos", teste: ".ds-visor .text-label", seletorTipo: ".ds-visor .text-label" },
  { id: "caption", label: "Legenda", grupo: "Textos", teste: ".ds-visor .text-caption", seletorTipo: ".ds-visor .text-caption" },
  { id: "body", label: "Corpo", grupo: "Textos", teste: ".ds-visor .text-body", seletorTipo: ".ds-visor .text-body" },
  // Papéis amplos usados pela aba "Fontes". `teste` nunca casa: não entram no
  // picker (seriam genéricos demais), só na atribuição por papel.
  { id: "numeros", label: "Números / dinheiro", grupo: "Textos", teste: ".__nunca__", seletorTipo: ".ds-visor .a4p-num,.ds-visor .tabular-nums" },
  { id: "menuTudo", label: "Menu (todo)", grupo: "Menu", teste: ".__nunca__", seletorTipo: ".a4p-sidebar" },
  { id: "appTudo", label: "Texto do app (base)", grupo: "Textos", teste: ".__nunca__", seletorTipo: ".ds-visor" },
  { id: "iaTudo", label: "All 4 Pay AI (tudo)", grupo: "Componentes", teste: ".__nunca__", seletorTipo: ".a4p-ia,.a4p-ia-fab" },
];

/** Alvos de borda oferecidos direto no Global (os mais pedidos). */
const BORDAS: { id: string; label: string }[] = [
  { id: "card", label: "Borda dos cards" },
  { id: "button", label: "Borda dos botões" },
  { id: "iconTile", label: "Borda do chip de ícone" },
  { id: "menuActive", label: "Borda do item ativo do menu" },
  { id: "menuBg", label: "Borda do menu (lateral)" },
];

/** Alvos de ARREDONDAMENTO oferecidos direto no Global (raio em px). */
const RAIOS: { id: string; label: string; dica: string }[] = [
  { id: "button", label: "Botões", dica: "0 = quadrado · 999 = pílula" },
  { id: "card", label: "Cards", dica: "as caixas brancas" },
  { id: "iconTile", label: "Chip de ícone", dica: "o tile do glifo" },
  { id: "menuActive", label: "Item ativo do menu", dica: "o pill do menu" },
];

/** Papéis tipográficos da aba "Fontes" — uma fonte (e tamanho) por papel. */
const PAPEIS: { id: string; label: string; dica: string }[] = [
  { id: "h1", label: "Título da página", dica: "“Bem-vindo, João!”" },
  { id: "h2", label: "Subtítulo / seção", dica: "títulos de bloco" },
  { id: "h3", label: "Título de card", dica: "“Você gastou”" },
  { id: "numeros", label: "Números / dinheiro", dica: "R$ 243.586,52" },
  { id: "body", label: "Corpo", dica: "parágrafos" },
  { id: "label", label: "Rótulos", dica: "labels de campo" },
  { id: "caption", label: "Legendas", dica: "textos pequenos" },
  { id: "button", label: "Botões", dica: "ações" },
  { id: "menuTudo", label: "Menu (todo)", dica: "barra lateral" },
  { id: "iaTudo", label: "All 4 Pay AI", dica: "o botão e o chat" },
  { id: "appTudo", label: "Texto do app (base)", dica: "o resto" },
];

function padraoDe(el: Element): Padrao | null {
  for (const p of PADROES) { try { if (el.closest(p.teste)) return p; } catch { /* ignore */ } }
  return null;
}

/* ============ SELETOR ÚNICO (caminho estrutural do elemento) ============ */
/**
 * Âncoras estáveis: a sidebar, o painel/botão da IA e o main do app.
 * A IA precisa da própria âncora — o FAB e o painel são IRMÃOS do
 * `<main>.ds-visor` no AppShell, então sem isto o picker devolvia `null` e
 * nada dentro da IA era selecionável.
 */
function raizDe(el: Element): { no: Element; prefixo: string } | null {
  const side = el.closest(".a4p-sidebar");
  if (side) return { no: side, prefixo: ".a4p-sidebar" };
  const fab = el.closest(".a4p-ia-fab");
  if (fab) return { no: fab, prefixo: ".a4p-ia-fab" };
  const ia = el.closest(".a4p-ia");
  if (ia) return { no: ia, prefixo: ".a4p-ia" };
  const main = el.closest("main.ds-visor") ?? el.closest(".ds-visor");
  if (main) return { no: main, prefixo: ".ds-visor" };
  return null;
}

/** Caminho `.raiz > tag:nth-of-type(n) > …` que identifica UM elemento. */
function caminhoUnico(el: Element): string | null {
  const raiz = raizDe(el);
  if (!raiz) return null;
  if (el === raiz.no) return raiz.prefixo;
  const partes: string[] = [];
  let cur: Element | null = el;
  while (cur && cur !== raiz.no && partes.length < 20) {
    const pai: Element | null = cur.parentElement;
    if (!pai) return null;
    const tag = cur.tagName.toLowerCase();
    const irmaos = Array.from(pai.children).filter((c) => c.tagName === cur!.tagName);
    partes.unshift(irmaos.length > 1 ? `${tag}:nth-of-type(${irmaos.indexOf(cur) + 1})` : tag);
    cur = pai;
  }
  if (cur !== raiz.no) return null;
  return `${raiz.prefixo} > ${partes.join(" > ")}`;
}

/** Sobe um nível no caminho (para pegar o container). */
function caminhoPai(sel: string): string | null {
  const i = sel.lastIndexOf(" > ");
  if (i < 0) return null;
  const p = sel.slice(0, i);
  const RAIZES = [".a4p-sidebar", ".ds-visor", ".a4p-ia", ".a4p-ia-fab"];
  return p.includes(">") || RAIZES.includes(p) ? p : null;
}

const contaAlvos = (sel: string): number => {
  try { return document.querySelectorAll(sel).length; } catch { return 0; }
};

/* ============================ PROPRIEDADES ============================ */
type Prop =
  | "oculto" | "semIcone" | "semTexto"
  | "fonte" | "size" | "weight" | "tracking" | "lineHeight" | "transform" | "align"
  | "color" | "bg" | "radius" | "padding" | "margin" | "borderW" | "borderColor"
  | "opacity" | "texto";

const PROPS_META: Record<Prop, { label: string; kind: "range" | "color" | "seg" | "font" | "text" | "toggle"; min?: number; max?: number; step?: number; un?: string; opcoes?: { v: string; label: string }[]; dica?: string }> = {
  oculto: { label: "Ocultar o elemento", kind: "toggle", dica: "some da tela por completo" },
  semIcone: { label: "Ocultar os ícones", kind: "toggle", dica: "só os glifos/chips dentro" },
  semTexto: { label: "Ocultar o texto", kind: "toggle", dica: "mantém ícone e caixa" },
  fonte: { label: "Fonte", kind: "font" },
  size: { label: "Tamanho", kind: "range", min: 8, max: 96, un: "px" },
  weight: { label: "Peso", kind: "range", min: 100, max: 900, step: 100 },
  tracking: { label: "Espaçamento", kind: "range", min: -8, max: 10, step: 0.5, un: "/100 em" },
  lineHeight: { label: "Entrelinha", kind: "range", min: 80, max: 220, step: 5, un: "%" },
  transform: { label: "Caixa", kind: "seg", opcoes: [{ v: "none", label: "Aa" }, { v: "uppercase", label: "AA" }, { v: "lowercase", label: "aa" }, { v: "capitalize", label: "Ab" }] },
  align: { label: "Alinhar", kind: "seg", opcoes: [{ v: "left", label: "⌐" }, { v: "center", label: "≡" }, { v: "right", label: "¬" }] },
  color: { label: "Cor do texto", kind: "color" },
  bg: { label: "Fundo", kind: "color" },
  radius: { label: "Raio", kind: "range", min: 0, max: 999, un: "px" },
  padding: { label: "Padding", kind: "range", min: 0, max: 64, un: "px" },
  margin: { label: "Margem", kind: "range", min: 0, max: 64, un: "px" },
  borderW: { label: "Borda (espessura)", kind: "range", min: 0, max: 8, un: "px" },
  borderColor: { label: "Borda (cor)", kind: "color" },
  opacity: { label: "Opacidade", kind: "range", min: 0, max: 100, un: "%" },
  texto: { label: "Texto", kind: "text" },
};

const ORDEM_PROPS: Prop[] = [
  "oculto", "semIcone", "semTexto",
  "texto", "fonte", "size", "weight", "tracking", "lineHeight", "transform", "align",
  "color", "bg", "radius", "padding", "margin", "borderW", "borderColor", "opacity",
];

type Overrides = Partial<Record<Prop, number | string>>;

/* ============================== ESTADO ============================== */
interface Selecao {
  key: string;
  seletor: string;      // caminho único do elemento
  padraoId: string;     // padrão reconhecido (para o escopo "todos do tipo")
  rotulo: string;
  amostra: string;      // trecho do texto, p/ você reconhecer no painel
  escopo: "este" | "tipo";
  ov: Overrides;
}
interface DesignState {
  font: string;
  numMesmaFonte: boolean;
  tracking: number;
  cores: Record<string, string>;
  selecoes: Selecao[];
  padroes: Record<string, Overrides>; // edição por padrão (todos do tipo)
}

/* Os defaults do Lab TÊM de espelhar os tokens reais do DS (bloco
   `html:not(.dark) .ds-visor` em globals.css). Quando divergem, abrir o
   Laboratório — ou só carregá-lo — repinta o app com valores que ninguém
   escolheu. Foi o que aconteceu com as semânticas: o Lab trazia um verde-oliva
   (#3f6212) e um tijolo (#b42318) no lugar do verde/vermelho vivos do DS. */
const DEFAULT_CORES: Record<string, string> = {
  ink: "#11190c", lime: "#e1ff00", onLime: "#11190c", bg: "#f8f9fa",
  cardBg: "#ffffff", surface2: "#f3f1ee", border: "#eceae4",
  body: "#3f4a38", muted: "#6b7280",
  // ⚠️ ESPELHO dos tokens reais de `html:not(.dark) .ds-visor`. Quando divergem,
  // o Laboratório repinta o app com valores que ninguém escolheu — foi o que
  // aconteceu antes com as semânticas. Atualizado junto com a correção de
  // contraste da ONDA 12.
  positive: "#367b4e", negative: "#be463c", warning: "#a45c15",
};
const DEFAULTS: DesignState = {
  font: "hanken", numMesmaFonte: false, tracking: -1,
  cores: { ...DEFAULT_CORES }, selecoes: [], padroes: {},
};

/** Estado salvo, ou `null` quando o usuário nunca mexeu no Laboratório. */
function carregarSalvo(): DesignState | null {
  if (typeof window === "undefined") return null;
  try {
    if (!localStorage.getItem(KEY)) return null;
  } catch { return null; }
  return carregar();
}

function carregar(): DesignState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw);
    return {
      ...DEFAULTS, ...p,
      cores: { ...DEFAULTS.cores, ...(p.cores ?? {}) },
      selecoes: Array.isArray(p.selecoes) ? p.selecoes : [],
      padroes: p.padroes && typeof p.padroes === "object" ? p.padroes : {},
    };
  } catch { return DEFAULTS; }
}

/* =========================== GERAÇÃO DE CSS =========================== */
function decl(p: Prop, v: number | string): string | null {
  switch (p) {
    case "fonte": { const s = stackDe(String(v)); return s ? `font-family:${s} !important` : null; }
    case "size": return `font-size:${v}px !important`;
    case "weight": return `font-weight:${v} !important`;
    case "tracking": return `letter-spacing:${(Number(v) / 100).toFixed(3)}em !important`;
    case "lineHeight": return `line-height:${Number(v) / 100} !important`;
    case "transform": return `text-transform:${v} !important`;
    case "align": return `text-align:${v} !important`;
    case "color": return `color:${v} !important`;
    case "bg": return `background-color:${v} !important`;
    case "radius": return `border-radius:${v}px !important`;
    case "padding": return `padding:${v}px !important`;
    case "margin": return `margin:${v}px !important`;
    case "borderW": return `border-width:${v}px !important;border-style:solid !important`;
    case "borderColor": return `border-color:${v} !important`;
    case "opacity": return `opacity:${Number(v) / 100} !important`;
    case "oculto": return v === "sim" ? `display:none !important` : null;
    case "texto": return null;    // aplicado via DOM
    case "semIcone": return null; // regra própria (filhos) — vide `regra()`
    case "semTexto": return null; // idem
  }
}

/** Props que devem descer para os filhos (senão a classe do filho vence). */
const HERDA: Prop[] = ["fonte", "size", "weight", "tracking", "lineHeight", "transform", "color"];

function regra(seletor: string, ov: Overrides): string {
  const proprio: string[] = [];
  const herdado: string[] = [];
  for (const p of ORDEM_PROPS) {
    if (!(p in ov)) continue;
    const d = decl(p, ov[p]!);
    if (!d) continue;
    proprio.push(d);
    if (HERDA.includes(p)) herdado.push(d);
  }
  // Só a COR da borda não desenha nada: o Tailwind zera border-width em tudo.
  // Assumimos 1px sólido para a escolha de cor valer por si.
  if (ov.borderColor !== undefined && ov.borderW === undefined) {
    proprio.push("border-width:1px !important", "border-style:solid !important");
  }
  const out: string[] = [];
  if (proprio.length) out.push(`${seletor}{${proprio.join(";")}}`);
  if (herdado.length) {
    // desce p/ os filhos (inclui svg do ícone, que usa currentColor)
    const filhos = seletor.split(",").map((s) => `${s.trim()} *`).join(",");
    out.push(`${filhos}{${herdado.join(";")}}`);
  }
  // Ocultar SÓ os ícones de dentro (svg + chips), preservando o resto.
  if (ov.semIcone === "sim") {
    const alvos = seletor.split(",").flatMap((s) => {
      const t = s.trim();
      return [`${t} svg`, `${t} [data-icontile]`, `${t}[data-icontile]`];
    }).join(",");
    out.push(`${alvos}{display:none !important}`);
  }
  // Ocultar SÓ o texto: font-size 0 colapsa os nós de texto do elemento, mas
  // SVGs (dimensionados por width/height) e filhos com tamanho próprio via
  // classe seguem visíveis. Não forçamos tamanho nos filhos de propósito —
  // `initial` os jogaria todos para 16px e quebraria a escala.
  if (ov.semTexto === "sim") {
    out.push(`${seletor.split(",").map((s) => s.trim()).join(",")}{font-size:0 !important}`);
  }
  return out.join("\n");
}

function montarCSS(s: DesignState): string {
  const stack = stackDe(s.font);
  const tr = (s.tracking / 100).toFixed(3);
  const vars = COR_CAMPOS.map((c) => `${c.varName}:${s.cores[c.key]};`).join("");
  const out: string[] = [
    // Os tokens precisam existir no CANVAS (que pinta o fundo da página) e na
    // SIDEBAR, não só no <main>.ds-visor: variável CSS desce, não sobe — e o
    // .a4p-canvas é o PAI do main, então só ele enxergaria o valor antigo.
    `html:not(.dark) .a4p-canvas,html:not(.dark) .a4p-sidebar,html:not(.dark) .ds-visor{${vars}}`,
    // Reforço: o canvas pinta o fundo da página por uma regra unlayered em
    // globals.css. Repintamos direto para a mudança valer sempre.
    `html:not(.dark) .a4p-canvas{background-color:${s.cores.bg} !important}`,
    // Idem p/ os cards: a folha declara-se "unlayered de propósito (vence as
    // utilities bg-white)", então não confiamos só no token.
    `html:not(.dark) .ds-visor [data-card="1"]{background-color:${s.cores.cardBg} !important}`,
    `.ds-visor,.ds-visor *,.a4p-sidebar,.a4p-sidebar *{font-family:${stack};}`,
    `.ds-visor,.ds-visor *{letter-spacing:${tr}em;}`,
  ];
  if (s.numMesmaFonte) out.push(`.ds-visor .tabular-nums,.ds-visor .a4p-num,.ds-visor .a4p-num *{font-family:${stack} !important;}`);

  // 2) por padrão (todos do tipo)
  for (const p of PADROES) {
    const ov = s.padroes[p.id];
    if (ov && Object.keys(ov).length) { const r = regra(p.seletorTipo, ov); if (r) out.push(r); }
  }
  // 3) individuais — por último, para vencerem o padrão
  for (const sel of s.selecoes) {
    if (!Object.keys(sel.ov).length) continue;
    const alvo = sel.escopo === "tipo"
      ? (PADROES.find((p) => p.id === sel.padraoId)?.seletorTipo ?? sel.seletor)
      : sel.seletor;
    const r = regra(alvo, sel.ov);
    if (r) out.push(r);
  }
  return out.join("\n");
}

function aplicarCSS(s: DesignState) {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = STYLE_ID; document.head.appendChild(el); }
  el.textContent = montarCSS(s);
}

/** Textos editados: aplicados no DOM (CSS não troca conteúdo). */
function aplicarTextos(s: DesignState) {
  if (typeof document === "undefined") return;
  for (const sel of s.selecoes) {
    const t = sel.ov.texto;
    if (typeof t !== "string") continue;
    const alvo = sel.escopo === "tipo"
      ? (PADROES.find((p) => p.id === sel.padraoId)?.seletorTipo ?? sel.seletor)
      : sel.seletor;
    try {
      document.querySelectorAll(alvo).forEach((el) => {
        if (el.childElementCount === 0 && el.textContent !== t) el.textContent = t;
      });
    } catch { /* ignore */ }
  }
}

/**
 * Injeta os ajustes SALVOS do Laboratório. Sem nada salvo não emite estilo
 * nenhum — o sandbox fica inerte e quem manda é o design system. Antes ele
 * aplicava os DEFAULTS do Lab em toda visita, sobrescrevendo os tokens do DS
 * para qualquer usuário que nunca tivesse aberto o Laboratório.
 */
export function DesignLabStyle() {
  React.useEffect(() => {
    const s = carregarSalvo();
    if (!s) return;
    aplicarCSS(s);
    aplicarTextos(s);
  }, []);
  return null;
}

/* ============================= COMPONENTE ============================= */
export function DesignLab() {
  const [open, setOpen] = React.useState(false);
  const [s, setS] = React.useState<DesignState>(DEFAULTS);
  const [copiado, setCopiado] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [hover, setHover] = React.useState<{ rect: DOMRect; label: string } | null>(null);
  const [expandido, setExpandido] = React.useState<string | null>(null);
  const [aba, setAba] = React.useState<"itens" | "fontes" | "padroes" | "global">("itens");
  const [foco, setFoco] = React.useState<DOMRect | null>(null);
  const refs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => { setS(carregar()); }, []);
  React.useEffect(() => {
    aplicarCSS(s);
    aplicarTextos(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, [s]);
  // textos precisam ser reaplicados quando o React re-renderiza
  React.useEffect(() => {
    if (!s.selecoes.some((x) => typeof x.ov.texto === "string")) return;
    const t = setInterval(() => aplicarTextos(s), 900);
    return () => clearInterval(t);
  }, [s]);

  const set = (patch: Partial<DesignState>) => setS((p) => ({ ...p, ...patch }));
  const setCor = (k: string, v: string) => setS((p) => ({ ...p, cores: { ...p.cores, [k]: v } }));

  const setSelProp = (key: string, p: Prop, v: number | string) =>
    setS((prev) => ({ ...prev, selecoes: prev.selecoes.map((x) => x.key === key ? { ...x, ov: { ...x.ov, [p]: v } } : x) }));
  const clearSelProp = (key: string, p: Prop) =>
    setS((prev) => ({ ...prev, selecoes: prev.selecoes.map((x) => { if (x.key !== key) return x; const ov = { ...x.ov }; delete ov[p]; return { ...x, ov }; }) }));
  const removerSel = (key: string) => setS((prev) => ({ ...prev, selecoes: prev.selecoes.filter((x) => x.key !== key) }));
  const setEscopo = (key: string, escopo: "este" | "tipo") =>
    setS((prev) => ({ ...prev, selecoes: prev.selecoes.map((x) => x.key === key ? { ...x, escopo } : x) }));
  const subirNivel = (key: string) =>
    setS((prev) => ({
      ...prev,
      selecoes: prev.selecoes.map((x) => {
        if (x.key !== key) return x;
        const pai = caminhoPai(x.seletor);
        if (!pai) return x;
        let rot = x.rotulo, am = x.amostra;
        try { const el = document.querySelector(pai); if (el) { rot = (padraoDe(el)?.label ?? el.tagName.toLowerCase()) + " (container)"; am = (el.textContent ?? "").trim().slice(0, 42); } } catch { /* ignore */ }
        return { ...x, seletor: pai, rotulo: rot, amostra: am };
      }),
    }));

  const setPadProp = (id: string, p: Prop, v: number | string) =>
    setS((prev) => ({ ...prev, padroes: { ...prev.padroes, [id]: { ...prev.padroes[id], [p]: v } } }));
  const clearPadProp = (id: string, p: Prop) =>
    setS((prev) => { const ov = { ...prev.padroes[id] }; delete ov[p]; const padroes = { ...prev.padroes }; if (Object.keys(ov).length) padroes[id] = ov; else delete padroes[id]; return { ...prev, padroes }; });

  const resetTudo = () => setS({ ...DEFAULTS, cores: { ...DEFAULT_CORES }, selecoes: [], padroes: {} });

  /* ---- realce de um seletor (hover no painel) ---- */
  const realcar = (seletor: string | null) => {
    if (!seletor) { setFoco(null); return; }
    try { const el = document.querySelector(seletor); setFoco(el ? el.getBoundingClientRect() : null); } catch { setFoco(null); }
  };

  /* ---- modo selecionar na tela ---- */
  React.useEffect(() => {
    if (!picking) { setHover(null); return; }
    // Enquanto se seleciona, TODO elemento vira clicável: vários enfeites (o
    // centro do donut, overlays de gráfico) são `pointer-events:none`, e sem
    // isto o clique os atravessa e eles nunca podem ser editados.
    document.documentElement.classList.add("a4p-picking");
    const noLab = (t: EventTarget | null) => t instanceof Element && !!t.closest("[data-designlab]");
    const onMove = (e: MouseEvent) => {
      if (noLab(e.target)) { setHover(null); return; }
      const el = e.target as Element;
      if (!(el instanceof Element)) return;
      const p = padraoDe(el);
      setHover({ rect: el.getBoundingClientRect(), label: p?.label ?? el.tagName.toLowerCase() });
    };
    const onClick = (e: MouseEvent) => {
      if (noLab(e.target)) return;
      const el = e.target as Element;
      if (!(el instanceof Element)) return;
      const seletor = caminhoUnico(el);
      if (!seletor) return;
      e.preventDefault(); e.stopPropagation();
      const p = padraoDe(el);
      const key = `s${Date.now().toString(36)}`;
      const nova: Selecao = {
        key, seletor, padraoId: p?.id ?? "", rotulo: p?.label ?? el.tagName.toLowerCase(),
        amostra: (el.textContent ?? "").trim().slice(0, 42), escopo: "este", ov: {},
      };
      // Se este elemento já foi selecionado antes, reabre o cartão existente.
      let alvoKey = key;
      setS((prev) => {
        const existe = prev.selecoes.find((x) => x.seletor === seletor);
        if (existe) { alvoKey = existe.key; return prev; }
        return { ...prev, selecoes: [nova, ...prev.selecoes] };
      });
      setExpandido(alvoKey);
      setPicking(false); setOpen(true); setAba("itens");
      setTimeout(() => refs.current[alvoKey]?.scrollIntoView({ block: "center", behavior: "smooth" }), 80);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPicking(false); };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      document.documentElement.classList.remove("a4p-picking");
    };
  }, [picking]);

  const instrucao = React.useMemo(() => gerarInstrucao(s), [s]);
  const copiar = () => { try { void navigator.clipboard?.writeText(instrucao); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* ignore */ } };

  const nSel = s.selecoes.filter((x) => Object.keys(x.ov).length).length;
  const nPad = Object.keys(s.padroes).length;
  const nFontes = PAPEIS.filter((p) => s.padroes[p.id]?.fonte).length;

  return (
    <>
      <button data-designlab onClick={() => setOpen((o) => !o)} aria-label="Laboratório de Design"
        title="Laboratório de Design" className="fixed bottom-5 left-5 z-[85] inline-flex items-center gap-2 rounded-pill bg-ink text-white pl-3 pr-4 py-[9px] shadow-popover hover:opacity-90">
        <span className="w-[26px] h-[26px] rounded-md bg-lime inline-flex items-center justify-center">
          <Icon name="palette" size={15} color="var(--color-on-lime)" />
        </span>
        <span className="text-[14px] font-semibold">Design</span>
      </button>

      {/* realce (picker) */}
      {picking && hover && <Realce rect={hover.rect} label={hover.label} />}
      {/* realce (hover no painel) */}
      {!picking && foco && <Realce rect={foco} label="" sutil />}

      {picking && (
        <div data-designlab className="fixed top-3 left-1/2 -translate-x-1/2 z-[96] bg-ink text-white text-[13px] font-medium px-4 py-2 rounded-pill shadow-popover flex items-center gap-2">
          <span className="w-2 h-2 rounded-pill bg-lime animate-pulse" />
          Clique no elemento que quer editar · Esc para sair
        </div>
      )}

      {open && (
        <>
          <div data-designlab className="fixed inset-0 z-[89] bg-black/20" onClick={() => setOpen(false)} aria-hidden />
          <aside data-designlab className="fixed top-0 right-0 z-[90] h-full w-full sm:w-[430px] bg-white border-l border-border flex flex-col shadow-popover" role="dialog" aria-label="Laboratório de Design">
            <header className="flex items-center gap-2 px-4 h-[54px] border-b border-border-soft shrink-0">
              <span className="w-7 h-7 rounded-md bg-ink inline-flex items-center justify-center">
                <Icon name="palette" size={15} color="var(--color-lime)" />
              </span>
              <span className="text-[15px] font-semibold text-ink">Laboratório de Design</span>
              <button onClick={resetTudo} title="Restaurar tudo" className="ml-auto text-caption text-muted hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2">Reset</button>
              <button onClick={() => setOpen(false)} aria-label="Fechar" className="w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2">
                <Icon name="x" size={18} color="currentColor" />
              </button>
            </header>

            <div className="px-4 pt-3 shrink-0">
              <button onClick={() => { setPicking(true); setOpen(false); }}
                className="w-full rounded-md py-[10px] text-label font-medium inline-flex items-center justify-center gap-2 border bg-lime text-on-lime border-lime hover:opacity-90">
                <Icon name="target" size={16} color="currentColor" />
                Selecionar item na tela
              </button>
              <div className="flex gap-1 mt-3 bg-surface-2 rounded-md p-1">
                {([["itens", `Itens${nSel ? ` (${nSel})` : ""}`], ["fontes", `Fontes${nFontes ? ` (${nFontes})` : ""}`], ["padroes", `Por tipo${nPad ? ` (${nPad})` : ""}`], ["global", "Global"]] as const).map(([k, lb]) => (
                  <button key={k} onClick={() => setAba(k)}
                    className={`flex-1 text-[11px] py-[6px] rounded-sm font-medium ${aba === k ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>{lb}</button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">
              {/* ---------- ABA: SELECIONADOS (individual) ---------- */}
              {aba === "itens" && (
                s.selecoes.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <div className="w-12 h-12 rounded-md bg-surface-2 inline-flex items-center justify-center mb-3">
                      <Icon name="target" size={22} color="var(--color-text-tertiary)" />
                    </div>
                    <p className="m-0 text-label text-ink font-medium">Nenhum item selecionado</p>
                    <p className="m-0 mt-1 text-caption text-muted leading-snug">
                      Clique em <strong>Selecionar item na tela</strong> e escolha o elemento exato que você quer mudar. Só ele será alterado.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {s.selecoes.map((sel) => {
                      const n = Object.keys(sel.ov).length;
                      const aberto = expandido === sel.key;
                      const alvos = typeof document !== "undefined"
                        ? contaAlvos(sel.escopo === "tipo" ? (PADROES.find((p) => p.id === sel.padraoId)?.seletorTipo ?? sel.seletor) : sel.seletor) : 0;
                      return (
                        <div key={sel.key} ref={(el) => { refs.current[sel.key] = el; }}
                          onMouseEnter={() => realcar(sel.seletor)} onMouseLeave={() => realcar(null)}
                          className={`rounded-md border overflow-hidden ${n ? "border-ink/30" : "border-border"}`}>
                          <div className="flex items-center gap-2 px-3 py-[9px] hover:bg-surface-2">
                            <button onClick={() => setExpandido(aberto ? null : sel.key)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                              <Icon name={aberto ? "chevron-down" : "chevron-right"} size={14} color="var(--color-text-tertiary)" />
                              <span className="min-w-0">
                                <span className="block text-[13px] text-ink truncate">{sel.rotulo}</span>
                                {sel.amostra && <span className="block text-[11px] text-faint truncate">“{sel.amostra}”</span>}
                              </span>
                            </button>
                            {n > 0 && <span className="text-[10px] font-semibold text-on-lime bg-lime rounded-pill px-[7px] py-[1px] shrink-0">{n}</span>}
                            {/* atalho: ocultar/mostrar sem abrir o cartão */}
                            <button
                              onClick={() => (sel.ov.oculto === "sim" ? clearSelProp(sel.key, "oculto") : setSelProp(sel.key, "oculto", "sim"))}
                              title={sel.ov.oculto === "sim" ? "Mostrar de novo" : "Ocultar este elemento"}
                              className={`shrink-0 ${sel.ov.oculto === "sim" ? "text-negative" : "text-faint hover:text-ink"}`}>
                              <Icon name="eye" size={14} color="currentColor" />
                            </button>
                            <button onClick={() => removerSel(sel.key)} title="Tirar da lista (não altera a tela)" className="text-faint hover:text-negative shrink-0">
                              <Icon name="x" size={13} color="currentColor" />
                            </button>
                          </div>
                          {aberto && (
                            <div className="px-3 pb-3 pt-2 flex flex-col gap-3 border-t border-border-soft bg-surface-1/40">
                              {/* escopo */}
                              <div className="flex items-center gap-2">
                                <span className="text-caption text-muted">Aplicar em</span>
                                <div className="inline-flex rounded-md border border-border overflow-hidden ml-auto">
                                  <button onClick={() => setEscopo(sel.key, "este")}
                                    className={`px-2 py-1 text-[11px] ${sel.escopo === "este" ? "bg-ink text-white" : "text-muted hover:bg-surface-2"}`}>Só este</button>
                                  <button onClick={() => setEscopo(sel.key, "tipo")} disabled={!sel.padraoId}
                                    className={`px-2 py-1 text-[11px] disabled:opacity-40 ${sel.escopo === "tipo" ? "bg-ink text-white" : "text-muted hover:bg-surface-2"}`}>Todos do tipo</button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] text-faint">{alvos} elemento{alvos === 1 ? "" : "s"} afetado{alvos === 1 ? "" : "s"}</span>
                                <button onClick={() => subirNivel(sel.key)} className="text-[11px] text-muted hover:text-ink underline">selecionar o container ↑</button>
                              </div>
                              {ORDEM_PROPS.map((p) => (
                                <Controle key={p} prop={p} valor={sel.ov[p]}
                                  onChange={(v) => setSelProp(sel.key, p, v)} onClear={() => clearSelProp(sel.key, p)} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )
              )}

              {/* ---------- ABA: POR TIPO ---------- */}
              {/* ---------- ABA: FONTES (uma fonte por papel) ---------- */}
              {aba === "fontes" && (
                <>
                  <p className="m-0 text-[11px] text-faint leading-snug -mb-1">
                    Cada papel pode ter a SUA fonte. Deixe em “— herdar —” para seguir a fonte global.
                    Estes ajustes valem em todo o app (a Home é a página de teste).
                  </p>
                  {PAPEIS.map((papel) => {
                    const ov = s.padroes[papel.id] ?? {};
                    const fonteId = (ov.fonte as string) ?? "";
                    const stack = stackDe(fonteId);
                    return (
                      <div key={papel.id}
                        onMouseEnter={() => realcar(PADROES.find((p) => p.id === papel.id)?.seletorTipo ?? null)}
                        onMouseLeave={() => realcar(null)}
                        className={`rounded-md border p-3 flex flex-col gap-2 ${fonteId ? "border-ink/30" : "border-border"}`}>
                        <div className="flex items-baseline gap-2">
                          <span className="text-[13px] text-ink font-medium">{papel.label}</span>
                          <span className="text-[11px] text-faint truncate">· {papel.dica}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <select value={fonteId}
                            onChange={(e) => (e.target.value ? setPadProp(papel.id, "fonte", e.target.value) : clearPadProp(papel.id, "fonte"))}
                            className="flex-1 text-caption text-ink bg-white rounded-sm px-2 py-[6px] border border-border">
                            {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                          </select>
                          <input type="number" min={8} max={96}
                            value={(ov.size as number) ?? ""} placeholder="px"
                            onChange={(e) => (e.target.value ? setPadProp(papel.id, "size", Number(e.target.value)) : clearPadProp(papel.id, "size"))}
                            className="w-[62px] text-caption tabular-nums text-ink bg-white rounded-sm px-2 py-[6px] border border-border" />
                        </div>
                        {/* amostra na fonte escolhida */}
                        <div className="rounded-sm bg-surface-2 px-2 py-[6px] text-ink truncate"
                          style={{ fontFamily: stack || undefined, fontSize: (ov.size as number) ?? 16 }}>
                          {papel.id === "numeros" ? "R$ 243.586,52" : "Bem-vindo, João!"}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {aba === "padroes" && (["Menu", "Textos", "Componentes"] as const).map((g) => (
                <Secao key={g} titulo={g} hint="muda TODOS deste tipo">
                  <div className="flex flex-col gap-[6px]">
                    {PADROES.filter((p) => p.grupo === g).map((p) => {
                      const ov = s.padroes[p.id] ?? {};
                      const n = Object.keys(ov).length;
                      const aberto = expandido === `p:${p.id}`;
                      return (
                        <div key={p.id} onMouseEnter={() => realcar(p.seletorTipo)} onMouseLeave={() => realcar(null)}
                          className={`rounded-md border overflow-hidden ${n ? "border-ink/30" : "border-border"}`}>
                          <button onClick={() => setExpandido(aberto ? null : `p:${p.id}`)} className="w-full flex items-center gap-2 px-3 py-[9px] text-left hover:bg-surface-2">
                            <Icon name={aberto ? "chevron-down" : "chevron-right"} size={14} color="var(--color-text-tertiary)" />
                            <span className="text-[13px] text-ink flex-1 truncate">{p.label}</span>
                            {n > 0 && <span className="text-[10px] font-semibold text-on-lime bg-lime rounded-pill px-[7px] py-[1px]">{n}</span>}
                          </button>
                          {aberto && (
                            <div className="px-3 pb-3 pt-2 flex flex-col gap-3 border-t border-border-soft bg-surface-1/40">
                              {ORDEM_PROPS.filter((x) => x !== "texto").map((x) => (
                                <Controle key={x} prop={x} valor={ov[x]} onChange={(v) => setPadProp(p.id, x, v)} onClear={() => clearPadProp(p.id, x)} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Secao>
              ))}

              {/* ---------- ABA: GLOBAL ---------- */}
              {aba === "global" && (
                <>
                  <Secao titulo="Fonte do sistema" hint="muda tudo (inclui o menu)">
                    <div className="grid grid-cols-2 gap-2">
                      {FONTS_GLOBAL.map((f) => (
                        <button key={f.id} onClick={() => set({ font: f.id })}
                          className={`text-left px-3 py-2 rounded-md border text-[14px] ${s.font === f.id ? "border-ink bg-surface-2 text-ink font-semibold" : "border-border text-muted hover:text-ink"}`}
                          style={{ fontFamily: f.stack }}>{f.label}</button>
                      ))}
                    </div>
                    <label className="flex items-center gap-2 mt-2 text-caption text-muted cursor-pointer">
                      <input type="checkbox" checked={s.numMesmaFonte} onChange={(e) => set({ numMesmaFonte: e.target.checked })} />
                      Aplicar a fonte também nos números
                    </label>
                    <RangeSimples label="Espaçamento global" v={s.tracking} min={-8} max={6} step={0.5} onChange={(v) => set({ tracking: v })} un="/100 em" />
                  </Secao>
                  {/* ARREDONDAMENTO — raio dos botões (e companhia) */}
                  <Secao titulo="Arredondamento" hint="raio dos botões, cards…">
                    <div className="flex flex-col gap-2">
                      {RAIOS.map((r) => {
                        const ov = s.padroes[r.id] ?? {};
                        const raio = ov.radius as number | undefined;
                        return (
                          <div key={r.id}
                            onMouseEnter={() => realcar(PADROES.find((p) => p.id === r.id)?.seletorTipo ?? null)}
                            onMouseLeave={() => realcar(null)}
                            className={`rounded-md border p-3 flex flex-col gap-2 ${raio !== undefined ? "border-ink/30" : "border-border"}`}>
                            <div className="flex items-center gap-2">
                              <span className="flex-1 min-w-0">
                                <span className="block text-[13px] text-ink font-medium truncate">{r.label}</span>
                                <span className="block text-[11px] text-faint truncate">{r.dica}</span>
                              </span>
                              <input type="number" min={0} max={999} step={1} placeholder="px"
                                value={raio ?? ""}
                                onChange={(e) => (e.target.value === "" ? clearPadProp(r.id, "radius") : setPadProp(r.id, "radius", Number(e.target.value)))}
                                className="w-[62px] text-caption tabular-nums text-ink bg-surface-2 rounded-sm px-2 py-1 border border-border shrink-0" />
                              {raio !== undefined && (
                                <button onClick={() => clearPadProp(r.id, "radius")}
                                  title="Voltar ao padrão" className="text-faint hover:text-negative shrink-0">
                                  <Icon name="x" size={13} color="currentColor" />
                                </button>
                              )}
                            </div>
                            <input type="range" min={0} max={40} step={1}
                              value={Math.min(raio ?? 0, 40)}
                              onChange={(e) => setPadProp(r.id, "radius", Number(e.target.value))}
                              className="w-full accent-ink" />
                          </div>
                        );
                      })}
                    </div>
                    <p className="m-0 text-[11px] text-faint leading-snug">
                      A régua vai até 40px; para a <strong>pílula</strong>, digite 999 no campo.
                      Para UM elemento específico, use a aba <strong>Itens</strong>.
                    </p>
                  </Secao>

                  {/* BORDAS — espessura + cor nos alvos mais pedidos */}
                  <Secao titulo="Bordas" hint="espessura e cor">
                    <div className="flex flex-col gap-2">
                      {BORDAS.map((b) => {
                        const ov = s.padroes[b.id] ?? {};
                        const w = ov.borderW as number | undefined;
                        const cor = (ov.borderColor as string) ?? "#eceae4";
                        return (
                          <div key={b.id}
                            onMouseEnter={() => realcar(PADROES.find((p) => p.id === b.id)?.seletorTipo ?? null)}
                            onMouseLeave={() => realcar(null)}
                            className={`rounded-md border p-3 flex flex-col gap-2 ${w || ov.borderColor !== undefined ? "border-ink/30" : "border-border"}`}>
                            <span className="text-[13px] text-ink font-medium">{b.label}</span>
                            <div className="flex items-center gap-2">
                              <input type="color" value={cor}
                                onChange={(e) => setPadProp(b.id, "borderColor", e.target.value)}
                                className="w-8 h-8 rounded-md border border-border shrink-0 cursor-pointer bg-transparent p-0" />
                              <input value={ov.borderColor !== undefined ? cor : ""} placeholder="cor"
                                onChange={(e) => setPadProp(b.id, "borderColor", e.target.value)}
                                className="w-[84px] text-caption tabular-nums text-ink bg-surface-2 rounded-sm px-2 py-1 border border-border" />
                              <input type="number" min={0} max={8} step={1} placeholder="px"
                                value={w ?? ""}
                                onChange={(e) => (e.target.value === "" ? clearPadProp(b.id, "borderW") : setPadProp(b.id, "borderW", Number(e.target.value)))}
                                className="w-[62px] text-caption tabular-nums text-ink bg-surface-2 rounded-sm px-2 py-1 border border-border" />
                              {(w !== undefined || ov.borderColor !== undefined) && (
                                <button onClick={() => { clearPadProp(b.id, "borderW"); clearPadProp(b.id, "borderColor"); }}
                                  title="Sem borda" className="text-faint hover:text-negative shrink-0">
                                  <Icon name="x" size={13} color="currentColor" />
                                </button>
                              )}
                            </div>
                            <span className="text-[11px] text-faint">
                              {w === undefined && ov.borderColor !== undefined
                                ? "espessura vazia → assume 1px"
                                : "deixe a espessura vazia para 1px · × remove"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="m-0 text-[11px] text-faint leading-snug">
                      Para a borda de UM elemento específico, use a aba <strong>Itens</strong>.
                    </p>
                  </Secao>

                  {SECOES_COR.map((sec) => (
                    <Secao key={sec} titulo={sec === "Fundos" ? "Fundos (página, cards…)" : `Cores · ${sec}`}
                      hint={sec === "Fundos" ? "é aqui que se muda o fundo" : undefined}>
                      <div className="flex flex-col gap-[6px]">
                        {COR_CAMPOS.filter((c) => c.secao === sec).map((c) => (
                          <div key={c.key} className={`flex items-center gap-2 ${sec === "Fundos" ? "bg-surface-1/60 rounded-sm px-2 py-[5px]" : ""}`}>
                            <input type="color" value={s.cores[c.key]} onChange={(e) => setCor(c.key, e.target.value)}
                              className="w-8 h-8 rounded-md border border-border shrink-0 cursor-pointer bg-transparent p-0" />
                            <span className="flex-1 min-w-0">
                              <span className="block text-caption text-ink truncate">{c.label}</span>
                              {c.dica && <span className="block text-[11px] text-faint truncate">{c.dica}</span>}
                            </span>
                            <input value={s.cores[c.key]} onChange={(e) => setCor(c.key, e.target.value)}
                              className="w-[86px] text-caption tabular-nums text-ink bg-surface-2 rounded-sm px-2 py-1 border border-border shrink-0" />
                          </div>
                        ))}
                      </div>
                    </Secao>
                  ))}
                </>
              )}
            </div>

            <footer className="shrink-0 border-t border-border-soft p-4 flex flex-col gap-2">
              <button onClick={copiar} className="w-full rounded-md bg-ink text-white text-label font-medium py-[10px] hover:opacity-90 inline-flex items-center justify-center gap-2">
                <Icon name={copiado ? "check" : "file-text"} size={15} color="var(--color-lime)" />
                {copiado ? "Copiado! Cole no Claude Code" : "Copiar para o Claude Code"}
              </button>
              <p className="m-0 text-[11px] text-faint leading-snug">Mudanças aqui são de teste (salvas só no seu navegador). Cole o texto no chat p/ eu levar ao código.</p>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

/* ============================== AUXILIARES ============================== */
function Realce({ rect, label, sutil }: { rect: DOMRect; label: string; sutil?: boolean }) {
  return (
    <div data-designlab className="fixed z-[95] pointer-events-none rounded-[6px]"
      style={{
        left: rect.left - 2, top: rect.top - 2, width: rect.width + 4, height: rect.height + 4,
        outline: `2px solid var(--color-lime)`, background: sutil ? "rgba(225,255,0,0.10)" : "rgba(225,255,0,0.16)",
        boxShadow: "0 0 0 1px rgba(17,25,12,0.55)",
      }}>
      {label && (
        <span className="absolute -top-6 left-0 text-[11px] font-semibold px-2 py-[2px] rounded-md whitespace-nowrap"
          style={{ background: "var(--color-ink,#11190c)", color: "var(--color-lime,#e1ff00)" }}>{label}</span>
      )}
    </div>
  );
}

function Controle({ prop, valor, onChange, onClear }: { prop: Prop; valor: number | string | undefined; onChange: (v: number | string) => void; onClear: () => void }) {
  const m = PROPS_META[prop];
  const ativo = valor !== undefined;

  if (m.kind === "toggle") {
    const on = valor === "sim";
    return (
      <button onClick={() => (on ? onClear() : onChange("sim"))}
        className={`flex items-center gap-2 w-full text-left rounded-sm px-2 py-[7px] border ${on ? "border-negative/40 bg-negative/5" : "border-border hover:bg-surface-2"}`}>
        <span className={`w-[30px] h-[18px] rounded-pill p-[2px] shrink-0 transition-colors ${on ? "bg-negative" : "bg-surface-3"}`}>
          <span className={`block w-[14px] h-[14px] rounded-pill bg-white transition-transform ${on ? "translate-x-[12px]" : ""}`} />
        </span>
        <span className="min-w-0">
          <span className={`block text-caption ${on ? "text-negative font-medium" : "text-ink"}`}>{m.label}</span>
          {m.dica && <span className="block text-[11px] text-faint truncate">{m.dica}</span>}
        </span>
      </button>
    );
  }
  if (m.kind === "text") {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between text-caption">
          <span className="text-muted">{m.label}</span>
          {ativo && <Limpar onClick={onClear} />}
        </div>
        <input value={(valor as string) ?? ""} placeholder="escreva p/ trocar · vazio apaga · × restaura" onChange={(e) => onChange(e.target.value)}
          className="w-full text-caption text-ink bg-white rounded-sm px-2 py-[6px] border border-border" />
      </div>
    );
  }
  if (m.kind === "font") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-caption text-muted flex-1">{m.label}</span>
        <select value={(valor as string) ?? ""} onChange={(e) => (e.target.value ? onChange(e.target.value) : onClear())}
          className="text-caption text-ink bg-white rounded-sm px-2 py-1 border border-border max-w-[170px]">
          {FONTS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        {ativo && <Limpar onClick={onClear} />}
      </div>
    );
  }
  if (m.kind === "color") {
    const v = (valor as string) ?? "#000000";
    return (
      <div className="flex items-center gap-2">
        <input type="color" value={v} onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded-md border border-border shrink-0 cursor-pointer bg-transparent p-0" />
        <span className="text-caption text-muted flex-1">{m.label}</span>
        <input value={ativo ? v : ""} placeholder="—" onChange={(e) => onChange(e.target.value)}
          className="w-[80px] text-caption tabular-nums text-ink bg-surface-2 rounded-sm px-2 py-1 border border-border" />
        {ativo && <Limpar onClick={onClear} />}
      </div>
    );
  }
  if (m.kind === "seg") {
    const v = (valor as string) ?? "";
    return (
      <div className="flex items-center gap-2">
        <span className="text-caption text-muted flex-1">{m.label}</span>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {(m.opcoes ?? []).map((c) => (
            <button key={c.v} onClick={() => onChange(c.v)}
              className={`px-2 py-1 text-[12px] ${v === c.v ? "bg-ink text-white" : "text-muted hover:bg-surface-2"}`}>{c.label}</button>
          ))}
        </div>
        {ativo && <Limpar onClick={onClear} />}
      </div>
    );
  }
  const v = (valor as number) ?? m.min ?? 0;
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-caption">
        <span className="text-muted">{m.label}</span>
        <span className="flex items-center gap-2">
          <span className={`tabular-nums font-medium ${ativo ? "text-ink" : "text-faint"}`}>{ativo ? `${v}${m.un ? ` ${m.un}` : ""}` : "—"}</span>
          {ativo && <Limpar onClick={onClear} />}
        </span>
      </div>
      <input type="range" min={m.min} max={m.max} step={m.step ?? 1} value={v}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink" />
    </label>
  );
}

function Limpar({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} title="Limpar" className="text-faint hover:text-negative shrink-0"><Icon name="x" size={12} color="currentColor" /></button>;
}

function Secao({ titulo, hint, children }: { titulo: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="m-0 text-[12px] font-semibold uppercase tracking-wide text-faint">{titulo}</h3>
        {hint && <span className="text-[11px] text-faint">· {hint}</span>}
      </div>
      {children}
    </section>
  );
}

function RangeSimples({ label, v, min, max, step = 1, onChange, un }: { label: string; v: number; min: number; max: number; step?: number; onChange: (v: number) => void; un?: string }) {
  return (
    <label className="flex flex-col gap-1 mt-1">
      <div className="flex items-center justify-between text-caption">
        <span className="text-muted">{label}</span>
        <span className="text-ink tabular-nums font-medium">{v}{un ? ` ${un}` : ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink" />
    </label>
  );
}

/* ====================== EXPORT p/ o Claude Code ====================== */
/** Traduz o valor cru para algo acionável no código. */
function valorLegivel(p: Prop, v: number | string): string {
  if (p === "fonte") {
    const f = FONTS.find((x) => x.id === v);
    return f ? `${f.label}  →  font-family: ${f.stack}` : String(v);
  }
  if (p === "oculto") return "REMOVER este elemento da interface";
  if (p === "semIcone") return "REMOVER o(s) ícone(s) de dentro deste elemento";
  if (p === "semTexto") return "REMOVER o texto (manter ícone/caixa)";
  if (p === "texto") return v === "" ? "(apagar o texto)" : `trocar para “${v}”`;
  return String(v);
}

function gerarInstrucao(s: DesignState): string {
  const f = FONTS.find((x) => x.id === s.font);
  const L: string[] = [];
  L.push("Aplique estes ajustes do Laboratório de Design ao design system all4pay,");
  L.push("promovendo-os ao código (globals.css .ds-visor / .a4p-sidebar / componentes):");
  L.push("");
  L.push("GLOBAL");
  L.push(`  Fonte: ${f?.label} — ${f?.stack}${s.numMesmaFonte ? " (também nos números)" : ""}`);
  L.push(`  Tracking base: ${(s.tracking / 100).toFixed(3)}em`);
  L.push("  Cores:");
  for (const c of COR_CAMPOS) L.push(`    ${c.varName}: ${s.cores[c.key]};`);
  const pads = Object.keys(s.padroes);
  if (pads.length) {
    L.push("");
    L.push("POR TIPO (todos os elementos do padrão):");
    for (const p of PADROES) {
      const ov = s.padroes[p.id];
      if (!ov || !Object.keys(ov).length) continue;
      L.push(`  • ${p.label}   [${p.seletorTipo}]`);
      for (const k of ORDEM_PROPS) if (k in ov) L.push(`      ${k}: ${valorLegivel(k, ov[k]!)}`);
    }
  }
  const sels = s.selecoes.filter((x) => Object.keys(x.ov).length);
  if (sels.length) {
    L.push("");
    L.push("ITENS INDIVIDUAIS (elemento específico — veja o seletor):");
    for (const sel of sels) {
      L.push(`  • ${sel.rotulo}${sel.amostra ? ` — “${sel.amostra}”` : ""}`);
      L.push(`      escopo: ${sel.escopo === "este" ? "só este elemento" : "todos do tipo"}`);
      L.push(`      seletor: ${sel.escopo === "tipo" ? (PADROES.find((p) => p.id === sel.padraoId)?.seletorTipo ?? sel.seletor) : sel.seletor}`);
      for (const k of ORDEM_PROPS) if (k in sel.ov) L.push(`      ${k}: ${valorLegivel(k, sel.ov[k]!)}`);
    }
  }
  L.push("");
  L.push("JSON:");
  L.push(JSON.stringify(s));
  return L.join("\n");
}
