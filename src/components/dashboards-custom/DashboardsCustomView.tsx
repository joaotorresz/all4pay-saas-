"use client";

/**
 * Dashboards Customizados — lista, editor e catálogo de widgets.
 *
 * A tela alterna entre dois modos: LISTA (com filtro Todos/Pessoal/Empresa) e
 * EDITOR (nome, descrição, aparência, páginas e widgets). O catálogo é um modal
 * — via portal, porque o `Card` do DS tem transform e um ancestral transformado
 * vira bloco de contenção de `position: fixed` (a mesma armadilha do modal de
 * baixa em Pagar/Receber).
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Card, Button, Icon, Input, Textarea, Select, Switch } from "@/components/ui";
import {
  CATALOGO, FONTES_METRICA, FONTES_SERIE, FONTES_CATEGORIA,
  dashboardVazio, templateAcompanhamentoSemanal, widgetPadrao, sugerirWidgets, novoId,
  type DashboardCustom, type Widget, type TipoWidget, type Largura,
} from "@/core/dashboards";
import { listarDashboards, salvarDashboard, removerDashboard } from "@/lib/dashboards";
import { WidgetRender } from "./WidgetRender";

type Aba = "todos" | "pessoal" | "empresa";
// Cor de capa do dashboard: a rampa categórica do sistema.
const CORES = ["var(--a4p-cat-1)", "var(--a4p-cat-2)", "var(--a4p-cat-3)", "var(--a4p-cat-4)", "var(--a4p-cat-6)", "var(--a4p-cat-8)"];

export function DashboardsCustomView() {
  const [lista, setLista] = React.useState<DashboardCustom[]>([]);
  const [aba, setAba] = React.useState<Aba>("todos");
  const [editando, setEditando] = React.useState<DashboardCustom | null>(null);

  React.useEffect(() => { setLista(listarDashboards()); }, []);

  const salvar = (d: DashboardCustom) => { setLista(salvarDashboard(d)); setEditando(null); };
  const abrirTemplate = () => setEditando(templateAcompanhamentoSemanal());

  if (editando) {
    return <Editor inicial={editando} onSalvar={salvar} onCancelar={() => setEditando(null)} />;
  }

  const visiveis = aba === "todos" ? lista : lista.filter((d) => d.escopo === aba);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted max-w-[60ch]">
          Crie e organize painéis com os widgets e dados que importam para você.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" onClick={abrirTemplate}>
            <Icon name="sparkles" size={15} color="currentColor" />
            Criar com IA
          </Button>
          <Button variant="primary" onClick={() => setEditando(dashboardVazio())}>
            <Icon name="plus" size={15} color="currentColor" />
            Novo painel
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {(["todos", "pessoal", "empresa"] as Aba[]).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`rounded-pill px-4 py-[7px] text-caption transition-colors ${
              aba === a ? "bg-surface-3 text-ink font-semibold" : "text-muted hover:text-ink hover:bg-surface-2"
            }`}
          >
            {a === "todos" ? "Todos" : a === "pessoal" ? "Pessoal" : "Empresa"}
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-4 py-10">
            <p className="m-0 text-label text-muted">Você ainda não montou nenhum painel.</p>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <Button variant="primary" onClick={() => setEditando(dashboardVazio())}>
                <Icon name="plus" size={15} color="currentColor" />
                Novo painel
              </Button>
              <Button variant="ghost" onClick={abrirTemplate}>
                <Icon name="calendar" size={15} color="currentColor" />
                Acompanhamento Semanal
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visiveis.map((d) => (
            <Card key={d.id} className="flex flex-col gap-2">
              <div className="flex items-start gap-3">
                <span className="w-[10px] h-[10px] rounded-pill mt-[6px] shrink-0" style={{ background: d.cor }} />
                <div className="min-w-0 flex-1">
                  <div className="text-label font-medium text-ink truncate">{d.nome || "Sem título"}</div>
                  <div className="text-caption text-muted line-clamp-2">{d.descricao || "Sem descrição"}</div>
                </div>
              </div>
              <div className="text-caption text-faint">
                {d.paginas.length} página(s) · {d.paginas.reduce((s, p) => s + p.widgets.length, 0)} widget(s) ·{" "}
                {d.escopo === "empresa" ? "Empresa" : "Pessoal"}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <Button variant="ghost" onClick={() => setEditando(d)}>Abrir</Button>
                <button
                  onClick={() => setLista(removerDashboard(d.id))}
                  aria-label="Excluir painel"
                  className="ml-auto p-1 rounded-md text-muted hover:text-negative hover:bg-surface-2"
                >
                  <Icon name="trash-2" size={15} color="currentColor" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- editor --------------------------------- */

function Editor({
  inicial, onSalvar, onCancelar,
}: { inicial: DashboardCustom; onSalvar: (d: DashboardCustom) => void; onCancelar: () => void }) {
  const [d, setD] = React.useState<DashboardCustom>(inicial);
  const [pagina, setPagina] = React.useState(0);
  const [catalogo, setCatalogo] = React.useState(false);
  const [aparencia, setAparencia] = React.useState(false);
  const [editandoWidget, setEditandoWidget] = React.useState<string | null>(null);

  const pAtual = d.paginas[Math.min(pagina, d.paginas.length - 1)];

  const mudarPagina = (fn: (w: Widget[]) => Widget[]) =>
    setD((s) => ({
      ...s,
      paginas: s.paginas.map((p, k) => (k === pagina ? { ...p, widgets: fn(p.widgets) } : p)),
    }));

  const addWidget = (t: TipoWidget) => { mudarPagina((ws) => [...ws, widgetPadrao(t)]); setCatalogo(false); };
  const removerWidget = (id: string) => mudarPagina((ws) => ws.filter((w) => w.id !== id));
  const moverWidget = (id: string, dir: -1 | 1) =>
    mudarPagina((ws) => {
      const i = ws.findIndex((w) => w.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= ws.length) return ws;
      const out = [...ws];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  const atualizarWidget = (id: string, patch: Partial<Widget>) =>
    mudarPagina((ws) => ws.map((w) => (w.id === id ? ({ ...w, ...patch } as Widget) : w)));

  const addPagina = () =>
    setD((s) => ({
      ...s,
      paginas: [...s.paginas, { id: novoId("p"), titulo: `Página ${s.paginas.length + 1}`, widgets: [] }],
    }));

  return (
    <div className="flex flex-col gap-5 pb-4">
      {/* cabeçalho do editor */}
      <Card>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-5">
          <div className="flex flex-col gap-3 min-w-0">
            <Input placeholder="Nome do painel" value={d.nome}
              onChange={(e) => setD((s) => ({ ...s, nome: e.target.value }))} />
            <Input placeholder="Descrição (opcional)" value={d.descricao}
              onChange={(e) => setD((s) => ({ ...s, descricao: e.target.value }))} />

            <div className="flex items-start gap-3">
              <Switch
                checked={d.todasEmpresas}
                onChange={(v) => setD((s) => ({ ...s, todasEmpresas: v }))}
              />
              <div className="min-w-0">
                <div className="text-label text-ink">Visível em todas as minhas empresas</div>
                <div className="text-caption text-faint">
                  Os widgets carregam os dados da empresa selecionada no momento.
                </div>
              </div>
            </div>

            <div>
              <Button variant="ghost" onClick={() => setAparencia((v) => !v)}>
                <Icon name="sparkles" size={15} color="currentColor" />
                Aparência do painel
              </Button>
              {aparencia && (
                <div className="flex items-center gap-4 mt-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-muted">Cor</span>
                    {CORES.map((c) => (
                      <button
                        key={c}
                        onClick={() => setD((s) => ({ ...s, cor: c }))}
                        aria-label={`Cor ${c}`}
                        className={`w-6 h-6 rounded-md transition-transform ${d.cor === c ? "ring-2 ring-ink ring-offset-2 scale-105" : ""}`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-caption text-muted">Escopo</span>
                    <Select
                      value={d.escopo}
                      onChange={(v) => setD((s) => ({ ...s, escopo: v as DashboardCustom["escopo"] }))}
                      options={[
                        { value: "pessoal", label: "Pessoal" },
                        { value: "empresa", label: "Empresa" },
                      ]}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 items-stretch lg:items-end shrink-0">
            <div className="flex items-center gap-2 flex-wrap lg:justify-end">
              <Button variant="ghost" onClick={() => mudarPagina((ws) => [...ws, ...sugerirWidgets()])}>
                <Icon name="sparkles" size={15} color="currentColor" />
                Assistente IA
              </Button>
              <Button variant="ghost" onClick={() => setCatalogo(true)}>
                <Icon name="plus" size={15} color="currentColor" />
                Adicionar widget
              </Button>
              <Button variant="primary" onClick={() => onSalvar(d)}>
                <Icon name="check" size={15} color="currentColor" />
                Salvar
              </Button>
            </div>
            <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          </div>
        </div>
      </Card>

      {/* páginas */}
      <div className="flex items-center gap-1 border-b border-border-soft overflow-x-auto">
        {d.paginas.map((p, k) => {
          const on = k === pagina;
          return (
            <button
              key={p.id}
              onClick={() => setPagina(k)}
              className={`relative px-3 py-2 text-label whitespace-nowrap transition-colors ${on ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
            >
              {k + 1}. {p.titulo}
              {on && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
            </button>
          );
        })}
        <button onClick={addPagina}
          className="ml-1 inline-flex items-center gap-1 px-3 py-2 text-caption text-muted hover:text-ink">
          <Icon name="plus" size={14} color="currentColor" />
          Adicionar página
        </button>
      </div>

      {/* widgets da página */}
      {!pAtual || pAtual.widgets.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <p className="m-0 text-h3 font-semibold text-ink">Nenhum widget ainda</p>
            <p className="m-0 text-caption text-muted max-w-[46ch]">
              Use “Adicionar widget” para escolher do catálogo. Reordene com as setas de cada card.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {pAtual.widgets.map((w) => (
            <div
              key={w.id}
              className={w.largura === 3 ? "lg:col-span-3" : w.largura === 2 ? "lg:col-span-2" : ""}
            >
              <div className="relative group">
                <WidgetRender w={w} />
                {/* controles do widget — discretos, aparecem no hover */}
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <BotaoIcone label="Editar" icone="settings" onClick={() => setEditandoWidget(editandoWidget === w.id ? null : w.id)} />
                  <BotaoIcone label="Mover para trás" icone="chevron-left" onClick={() => moverWidget(w.id, -1)} />
                  <BotaoIcone label="Mover para frente" icone="chevron-right" onClick={() => moverWidget(w.id, 1)} />
                  <BotaoIcone label="Remover" icone="trash-2" onClick={() => removerWidget(w.id)} perigo />
                </div>
              </div>
              {editandoWidget === w.id && (
                <Card className="mt-2">
                  <EditorWidget w={w} onChange={(patch) => atualizarWidget(w.id, patch)} />
                </Card>
              )}
            </div>
          ))}
        </div>
      )}

      {catalogo && <CatalogoModal onEscolher={addWidget} onFechar={() => setCatalogo(false)} />}
    </div>
  );
}

/* ----------------------------- editor de widget ----------------------------- */

function EditorWidget({ w, onChange }: { w: Widget; onChange: (p: Partial<Widget>) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Título</label>
          <Input value={w.titulo} onChange={(e) => onChange({ titulo: e.target.value })} />
        </div>
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Largura</label>
          <Select
            value={String(w.largura)}
            onChange={(v) => onChange({ largura: Number(v) as Largura })}
            options={[
              { value: "1", label: "1 coluna" },
              { value: "2", label: "2 colunas" },
              { value: "3", label: "Largura total" },
            ]}
          />
        </div>
      </div>

      {w.tipo === "kpi" && (
        <CampoFonte label="Fonte da métrica" value={w.fonte}
          options={FONTES_METRICA.map((f) => ({ value: f.id, label: f.label }))}
          onChange={(v) => onChange({ fonte: v })} />
      )}

      {w.tipo === "serie" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <CampoFonte label="Fonte da série" value={w.fonte}
            options={FONTES_SERIE.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(v) => onChange({ fonte: v })} />
          <div className="flex flex-col gap-[6px]">
            <label className="text-caption font-medium text-muted">Formato</label>
            <Select value={w.formato} onChange={(v) => onChange({ formato: v as "linha" | "barras" })}
              options={[{ value: "barras", label: "Barras" }, { value: "linha", label: "Linha" }]} />
          </div>
        </div>
      )}

      {w.tipo === "pizza" && (
        <CampoFonte label="Fonte das fatias" value={w.fonte}
          options={FONTES_CATEGORIA.map((f) => ({ value: f.id, label: f.label }))}
          onChange={(v) => onChange({ fonte: v })} />
      )}

      {w.tipo === "texto" && (
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Conteúdo</label>
          <Textarea rows={4} value={w.texto} onChange={(e) => onChange({ texto: e.target.value })} />
        </div>
      )}

      {w.tipo === "semana" && (
        <div className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">Mostrar</label>
          <Select value={w.direcao} onChange={(v) => onChange({ direcao: v as "pagar" | "receber" | "ambos" })}
            options={[
              { value: "ambos", label: "A pagar e a receber" },
              { value: "pagar", label: "Só a pagar" },
              { value: "receber", label: "Só a receber" },
            ]} />
        </div>
      )}
    </div>
  );
}

function CampoFonte({
  label, value, options, onChange,
}: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      <Select value={value} onChange={onChange} options={options} />
    </div>
  );
}

/* -------------------------------- catálogo -------------------------------- */

function CatalogoModal({ onEscolher, onFechar }: { onEscolher: (t: TipoWidget) => void; onFechar: () => void }) {
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => {
    setMontado(true);
    const h = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onFechar]);
  if (!montado) return null;

  // Portal: o Card do DS tem transform, e um ancestral transformado vira o
  // bloco de contenção de qualquer position:fixed — o modal nasceria preso.
  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button aria-label="Fechar catálogo" onClick={onFechar} className="absolute inset-0 bg-black/40" />
      <div className="relative w-full max-w-[720px] max-h-[80vh] overflow-y-auto rounded-card bg-white shadow-popover">
        <div className="sticky top-0 flex items-center justify-between gap-4 px-6 py-4 bg-white border-b border-border-soft">
          <h2 className="m-0 text-h3 font-semibold text-ink">Catálogo de widgets</h2>
          <button onClick={onFechar} aria-label="Fechar"
            className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-2">
            <Icon name="x" size={18} color="currentColor" />
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6">
          {CATALOGO.map((c) => (
            <div key={c.tipo} className="rounded-card bg-surface-2 p-4 flex flex-col gap-2">
              <div className="text-label font-semibold text-ink">{c.nome}</div>
              <p className="m-0 text-caption text-muted flex-1">{c.descricao}</p>
              <Button variant="primary" onClick={() => onEscolher(c.tipo)}>
                <Icon name="plus" size={15} color="currentColor" />
                Adicionar
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function BotaoIcone({
  label, icone, onClick, perigo,
}: { label: string; icone: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={`p-1 rounded-md bg-white/90 text-muted hover:bg-surface-2 ${perigo ? "hover:text-negative" : "hover:text-ink"}`}
    >
      <Icon name={icone} size={14} color="currentColor" />
    </button>
  );
}
