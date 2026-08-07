"use client";

/**
 * Cadastros › Orçamento — planejamento financeiro por categoria e mês.
 *
 * O cadastro é em DUAS ETAPAS, e isso é regra, não estética: a alocação mensal
 * só pode existir depois que o período estiver definido, porque é o período que
 * decide QUANTAS colunas a tabela tem. Pedir as duas coisas juntas obrigaria a
 * refazer a tabela a cada mudança de data.
 *
 * O orçamento salvo alimenta a comparação previsto × realizado do DRE e do DFC
 * (`orcadoPorLinha` faz a ponte da categoria para a linha da cascata).
 */
import * as React from "react";
import { Card, Button, Input, Textarea, Select, DateField, CurrencyInput, Icon, BRL } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { rotuloColuna, mesesDoIntervalo, type Intervalo } from "@/core/relatorios";
import {
  validarOrcamento, resumoOrcamento, mesesDoOrcamento, ajustarAlocacoes, distribuir,
  totalAlocacao, sugerirCategorias, anoDoOrcamento,
  type Orcamento, type AlocacaoCategoria, type RegimeOrcamento, type FormatoOrcamento,
} from "@/core/orcamento";
import { listarOrcamentos, salvarOrcamento, removerOrcamento, duplicarOrcamento } from "@/lib/orcamentos";
import { listProjetos, listCentrosCusto } from "@/lib/iuli-cadastros";
import { normalizar } from "@/core/registros";
import {
  CabecalhoRegistro, FiltrosRegistro, TabelaRegistro, VazioRegistro, AcaoLinha, Campo,
} from "./kit";

const hoje = () => new Date();
const anoAtual = () => hoje().getFullYear();
const fmtDia = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");

const novo = (): Orcamento => ({
  id: "", nome: "", regime: "competencia", formato: "detalhado",
  periodo: { de: `${anoAtual()}-01-01`, ate: `${anoAtual()}-12-31` },
  projeto: null, centro: null, descricao: "", alocacoes: [],
  criadoEm: hoje().toISOString().slice(0, 10),
});

export function OrcamentosView() {
  const [lista, setLista] = React.useState<Orcamento[]>([]);
  const [busca, setBusca] = React.useState("");
  const [editando, setEditando] = React.useState<Orcamento | null>(null);
  const { show, node } = useToast();

  React.useEffect(() => { setLista(listarOrcamentos()); }, []);

  const visiveis = React.useMemo(() => {
    const q = normalizar(busca).trim();
    if (!q) return lista;
    return lista.filter((o) =>
      [o.nome, anoDoOrcamento(o), o.descricao].some((s) => normalizar(String(s)).includes(q)));
  }, [lista, busca]);

  const linhasXLSX = React.useMemo(() => {
    const cab = ["Orçamento", "Categoria", "Tipo", "Total", "Regime", "Formato", "Período"];
    const out: (string | number)[][] = [cab];
    for (const o of visiveis) {
      if (o.alocacoes.length === 0) {
        out.push([o.nome, "(sem alocação)", "", 0, o.regime, o.formato, `${o.periodo.de} → ${o.periodo.ate}`]);
        continue;
      }
      for (const a of o.alocacoes) {
        out.push([o.nome, a.categoria, a.tipo === "entrada" ? "Receita" : "Despesa",
          totalAlocacao(a), o.regime, o.formato, `${o.periodo.de} → ${o.periodo.ate}`]);
      }
    }
    return out;
  }, [visiveis]);

  if (editando) {
    return (
      <Editor
        inicial={editando}
        onCancelar={() => setEditando(null)}
        onSalvo={(o) => { setLista(salvarOrcamento(o)); setEditando(null); show("Orçamento salvo."); }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo="Planejamento financeiro por categoria e mês. O orçamento salvo pode ser comparado com o realizado no DRE e no DFC."
        acaoNova={{ label: "Novo orçamento", onClick: () => setEditando(novo()) }}
        exportar={{ nomeArquivo: "orcamentos", aba: "Orçamentos", linhas: linhasXLSX }}
      />

      <FiltrosRegistro busca={busca} onBusca={setBusca} placeholder="Nome, ano ou descrição…" />

      <TabelaRegistro
        itens={visiveis}
        vazio={
          <VazioRegistro
            texto={lista.length === 0
              ? "Nenhum orçamento cadastrado para esta empresa. Crie o primeiro para comparar previsto e realizado nos relatórios."
              : "Nenhum orçamento encontrado com essa busca."}
            acao={lista.length === 0 ? <Button variant="primary" onClick={() => setEditando(novo())}>Novo orçamento</Button> : undefined}
          />
        }
        colunas={[
          { chave: "nome", label: "Orçamento", render: (o) => (
            <div className="flex flex-col">
              <span className="text-ink">{o.nome || "Sem nome"}</span>
              {o.descricao && <span className="text-caption text-faint truncate max-w-[44ch]">{o.descricao}</span>}
            </div>
          ) },
          { chave: "periodo", label: "Período", render: (o) => (
            <span className="text-muted tabular-nums">{fmtDia(o.periodo.de)} → {fmtDia(o.periodo.ate)}</span>
          ) },
          { chave: "regime", label: "Regime", render: (o) => (
            <span className="text-muted">
              {o.regime === "competencia" ? "Competência" : "Caixa"} · {o.formato === "detalhado" ? "Detalhado" : "Resumido"}
            </span>
          ) },
          { chave: "receita", label: "Receita prevista", alinhar: "direita", render: (o) => <BRL value={resumoOrcamento(o).receita} /> },
          { chave: "despesa", label: "Despesa prevista", alinhar: "direita", render: (o) => <BRL value={resumoOrcamento(o).despesa} /> },
          { chave: "resultado", label: "Resultado previsto", alinhar: "direita", render: (o) => <BRL value={resumoOrcamento(o).resultado} /> },
        ]}
        acoes={(o) => (
          <>
            <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(o)} />
            <AcaoLinha label="Duplicar" icone="layers" onClick={() => {
              const c = duplicarOrcamento(o.id);
              if (c) { setLista(listarOrcamentos()); show("Orçamento duplicado."); }
            }} />
            <AcaoLinha label="Excluir" icone="trash-2" perigo onClick={() => {
              if (!window.confirm(`Excluir o orçamento "${o.nome}"?`)) return;
              setLista(removerOrcamento(o.id));
              show("Orçamento removido.");
            }} />
          </>
        )}
      />
      {node}
    </div>
  );
}

/* ================================= editor ================================= */

function Editor({
  inicial, onCancelar, onSalvo,
}: { inicial: Orcamento; onCancelar: () => void; onSalvo: (o: Orcamento) => void }) {
  // Um orçamento já salvo abre direto na alocação — a etapa 1 é o cadastro
  // inicial, não um pedágio para toda edição.
  const [etapa, setEtapa] = React.useState<1 | 2>(inicial.id ? 2 : 1);
  const [o, setO] = React.useState<Orcamento>(inicial);
  const [erros, setErros] = React.useState<Record<string, string>>({});

  const set = <K extends keyof Orcamento>(k: K, v: Orcamento[K]) => setO((s) => ({ ...s, [k]: v }));

  const projetos = React.useMemo(() => listProjetos(), []);
  const centros = React.useMemo(() => listCentrosCusto(), []);

  /** Mudar o período reajusta a alocação: as colunas mudam com ele. */
  const mudarPeriodo = (p: Intervalo) => {
    setO((s) => ({ ...s, periodo: p, alocacoes: ajustarAlocacoes(s.alocacoes, mesesDoIntervalo(p).length) }));
  };

  const avancar = () => {
    const e = validarOrcamento(o);
    setErros(e);
    if (Object.keys(e).length > 0) return;
    setO((s) => ({ ...s, id: s.id || `orc_${Date.now().toString(36)}` }));
    setEtapa(2);
  };

  if (etapa === 1) {
    return (
      <div className="flex flex-col gap-5 pb-4">
        <Card className="max-w-[860px] w-full self-center">
          <div className="flex flex-col gap-4">
            <Campo label="Nome" obrigatorio erro={erros.nome}>
              <Input value={o.nome} onChange={(e) => set("nome", e.target.value)} placeholder="Ex.: Orçamento 2026" />
            </Campo>

            <Campo label="Período" obrigatorio erro={erros.periodo}>
              <div className="flex items-center gap-2 flex-wrap">
                <DateField value={o.periodo.de} onChange={(v) => mudarPeriodo({ ...o.periodo, de: v })} />
                <Icon name="arrow-up-right" size={14} color="var(--color-text-tertiary)" />
                <DateField value={o.periodo.ate} onChange={(v) => mudarPeriodo({ ...o.periodo, ate: v })} />
                <Button variant="ghost" onClick={() => mudarPeriodo({ de: `${anoAtual()}-01-01`, ate: `${anoAtual()}-12-31` })}>
                  Ano inteiro
                </Button>
              </div>
            </Campo>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Campo
                label="Regime" obrigatorio erro={erros.regime}
                ajuda={o.regime === "competencia"
                  ? "Compara com a DRE (o fato, pelo vencimento)."
                  : "Compara com o DFC (o caixa, pelo pagamento)."}
              >
                <Select
                  value={o.regime}
                  onChange={(v) => set("regime", v as RegimeOrcamento)}
                  options={[
                    { value: "competencia", label: "Competência" },
                    { value: "caixa", label: "Caixa" },
                  ]}
                />
              </Campo>
              <Campo
                label="Formato" obrigatorio erro={erros.formato}
                ajuda={o.formato === "detalhado"
                  ? "Uma linha por categoria."
                  : "Poucas linhas — os grandes blocos de receita e despesa."}
              >
                <Select
                  value={o.formato}
                  onChange={(v) => set("formato", v as FormatoOrcamento)}
                  options={[
                    { value: "detalhado", label: "Detalhado" },
                    { value: "resumido", label: "Resumido" },
                  ]}
                />
              </Campo>
              <Campo label="Projeto (opcional)">
                <Select
                  value={o.projeto ?? ""}
                  onChange={(v) => set("projeto", v || null)}
                  options={[{ value: "", label: "Nenhum projeto" }, ...projetos.map((p) => ({ value: p.nome, label: p.nome }))]}
                  disabled={projetos.length === 0}
                />
              </Campo>
              <Campo label="Centro de custo (opcional)">
                <Select
                  value={o.centro ?? ""}
                  onChange={(v) => set("centro", v || null)}
                  options={[{ value: "", label: "Nenhum centro de custo" }, ...centros.map((c) => ({ value: c.nome, label: c.nome }))]}
                  disabled={centros.length === 0}
                />
              </Campo>
            </div>

            <Campo label="Descrição">
              <Textarea value={o.descricao} onChange={(e) => set("descricao", e.target.value)} rows={3} />
            </Campo>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-border-soft">
              <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
              <Button variant="primary" onClick={avancar}>
                Salvar e continuar
                <Icon name="arrow-up-right" size={15} color="currentColor" />
              </Button>
            </div>
          </div>
        </Card>
        <p className="m-0 text-caption text-faint text-center">
          Etapa 1 de 2 — preencha os dados iniciais. Ao salvar, o próximo passo abre a tabela de alocação mensal por categoria.
        </p>
      </div>
    );
  }

  return (
    <Alocacao
      o={o}
      onVoltar={() => setEtapa(1)}
      onChange={setO}
      onCancelar={onCancelar}
      onSalvar={() => onSalvo(o)}
    />
  );
}

/* =============================== etapa 2 =============================== */

function Alocacao({
  o, onVoltar, onChange, onCancelar, onSalvar,
}: {
  o: Orcamento;
  onVoltar: () => void;
  onChange: (o: Orcamento) => void;
  onCancelar: () => void;
  onSalvar: () => void;
}) {
  const { data: input } = useRiscoInput();
  const meses = mesesDoOrcamento(o);
  const resumo = resumoOrcamento(o);

  const setLinhas = (fn: (a: AlocacaoCategoria[]) => AlocacaoCategoria[]) =>
    onChange({ ...o, alocacoes: fn(o.alocacoes) });

  const adicionar = (tipo: "entrada" | "saida") =>
    setLinhas((a) => [...a, { categoria: "", tipo, valores: meses.map(() => 0) }]);

  /** Puxa as categorias que a empresa REALMENTE usa — orçar do zero em branco
   *  é o que faz a pessoa desistir na primeira tela. */
  const puxarDoRealizado = () => {
    const sugeridas = sugerirCategorias(input?.movements ?? []);
    const jaTem = new Set(o.alocacoes.map((a) => a.categoria.toLowerCase()));
    const novas = sugeridas
      .filter((s) => !jaTem.has(s.categoria.toLowerCase()))
      .map((s) => ({ categoria: s.categoria, tipo: s.tipo, valores: meses.map(() => 0) }));
    setLinhas((a) => [...a, ...novas]);
  };

  const totalLinha = (a: AlocacaoCategoria) => totalAlocacao(a);

  const linhasXLSX = React.useMemo(() => [
    ["Categoria", "Tipo", ...meses.map(rotuloColuna), "Total"],
    ...o.alocacoes.map((a) => [
      a.categoria, a.tipo === "entrada" ? "Receita" : "Despesa", ...a.valores, totalAlocacao(a),
    ]),
  ], [o.alocacoes, meses]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo={`${o.nome || "Orçamento"} · ${fmtDia(o.periodo.de)} → ${fmtDia(o.periodo.ate)} · ${meses.length} ${meses.length === 1 ? "mês" : "meses"}`}
        exportar={{ nomeArquivo: `orcamento-${o.nome || "novo"}`, aba: "Alocação", linhas: linhasXLSX }}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Resumo label="Receita prevista" valor={resumo.receita} />
        <Resumo label="Despesa prevista" valor={resumo.despesa} />
        <Resumo label="Resultado previsto" valor={resumo.resultado} tom={resumo.resultado >= 0 ? "positivo" : "negativo"} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="ghost" onClick={() => adicionar("entrada")}>
          <Icon name="plus" size={15} color="currentColor" />
          Linha de receita
        </Button>
        <Button variant="ghost" onClick={() => adicionar("saida")}>
          <Icon name="plus" size={15} color="currentColor" />
          Linha de despesa
        </Button>
        <Button variant="ghost" onClick={puxarDoRealizado}>
          <Icon name="sparkles" size={15} color="currentColor" />
          Puxar categorias do realizado
        </Button>
      </div>

      {o.alocacoes.length === 0 ? (
        <Card>
          <VazioRegistro
            texto="Nenhuma categoria alocada ainda. Comece puxando as categorias que a empresa já usa e depois preencha os meses."
            acao={<Button variant="primary" onClick={puxarDoRealizado}>Puxar categorias do realizado</Button>}
          />
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse text-label">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-4 py-3 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-faint sticky left-0 bg-white min-w-[220px]">
                    Categoria
                  </th>
                  {meses.map((m) => (
                    <th key={m} className="px-3 py-3 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-faint min-w-[120px]">
                      {rotuloColuna(m)}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Total</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {o.alocacoes.map((a, i) => (
                  <tr key={i} className="border-b border-border-soft last:border-0">
                    <td className="px-4 py-2 sticky left-0 bg-white min-w-[220px]">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-[3px] self-stretch min-h-[22px] rounded-pill shrink-0"
                          style={{ background: a.tipo === "entrada" ? "var(--color-positive)" : "var(--color-negative)" }}
                        />
                        <Input
                          value={a.categoria}
                          onChange={(e) => setLinhas((l) => l.map((x, k) => (k === i ? { ...x, categoria: e.target.value } : x)))}
                          placeholder="Nome da categoria"
                          containerClassName="flex-1 min-w-0"
                        />
                      </div>
                    </td>
                    {a.valores.map((v, k) => (
                      <td key={k} className="px-2 py-2">
                        <CurrencyInput
                          value={v}
                          onValueChange={(nv) => setLinhas((l) => l.map((x, j) =>
                            (j === i ? { ...x, valores: x.valores.map((y, q) => (q === k ? nv : y)) } : x)))}
                          containerClassName="w-[118px]"
                        />
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-ink">
                      <BRL value={totalLinha(a)} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        {/* Distribuir: digita-se o ano inteiro numa célula e a
                            linha se espalha. O resto vai no último mês, senão o
                            total fecharia com centavos a menos. */}
                        <AcaoLinha
                          label="Distribuir o total igualmente pelos meses"
                          icone="arrow-left-right"
                          onClick={() => setLinhas((l) => l.map((x, j) =>
                            (j === i ? { ...x, valores: distribuir(totalAlocacao(x), meses.length) } : x)))}
                        />
                        <AcaoLinha
                          label="Remover linha" icone="trash-2" perigo
                          onClick={() => setLinhas((l) => l.filter((_, j) => j !== i))}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" onClick={onVoltar}>
          <Icon name="chevron-left" size={15} color="currentColor" />
          Voltar aos dados
        </Button>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancelar}>Cancelar</Button>
          <Button variant="primary" onClick={onSalvar}>
            <Icon name="check" size={15} color="currentColor" />
            Salvar orçamento
          </Button>
        </div>
      </div>
      <p className="m-0 text-caption text-faint text-center">
        Etapa 2 de 2 — alocação mensal por categoria. Depois de salvar, escolha este orçamento no DRE ou no DFC
        para ver as colunas Orçado / Diferença / %.
      </p>
    </div>
  );
}

function Resumo({ label, valor, tom }: { label: string; valor: number; tom?: "positivo" | "negativo" }) {
  const cor = tom === "positivo" ? "text-positive" : tom === "negativo" ? "text-negative" : "text-ink";
  return (
    <Card>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{label}</span>
      <span className={`block mt-2 text-[24px] leading-none font-semibold tabular-nums ${cor}`}>
        <BRL value={valor} />
      </span>
    </Card>
  );
}
