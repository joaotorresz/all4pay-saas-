"use client";

/**
 * Laboratório de Design — editor de TOKENS GLOBAIS do design system, ao vivo.
 * Painel flutuante (botão na Home). Você mexe em FONTE, CORES, TAMANHOS de
 * texto, PESO, ESPAÇAMENTO, RAIOS e PADDING; o resultado aplica NA HORA em todo
 * o app (injeta um <style> que sobrescreve os tokens do escopo .ds-visor) e é
 * salvo no navegador. O botão "Copiar para o Claude Code" gera um bloco que
 * você cola no chat — e eu promovo os tokens ao código (globals.css/tailwind).
 * Nada é escrito no código a partir daqui; é um sandbox de adaptação.
 */
import * as React from "react";
import { Icon } from "@/components/ui";

const KEY = "a4p_designlab";
const STYLE_ID = "a4p-designlab-style";

/* ----- fontes disponíveis p/ teste (registradas em layout.tsx/globals.css) ----- */
const FONTS: { id: string; label: string; stack: string }[] = [
  { id: "hanken", label: "Hanken Grotesk", stack: '"Hanken Grotesk Variable","Hanken Grotesk",sans-serif' },
  { id: "roobert", label: "Roobert", stack: '"Roobert",sans-serif' },
  { id: "boldonse", label: "Boldonse", stack: '"Boldonse",sans-serif' },
  { id: "schibsted", label: "Schibsted Grotesk", stack: '"Schibsted Grotesk Variable",sans-serif' },
  { id: "geist", label: "Geist Mono", stack: '"Geist Mono Variable",ui-monospace,monospace' },
  { id: "system", label: "Sistema", stack: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" },
];
const stackDe = (id: string) => FONTS.find((f) => f.id === id)?.stack ?? FONTS[0].stack;

interface DesignState {
  font: string;
  numMesmaFonte: boolean;
  cores: Record<string, string>;
  tipo: { h1: number; card: number; kpi: number; corpo: number; legenda: number };
  peso: number;
  tracking: number; // em ×100 (ex.: -2 = -0.02em)
  raio: { card: number; md: number; sm: number };
  padding: number;
}

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

const DEFAULTS: DesignState = {
  font: "hanken",
  numMesmaFonte: false,
  cores: {
    ink: "#11190c", lime: "#e1ff00", onLime: "#11190c", bg: "#f3f1ee",
    surface2: "#f0eee9", border: "#eceae4", body: "#3f4a38", muted: "#6b7280",
    positive: "#3f6212", negative: "#b42318", warning: "#92400e",
  },
  tipo: { h1: 35, card: 18, kpi: 36, corpo: 16, legenda: 13 },
  peso: 600,
  tracking: -1,
  raio: { card: 16, md: 10, sm: 8 },
  padding: 24,
};

function carregar(): DesignState {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const p = JSON.parse(raw);
    return { ...DEFAULTS, ...p, cores: { ...DEFAULTS.cores, ...(p.cores ?? {}) }, tipo: { ...DEFAULTS.tipo, ...(p.tipo ?? {}) }, raio: { ...DEFAULTS.raio, ...(p.raio ?? {}) } };
  } catch { return DEFAULTS; }
}

/** Gera o CSS que aplica o estado ao escopo .ds-visor (tema claro). */
function montarCSS(s: DesignState): string {
  const stack = stackDe(s.font);
  const tr = (s.tracking / 100).toFixed(3);
  const vars = COR_CAMPOS.map((c) => `${c.varName}:${s.cores[c.key]};`).join("");
  const numRule = s.numMesmaFonte
    ? `.ds-visor .tabular-nums,.ds-visor .a4p-num,.ds-visor .a4p-num *{font-family:${stack} !important;}`
    : "";
  return [
    `html:not(.dark) .ds-visor{${vars}--radius-card:${s.raio.card}px;}`,
    `.ds-visor,.ds-visor *{font-family:${stack};letter-spacing:${tr}em;}`,
    numRule,
    `.ds-visor .rounded-card{border-radius:${s.raio.card}px;}`,
    `.ds-visor .rounded-md{border-radius:${s.raio.md}px;}`,
    `.ds-visor .rounded-sm{border-radius:${s.raio.sm}px;}`,
    `.ds-visor [data-card="1"]{padding:${s.padding}px;}`,
    `.ds-visor h1,.ds-visor .text-h1{font-size:${s.tipo.h1}px;}`,
    `.ds-visor .text-h3{font-size:${s.tipo.card}px;}`,
    `.ds-visor .text-value-lg{font-size:${s.tipo.kpi}px;}`,
    `.ds-visor .text-body{font-size:${s.tipo.corpo}px;}`,
    `.ds-visor .text-caption{font-size:${s.tipo.legenda}px;}`,
    `.ds-visor h1,.ds-visor h2,.ds-visor h3,.ds-visor .text-h1,.ds-visor .text-h2,.ds-visor .text-h3{font-weight:${s.peso};}`,
  ].join("\n");
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

export function DesignLab() {
  const [open, setOpen] = React.useState(false);
  const [s, setS] = React.useState<DesignState>(DEFAULTS);
  const [copiado, setCopiado] = React.useState(false);

  React.useEffect(() => { setS(carregar()); }, []);
  React.useEffect(() => {
    aplicar(s);
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  }, [s]);

  const set = (patch: Partial<DesignState>) => setS((p) => ({ ...p, ...patch }));
  const setCor = (k: string, v: string) => setS((p) => ({ ...p, cores: { ...p.cores, [k]: v } }));
  const setTipo = (k: keyof DesignState["tipo"], v: number) => setS((p) => ({ ...p, tipo: { ...p.tipo, [k]: v } }));
  const setRaio = (k: keyof DesignState["raio"], v: number) => setS((p) => ({ ...p, raio: { ...p.raio, [k]: v } }));
  const reset = () => setS(DEFAULTS);

  const instrucao = React.useMemo(() => gerarInstrucao(s), [s]);
  const copiar = () => {
    try { void navigator.clipboard?.writeText(instrucao); setCopiado(true); setTimeout(() => setCopiado(false), 1800); } catch { /* ignore */ }
  };

  return (
    <>
      {/* Botão flutuante (canto inferior esquerdo p/ não brigar com a IA/Guia) */}
      <button
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

      {open && (
        <>
          <div className="fixed inset-0 z-[89] bg-black/20" onClick={() => setOpen(false)} aria-hidden />
          <aside className="fixed top-0 right-0 z-[90] h-full w-full sm:w-[380px] bg-white border-l border-border flex flex-col shadow-popover" role="dialog" aria-label="Laboratório de Design">
            {/* header */}
            <header className="flex items-center gap-2 px-4 h-[56px] border-b border-border-soft shrink-0">
              <span className="w-7 h-7 rounded-md bg-ink inline-flex items-center justify-center">
                <Icon name="palette" size={15} color="var(--color-lime)" />
              </span>
              <span className="text-[16px] font-semibold text-ink">Laboratório de Design</span>
              <button onClick={reset} title="Restaurar padrão" className="ml-auto text-caption text-muted hover:text-ink px-2 py-1 rounded-md hover:bg-surface-2">Reset</button>
              <button onClick={() => setOpen(false)} aria-label="Fechar" className="w-8 h-8 rounded-md inline-flex items-center justify-center text-faint hover:text-ink hover:bg-surface-2">
                <Icon name="x" size={18} color="currentColor" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-6">
              {/* FONTE */}
              <Secao titulo="Fonte" hint="troque a face do sistema para testar">
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
                <div className="mt-2 rounded-md bg-surface-2 px-3 py-3">
                  <div className="text-ink" style={{ fontFamily: stackDe(s.font), fontSize: 22, fontWeight: s.peso }}>Bem-vindo!</div>
                  <div className="text-muted tabular-nums" style={{ fontFamily: s.numMesmaFonte ? stackDe(s.font) : undefined, fontSize: 15 }}>R$ 4.387,45 · 30 vendas · +12%</div>
                </div>
              </Secao>

              {/* CORES */}
              <Secao titulo="Cores" hint="clique no quadrado ou edite o hex">
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

              {/* TIPOGRAFIA */}
              <Secao titulo="Tipografia" hint="tamanhos em px, peso e espaçamento">
                <Range label="Título da página (H1)" v={s.tipo.h1} min={22} max={56} onChange={(v) => setTipo("h1", v)} unidade="px" />
                <Range label="Título de card" v={s.tipo.card} min={13} max={28} onChange={(v) => setTipo("card", v)} unidade="px" />
                <Range label="Valor (KPI)" v={s.tipo.kpi} min={20} max={56} onChange={(v) => setTipo("kpi", v)} unidade="px" />
                <Range label="Corpo" v={s.tipo.corpo} min={12} max={20} onChange={(v) => setTipo("corpo", v)} unidade="px" />
                <Range label="Legenda" v={s.tipo.legenda} min={10} max={16} onChange={(v) => setTipo("legenda", v)} unidade="px" />
                <Range label="Peso dos títulos" v={s.peso} min={400} max={800} step={100} onChange={(v) => set({ peso: v })} />
                <Range label="Espaçamento (tracking)" v={s.tracking} min={-4} max={2} step={0.5} onChange={(v) => set({ tracking: v })} unidade="/100 em" />
              </Secao>

              {/* FORMAS */}
              <Secao titulo="Formas" hint="arredondamento e respiro">
                <Range label="Raio do card" v={s.raio.card} min={0} max={32} onChange={(v) => setRaio("card", v)} unidade="px" />
                <Range label="Raio de botões / inputs" v={s.raio.md} min={0} max={24} onChange={(v) => setRaio("md", v)} unidade="px" />
                <Range label="Raio de badges" v={s.raio.sm} min={0} max={20} onChange={(v) => setRaio("sm", v)} unidade="px" />
                <Range label="Padding do card" v={s.padding} min={12} max={40} onChange={(v) => set({ padding: v })} unidade="px" />
              </Secao>
            </div>

            {/* rodapé: exportar */}
            <footer className="shrink-0 border-t border-border-soft p-4 flex flex-col gap-2">
              <button onClick={copiar} className="w-full rounded-md bg-ink text-white text-label font-medium py-[10px] hover:opacity-90 inline-flex items-center justify-center gap-2">
                <Icon name={copiado ? "check" : "file-text"} size={15} color="var(--color-lime)" />
                {copiado ? "Copiado! Cole no Claude Code" : "Copiar para o Claude Code"}
              </button>
              <p className="m-0 text-[11px] text-faint leading-snug">Cole o texto no chat e peça “aplique estes tokens ao design system”. As mudanças aqui são só de teste (não vão pro código sozinhas).</p>
            </footer>
          </aside>
        </>
      )}
    </>
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
    <label className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-caption">
        <span className="text-muted">{label}</span>
        <span className="text-ink tabular-nums font-medium">{v}{unidade ? ` ${unidade}` : ""}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-ink" />
    </label>
  );
}

/** Bloco de texto que o usuário cola no Claude Code para promover os tokens. */
function gerarInstrucao(s: DesignState): string {
  const f = FONTS.find((x) => x.id === s.font);
  const tr = (s.tracking / 100).toFixed(3);
  const L: string[] = [];
  L.push("Aplique estes tokens do Laboratório de Design ao design system all4pay");
  L.push("(globals.css escopo .ds-visor tema claro + tailwind.config), promovendo-os ao código:");
  L.push("");
  L.push(`FONTE: ${f?.label} — stack ${f?.stack}${s.numMesmaFonte ? " (também nos números)" : " (números seguem em Geist Mono)"}`);
  L.push("");
  L.push("CORES:");
  for (const c of COR_CAMPOS) L.push(`  ${c.varName}: ${s.cores[c.key]};   /* ${c.label} */`);
  L.push("");
  L.push("TIPOGRAFIA (px):");
  L.push(`  H1: ${s.tipo.h1} · título de card (text-h3): ${s.tipo.card} · valor/KPI (text-value-lg): ${s.tipo.kpi} · corpo: ${s.tipo.corpo} · legenda (text-caption): ${s.tipo.legenda}`);
  L.push(`  peso dos títulos: ${s.peso} · tracking base: ${tr}em`);
  L.push("");
  L.push("FORMAS (px):");
  L.push(`  --radius-card: ${s.raio.card} · --radius-md: ${s.raio.md} · --radius-sm: ${s.raio.sm} · padding do card: ${s.padding}`);
  L.push("");
  L.push("JSON:");
  L.push(JSON.stringify(s));
  return L.join("\n");
}
