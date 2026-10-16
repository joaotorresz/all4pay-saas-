"use client";

/**
 * O EDITOR da vitrine do design system (etapa 3 e 4).
 *
 * - Cada valor de `tokens.json` (e cada folha das escalas do Tailwind) vira um
 *   campo. O que se digita entra num RASCUNHO, nunca no arquivo.
 * - A prévia é AO VIVO e é a mesma conta do arquivo: o rascunho é aplicado por
 *   `aplicarRascunho` e as declarações saem de `gerarDeclaracoes` — as funções
 *   que o `npm run tokens` usa. Elas entram num `<style>` no FIM do `<head>`:
 *   mesmos seletores, mais tarde na ordem, então vencem o bloco publicado sem
 *   `!important`. Uma prévia montada por outro caminho poderia mostrar um
 *   valor que o arquivo salvo não produz.
 * - O rascunho fica no navegador de quem edita (conveniência: recarregar a
 *   página não perde o trabalho). Ele não é estado do sistema — o sistema só
 *   muda quando o PR é aceito.
 * - "Usado em N regras": conta as regras de estilo carregadas que leem
 *   `var(--nome)`. É a resposta para "se eu mexer aqui, quanto do sistema
 *   muda?" antes do primeiro clique.
 */
import * as React from "react";
import { Button, Textarea } from "@/components/ui";
import tokensJson from "@/design/tokens.json";
import {
  aplicarRascunho, contextosEditaveis, cssDaPreviaDeEscalas, folhasDeEscala, gerarDeclaracoes,
  mudancasDoRascunho, problemaDoValor, serializarTokens, validarRascunho,
  RASCUNHO_VAZIO, ROTULO_CONTEXTO,
  type ArquivoTokens, type ChaveContexto, type Mudanca, type Rascunho,
} from "@/design/gerar";

export const ARQ = tokensJson as unknown as ArquivoTokens;
const CHAVE_LOCAL = "a4p_ds_rascunho";
const FOLHAS = new Map(folhasDeEscala(ARQ.escalas).map((f) => [f.caminho, f.valor]));

interface EditorApi {
  rascunho: Rascunho;
  mudancas: Mudanca[];
  erros: string[];
  definirToken: (nome: string, ctx: ChaveContexto, valor: string | null) => void;
  definirEscala: (caminho: string, valor: string | null) => void;
  descartar: () => void;
  usos: (nome: string) => number | null;
}

const Ctx = React.createContext<EditorApi | null>(null);
export function useEditor(): EditorApi {
  const v = React.useContext(Ctx);
  if (!v) throw new Error("useEditor fora do EditorProvider");
  return v;
}

function lerLocal(): Rascunho {
  try {
    const bruto = localStorage.getItem(CHAVE_LOCAL);
    if (!bruto) return RASCUNHO_VAZIO;
    const r = JSON.parse(bruto) as Rascunho;
    // Um rascunho antigo que não casa mais com o arquivo (token renomeado)
    // é descartado inteiro em vez de pintar valores órfãos.
    return validarRascunho(ARQ, r).length ? RASCUNHO_VAZIO : { tokens: r.tokens ?? {}, escalas: r.escalas ?? {} };
  } catch {
    return RASCUNHO_VAZIO;
  }
}

/** Conta, nas folhas de estilo carregadas, as regras que leem cada variável. */
function contarUsos(): Map<string, number> {
  const nomes = ARQ.tokens.map((t) => t.nome);
  const contagem = new Map(nomes.map((n) => [n, 0]));
  const andar = (regras: CSSRuleList) => {
    for (const regra of Array.from(regras)) {
      const filhas = (regra as CSSGroupingRule).cssRules;
      if (filhas) {
        andar(filhas);
        continue;
      }
      const txt = regra.cssText;
      if (!txt.includes("var(--")) continue;
      for (const n of nomes) if (txt.includes(`var(${n})`) || txt.includes(`var(${n},`)) contagem.set(n, (contagem.get(n) ?? 0) + 1);
    }
  };
  for (const folha of Array.from(document.styleSheets)) {
    if ((folha.ownerNode as HTMLElement | null)?.id === "ds-rascunho") continue;
    try {
      andar(folha.cssRules);
    } catch {
      /* folha de outra origem (fonte externa): não se lê, e não usa token */
    }
  }
  return contagem;
}

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [rascunho, setRascunho] = React.useState<Rascunho>(RASCUNHO_VAZIO);
  const [usos, setUsos] = React.useState<Map<string, number> | null>(null);

  React.useEffect(() => {
    setRascunho(lerLocal());
    // Depois da pintura: as folhas do Next já estão no documento.
    const id = window.setTimeout(() => setUsos(contarUsos()), 300);
    return () => window.clearTimeout(id);
  }, []);

  React.useEffect(() => {
    try {
      const vazio = !Object.keys(rascunho.tokens).length && !Object.keys(rascunho.escalas).length;
      if (vazio) localStorage.removeItem(CHAVE_LOCAL);
      else localStorage.setItem(CHAVE_LOCAL, JSON.stringify(rascunho));
    } catch {
      /* sem armazenamento (janela anônima): o rascunho vive só nesta aba */
    }
  }, [rascunho]);

  const erros = React.useMemo(() => validarRascunho(ARQ, rascunho), [rascunho]);
  const mudancas = React.useMemo(() => mudancasDoRascunho(ARQ, rascunho), [rascunho]);

  // A prévia ao vivo. Valor inválido não entra (quebraria a folha inteira).
  React.useEffect(() => {
    let el = document.getElementById("ds-rascunho") as HTMLStyleElement | null;
    if (!mudancas.length) {
      el?.remove();
      return;
    }
    const valido: Rascunho = { tokens: {}, escalas: {} };
    for (const [n, ctxs] of Object.entries(rascunho.tokens))
      for (const [c, v] of Object.entries(ctxs ?? {}))
        if (typeof v === "string" && !problemaDoValor(v)) (valido.tokens[n] ??= {})[c as ChaveContexto] = v;
    for (const [c, v] of Object.entries(rascunho.escalas)) if (!problemaDoValor(v)) valido.escalas[c] = v;
    if (!el) {
      el = document.createElement("style");
      el.id = "ds-rascunho";
    }
    document.head.appendChild(el); // sempre o ÚLTIMO: é o que faz a prévia vencer
    el.textContent = gerarDeclaracoes(aplicarRascunho(ARQ, valido), false) + cssDaPreviaDeEscalas(ARQ, valido);
  }, [rascunho, mudancas.length]);

  React.useEffect(() => () => document.getElementById("ds-rascunho")?.remove(), []);

  const api: EditorApi = {
    rascunho,
    mudancas,
    erros,
    definirToken: (nome, ctx, valor) =>
      setRascunho((r) => {
        const t = { ...r.tokens, [nome]: { ...(r.tokens[nome] ?? {}) } };
        const original = ARQ.tokens.find((x) => x.nome === nome)?.[ctx];
        if (valor === null || valor === original) delete t[nome][ctx];
        else t[nome][ctx] = valor;
        if (!Object.keys(t[nome]).length) delete t[nome];
        return { ...r, tokens: t };
      }),
    definirEscala: (caminho, valor) =>
      setRascunho((r) => {
        const e = { ...r.escalas };
        if (valor === null || valor === FOLHAS.get(caminho)) delete e[caminho];
        else e[caminho] = valor;
        return { ...r, escalas: e };
      }),
    descartar: () => setRascunho(RASCUNHO_VAZIO),
    usos: (nome) => (usos ? usos.get(nome) ?? 0 : null),
  };
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/* ── Campos ───────────────────────────────────────────────────────────────── */

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Um campo de valor: texto livre, seletor de cor quando o valor é um hex. */
function Campo({ valor, original, rotulo, onMudar }: {
  valor: string; original: string; rotulo: string; onMudar: (v: string | null) => void;
}) {
  const mudou = valor !== original;
  const problema = problemaDoValor(valor);
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="a4p-label w-[86px] shrink-0 text-muted">{rotulo}</span>
      {HEX6.test(valor.trim()) && (
        <input type="color" aria-label={`Escolher cor (${rotulo})`} value={valor.trim().toLowerCase()}
          onChange={(e) => onMudar(e.target.value)}
          className="w-7 h-7 shrink-0 cursor-pointer rounded-sm border border-border bg-transparent p-0" />
      )}
      <input type="text" aria-label={`Valor (${rotulo})`} value={valor} spellCheck={false}
        onChange={(e) => onMudar(e.target.value)}
        aria-invalid={problema ? true : undefined}
        title={problema ?? undefined}
        className={`min-w-0 flex-1 h-8 rounded-sm border px-2 text-[12px] tabular-nums text-ink bg-surface-1 outline-none focus:border-ink ${problema ? "border-negative" : mudou ? "border-ink" : "border-border"}`} />
      {mudou && (
        <button type="button" onClick={() => onMudar(null)} title={`Voltar para ${original}`}
          className="shrink-0 text-[12px] text-muted underline hover:text-ink">desfazer</button>
      )}
    </span>
  );
}

/** Os campos de um token: um por contexto que tem valor próprio. */
export function CamposToken({ nome }: { nome: string }) {
  const { rascunho, definirToken, usos } = useEditor();
  const t = ARQ.tokens.find((x) => x.nome === nome);
  if (!t) return null;
  const n = usos(nome);
  return (
    <div className="mt-1 flex flex-col gap-1">
      {contextosEditaveis(t).map((c) => (
        <Campo key={c} rotulo={c === "claro" && t.espelhoNoApp ? "Claro e app" : ROTULO_CONTEXTO[c]}
          original={t[c]!} valor={rascunho.tokens[nome]?.[c] ?? t[c]!}
          onMudar={(v) => definirToken(nome, c, v)} />
      ))}
      <span className="text-[11px] text-faint">
        {n === null ? "Contando onde é usado…" : n === 0 ? "Nenhuma regra de estilo carregada lê este valor." : `Usado em ${n} regra${n > 1 ? "s" : ""} de estilo.`}
      </span>
    </div>
  );
}

/** Campo de uma folha das escalas do Tailwind (`borderRadius.card`…). */
export function CampoEscala({ caminho, rotulo }: { caminho: string; rotulo?: string }) {
  const { rascunho, definirEscala } = useEditor();
  const original = FOLHAS.get(caminho);
  if (original === undefined) return null;
  return (
    <Campo rotulo={rotulo ?? caminho.split(".").pop()!} original={original}
      valor={rascunho.escalas[caminho] ?? original} onMudar={(v) => definirEscala(caminho, v)} />
  );
}

/** Valor efetivo de uma escala com o rascunho (para os desenhos da vitrine). */
export function useEscala(caminho: string): string | undefined {
  const { rascunho } = useEditor();
  return rascunho.escalas[caminho] ?? FOLHAS.get(caminho);
}

/* ── Barra de ações: descartar, baixar, salvar ────────────────────────────── */

export function BarraEditor() {
  const { mudancas, erros, rascunho, descartar } = useEditor();
  const [aberto, setAberto] = React.useState(false);
  const [descricao, setDescricao] = React.useState("");
  const [estado, setEstado] = React.useState<{ tipo: "ok" | "erro"; msg: string; url?: string } | null>(null);
  const [enviando, setEnviando] = React.useState(false);

  const baixar = () => {
    const blob = new Blob([serializarTokens(aplicarRascunho(ARQ, rascunho))], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "tokens.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const salvar = async () => {
    setEnviando(true);
    setEstado(null);
    try {
      const r = await fetch("/api/admin/design-system/salvar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rascunho, descricao }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; mensagem?: string; url?: string };
      if (r.ok && j.url) {
        setEstado({ tipo: "ok", msg: j.mensagem ?? "PR aberto.", url: j.url });
        descartar();
        setAberto(false);
        setDescricao("");
      } else {
        setEstado({ tipo: "erro", msg: j.mensagem ?? `O servidor respondeu ${r.status}.` });
      }
    } catch {
      setEstado({ tipo: "erro", msg: "Sem resposta do servidor. O rascunho continua aqui." });
    } finally {
      setEnviando(false);
    }
  };

  const n = mudancas.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[14px] text-ink tabular-nums">
          {n === 0 ? "Nenhuma alteração." : `${n} alteraç${n > 1 ? "ões" : "ão"} no rascunho`}
        </span>
        {erros.length > 0 && <span className="text-[13px] text-negative">{erros.length} valor(es) inválido(s): {erros[0]}</span>}
        <span className="flex-1" />
        <Button variant="ghost" size="sm" disabled={!n} onClick={descartar}>Descartar</Button>
        <Button variant="secondary" size="sm" disabled={!n || erros.length > 0} onClick={baixar}>Baixar tokens.json</Button>
        <Button variant="primary" size="sm" disabled={!n || erros.length > 0} onClick={() => setAberto((v) => !v)}>Salvar no sistema</Button>
      </div>

      {aberto && n > 0 && (
        <div className="rounded-card bg-surface-2 p-4 flex flex-col gap-3">
          <p className="m-0 text-[14px] text-ink">
            Salvar abre um pull request com {n} alteraç{n > 1 ? "ões" : "ão"}. As guardas do sistema conferem os valores, e a mudança vai ao ar quando o PR for aceito.
          </p>
          <ul className="m-0 pl-4 flex flex-col gap-1 text-[13px] text-ink">
            {mudancas.map((m) => (
              <li key={`${m.alvo}:${m.contexto ?? ""}`} className="break-all">
                <code>{m.alvo}</code> {m.contexto ? `(${ROTULO_CONTEXTO[m.contexto]})` : "(escala)"}: <span className="tabular-nums text-muted">{m.de}</span> → <span className="tabular-nums">{m.para}</span>
              </li>
            ))}
          </ul>
          <Textarea label="Por que mudar (opcional, vai no PR)" value={descricao}
            onChange={(e) => setDescricao(e.target.value)} maxLength={500} rows={2} />
          <div className="flex items-center gap-3">
            <Button variant="primary" size="sm" onClick={salvar} disabled={enviando}>
              {enviando ? "Abrindo o PR…" : "Abrir o PR"}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {estado && (
        <p className={`m-0 text-[14px] ${estado.tipo === "ok" ? "text-ink" : "text-negative"}`} role="status">
          {estado.msg}{" "}
          {estado.url && <a href={estado.url} target="_blank" rel="noreferrer" className="underline">Abrir o PR ↗</a>}
        </p>
      )}
    </div>
  );
}
