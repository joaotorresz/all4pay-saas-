"use client";

import * as React from "react";
import { Icon, Button, Select } from "@/components/ui";

/**
 * Editor visual do sistema (estilo Framer/Webflow) — montado no AppShell, vale
 * em TODAS as páginas. Duas abas:
 *   • Elemento: liga o modo de edição, clica em qualquer elemento (texto, card,
 *     número, ícone…) e edita texto/cor/tamanho/peso/fundo/raio/padding/borda.
 *   • Tema: ajustes globais da página de teste (.ds-onest).
 * Aplica AO VIVO (inline !important), salva no navegador e EXPORTA um JSON.
 * Nada é promovido ao código aqui — o usuário exporta e manda no Claude Code.
 */

/* ----------------------------- helpers ----------------------------- */

const EDITS_KEY = "a4p_visual_edits";
const THEME_KEY = "a4p_theme_draft";

interface ElementOverride {
  selector: string;
  tag: string;
  texto?: string; // conteúdo de texto novo
  amostra?: string; // amostra do texto original (referência)
  estilos: Record<string, string>; // css prop → valor
}

/** Caminho CSS estável (nth-of-type) do elemento até o body. */
function cssPath(el: Element): string {
  const parts: string[] = [];
  let e: Element | null = el;
  while (e && e.nodeType === 1 && e !== document.body) {
    let sel = e.tagName.toLowerCase();
    const parent: Element | null = e.parentElement;
    if (parent) {
      const irmaos = Array.from(parent.children).filter((c) => c.tagName === e!.tagName);
      if (irmaos.length > 1) sel += `:nth-of-type(${irmaos.indexOf(e) + 1})`;
    }
    parts.unshift(sel);
    e = parent;
  }
  return parts.join(" > ");
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/[\d.]+/g);
  if (!m) return "#000000";
  if (m.length >= 4 && Number(m[3]) === 0) return "transparent";
  const [r, g, b] = m.map((x) => Math.round(Number(x)));
  return "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function loadEdits(): Record<string, ElementOverride> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(EDITS_KEY) || "{}"); } catch { return {}; }
}

/* ----------------------------- tema ----------------------------- */

interface ThemeVals {
  bg: string; boxBg: string; radius: number; padding: number;
  titleWeight: string; tracking: number; semBorda: boolean; borderColor: string;
}
const THEME_DEFAULTS: ThemeVals = {
  bg: "#eceef2", boxBg: "#ffffff", radius: 24, padding: 31.2,
  titleWeight: "600", tracking: -0.03, semBorda: true, borderColor: "#e6e8ec",
};
function themeToCssVars(v: ThemeVals): Record<string, string> {
  return {
    "--a4p-bg": v.bg,
    "--a4p-box-bg": v.boxBg,
    "--a4p-box-radius": `${v.radius}px`,
    "--a4p-box-padding": `${v.padding}px`,
    "--a4p-title-weight": v.titleWeight,
    "--a4p-num-tracking": `${v.tracking}px`,
    "--a4p-borders": v.semBorda ? "transparent" : v.borderColor,
  };
}
function loadTheme(): ThemeVals {
  if (typeof window === "undefined") return THEME_DEFAULTS;
  try { return { ...THEME_DEFAULTS, ...(JSON.parse(localStorage.getItem(THEME_KEY) || "{}")) }; }
  catch { return THEME_DEFAULTS; }
}

/* ----------------------------- componente ----------------------------- */

export function VisualEditor() {
  const [montado, setMontado] = React.useState(false);
  const [aberto, setAberto] = React.useState(false);
  const [aba, setAba] = React.useState<"elemento" | "tema">("elemento");
  const [selecionando, setSelecionando] = React.useState(false);
  const [sel, setSel] = React.useState<HTMLElement | null>(null);
  const [edits, setEdits] = React.useState<Record<string, ElementOverride>>({});
  const [theme, setTheme] = React.useState<ThemeVals>(THEME_DEFAULTS);
  const [tick, setTick] = React.useState(0); // força re-leitura dos controles
  const [salvando, setSalvando] = React.useState<"idle" | "saving" | "saved" | "local">("idle");
  const saveTimer = React.useRef<number | null>(null);

  React.useEffect(() => { setMontado(true); setEdits(loadEdits()); setTheme(loadTheme()); }, []);

  /* aplica TEMA ao vivo em .ds-onest */
  React.useEffect(() => {
    if (!montado) return;
    const el = document.querySelector<HTMLElement>(".ds-onest");
    if (el) for (const [k, val] of Object.entries(themeToCssVars(theme))) el.style.setProperty(k, val);
    try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch { /* ignore */ }
  }, [theme, montado]);

  /* reaplica EDIÇÕES de elemento (após render/troca de página) */
  const reaplicar = React.useCallback(() => {
    for (const ov of Object.values(loadEdits())) {
      const node = document.querySelector<HTMLElement>(ov.selector);
      if (!node) continue;
      if (ov.texto != null && node.children.length === 0) node.textContent = ov.texto;
      for (const [p, val] of Object.entries(ov.estilos)) node.style.setProperty(p, val, "important");
    }
  }, []);
  React.useEffect(() => {
    if (!montado) return;
    const t = window.setTimeout(reaplicar, 300);
    return () => window.clearTimeout(t);
  }, [montado, reaplicar]);

  /* modo seleção: clique escolhe elemento; hover destaca */
  React.useEffect(() => {
    if (!selecionando) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-a4p-editor]")) return;
      e.preventDefault(); e.stopPropagation();
      setSel(t); setTick((n) => n + 1);
    };
    const onOver = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-a4p-editor]")) return;
      t.dataset.a4pHover = "1";
    };
    const onOut = (e: MouseEvent) => { delete (e.target as HTMLElement).dataset.a4pHover; };
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("mouseout", onOut, true);
    document.body.classList.add("a4p-editing");
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("mouseout", onOut, true);
      document.body.classList.remove("a4p-editing");
      document.querySelectorAll<HTMLElement>("[data-a4p-hover]").forEach((n) => delete n.dataset.a4pHover);
    };
  }, [selecionando]);

  /* outline do selecionado */
  React.useEffect(() => {
    if (!sel) return;
    sel.dataset.a4pSel = "1";
    return () => { delete sel.dataset.a4pSel; };
  }, [sel]);

  /* valores atuais do elemento selecionado (para os controles) */
  const cur = React.useMemo(() => {
    if (!sel || typeof window === "undefined") return null;
    void tick;
    const cs = getComputedStyle(sel);
    const soTexto = sel.children.length === 0;
    const g = parseFloat(cs.gap);
    const lh = parseFloat(cs.lineHeight);
    const mv = parseFloat(cs.marginTop);
    const mh = parseFloat(cs.marginLeft);
    return {
      soTexto,
      texto: soTexto ? (sel.textContent ?? "") : "",
      color: rgbToHex(cs.color),
      bg: rgbToHex(cs.backgroundColor),
      fontSize: Math.round(parseFloat(cs.fontSize)) || 16,
      fontWeight: String(parseInt(cs.fontWeight, 10) || 400),
      radius: Math.round(parseFloat(cs.borderTopLeftRadius)) || 0,
      padding: Math.round(parseFloat(cs.paddingTop)) || 0,
      gap: Number.isFinite(g) ? Math.round(g) : 0,
      lineHeight: Number.isFinite(lh) ? Math.round(lh) : 0,
      marginV: Number.isFinite(mv) ? Math.round(mv) : 0,
      marginH: Number.isFinite(mh) ? Math.round(mh) : 0,
    };
  }, [sel, tick]);

  function pathDe(el: HTMLElement) { return cssPath(el); }

  function registrar(mut: (ov: ElementOverride) => void) {
    if (!sel) return;
    const selector = pathDe(sel);
    setEdits((prev) => {
      const ov: ElementOverride = prev[selector]
        ? { ...prev[selector], estilos: { ...prev[selector].estilos } }
        : { selector, tag: sel.tagName.toLowerCase(), amostra: (sel.textContent ?? "").trim().slice(0, 48), estilos: {} };
      mut(ov);
      const next = { ...prev, [selector]: ov };
      try { localStorage.setItem(EDITS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  function setStyle(cssProp: string, value: string) {
    if (!sel) return;
    sel.style.setProperty(cssProp, value, "important");
    registrar((ov) => { ov.estilos[cssProp] = value; });
    setTick((n) => n + 1);
  }
  function setText(value: string) {
    if (!sel) return;
    sel.textContent = value;
    registrar((ov) => { ov.texto = value; });
  }

  const buildPayload = React.useCallback(() => ({
    app: "all4pay",
    geradoEm: new Date().toISOString(),
    tema: themeToCssVars(theme),
    elementos: Object.values(loadEdits()),
  }), [theme]);

  /* AUTO-SAVE no arquivo design-edits.json (via API). Em FS somente-leitura
   *  (serverless) cai para "local" — segue valendo o navegador + Exportar. */
  const salvarArquivo = React.useCallback(() => {
    setSalvando("saving");
    fetch("/api/design", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildPayload()),
    })
      .then((r) => r.json())
      .then((j) => setSalvando(j?.ok ? "saved" : "local"))
      .catch(() => setSalvando("local"));
  }, [buildPayload]);

  /* dispara o auto-save (debounce) a cada mudança de elemento ou tema */
  React.useEffect(() => {
    if (!montado) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(salvarArquivo, 600);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [edits, theme, montado, salvarArquivo]);

  /* hidrata do arquivo na carga, se o navegador ainda não tem edições */
  React.useEffect(() => {
    if (!montado) return;
    if (Object.keys(loadEdits()).length > 0) return;
    fetch("/api/design")
      .then((r) => r.json())
      .then((j) => {
        const elementos: ElementOverride[] = j?.ok && Array.isArray(j.data?.elementos) ? j.data.elementos : [];
        if (!elementos.length) return;
        const map: Record<string, ElementOverride> = {};
        for (const ov of elementos) map[ov.selector] = ov;
        try { localStorage.setItem(EDITS_KEY, JSON.stringify(map)); } catch { /* ignore */ }
        setEdits(map);
        window.setTimeout(reaplicar, 100);
      })
      .catch(() => { /* arquivo indisponível — segue no navegador */ });
  }, [montado, reaplicar]);

  function exportar() {
    const blob = new Blob([JSON.stringify(buildPayload(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "all4pay-edicoes.json"; a.click();
    URL.revokeObjectURL(url);
  }

  function limparTudo() {
    // remove edições aplicadas no DOM + storage
    for (const ov of Object.values(loadEdits())) {
      const node = document.querySelector<HTMLElement>(ov.selector);
      if (!node) continue;
      for (const p of Object.keys(ov.estilos)) node.style.removeProperty(p);
    }
    setEdits({});
    try { localStorage.removeItem(EDITS_KEY); } catch { /* ignore */ }
  }

  const setT = <K extends keyof ThemeVals>(k: K, v: ThemeVals[K]) => setTheme((p) => ({ ...p, [k]: v }));
  const temDsOnest = montado && typeof document !== "undefined" && !!document.querySelector(".ds-onest");
  const nEdits = Object.keys(edits).length;

  if (!montado) return null;

  return (
    <div data-a4p-editor>
      {/* estilos de destaque (hover/selecionado) */}
      <style>{`
        body.a4p-editing * { cursor: crosshair !important; }
        [data-a4p-hover] { outline: 2px dashed rgba(220,255,0,.7) !important; outline-offset: 1px !important; }
        [data-a4p-sel] { outline: 2px solid #dcff00 !important; outline-offset: 1px !important; }
      `}</style>

      {/* botão flutuante */}
      <button
        onClick={() => setAberto((o) => !o)}
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] inline-flex items-center gap-2 h-11 px-5 rounded-pill bg-ink text-white text-[15px] font-medium"
        title="Editar o sistema visualmente"
      >
        <Icon name="palette" size={16} color="var(--color-lime)" />
        {aberto ? "Fechar editor" : "Editar design"}
        {nEdits > 0 && <span className="ml-1 text-[12px] bg-lime text-on-lime rounded-pill px-2">{nEdits}</span>}
      </button>

      {aberto && (
        <div className="fixed top-0 right-0 h-full w-[min(94vw,380px)] z-[60] bg-white border-l border-border flex flex-col">
          {/* header + abas */}
          <div className="flex items-center justify-between px-4 pt-4">
            <span className="text-h3 text-ink">Editor</span>
            <button onClick={() => setAberto(false)} className="inline-flex p-1 rounded-md hover:bg-surface-2" aria-label="Fechar">
              <Icon name="x" size={16} color="var(--color-text-secondary)" />
            </button>
          </div>
          <div className="flex gap-1 px-4 pt-3">
            {(["elemento", "tema"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setAba(t)}
                className={["px-3 h-8 rounded-pill text-caption", aba === t ? "bg-ink text-white" : "text-muted hover:bg-surface-1"].join(" ")}
              >
                {t === "elemento" ? "Elemento" : "Tema"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
            {aba === "elemento" && (
              <>
                <Button
                  variant={selecionando ? "accent" : "primary"}
                  onClick={() => setSelecionando((s) => !s)}
                  leftIcon={<Icon name="palette" size={15} color={selecionando ? "var(--color-on-lime)" : "#fff"} />}
                >
                  {selecionando ? "Selecionando… (clique num elemento)" : "Selecionar elemento"}
                </Button>

                {!sel && <p className="text-caption text-faint">Ligue “Selecionar elemento” e clique em qualquer texto, número, card ou ícone da página.</p>}

                {sel && cur && (
                  <>
                    <div className="text-caption text-faint">
                      Selecionado: <span className="text-ink">&lt;{sel.tagName.toLowerCase()}&gt;</span>
                      {cur.soTexto && cur.texto ? ` · “${cur.texto.slice(0, 32)}”` : ""}
                    </div>

                    {cur.soTexto && (
                      <Campo label="Texto">
                        <textarea
                          value={cur.texto}
                          onChange={(e) => setText(e.target.value)}
                          rows={2}
                          className="w-full px-2 py-1 rounded-sm bg-white border border-border text-[15px] text-ink outline-none focus:border-faint resize-y"
                        />
                      </Campo>
                    )}
                    <Campo label="Cor do texto"><Cor value={cur.color} onChange={(c) => setStyle("color", c)} /></Campo>
                    <Campo label={`Tamanho da fonte · ${cur.fontSize}px`}>
                      <input type="range" min={8} max={80} value={cur.fontSize} onChange={(e) => setStyle("font-size", `${e.target.value}px`)} className="w-full accent-ink" />
                    </Campo>
                    <Campo label="Peso da fonte">
                      <Select
                        value={cur.fontWeight}
                        onChange={(v) => setStyle("font-weight", v)}
                        options={[
                          { value: "400", label: "Regular (400)" },
                          { value: "500", label: "Medium (500)" },
                          { value: "600", label: "SemiBold (600)" },
                          { value: "700", label: "Bold (700)" },
                        ]}
                      />
                    </Campo>
                    <Campo label="Cor de fundo"><Cor value={cur.bg} onChange={(c) => setStyle("background-color", c)} allowNone /></Campo>
                    <Campo label={`Arredondamento · ${cur.radius}px`}>
                      <input type="range" min={0} max={48} value={cur.radius} onChange={(e) => setStyle("border-radius", `${e.target.value}px`)} className="w-full accent-ink" />
                    </Campo>
                    <Campo label={`Espaçamento interno · ${cur.padding}px`}>
                      <input type="range" min={0} max={64} value={cur.padding} onChange={(e) => setStyle("padding", `${e.target.value}px`)} className="w-full accent-ink" />
                    </Campo>
                    <Campo label={`Espaço entre itens (gap) · ${cur.gap}px`}>
                      <input type="range" min={0} max={64} value={cur.gap} onChange={(e) => setStyle("gap", `${e.target.value}px`)} className="w-full accent-ink" />
                    </Campo>
                    <Campo label={`Margem vertical (cima / baixo) · ${cur.marginV}px`}>
                      <input type="range" min={0} max={64} value={cur.marginV} onChange={(e) => { const px = `${e.target.value}px`; setStyle("margin-top", px); setStyle("margin-bottom", px); }} className="w-full accent-ink" />
                    </Campo>
                    <Campo label={`Margem horizontal (esquerda / direita) · ${cur.marginH}px`}>
                      <input type="range" min={0} max={64} value={cur.marginH} onChange={(e) => { const px = `${e.target.value}px`; setStyle("margin-left", px); setStyle("margin-right", px); }} className="w-full accent-ink" />
                    </Campo>
                    <Campo label={`Altura da linha · ${cur.lineHeight || 22}px`}>
                      <input type="range" min={12} max={56} value={cur.lineHeight || 22} onChange={(e) => setStyle("line-height", `${e.target.value}px`)} className="w-full accent-ink" />
                    </Campo>
                    <Campo label="Borda">
                      <div className="flex items-center gap-2">
                        <button onClick={() => setStyle("border", "none")} className="px-3 h-9 rounded-sm border border-border text-caption text-muted hover:bg-surface-1">Sem borda</button>
                        <button onClick={() => setStyle("border", "1px solid var(--color-border)")} className="px-3 h-9 rounded-sm border border-border text-caption text-muted hover:bg-surface-1">1px</button>
                      </div>
                    </Campo>
                    <p className="text-caption text-faint">Dica: gráficos são desenhos (SVG). Dá pra editar o card/texto ao redor; cores de série eu ajusto pelo código a partir do export.</p>
                  </>
                )}
              </>
            )}

            {aba === "tema" && (
              <>
                {!temDsOnest && <p className="text-caption text-faint">O tema editável vale na Home (escopo de teste). Abra a página inicial para ajustar aqui.</p>}
                <Campo label="Fundo principal"><Cor value={theme.bg} onChange={(c) => setT("bg", c)} /></Campo>
                <Campo label="Fundo do box"><Cor value={theme.boxBg} onChange={(c) => setT("boxBg", c)} /></Campo>
                <Campo label={`Arredondamento do box · ${theme.radius}px`}>
                  <input type="range" min={0} max={48} value={theme.radius} onChange={(e) => setT("radius", Number(e.target.value))} className="w-full accent-ink" />
                </Campo>
                <Campo label={`Espaçamento interno · ${theme.padding}px`}>
                  <input type="range" min={8} max={64} value={theme.padding} onChange={(e) => setT("padding", Number(e.target.value))} className="w-full accent-ink" />
                </Campo>
                <Campo label="Peso do título">
                  <Select value={theme.titleWeight} onChange={(v) => setT("titleWeight", v)} options={[
                    { value: "400", label: "Regular (400)" }, { value: "500", label: "Medium (500)" }, { value: "600", label: "SemiBold (600)" },
                  ]} />
                </Campo>
                <Campo label={`Espaçamento dos números · ${theme.tracking}px`}>
                  <input type="range" min={-2} max={2} step={0.01} value={theme.tracking} onChange={(e) => setT("tracking", Number(e.target.value))} className="w-full accent-ink" />
                </Campo>
                <Campo label="Bordas">
                  <label className="inline-flex items-center gap-2 text-[15px] text-ink cursor-pointer">
                    <input type="checkbox" checked={theme.semBorda} onChange={(e) => setT("semBorda", e.target.checked)} className="accent-ink" /> Sem borda
                  </label>
                  {!theme.semBorda && <div className="mt-2"><Cor value={theme.borderColor} onChange={(c) => setT("borderColor", c)} /></div>}
                </Campo>
              </>
            )}
          </div>

          {/* rodapé: status do auto-save + export / limpar */}
          <div className="border-t border-border-soft p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-caption">
              <span className="w-[7px] h-[7px] rounded-pill shrink-0" style={{ background: salvando === "saved" ? "var(--color-positive)" : salvando === "saving" ? "var(--color-warning)" : salvando === "local" ? "var(--color-faint)" : "var(--color-border)" }} />
              <span className="text-muted">
                {salvando === "saving" ? "Salvando no arquivo…"
                  : salvando === "saved" ? "Salvo em design-edits.json"
                  : salvando === "local" ? "Salvo no navegador (arquivo indisponível neste ambiente)"
                  : "Pronto para editar"}
              </span>
              <button onClick={salvarArquivo} className="ml-auto text-muted hover:text-ink underline">Salvar agora</button>
            </div>
            <Button variant="primary" fullWidth leftIcon={<Icon name="arrow-down-to-line" size={15} />} onClick={exportar}>
              Exportar tudo (.json)
            </Button>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={reaplicar}>Reaplicar</Button>
              <Button variant="ghost" leftIcon={<Icon name="rotate-ccw" size={15} />} onClick={limparTudo}>Limpar edições</Button>
            </div>
            <p className="text-caption text-faint">As alterações salvam sozinhas em <code>design-edits.json</code> (quando o ambiente permite gravar) e no navegador. O botão Exportar baixa o mesmo JSON para me mandar no Claude Code.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <span className="text-label font-medium text-muted">{label}</span>
      {children}
    </div>
  );
}

function Cor({ value, onChange, allowNone }: { value: string; onChange: (c: string) => void; allowNone?: boolean }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
  return (
    <div className="inline-flex items-center gap-2">
      <input type="color" value={safe} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded-md border border-border bg-white p-0 cursor-pointer" aria-label="Cor" />
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-[110px] h-9 px-2 rounded-sm bg-white border border-border text-[15px] text-ink outline-none focus:border-faint" />
      {allowNone && <button onClick={() => onChange("transparent")} className="px-2 h-9 rounded-sm border border-border text-caption text-muted hover:bg-surface-1">Transp.</button>}
    </div>
  );
}
