"use client";

/**
 * Cadastros › Plano de Contas — a espinha dorsal da classificação.
 *
 * Duas abas com papéis bem diferentes:
 *  • **Plano de Contas** — a árvore Grupo → Categoria, editável (adicionar
 *    subcategoria, renomear, excluir), colorida pela NATUREZA: verde para
 *    receita (contas a receber), vermelho para despesa (contas a pagar). A cor
 *    é um fio de 3px na lateral, não um preenchimento.
 *  • **Uso Padrão** — o dicionário que amarra cada função automática do sistema
 *    a UMA categoria. É o que faz uma venda importada, uma taxa de plataforma ou
 *    um chargeback caírem na linha certa do DRE sem ninguém classificar à mão.
 *
 * Excluir um grupo leva os filhos junto — por isso a confirmação diz quantos.
 */
import * as React from "react";
import { Card, Button, Input, Select, Icon } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import {
  USOS_PADRAO, achatarPlano, idsComDescendentes, normalizar,
  type CategoriaPlano, type Natureza,
} from "@/core/registros";
import {
  listPlanoContas, salvarPlanoContas, resetarPlanoContas,
  listUsosPadrao, salvarUsoPadrao, novoIdRegistro,
} from "@/lib/registros";
import { CabecalhoRegistro, IdCopiavel, Campo, AcaoLinha, VazioRegistro } from "./kit";

const COR: Record<Natureza, string> = { receita: "var(--color-positive)", despesa: "var(--color-negative)" };

export function PlanoContasView() {
  const [aba, setAba] = React.useState<"plano" | "usos">("plano");
  const [cats, setCats] = React.useState<CategoriaPlano[]>([]);
  const [usos, setUsos] = React.useState<Record<string, string>>({});

  React.useEffect(() => { setCats(listPlanoContas()); setUsos(listUsosPadrao()); }, []);

  const linhasXLSX = React.useMemo(() => [
    ["ID", "Código", "Categoria", "Natureza", "Grupo"],
    ...achatarPlano(cats).map(({ cat }) => [
      cat.id, cat.codigo, cat.nome,
      cat.natureza === "receita" ? "Receita" : "Despesa",
      cats.find((c) => c.id === cat.paiId)?.nome ?? "",
    ]),
  ], [cats]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="Hierarquia de categorias usada em lançamentos, relatórios e conciliação."
        exportar={{ nomeArquivo: "plano-de-contas", aba: "Plano de contas", linhas: linhasXLSX }}
      />

      <div className="flex items-center gap-1 border-b border-border-soft">
        {(["plano", "usos"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`relative px-3 py-2 text-label transition-colors ${aba === a ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
          >
            {a === "plano" ? "Plano de Contas" : "Uso Padrão"}
            {aba === a && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
          </button>
        ))}
      </div>

      {aba === "plano"
        ? <Arvore cats={cats} onCats={(c) => setCats(salvarPlanoContas(c))} />
        : <UsoPadrao cats={cats} usos={usos} onUsos={setUsos} />}
    </div>
  );
}

/* --------------------------------- árvore --------------------------------- */

function Arvore({ cats, onCats }: { cats: CategoriaPlano[]; onCats: (c: CategoriaPlano[]) => void }) {
  const [busca, setBusca] = React.useState("");
  const [recolhidos, setRecolhidos] = React.useState<Set<string>>(new Set());
  const [editando, setEditando] = React.useState<CategoriaPlano | null>(null);
  const [novaEm, setNovaEm] = React.useState<CategoriaPlano | null>(null);
  const { show, node } = useToast();

  const q = normalizar(busca).trim();
  const achatado = React.useMemo(() => achatarPlano(cats), [cats]);

  /**
   * Buscando, os PAIS de quem casa continuam visíveis — sem eles a linha
   * encontrada apareceria solta, sem dizer de que grupo veio.
   */
  const visiveis = React.useMemo(() => {
    if (!q) return achatado.filter(({ cat }) => !cat.paiId || !recolhidos.has(cat.paiId));
    const casa = (c: CategoriaPlano) =>
      normalizar(c.nome).includes(q) || normalizar(c.codigo).includes(q) || c.id.includes(q);
    const manter = new Set<string>();
    for (const { cat } of achatado) {
      if (!casa(cat)) continue;
      manter.add(cat.id);
      let pai = cat.paiId;
      while (pai) {
        manter.add(pai);
        pai = cats.find((c) => c.id === pai)?.paiId ?? null;
      }
    }
    return achatado.filter(({ cat }) => manter.has(cat.id));
  }, [achatado, q, recolhidos, cats]);

  const alternar = (id: string) =>
    setRecolhidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const excluir = (c: CategoriaPlano) => {
    const ids = idsComDescendentes(cats, c.id);
    const filhos = ids.length - 1;
    const ok = window.confirm(
      filhos > 0
        ? `Excluir "${c.nome}" também remove ${filhos} ${filhos === 1 ? "subcategoria" : "subcategorias"}. Continuar?`
        : `Excluir "${c.nome}"?`,
    );
    if (!ok) return;
    onCats(cats.filter((x) => !ids.includes(x.id)));
    show(filhos > 0 ? `${ids.length} categorias removidas.` : "Categoria removida.");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end gap-3 flex-wrap">
        <Campo label="Buscar" className="flex-1 min-w-[220px]">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código ou ID…" />
        </Campo>
        <Button
          variant="ghost"
          onClick={() => setRecolhidos((s) => (s.size > 0 ? new Set() : new Set(cats.filter((c) => !c.paiId).map((c) => c.id))))}
        >
          <Icon name={recolhidos.size > 0 ? "chevron-down" : "chevron-right"} size={15} color="currentColor" />
          {recolhidos.size > 0 ? "Expandir tudo" : "Recolher tudo"}
        </Button>
        <Button variant="ghost" onClick={() => { onCats([...cats, grupoNovo("receita")]); show("Grupo criado."); }}>
          <Icon name="plus" size={15} color="currentColor" />
          Novo grupo
        </Button>
      </div>

      <div className="flex items-center gap-5 text-caption text-muted">
        <Legenda cor={COR.receita}>Receita (contas a receber)</Legenda>
        <Legenda cor={COR.despesa}>Despesa (contas a pagar)</Legenda>
      </div>

      {visiveis.length === 0 ? (
        <Card><VazioRegistro texto="Nenhuma categoria encontrada." /></Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-6 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint w-[140px]">ID</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint w-[100px]">Código</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint">Categoria</th>
                  <th className="px-6 py-3 text-right text-[11px] font-medium tracking-[0.08em] text-faint">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(({ cat, nivel }) => {
                  const grupo = nivel === 0;
                  const temFilho = cats.some((c) => c.paiId === cat.id);
                  return (
                    <tr key={cat.id} className={`border-b border-border-soft last:border-0 ${grupo ? "bg-surface-2/60" : ""}`}>
                      <td className="px-6 py-[10px]"><IdCopiavel id={cat.id} /></td>
                      <td className="px-4 py-[10px] text-caption text-muted tabular-nums">{cat.codigo || "—"}</td>
                      <td className="px-4 py-[10px]">
                        <div className="flex items-center gap-2" style={{ paddingLeft: nivel * 20 }}>
                          {/* O fio de cor é o sinal da natureza — não um fundo colorido. */}
                          <span className="w-[3px] self-stretch min-h-[18px] rounded-pill shrink-0" style={{ background: COR[cat.natureza] }} />
                          {grupo && temFilho ? (
                            <button onClick={() => alternar(cat.id)} aria-label="Recolher/expandir" className="text-muted hover:text-ink">
                              <Icon name={recolhidos.has(cat.id) ? "chevron-right" : "chevron-down"} size={14} color="currentColor" />
                            </button>
                          ) : <span className="w-[14px]" />}
                          <span className={`text-label ${grupo ? "font-semibold text-ink" : "text-ink"}`}>{cat.nome}</span>
                        </div>
                      </td>
                      <td className="px-6 py-[10px]">
                        <div className="flex items-center justify-end gap-1">
                          {grupo && (
                            <Button variant="ghost" onClick={() => setNovaEm(cat)}>
                              <Icon name="plus" size={14} color="currentColor" />
                              Categoria
                            </Button>
                          )}
                          <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(cat)} />
                          <AcaoLinha label="Excluir" icone="trash-2" perigo onClick={() => excluir(cat)} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div>
        <Button
          variant="ghost"
          onClick={() => {
            if (!window.confirm("Restaurar o plano de contas padrão? As categorias criadas por você serão perdidas.")) return;
            onCats(resetarPlanoContas());
            show("Plano padrão restaurado.");
          }}
        >
          <Icon name="rotate-ccw" size={15} color="currentColor" />
          Restaurar plano padrão
        </Button>
      </div>

      {(editando || novaEm) && (
        <FormCategoria
          inicial={editando}
          pai={novaEm}
          onClose={() => { setEditando(null); setNovaEm(null); }}
          onSalvo={(c) => {
            onCats(editando ? cats.map((x) => (x.id === c.id ? c : x)) : [...cats, c]);
            setEditando(null); setNovaEm(null);
            show(editando ? "Categoria salva." : "Categoria criada.");
          }}
        />
      )}
      {node}
    </div>
  );
}

const grupoNovo = (natureza: Natureza): CategoriaPlano => ({
  id: novoIdRegistro(), nome: "Novo grupo", codigo: "", natureza, paiId: null,
});

function Legenda({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-[8px] h-[8px] rounded-pill" style={{ background: cor }} />
      {children}
    </span>
  );
}

function FormCategoria({
  inicial, pai, onClose, onSalvo,
}: {
  inicial?: CategoriaPlano | null; pai?: CategoriaPlano | null;
  onClose: () => void; onSalvo: (c: CategoriaPlano) => void;
}) {
  const [nome, setNome] = React.useState(inicial?.nome ?? "");
  const [codigo, setCodigo] = React.useState(inicial?.codigo ?? "");
  // Subcategoria HERDA a natureza do grupo: uma despesa dentro de um grupo de
  // receita quebraria o DRE em silêncio.
  const [natureza, setNatureza] = React.useState<Natureza>(inicial?.natureza ?? pai?.natureza ?? "despesa");
  const [erro, setErro] = React.useState("");

  const salvar = () => {
    if (!nome.trim()) { setErro("Informe o nome da categoria."); return; }
    onSalvo(inicial
      ? { ...inicial, nome: nome.trim(), codigo: codigo.trim(), natureza }
      : { id: novoIdRegistro(), nome: nome.trim(), codigo: codigo.trim(), natureza: pai?.natureza ?? natureza, paiId: pai?.id ?? null });
  };

  return (
    <FormModal
      title={inicial ? "Editar categoria" : pai ? `Nova categoria em "${pai.nome}"` : "Nova categoria"}
      size="compact"
      onClose={onClose}
      onSave={salvar}
    >
      <Campo label="Nome" obrigatorio erro={erro}>
        <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Produto Online" />
      </Campo>
      <Campo label="Código" ajuda="Opcional — usado por planos contábeis.">
        <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Ex.: 3.1.01" />
      </Campo>
      {pai ? (
        <p className="m-0 text-caption text-faint">
          Herda a natureza do grupo: {pai.natureza === "receita" ? "Receita" : "Despesa"}.
        </p>
      ) : (
        <Campo label="Natureza">
          <Select
            value={natureza}
            onChange={(v) => setNatureza(v as Natureza)}
            options={[{ value: "receita", label: "Receita (contas a receber)" }, { value: "despesa", label: "Despesa (contas a pagar)" }]}
          />
        </Campo>
      )}
    </FormModal>
  );
}

/* ------------------------------- uso padrão ------------------------------- */

function UsoPadrao({
  cats, usos, onUsos,
}: { cats: CategoriaPlano[]; usos: Record<string, string>; onUsos: (u: Record<string, string>) => void }) {
  // Só FOLHAS entram: amarrar uma função a um grupo classificaria o lançamento
  // num nível que o DRE não detalha.
  const folhas = React.useMemo(
    () => cats.filter((c) => !cats.some((x) => x.paiId === c.id)),
    [cats],
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-label text-muted max-w-[92ch]">
        Categorias usadas automaticamente quando o sistema cria lançamentos a partir de importações e
        integrações (vendas, taxas de plataforma, chargebacks). Cada função aceita uma única categoria.
      </p>
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
          {USOS_PADRAO.map((f) => {
            const opcoes = folhas.filter((c) => c.natureza === f.natureza);
            return (
              <div key={f.id} className="flex flex-col gap-[6px]">
                <span className="inline-flex items-center gap-2 text-label text-ink">
                  <span className="w-[8px] h-[8px] rounded-pill shrink-0" style={{ background: COR[f.natureza] }} />
                  {f.label}
                </span>
                <Select
                  value={usos[f.id] ?? ""}
                  onChange={(v) => onUsos(salvarUsoPadrao(f.id, v))}
                  placeholder="Selecione a categoria"
                  options={opcoes.map((c) => ({ value: c.id, label: c.nome }))}
                />
                <span className="text-caption text-faint">{f.ajuda}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
