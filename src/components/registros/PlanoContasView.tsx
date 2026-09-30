"use client";

/**
 * Cadastros › Plano de Contas — a espinha dorsal da classificação.
 *
 * ⚠️ **A árvore editada aqui É a que os lançamentos usam** — `categories`, com
 * `parent_id`, `code`, `dre_linha` e `active`. Antes esta tela editava um plano
 * em `org_state` com id numérico que NENHUM lançamento referenciava: a pessoa
 * organizava grupos, declarava linhas e nada disso chegava ao formulário nem ao
 * DRE, que liam outra lista (plana, sem código e sem linha declarada).
 *
 * As regras da árvore são do BANCO (migration `20260930180000`), e a tela só as
 * antecipa: lançamento só em FOLHA; categoria com lançamento não vira grupo nem
 * vai para a lixeira (o caminho é DESATIVAR); subcategoria herda a natureza do
 * grupo; nome único no mesmo grupo. Quando o banco recusa, a frase dele vem
 * para a tela.
 *
 * Duas abas:
 *  • **Plano de Contas** — a árvore Grupo → Categoria, com a LINHA DO DRE de
 *    cada uma (a declaração que VENCE o palpite por palavra-chave). O fio de
 *    3px na lateral é a natureza (receita × despesa), não um preenchimento.
 *  • **Uso Padrão** — qual categoria cada função automática usa (receita
 *    padrão, taxa de plataforma, chargeback…). Só FOLHAS entram.
 */
import * as React from "react";
import { Card, Button, Input, Select, Icon } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { USOS_PADRAO, linhasDREdaNatureza, normalizar, type Natureza } from "@/core/registros";
import {
  achatarArvore, categoriasSelecionaveis, ordemDeExclusao, validarCategoria,
  type CategoriaCadastro,
} from "@/core/registros/hierarquia";
import { contarLancamentosDaCategoria, usosAntigos } from "@/lib/cadastros-hierarquia";
import {
  useCategoriasArvore, useSalvarCategoria, useDefinirCategoriaAtiva, useExcluirCategoria,
  useUsosPadrao, useDefinirUsoPadrao, usePendenciasAntigas, useTrazerAntigo,
} from "./hooks";
import { CabecalhoRegistro, IdCopiavel, Campo, AcaoLinha, VazioRegistro, ErroGravacao, BlocoAntigos } from "./kit";

const COR: Record<Natureza, string> = { receita: "var(--color-positive)", despesa: "var(--color-negative)" };
const erroTexto = (e: unknown) => (e instanceof Error ? e.message : "O banco recusou a gravação.");
const rotuloLinha = (id: string | undefined, n: Natureza) =>
  id ? linhasDREdaNatureza(n).find((l) => l.id === id)?.label ?? id : null;

export function PlanoContasView() {
  const [aba, setAba] = React.useState<"plano" | "usos">("plano");
  const arvore = useCategoriasArvore();
  const cats = React.useMemo(() => arvore.data ?? [], [arvore.data]);

  const linhasXLSX = React.useMemo(() => [
    ["ID", "Código", "Categoria", "Natureza", "Grupo", "Linha do DRE", "Situação"],
    ...achatarArvore(cats).map(({ item }) => [
      item.id, item.codigo, item.nome,
      item.natureza === "receita" ? "Receita" : "Despesa",
      cats.find((c) => c.id === item.paiId)?.nome ?? "",
      rotuloLinha(item.dreLinha, item.natureza) ?? "Pelo nome (palpite)",
      item.ativo ? "Ativa" : "Inativa",
    ]),
  ], [cats]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="A árvore de categorias que os lançamentos, o DRE e a conciliação usam."
        exportar={{ nomeArquivo: "plano-de-contas", aba: "Plano de contas", linhas: linhasXLSX }}
      />

      <div className="flex items-center gap-1 border-b border-border-soft" role="tablist">
        {(["plano", "usos"] as const).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={aba === a}
            onClick={() => setAba(a)}
            className={`relative px-3 py-2 text-label transition-colors ${aba === a ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
          >
            {a === "plano" ? "Plano de Contas" : "Uso Padrão"}
            {aba === a && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
          </button>
        ))}
      </div>

      {arvore.error ? (
        <ErroGravacao mensagem={`Não foi possível ler o plano de contas: ${erroTexto(arvore.error)}`} />
      ) : aba === "plano"
        ? <Arvore cats={cats} carregando={arvore.isLoading} carregado={!!arvore.data} />
        : <UsoPadrao cats={cats} />}
    </div>
  );
}

/* --------------------------------- árvore --------------------------------- */

function Arvore({ cats, carregando, carregado }: { cats: CategoriaCadastro[]; carregando: boolean; carregado: boolean }) {
  const ativar = useDefinirCategoriaAtiva();
  const excluirMut = useExcluirCategoria();
  const trazer = useTrazerAntigo("categorias");
  const antigos = usePendenciasAntigas("categorias", carregado ? { categorias: cats } : null);

  const [busca, setBusca] = React.useState("");
  const [recolhidos, setRecolhidos] = React.useState<Set<string>>(new Set());
  const [editando, setEditando] = React.useState<CategoriaCadastro | null>(null);
  const [trazendo, setTrazendo] = React.useState<string | null>(null);
  const [excluindo, setExcluindo] = React.useState<string | null>(null);

  // `?novo=1` — o endereço que o painel Criar usa abre esta tela com o
  // formulário de nova categoria já aberto.
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).get("novo")) setEditando(nova(null, "despesa"));
  }, []);
  const { show, node } = useToast();

  const q = normalizar(busca).trim();
  const achatado = React.useMemo(() => achatarArvore(cats), [cats]);
  const grupos = React.useMemo(() => new Set(cats.map((c) => c.paiId).filter(Boolean) as string[]), [cats]);

  /**
   * Buscando, os PAIS de quem casa continuam visíveis — sem eles a linha
   * encontrada apareceria solta, sem dizer de que grupo veio.
   */
  const visiveis = React.useMemo(() => {
    if (!q) return achatado.filter(({ item }) => !item.paiId || !recolhidos.has(item.paiId));
    const casa = (c: CategoriaCadastro) =>
      normalizar(c.nome).includes(q) || normalizar(c.codigo).includes(q) || c.id.includes(q);
    const manter = new Set<string>();
    for (const { item } of achatado) {
      if (!casa(item)) continue;
      manter.add(item.id);
      let pai = item.paiId;
      while (pai && !manter.has(pai)) {
        manter.add(pai);
        pai = cats.find((c) => c.id === pai)?.paiId ?? null;
      }
    }
    return achatado.filter(({ item }) => manter.has(item.id));
  }, [achatado, q, recolhidos, cats]);

  const alternar = (id: string) =>
    setRecolhidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  /**
   * ⚠️ CONTA ANTES, e diz quantos. Categoria com lançamento não vai para a
   * lixeira (o banco recusa de novo se alguém pular esta conta) — o caminho é
   * desativar, que tira das escolhas sem perder o histórico.
   */
  const excluir = async (c: CategoriaCadastro) => {
    setExcluindo(c.id);
    try {
      const ordem = ordemDeExclusao(cats, c.id);
      let n = 0;
      for (const id of ordem) n += await contarLancamentosDaCategoria(id);
      if (n > 0) {
        show(`"${c.nome}" ${ordem.length > 1 ? "e as subcategorias têm" : "tem"} ${n} lançamento(s) e não pode ir para a lixeira. Desative para tirá-la das escolhas sem perder o histórico.`);
        return;
      }
      const filhas = ordem.length - 1;
      const ok = window.confirm(
        filhas > 0
          ? `Mandar "${c.nome}" e ${filhas} ${filhas === 1 ? "subcategoria" : "subcategorias"} para a lixeira? Nenhuma delas tem lançamento.`
          : `Mandar "${c.nome}" para a lixeira? Ela não tem lançamento.`,
      );
      if (!ok) return;
      await excluirMut.mutateAsync(c.id);
      show(filhas > 0 ? `${ordem.length} categorias foram para a lixeira.` : `"${c.nome}" foi para a lixeira.`);
    } catch (e) {
      show(erroTexto(e));
    } finally {
      setExcluindo(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <BlocoAntigos
        oQue="categorias"
        itens={antigos}
        trazendo={trazendo}
        onTrazer={(i) => {
          const p = antigos.find((x) => x.chave === i.chave);
          if (!p) return;
          setTrazendo(i.chave);
          trazer.mutate(p, {
            onSuccess: (msg) => show(msg),
            onError: (e) => show(erroTexto(e)),
            onSettled: () => setTrazendo(null),
          });
        }}
      />

      <div className="flex items-end gap-3 flex-wrap">
        <Campo label="Buscar" className="flex-1 min-w-[220px]">
          <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código ou ID…" />
        </Campo>
        <Button
          variant="ghost"
          onClick={() => setRecolhidos((s) => (s.size > 0 ? new Set() : new Set(Array.from(grupos))))}
        >
          <Icon name={recolhidos.size > 0 ? "chevron-down" : "chevron-right"} size={15} color="currentColor" />
          {recolhidos.size > 0 ? "Expandir tudo" : "Recolher tudo"}
        </Button>
        <Button variant="outline" onClick={() => setEditando(nova(null, "despesa"))}>
          <Icon name="plus" size={15} color="currentColor" />
          Nova categoria ou grupo
        </Button>
      </div>

      <div className="flex items-center gap-5 text-caption text-muted flex-wrap">
        <Legenda cor={COR.receita}>Receita (contas a receber)</Legenda>
        <Legenda cor={COR.despesa}>Despesa (contas a pagar)</Legenda>
        <span>Lançamento só em categoria sem subcategorias.</span>
      </div>

      {visiveis.length === 0 ? (
        <Card>
          <VazioRegistro texto={carregando ? "Carregando o plano de contas…" : cats.length === 0 ? "O plano de contas está vazio. Crie o primeiro grupo ou categoria." : "Nenhuma categoria encontrada."} />
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-6 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint">ID</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint w-[100px]">Código</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint">Categoria</th>
                  <th className="px-4 py-3 text-left text-[11px] font-medium tracking-[0.08em] text-faint">Linha do DRE</th>
                  <th className="px-6 py-3 text-right text-[11px] font-medium tracking-[0.08em] text-faint">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map(({ item: cat, nivel }) => {
                  const grupo = grupos.has(cat.id);
                  const linha = rotuloLinha(cat.dreLinha, cat.natureza);
                  return (
                    <tr key={cat.id} className={`border-b border-border-soft last:border-0 ${grupo ? "bg-surface-2/60" : ""}`}>
                      <td className="px-6 py-[10px]"><IdCopiavel id={cat.id} /></td>
                      <td className="px-4 py-[10px] text-caption text-muted tabular-nums">{cat.codigo || "—"}</td>
                      <td className="px-4 py-[10px]">
                        <div className="flex items-center gap-2" style={{ paddingLeft: nivel * 20 }}>
                          {/* O fio de cor é o sinal da natureza — não um fundo colorido. */}
                          <span className="w-[3px] self-stretch min-h-[18px] rounded-pill shrink-0" style={{ background: COR[cat.natureza] }} />
                          {grupo ? (
                            <button onClick={() => alternar(cat.id)} aria-label="Recolher/expandir" className="text-muted hover:text-ink">
                              <Icon name={recolhidos.has(cat.id) ? "chevron-right" : "chevron-down"} size={14} color="currentColor" />
                            </button>
                          ) : <span className="w-[14px]" />}
                          <span className={`text-label ${grupo ? "font-semibold" : ""} ${cat.ativo ? "text-ink" : "text-faint"}`}>{cat.nome}</span>
                          {!cat.ativo && <span className="text-caption text-faint">(inativa)</span>}
                        </div>
                      </td>
                      <td className="px-4 py-[10px] text-caption text-muted">
                        {grupo ? <span className="text-faint">grupo</span> : (linha ?? <span className="text-faint">pelo nome (palpite)</span>)}
                      </td>
                      <td className="px-6 py-[10px]">
                        <div className="flex items-center justify-end gap-1">
                          {nivel === 0 && (
                            <Button variant="ghost" onClick={() => setEditando(nova(cat.id, cat.natureza))}>
                              <Icon name="plus" size={14} color="currentColor" />
                              Subcategoria
                            </Button>
                          )}
                          <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(cat)} />
                          <AcaoLinha
                            label={cat.ativo ? "Desativar" : "Reativar"}
                            icone={cat.ativo ? "eye-off" : "eye"}
                            onClick={() => ativar.mutate({ id: cat.id, ativo: !cat.ativo }, {
                              onSuccess: () => show(cat.ativo ? `"${cat.nome}" desativada — sai das escolhas, o histórico fica.` : `"${cat.nome}" reativada.`),
                              onError: (e) => show(erroTexto(e)),
                            })}
                          />
                          <AcaoLinha
                            label={excluindo === cat.id ? "Contando lançamentos…" : "Excluir"}
                            icone="trash-2"
                            perigo
                            onClick={() => { if (!excluindo) void excluir(cat); }}
                          />
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

      {editando && (
        <FormCategoria
          inicial={editando}
          todas={cats}
          onClose={() => setEditando(null)}
          onSalvo={(c, criada) => {
            setEditando(null);
            show(criada ? `Categoria "${c.nome}" criada.` : `Categoria "${c.nome}" salva.`);
          }}
        />
      )}
      {node}
    </div>
  );
}

const nova = (paiId: string | null, natureza: Natureza): CategoriaCadastro => ({
  id: "", nome: "", codigo: "", natureza, paiId, dreLinha: undefined, ativo: true,
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
  inicial, todas, onClose, onSalvo,
}: {
  inicial: CategoriaCadastro; todas: CategoriaCadastro[];
  onClose: () => void; onSalvo: (c: CategoriaCadastro, criada: boolean) => void;
}) {
  const salvarCat = useSalvarCategoria();
  const [f, setF] = React.useState<CategoriaCadastro>(inicial);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [erroBanco, setErroBanco] = React.useState<string | null>(null);
  const set = <K extends keyof CategoriaCadastro>(k: K, v: CategoriaCadastro[K]) => setF((s) => ({ ...s, [k]: v }));

  const pai = f.paiId ? todas.find((c) => c.id === f.paiId) : undefined;
  // ⚠️ Subcategoria HERDA a natureza do grupo — uma despesa dentro de um grupo
  // de receita quebraria o DRE em silêncio (o banco também recusa).
  const natureza: Natureza = pai?.natureza ?? f.natureza;
  const ehGrupo = !!f.id && todas.some((c) => c.paiId === f.id);
  // Grupo possível: uma categoria de primeiro nível, da mesma natureza, que não
  // seja ela mesma. A tela trabalha com dois níveis (grupo → categoria).
  const opcoesDeGrupo = todas.filter((c) => !c.paiId && c.id !== f.id && c.natureza === natureza);
  const linhas = linhasDREdaNatureza(natureza);

  const salvar = () => {
    const alvo = { ...f, natureza };
    const e = validarCategoria(alvo, todas);
    setErros(e);
    setErroBanco(null);
    if (Object.keys(e).length > 0) return;
    salvarCat.mutate(alvo, {
      onSuccess: (c) => onSalvo(c, !inicial.id),
      onError: (err) => setErroBanco(erroTexto(err)),
    });
  };

  const titulo = inicial.id
    ? "Editar categoria"
    : inicial.paiId ? `Nova subcategoria em "${todas.find((c) => c.id === inicial.paiId)?.nome ?? ""}"` : "Nova categoria ou grupo";

  return (
    <FormModal title={titulo} size="compact" onClose={onClose} onSave={salvar} saving={salvarCat.isPending}>
      <ErroGravacao mensagem={erroBanco} />
      <Campo label="Nome" obrigatorio erro={erros.nome}>
        <Input value={f.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Produto Online" />
      </Campo>
      <Campo label="Código" erro={erros.codigo} ajuda="Opcional — o código do plano contábil (o Domínio casa por ele).">
        <Input value={f.codigo} onChange={(e) => set("codigo", e.target.value)} placeholder="Ex.: 3.1.01" />
      </Campo>
      {pai ? (
        <p className="m-0 text-caption text-faint">
          Herda a natureza do grupo &quot;{pai.nome}&quot;: {pai.natureza === "receita" ? "Receita" : "Despesa"}.
        </p>
      ) : (
        <Campo label="Natureza" erro={erros.natureza}>
          <Select
            value={f.natureza}
            onChange={(v) => setF((s) => ({ ...s, natureza: v as Natureza, dreLinha: undefined }))}
            options={[{ value: "receita", label: "Receita (contas a receber)" }, { value: "despesa", label: "Despesa (contas a pagar)" }]}
          />
        </Campo>
      )}
      {!ehGrupo && (
        <Campo label="Grupo" erro={erros.paiId} ajuda="Vazio = a categoria fica no primeiro nível do plano.">
          <Select
            value={f.paiId ?? ""}
            onChange={(v) => set("paiId", v || null)}
            placeholder="Sem grupo"
            options={[{ value: "", label: "Sem grupo (primeiro nível)" }, ...opcoesDeGrupo.map((c) => ({ value: c.id, label: c.nome }))]}
          />
        </Campo>
      )}
      <Campo
        label="Linha do DRE"
        erro={erros.dreLinha}
        ajuda={ehGrupo
          ? "Um grupo não recebe lançamento — a linha vale para as subcategorias que não declararem a própria."
          : "Onde os lançamentos desta categoria entram no DRE. Sem declarar, o sistema adivinha pelo nome."}
      >
        <Select
          value={f.dreLinha ?? ""}
          onChange={(v) => set("dreLinha", v || undefined)}
          options={[{ value: "", label: "Adivinhar pelo nome (palpite)" }, ...linhas.map((l) => ({ value: l.id, label: l.label }))]}
        />
      </Campo>
    </FormModal>
  );
}

/* ------------------------------- uso padrão ------------------------------- */

function UsoPadrao({ cats }: { cats: CategoriaCadastro[] }) {
  const usos = useUsosPadrao();
  const definir = useDefinirUsoPadrao();
  const { show, node } = useToast();
  const [antigos, setAntigos] = React.useState<{ funcao: string; categoriaId: string; nome: string }[]>([]);

  // O uso padrão ANTIGO apontava para o id local do plano; lido só no
  // navegador e só depois de a tabela responder (antes, tudo pareceria novo).
  React.useEffect(() => {
    if (usos.data && cats.length) setAntigos(usosAntigos(cats, usos.data));
  }, [usos.data, cats]);

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-label text-muted max-w-[92ch]">
        Qual categoria cada função automática usa (vendas importadas, taxas de plataforma, chargebacks).
        Cada função aceita uma única categoria, e só categorias sem subcategorias entram. As
        importações ainda classificam pelo nome: esta escolha fica gravada no cadastro da empresa
        para quando passarem a lê-la.
      </p>
      {antigos.length > 0 && (
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-label text-muted">
              {antigos.length} escolha(s) do uso padrão antigo deste navegador ainda não estão no cadastro.
            </span>
            <Button
              variant="outline"
              disabled={definir.isPending}
              onClick={async () => {
                try {
                  for (const a of antigos) await definir.mutateAsync({ funcao: a.funcao, categoriaId: a.categoriaId });
                  show(`${antigos.length} escolha(s) trazida(s) para o cadastro.`);
                  setAntigos([]);
                } catch (e) { show(erroTexto(e)); }
              }}
            >
              Trazer para o cadastro
            </Button>
          </div>
        </Card>
      )}
      {usos.error ? (
        <ErroGravacao mensagem={`Não foi possível ler o uso padrão: ${erroTexto(usos.error)}`} />
      ) : (
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-5">
            {USOS_PADRAO.map((f) => {
              const opcoes = categoriasSelecionaveis(cats, f.natureza);
              return (
                <div key={f.id} className="flex flex-col gap-[6px]">
                  <span className="inline-flex items-center gap-2 text-label text-ink">
                    <span className="w-[8px] h-[8px] rounded-pill shrink-0" style={{ background: COR[f.natureza] }} />
                    {f.label}
                  </span>
                  <Select
                    value={usos.data?.[f.id] ?? ""}
                    onChange={(v) => definir.mutate({ funcao: f.id, categoriaId: v || null }, {
                      onError: (e) => show(erroTexto(e)),
                    })}
                    placeholder="Selecione a categoria"
                    options={[{ value: "", label: "Nenhuma" }, ...opcoes.map((c) => ({ value: c.id, label: c.nome }))]}
                  />
                  <span className="text-caption text-faint">{f.ajuda}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}
      {node}
    </div>
  );
}
