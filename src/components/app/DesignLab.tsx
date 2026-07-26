"use client";

/**
 * Laboratório de Design — editor VIVO do design system, item a item.
 *
 * Três modos de trabalho, todos aplicando na hora (injeta um <style> e salva no
 * navegador; nada é escrito no código a partir daqui — é um sandbox):
 *
 *  1. GLOBAL — troca a FONTE do sistema (inclui o menu) e os TOKENS de cor
 *     (afetam app + gráficos, escopo .ds-visor).
 *  2. ITEM A ITEM — cada PADRÃO da interface é um alvo editável com seus próprios
 *     controles (tamanho, peso, cor, fundo, espaçamento, caixa-alta, raio,
 *     padding): título de página, subtítulo, título de card, KPI, corpo, rótulo,
 *     legenda, card, chip de ícone, botão — e o MENU (fundo, item, pílula ativa,
 *     rótulo de seção).
 *  3. SELECIONAR NA TELA — liga o "modo alvo": passe o mouse (destaca) e clique
 *     em qualquer elemento; o Lab RECONHECE o padrão e abre os controles dele.
 *
 * "Copiar para o Claude Code" gera um bloco (global + overrides por alvo, com os
 * seletores) que você cola no chat — e eu promovo ao código (globals.css/tailwind).
 */
import * as React from "react";
import { Icon } from "@/components/ui";

const KEY = "a4p_designlab";
const STYLE_ID = "a4p-designlab-style";

/* ============================ FONTES (global) ============================ */
const FONTS: { id: string; label: string; stack: string }[] = [
  { id: "hanken", label: "Hanken Grotesk", stack: '"Hanken Grotesk Variable","Hanken Grotesk",sans-serif' },
  { id: "roobert", label: "Roobert", stack: '"Roobert",sans-serif' },
  { id: "boldonse", label: "Boldonse", stack: '"Boldonse",sans-serif' },
  { id: "schibsted", label: "Schibsted Grotesk", stack: '"Schibsted Grotesk Variable",sans-serif' },
  { id: "geist", label: "Geist Mono", stack: '"Geist Mono Variable",ui-monospace,monospace' },
  { id: "system", label: "Sistema", stack: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" },
];
const stackDe = (id: string) => FONTS.find((f) => f.id === id)?.stack ?? FONTS[0].stack;

/* ======================== TOKENS DE COR (global) ======================== */
const COR_CAMPOS: { key: string; label: string; varName: string }[] = [
  { key: "ink", label: "Ink (títulos/valores)", varName: "--color-ink" },
  { key: "lime", label: "Lima (acento)", varName: "--color-lime" },
  { key: "onLime", label: "Texto sobre lima", varName: "--color-on-lime" },
  { key: "bg", label: "Fundo da página", varName: "--color-surface-1" },
  { key: "surface2", label: "Superfície 2 (chips/seções)", varName: "--color-surface-2" },
  { key: "border", label: "Borda / divisor", varName: "--color-border" },
  { key: "body", label: "Texto corpo", varName: "--color-text-secondary" },
  { key: "muted", label: "Texto muted", varName: "--color-text-tertiary" },
  { key: "positive", label: "Positivo (Pago)", varName: "--color-positive" },
  { key: "negative", label: "Negativo (Falha)", varName: "--color-negative" },
  { key: "warning", label: "Alerta", varName: "--color-warning" },
];

/* ===================== ALVOS (edição item a item) ===================== */
type Prop = "size" | "weight" | "tracking" | "transform" | "color" | "bg" | "radius" | "padding";

interface TargetDef {
  id: string;
  label: string;
  group: "Menu" | "Textos" | "Componentes";
  /** Seletor CSS onde as regras são aplicadas (aceita lista separada por vírgula). */
  selector: string;
  /** Onde a COR é aplicada, se diferente do selector (ex.: glifo do chip, texto do item ativo). */
  colorSelector?: string;
  /** Seletor usado no "selecionar na tela" (closest); default = selector. */
  pick?: string;
  props: Prop[];
  /** Valores-base p/ posicionar os controles (não são emitidos até você mexer). */
  base?: Partial<Record<Prop, number | string>>;
}

// Ordem = prioridade no "selecionar na tela" (específico → genérico).
const TARGETS: TargetDef[] = [
  // ---- MENU (lateral, fora do escopo .ds-visor) ----
  {
    id: "menuActive", label: "Menu · item ativo (pílula)", group: "Menu",
    selector: '.a4p-sidebar nav a[aria-current="page"]',
    colorSelector: '.a4p-sidebar nav a[aria-current="page"] span,.a4p-sidebar nav a[aria-current="page"] svg',
    props: ["bg", "color", "radius", "size", "weight"],
    base: { bg: "#e1ff00", color: "#11190c", radius: 12, size: 15, weight: 600 },
  },
  {
    id: "menuItem", label: "Menu · item (inativo)", group: "Menu",
    selector: '.a4p-sidebar nav a span',
    pick: '.a4p-sidebar nav a',
    props: ["size", "weight", "color", "tracking"],
    base: { size: 15, weight: 500, color: "#6b7280" },
  },
  {
    id: "menuLabel", label: "Menu · rótulo de seção", group: "Menu",
    selector: '.a4p-sidebar nav > div > span',
    props: ["size", "weight", "color", "tracking", "transform"],
    base: { size: 12, weight: 600, color: "#959595" },
  },
  {
    id: "menuBg", label: "Menu · fundo", group: "Menu",
    selector: '.a4p-sidebar',
    props: ["bg"],
    base: { bg: "#ffffff" },
  },
  // ---- TEXTOS (escopo .ds-visor) ----
  {
    id: "kpi", label: "Valor / número-herói (KPI)", group: "Textos",
    selector: '.ds-visor .text-value-lg,.ds-visor .a4p-num',
    props: ["size", "weight", "color", "tracking"],
    base: { size: 36, weight: 600, color: "#11190c" },
  },
  {
    id: "h1", label: "Título da página (H1)", group: "Textos",
    selector: '.ds-visor h1,.ds-visor .text-h1',
    props: ["size", "weight", "color", "tracking", "transform"],
    base: { size: 35, weight: 600, color: "#11190c" },
  },
  {
    id: "h2", label: "Subtítulo / seção (H2)", group: "Textos",
    selector: '.ds-visor h2,.ds-visor .text-h2',
    props: ["size", "weight", "color", "tracking", "transform"],
    base: { size: 30, weight: 600, color: "#11190c" },
  },
  {
    id: "h3", label: "Título de card (H3)", group: "Textos",
    selector: '.ds-visor h3,.ds-visor .text-h3',
    props: ["size", "weight", "color", "tracking", "transform"],
    base: { size: 18, weight: 600, color: "#11190c" },
  },
  {
    id: "label", label: "Rótulo (label)", group: "Textos",
    selector: '.ds-visor .text-label',
    props: ["size", "weight", "color", "tracking"],
    base: { size: 15, weight: 500, color: "#3f4a38" },
  },
  {
    id: "body", label: "Corpo (texto)", group: "Textos",
    selector: '.ds-visor .text-body',
    props: ["size", "weight", "color", "tracking"],
    base: { size: 16, weight: 400, color: "#3f4a38" },
  },
  {
    id: "caption", label: "Legenda (caption)", group: "Textos",
    selector: '.ds-visor .text-caption',
    props: ["size", "weight", "color", "tracking", "transform"],
    base: { size: 13, weight: 400, color: "#6b7280" },
  },
  // ---- COMPONENTES (escopo .ds-visor) ----
  {
    id: "iconTile", label: "Chip de ícone (IconTile)", group: "Componentes",
    selector: '.ds-visor [data-icontile]',
    colorSelector: '.ds-visor [data-icontile] svg',
    props: ["bg", "color", "radius"],
    base: { bg: "#11190c", color: "#e1ff00", radius: 12 },
  },
  {
    id: "card", label: "Card (caixa branca)", group: "Componentes",
    selector: '.ds-visor [data-card="1"]',
    props: ["bg", "radius", "padding"],
    base: { bg: "#ffffff", radius: 16, padding: 24 },
  },
  {
    id: "button", label: "Botão", group: "Componentes",
    selector: '.ds-visor button',
    props: ["size", "weight", "radius"],
    base: { size: 15, weight: 500, radius: 999 },
  },
];

const PROP_META: Record<Prop, { label: string; kind: "range" | "color" | "seg"; min?: number; max?: number; step?: number; unidade?: string }> = {
  size: { label: "Tamanho", kind: "range", min: 8, max: 72, unidade: "px" },
  weight: { label: "Peso", kind: "range", min: 300, max: 800, step: 100 },
  tracking: { label: "Espaçamento", kind: "range", min: -6, max: 4, step: 0.5, unidade: "/100 em" },
  transform: { label: "Caixa", kind: "seg" },
  color: { label: "Cor", kind: "color" },
  bg: { label: "Fundo", kind: "color" },
  radius: { label: "Raio", kind: "range", min: 0, max: 999, unidade: "px" },
  padding: { label: "Padding", kind: "range", min: 0, max: 48, unidade: "px" },
};

/* =============================== ESTADO =============================== */
type TargetOverrides = Partial<Record<Prop, number | string>>;
interface DesignState {
  font: string;
  numMesmaFonte: boolean;
  tracking: number; // ×100 (−2 = −0.02em) — tracking global do app
  cores: Record<string, string>;
  targets: Record<string, TargetOverrides>;
}

const DEFAULT_CORES: Record<string, string> = {
  ink: "#11190c", lime: "#e1ff00", onLime: "#11190c", bg: "#f3f1ee",
  surface2: "#f0eee9", border: "#eceae4", body: "#3f4a38", muted: "#6b7280",
  positive: "#3f6212", negative: "#b42318", warning: "#92400e",
};
const DEFAULTS: DesignState = {
  font: "hanken", numMesmaFonte: false, tracking: -1,
  cores: { ...DEFAULT_CORES }, targets: {},
};

function carregar(): DesignState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw);
    return {
      ...DEFAULTS, ...p,
      cores: { ...DEFAULTS.cores, ...(p.cores ?? {}) },
      targets: { ...(p.targets ?? {}) },
    };
  } catch { return DEFAULTS; }
}

/* ============================ GERAÇÃO DE CSS ============================ */
function declFor(p: Prop, v: number | string): string {
  switch (p) {
    case "size": return `font-size:${v}px !important`;
    case "weight": return `font-weight:${v} !important`;
    case "tracking": return `letter-spacing:${(Number(v) / 100).toFixed(3)}em !important`;
    case "transform": return `text-transform:${v} !important`;
    case "color": return `color:${v} !important`;
    case "bg": return `background-color:${v} !important`;
    case "radius": return `border-radius:${v}px !important`;
    case "padding": return `padding:${v}px !important`;
  }
}

function ruleForTarget(t: TargetDef, ov: TargetOverrides): string {
  const main: string[] = [];
  let corExtra = "";
  for (const p of t.props) {
    if (!(p in ov)) continue;
    const v = ov[p]!;
    if (p === "color" && t.colorSelector) { corExtra = `${t.colorSelector}{${declFor("color", v)};}`; continue; }
    main.push(declFor(p, v));
  }
  const parts: string[] = [];
  if (main.length) parts.push(`${t.selector}{${main.join(";")}}`);
  if (corExtra) parts.push(corExtra);
  return parts.join("\n");
}

function montarCSS(s: DesignState): string {
  const stack = stackDe(s.font);
  const tr = (s.tracking / 100).toFixed(3);
  const vars = COR_CAMPOS.map((c) => `${c.varName}:${s.cores[c.key]};`).join("");
  const out: string[] = [
    // Global: tokens de cor (app + gráficos)
    `html:not(.dark) .ds-visor{${vars}}`,
    // Global: fonte (inclui o MENU) + tracking base do app
    `.ds-visor,.ds-visor *,.a4p-sidebar,.a4p-sidebar *{font-family:${stack};}`,
    `.ds-visor,.ds-visor *{letter-spacing:${tr}em;}`,
  ];
  if (s.numMesmaFonte) {
    out.push(`.ds-visor .tabular-nums,.ds-visor .a4p-num,.ds-visor .a4p-num *{font-family:${stack} !important;}`);
  }
  // Item a item
  for (const t of TARGETS) {
    const ov = s.targets[t.id];
    if (ov && Object.keys(ov).length) { const r = ruleForTarget(t, ov); if (r) out.push(r); }
  }
  return out.join("\n");
}

function aplicar(s: DesignState) {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) { el = document.createElement("style"); el.id = STYLE_ID; document.head.appendChild(el); }
  el.textContent = montarCSS(s);
}

/** Injeta o estilo salvo assim que a página monta (antes de abrir o painel). */
export function DesignLabStyle() {
  React.useEffect(() => { aplicar(carregar()); }, []);
  return null;
}

/* ====================== SELECIONAR NA TELA (pick) ====================== */
function acharAlvo(el: Element | null): TargetDef | null {
  if (!el) return null;
  for (const t of TARGETS) {
    try { if (el.closest(t.pick || t.selector)) return t; } catch { /* seletor inválido */ }
  }
  return null;
}

/* ============================== COMPONENTE ============================== */
export function DesignLab() {
  const [open, setOpen] = React.useState(false);
  const [s, setS] = React.useState<DesignState>(DEFAULTS);
  const [copiado, setCopiado] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const [aberto, setAberto] = React.useState<Set<string>>(new Set());
  const [hover, setHover] = React.useState<{ rect: DOMRect; label: string } | null>(null);
  const selRefs = React.useRef<Record<string, HTMLDivElement | null>>({});

  React.useEffect(() => { setS(carregar()); }, []);
  React.useEffect(() => {
    aplicar(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, [s]);

  const set = (patch: Partial<DesignState>) => setS((p) => ({ ...p, ...patch }));
  const setCor = (k: string, v: string) => setS((p) => ({ ...p, cores: { ...p.cores, [k]: v } }));
  const setProp = (tid: string, p: Prop, v: number | string) =>
    setS((prev) => ({ ...prev, targets: { ...prev.targets, [tid]: { ...prev.targets[tid], [p]: v } } }));
  const clearProp = (tid: string, p: Prop) =>
    setS((prev) => {
      const nt = { ...prev.targets[tid] }; delete nt[p];
      const targets = { ...prev.targets };
      if (Object.keys(nt).length) targets[tid] = nt; else delete targets[tid];
      return { ...prev, targets };
    });
  const clearTarget = (tid: string) =>
    setS((prev) => { const targets = { ...prev.targets }; delete targets[tid]; return { ...prev, targets }; });
  const resetTudo = () => setS({ ...DEFAULTS, cores: { ...DEFAULT_CORES }, targets: {} });

  const toggleAberto = (id: string) =>
    setAberto((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const selecionar = React.useCallback((id: string) => {
    setAberto((prev) => new Set(prev).add(id));
    setOpen(true);
    setTimeout(() => selRefs.current[id]?.scrollIntoView({ block: "center", behavior: "smooth" }), 60);
  }, []);

  // Modo "selecionar na tela"
  React.useEffect(() => {
    if (!picking) { setHover(null); return; }
    const dentroDoLab = (el: EventTarget | null) => el instanceof Element && !!el.closest("[data-designlab]");
    const onMove = (e: MouseEvent) => {
      if (dentroDoLab(e.target)) { setHover(null); return; }
      const t = acharAlvo(e.target as Element);
      if (!t) { setHover(null); return; }
      const node = (e.target as Element).closest(t.pick || t.selector);
      if (node) setHover({ rect: node.getBoundingClientRect(), label: t.label });
    };
    const onClick = (e: MouseEvent) => {
      if (dentroDoLab(e.target)) return;
      const t = acharAlvo(e.target as Element);
      if (!t) return;
      e.preventDefault(); e.stopPropagation();
      setPicking(false); selecionar(t.id);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPicking(false); };
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [picking, selecionar]);

  const instrucao = React.useMemo(() => gerarInstrucao(s), [s]);
  const copiar = () => {
    try { void navigator.clipboard?.writeText(instrucao); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* ignore */ }
  };

  const nOverrides = Object.keys(s.targets).length;
  const grupos: TargetDef["group"][] = ["Menu", "Textos", "Componentes"];

  return (
    <>
      {/* Botão flutuante */}
      <button
        data-designlab
        onClick={() => setOpen((o) => !o)}
        aria-label="Laboratório de Design"
        title="Laboratório de Design (editar o DS na unha)"
        className="fixed bottom-5 left-5 z-[85] inline-flex items-center gap-2 rounded-pill bg-ink text-white pl-3 pr-4 py-[9px] shadow-popover hover:opacity-90"
      >
        <span className="w-[26px] h-[26px] rounded-md bg-lime inline-flex items-center justify-center">
          <Icon name="palette" size={15} color="var(--color-on-lime)" />
        </span>
        <span className="text-[14px] font-semibold">Design</span>
      </button>

      {/* Realce do "selecionar na tela" */}
      {picking && hover && (
        <div data-designlab className="fixed z-[95] pointer-events-none rounded-[6px]"
          style={{
            left: hover.rect.left - 2, top: hover.rect.top - 2,
            width: hover.rect.width + 4, height: hover.rect.height + 4,
            outline: "2px solid var(--color-lime)", background: "rgba(225,255,0,0.12)",
            boxShadow: "0 0 0 1px rgba(17,25,12,0.6)",
          }}>
          <span className="absolute -top-6 left-0 text-[11px] font-semibold px-2 py-[2px] rounded-md whitespace-nowrap"
            style={{ background: "var(--color-ink,#11190c)", color: "var(--color-lime,#e1ff00)" }}>
            {hover.label}
          </span>
        </div>
      )}
      {picking && (
        <div data-designlab className="fixed top-3 left-1/2 -translate-x-1/2 z-[96] bg-ink text-white text-[13px] font-medium px-4 py-2 rounded-pill shadow-popover flex items-center gap-2">
          <span className="w-2 h-2 rounded-pill bg-lime animate-pulse" />
          Clique num elemento para editá-lo · Esc para sair
        </div>
      )}

      {open && (
        <>
          <div data-designlab className="fixed inset-0 z-[89] bg-black/20" onClick={() => setOpen(false)} aria-hidden />
          <aside data-designlab className="fixed top-0 right-0 z-[90] h-full w-full sm:w-[420px] bg-white border-l border-border flex flex-col shadow-popover" role="dialog" aria-label="Laboratório de Design">
            {/* header */}
            <header className="flex items-center gap-2 px-4 h-[56px] border-b border-border-soft shrink-0">
              <span className="w-7 h-7 rounded-md bg-ink inline-flex items-center justify-center">
                <Icon name="palette" size={15} color="var(--color-lime)" />
              </span>
              <span className="text-[16px] font-semibold text-ink">Laboratório de Design</span>
              <button onClick={resetTudo} title="Restaurar tudo ao padrão" className="ml-auto text-caption text-muted hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2">Reset</button>
              <button onClick={() => setOpen(false)} aria-label="Fechar" className="w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2">
                <Icon name="x" size={18} color="currentColor" />
              </button>
            </header>

            {/* selecionar na tela */}
            <div className="px-4 pt-3 shrink-0">
              <button
                onClick={() => { setPicking((p) => !p); if (!picking) setOpen(false); }}
                className={`w-full rounded-md py-[10px] text-label font-medium inline-flex items-center justify-center gap-2 border transition-colors ${picking ? "bg-lime text-on-lime border-lime" : "bg-surface-2 text-ink border-border hover:bg-surface-3"}`}
              >
                <Icon name="target" size={16} color="currentColor" />
                {picking ? "Selecionando… (clique num elemento)" : "Selecionar item na tela"}
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
              {/* GLOBAL — fonte */}
              <Secao titulo="Global · Fonte" hint="troca a face de todo o sistema (inclui o menu)">
                <div className="grid grid-cols-2 gap-2">
                  {FONTS.map((f) => (
                    <button key={f.id} onClick={() => set({ font: f.id })}
                      className={`text-left px-3 py-2 rounded-md border text-[14px] ${s.font === f.id ? "border-ink bg-surface-2 text-ink font-semibold" : "border-border text-muted hover:text-ink"}`}
                      style={{ fontFamily: f.stack }}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2 mt-2 text-caption text-muted cursor-pointer">
                  <input type="checkbox" checked={s.numMesmaFonte} onChange={(e) => set({ numMesmaFonte: e.target.checked })} />
                  Aplicar a fonte também nos números
                </label>
                <Range label="Espaçamento global (tracking)" v={s.tracking} min={-6} max={4} step={0.5} onChange={(v) => set({ tracking: v })} unidade="/100 em" />
              </Secao>

              {/* GLOBAL — cores */}
              <Secao titulo="Global · Cores (tokens)" hint="afeta app e gráficos">
                <div className="flex flex-col gap-[6px]">
                  {COR_CAMPOS.map((c) => (
                    <div key={c.key} className="flex items-center gap-2">
                      <input type="color" value={s.cores[c.key]} onChange={(e) => setCor(c.key, e.target.value)}
                        className="w-8 h-8 rounded-md border border-border shrink-0 cursor-pointer bg-transparent p-0" />
                      <span className="text-caption text-muted flex-1 truncate">{c.label}</span>
                      <input value={s.cores[c.key]} onChange={(e) => setCor(c.key, e.target.value)}
                        className="w-[86px] text-caption tabular-nums text-ink bg-surface-2 rounded-sm px-2 py-1 border border-border" />
                    </div>
                  ))}
                </div>
              </Secao>

              {/* ITEM A ITEM — por grupo */}
              {grupos.map((g) => (
                <Secao key={g} titulo={`Item a item · ${g}`} hint={g === "Menu" ? "estilos do menu lateral" : "clique num alvo para editar"}>
                  <div className="flex flex-col gap-[6px]">
                    {TARGETS.filter((t) => t.group === g).map((t) => {
                      const ov = s.targets[t.id] ?? {};
                      const n = Object.keys(ov).length;
                      const isOpen = aberto.has(t.id);
                      return (
                        <div key={t.id} ref={(el) => { selRefs.current[t.id] = el; }}
                          className={`rounded-md border ${n ? "border-ink/30" : "border-border"} overflow-hidden`}>
                          <button onClick={() => toggleAberto(t.id)}
                            className="w-full flex items-center gap-2 px-3 py-[9px] text-left hover:bg-surface-2">
                            <Icon name={isOpen ? "chevron-down" : "chevron-right"} size={14} color="var(--color-text-tertiary)" />
                            <span className="text-[13px] text-ink flex-1 truncate">{t.label}</span>
                            {n > 0 && <span className="text-[10px] font-semibold text-on-lime bg-lime rounded-pill px-[7px] py-[1px]">{n}</span>}
                          </button>
                          {isOpen && (
                            <div className="px-3 pb-3 pt-1 flex flex-col gap-3 border-t border-border-soft bg-surface-1/40">
                              {t.props.map((p) => (
                                <PropControl key={p} prop={p} target={t}
                                  value={ov[p]} onChange={(v) => setProp(t.id, p, v)} onClear={() => clearProp(t.id, p)} />
                              ))}
                              {n > 0 && (
                                <button onClick={() => clearTarget(t.id)} className="self-start text-[11px] text-muted hover:text-negative underline">
                                  limpar este alvo
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Secao>
              ))}
            </div>

            {/* rodapé: exportar */}
            <footer className="shrink-0 border-t border-border-soft p-4 flex flex-col gap-2">
              <button onClick={copiar} className="w-full rounded-md bg-ink text-white text-label font-medium py-[10px] hover:opacity-90 inline-flex items-center justify-center gap-2">
                <Icon name={copiado ? "check" : "file-text"} size={15} color="var(--color-lime)" />
                {copiado ? "Copiado! Cole no Claude Code" : `Copiar para o Claude Code${nOverrides ? ` (${nOverrides} alvo${nOverrides > 1 ? "s" : ""})` : ""}`}
              </button>
              <p className="m-0 text-[11px] text-faint leading-snug">Cole o texto no chat e peça “aplique estes tokens ao design system”. As mudanças aqui são só de teste (não vão pro código sozinhas).</p>
            </footer>
          </aside>
        </>
      )}
    </>
  );
}

/* ============================ CONTROLES ============================ */
const CAIXAS: { v: string; label: string }[] = [
  { v: "none", label: "Aa" }, { v: "uppercase", label: "AA" },
  { v: "lowercase", label: "aa" }, { v: "capitalize", label: "Ab" },
];

function PropControl({ prop, target, value, onChange, onClear }: {
  prop: Prop; target: TargetDef; value: number | string | undefined;
  onChange: (v: number | string) => void; onClear: () => void;
}) {
  const meta = PROP_META[prop];
  const base = target.base?.[prop];
  const ativo = value !== undefined;

  if (meta.kind === "color") {
    const v = (value as string) ?? (base as string) ?? "#000000";
    return (
      <div className="flex items-center gap-2">
        <input type="color" value={v} onChange={(e) => onChange(e.target.value)}
          className="w-7 h-7 rounded-md border border-border shrink-0 cursor-pointer bg-transparent p-0" />
        <span className="text-caption text-muted flex-1">{meta.label}</span>
        <input value={v} onChange={(e) => onChange(e.target.value)}
          className="w-[82px] text-caption tabular-nums text-ink bg-surface-2 rounded-sm px-2 py-1 border border-border" />
        {ativo && <ClearBtn onClick={onClear} />}
      </div>
    );
  }
  if (meta.kind === "seg") {
    const v = (value as string) ?? (base as string) ?? "none";
    return (
      <div className="flex items-center gap-2">
        <span className="text-caption text-muted flex-1">{meta.label}</span>
        <div className="inline-flex rounded-md border border-border overflow-hidden">
          {CAIXAS.map((c) => (
            <button key={c.v} onClick={() => onChange(c.v)}
              className={`px-2 py-1 text-[12px] ${v === c.v ? "bg-ink text-white" : "text-muted hover:bg-surface-2"}`}>{c.label}</button>
          ))}
        </div>
        {ativo && <ClearBtn onClick={onClear} />}
      </div>
    );
  }
  // range
  const v = (value as number) ?? (base as number) ?? meta.min ?? 0;
  return (
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-caption">
        <span className="text-muted">{meta.label}</span>
        <span className="flex items-center gap-2">
          <span className={`tabular-nums font-medium ${ativo ? "text-ink" : "text-faint"}`}>{v}{meta.unidade ? ` ${meta.unidade}` : ""}</span>
          {ativo && <ClearBtn onClick={onClear} />}
        </span>
      </div>
      <input type="range" min={meta.min} max={meta.max} step={meta.step ?? 1} value={v}
        onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink" />
    </label>
  );
}

function ClearBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Limpar (voltar ao padrão)" className="text-faint hover:text-negative shrink-0">
      <Icon name="x" size={12} color="currentColor" />
    </button>
  );
}

function Secao({ titulo, hint, children }: { titulo: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h3 className="m-0 text-[13px] font-semibold uppercase tracking-wide text-faint">{titulo}</h3>
        {hint && <span className="text-[11px] text-faint">· {hint}</span>}
      </div>
      {children}
    </section>
  );
}

function Range({ label, v, min, max, step = 1, onChange, unidade }: { label: string; v: number; min: number; max: number; step?: number; onChange: (v: number) => void; unidade?: string }) {
  return (
    <label className="flex flex-col gap-1 mt-1">
      <div className="flex items-center justify-between text-caption">
        <span className="text-muted">{label}</span>
        <span className="text-ink tabular-nums font-medium">{v}{unidade ? ` ${unidade}` : ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink" />
    </label>
  );
}

/* ===================== EXPORT p/ o Claude Code ===================== */
function gerarInstrucao(s: DesignState): string {
  const f = FONTS.find((x) => x.id === s.font);
  const tr = (s.tracking / 100).toFixed(3);
  const L: string[] = [];
  L.push("Aplique estes ajustes do Laboratório de Design ao design system all4pay");
  L.push("(globals.css escopo .ds-visor tema claro + .a4p-sidebar p/ o menu + tailwind.config),");
  L.push("promovendo-os ao código:");
  L.push("");
  L.push("GLOBAL");
  L.push(`  Fonte: ${f?.label} — stack ${f?.stack}${s.numMesmaFonte ? " (também nos números)" : " (números seguem em Geist Mono)"}`);
  L.push(`  Tracking base: ${tr}em`);
  L.push("  Cores (tokens):");
  for (const c of COR_CAMPOS) L.push(`    ${c.varName}: ${s.cores[c.key]};   /* ${c.label} */`);
  L.push("");
  const ids = Object.keys(s.targets);
  if (ids.length) {
    L.push("ITEM A ITEM (overrides por padrão):");
    for (const t of TARGETS) {
      const ov = s.targets[t.id];
      if (!ov || !Object.keys(ov).length) continue;
      L.push(`  • ${t.label}  [${t.selector}]`);
      for (const p of t.props) {
        if (!(p in ov)) continue;
        L.push(`      ${p}: ${ov[p]}`);
      }
    }
    L.push("");
  }
  L.push("JSON:");
  L.push(JSON.stringify(s));
  return L.join("\n");
}
