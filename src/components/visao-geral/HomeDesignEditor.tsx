"use client";

import * as React from "react";
import { Icon, Button, Select } from "@/components/ui";

/**
 * Editor visual do tema da Home (estilo Canva/Framer) — ajusta AO VIVO as
 * variáveis do tema de teste `.ds-onest`, salva no navegador (localStorage) e
 * EXPORTA um arquivo JSON com os valores. Nada é promovido ao sistema aqui:
 * o usuário exporta e manda o arquivo no Claude Code, e as alterações são
 * aplicadas no código depois. Só monta na Home (dentro do escopo .ds-onest).
 */

interface Vals {
  bg: string;
  boxBg: string;
  radius: number;
  padding: number;
  titleWeight: string;
  tracking: number;
  semBorda: boolean;
  borderColor: string;
}

const DEFAULTS: Vals = {
  bg: "#eceef2",
  boxBg: "#ffffff",
  radius: 24,
  padding: 31.2,
  titleWeight: "600",
  tracking: -0.03,
  semBorda: true,
  borderColor: "#e6e8ec",
};

const KEY = "a4p_theme_draft";

/** Mapa var CSS → valor formatado (o que vai pro arquivo e pro `.ds-onest`). */
function toCssVars(v: Vals): Record<string, string> {
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

function load(): Vals {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Vals>) };
  } catch { return DEFAULTS; }
}

export function HomeDesignEditor() {
  const [aberto, setAberto] = React.useState(false);
  const [v, setV] = React.useState<Vals>(DEFAULTS);
  const [copiado, setCopiado] = React.useState(false);
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => { setV(load()); setMontado(true); }, []);

  // Aplica AO VIVO no elemento .ds-onest (inline vence o stylesheet).
  React.useEffect(() => {
    if (!montado) return;
    const el = document.querySelector<HTMLElement>(".ds-onest");
    if (!el) return;
    const vars = toCssVars(v);
    for (const [k, val] of Object.entries(vars)) el.style.setProperty(k, val);
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignore */ }
  }, [v, montado]);

  const set = <K extends keyof Vals>(k: K, val: Vals[K]) => setV((p) => ({ ...p, [k]: val }));

  function exportar() {
    const payload = {
      tema: "all4pay-home",
      geradoEm: new Date().toISOString(),
      escopo: ".ds-onest (Home)",
      valores: toCssVars(v),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "all4pay-tema-home.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(toCssVars(v), null, 2));
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1800);
    } catch { /* ignore */ }
  }

  function restaurar() {
    setV(DEFAULTS);
    const el = document.querySelector<HTMLElement>(".ds-onest");
    if (el) for (const k of Object.keys(toCssVars(DEFAULTS))) el.style.removeProperty(k);
  }

  if (!montado) return null;

  return (
    <>
      {/* Botão flutuante (barra inferior, estilo Canva) */}
      <button
        onClick={() => setAberto((o) => !o)}
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 inline-flex items-center gap-2 h-11 px-5 rounded-pill bg-ink text-white text-[15px] font-medium"
        title="Editar o design desta página"
      >
        <Icon name="palette" size={16} color="var(--color-lime)" />
        {aberto ? "Fechar editor" : "Editar design"}
      </button>

      {aberto && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 w-[min(94vw,440px)] max-h-[72vh] overflow-y-auto rounded-card bg-white border border-border p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-h3 text-ink">Editar design · Home</span>
            <button onClick={() => setAberto(false)} className="inline-flex p-1 rounded-md hover:bg-surface-2" aria-label="Fechar">
              <Icon name="x" size={16} color="var(--color-text-secondary)" />
            </button>
          </div>

          <Campo label="Fundo principal">
            <Cor value={v.bg} onChange={(c) => set("bg", c)} />
          </Campo>
          <Campo label="Fundo do box (card)">
            <Cor value={v.boxBg} onChange={(c) => set("boxBg", c)} />
          </Campo>
          <Campo label={`Arredondamento do box · ${v.radius}px`}>
            <input type="range" min={0} max={48} step={1} value={v.radius} onChange={(e) => set("radius", Number(e.target.value))} className="w-full accent-ink" />
          </Campo>
          <Campo label={`Espaçamento interno · ${v.padding}px`}>
            <input type="range" min={8} max={64} step={1} value={v.padding} onChange={(e) => set("padding", Number(e.target.value))} className="w-full accent-ink" />
          </Campo>
          <Campo label="Peso do título">
            <Select
              value={v.titleWeight}
              onChange={(val) => set("titleWeight", val)}
              options={[
                { value: "400", label: "Regular (400)" },
                { value: "500", label: "Medium (500)" },
                { value: "600", label: "SemiBold (600)" },
              ]}
            />
          </Campo>
          <Campo label={`Espaçamento dos números · ${v.tracking}px`}>
            <input type="range" min={-2} max={2} step={0.01} value={v.tracking} onChange={(e) => set("tracking", Number(e.target.value))} className="w-full accent-ink" />
          </Campo>
          <Campo label="Bordas">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-[15px] text-ink cursor-pointer">
                <input type="checkbox" checked={v.semBorda} onChange={(e) => set("semBorda", e.target.checked)} className="accent-ink" />
                Sem borda
              </label>
              {!v.semBorda && <Cor value={v.borderColor} onChange={(c) => set("borderColor", c)} />}
            </div>
          </Campo>

          <div className="flex items-center gap-2 pt-1 border-t border-border-soft mt-1">
            <Button variant="primary" leftIcon={<Icon name="arrow-down-to-line" size={15} />} onClick={exportar}>
              Exportar arquivo
            </Button>
            <Button variant="secondary" onClick={copiar}>{copiado ? "Copiado!" : "Copiar"}</Button>
            <Button variant="ghost" leftIcon={<Icon name="rotate-ccw" size={15} />} onClick={restaurar}>Restaurar</Button>
          </div>
          <p className="text-caption text-faint">
            As mudanças ficam só no seu navegador. Clique em <b>Exportar arquivo</b> e me mande
            o <code>all4pay-tema-home.json</code> no Claude Code — eu aplico no sistema.
          </p>
        </div>
      )}
    </>
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

/** Seletor de cor + hex editável. */
function Cor({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#ffffff";
  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="color"
        value={safe}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded-md border border-border bg-white p-0 cursor-pointer"
        aria-label="Cor"
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-[120px] h-9 px-2 rounded-sm bg-white border border-border text-[15px] text-ink tabular-nums outline-none focus:border-faint"
      />
    </div>
  );
}
