"use client";

/**
 * Cadastros › Contratos — de fornecedores e de clientes.
 *
 * Um contrato é um compromisso com prazo: quem, o quê, quanto e por quanto
 * tempo. Duas coisas dão trabalho de verdade aqui, e as duas são regra de
 * negócio, não formulário:
 *
 *  1. **Rateio** por projeto e por centro de custo, que precisa fechar 100%.
 *     Enquanto não fecha, o contrato não salva — um rateio de 80% jogaria os
 *     20% restantes em lugar nenhum, e o DRE por centro mentiria em silêncio.
 *  2. **Vendas associadas** (só no contrato de CLIENTE): a agenda mês a mês
 *     sai de `vendasDoContrato`, que traduz competência e vencimento em datas
 *     reais dentro da vigência. A tabela mostra exatamente o que será criado —
 *     ninguém assina um recorrente sem ver as parcelas.
 */
import * as React from "react";
import { Card, Button, Input, Textarea, Select, DateField, CurrencyInput, Icon, BRL, Switch } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { usePartiesList, useProductsList } from "@/components/lancamentos/hooks";
import { useAccounts } from "@/components/visao-geral/hooks";
import {
  validarContrato, vendasDoContrato, somaRateio, rateioValido, anexoCabe, LIMITE_ANEXO,
  contratoAtivo, normalizar,
  type Contrato, type LinhaRateio, type ConfigVendas, type Vigencia,
} from "@/core/registros";
import { listContratos, salvarContrato, removerContrato, novoIdRegistro, listPlanoContas } from "@/lib/registros";
import { listProjetos, listCentrosCusto } from "@/lib/iuli-cadastros";
import {
  CabecalhoRegistro, FiltrosRegistro, TabelaRegistro, VazioRegistro, AcaoLinha, Campo, BlocoForm,
} from "./kit";

const fmtDia = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "—");
const hoje = () => new Date().toISOString().slice(0, 10);

const METODOS = ["Pix", "Boleto", "Cartão de crédito", "Transferência", "Dinheiro"];

export function ContratosView() {
  const [lado, setLado] = React.useState<"fornecedor" | "cliente">("fornecedor");
  const [itens, setItens] = React.useState<Contrato[]>([]);
  const [busca, setBusca] = React.useState("");
  const [vigencia, setVigencia] = React.useState<Vigencia>("todos");
  const [editando, setEditando] = React.useState<Contrato | null>(null);
  const { show, node } = useToast();

  React.useEffect(() => { setItens(listContratos()); }, []);

  const doLado = React.useMemo(() => itens.filter((c) => c.lado === lado), [itens, lado]);
  const visiveis = React.useMemo(() => {
    const q = normalizar(busca).trim();
    return doLado.filter((c) => {
      if (vigencia === "ativos" && !contratoAtivo(c, hoje())) return false;
      if (vigencia === "encerrados" && contratoAtivo(c, hoje())) return false;
      if (!q) return true;
      return [c.id, c.objeto, c.parteNome].some((s) => normalizar(String(s)).includes(q));
    });
  }, [doLado, busca, vigencia]);

  const linhas = React.useMemo(() => [
    ["ID", lado === "cliente" ? "Cliente" : "Fornecedor", "Objeto", "Valor", "Início", "Fim", "Vendas recorrentes", "Situação"],
    ...visiveis.map((c) => [
      c.id, c.parteNome, c.objeto, c.valor, c.inicio, c.fim,
      c.vendas ? vendasDoContrato(c).length : 0,
      contratoAtivo(c, hoje()) ? "Ativo" : "Encerrado",
    ]),
  ], [visiveis, lado]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo={lado === "fornecedor"
          ? "Contratos ativos e históricos vinculados aos fornecedores da empresa."
          : "Contratos ativos e históricos vinculados aos clientes — e as vendas recorrentes que eles geram."}
        acaoNova={{ label: "Novo contrato", onClick: () => setEditando(vazio(lado)) }}
        exportar={{ nomeArquivo: `contratos-${lado}`, aba: "Contratos", linhas }}
      />

      <div className="flex items-center gap-1 border-b border-border-soft">
        {(["fornecedor", "cliente"] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLado(l)}
            className={`relative px-3 py-2 text-label transition-colors ${lado === l ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
          >
            {l === "fornecedor" ? "Contratos de Fornecedores" : "Contratos de Clientes"}
            {lado === l && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
          </button>
        ))}
      </div>

      <FiltrosRegistro
        busca={busca} onBusca={setBusca}
        placeholder={`ID, objeto ou ${lado}…`}
        campos={[{ label: "Vigência", value: vigencia, onChange: (v) => setVigencia(v as Vigencia), options: [
          { value: "todos", label: "Todos" },
          { value: "ativos", label: "Ativos" },
          { value: "encerrados", label: "Encerrados" },
        ] }]}
      />

      <TabelaRegistro
        itens={visiveis}
        vazio={
          <VazioRegistro
            texto={doLado.length === 0
              ? "Nenhum contrato cadastrado."
              : "Nenhum contrato encontrado com esses filtros."}
            acao={doLado.length === 0
              ? <Button variant="primary" onClick={() => setEditando(vazio(lado))}>Novo contrato</Button>
              : undefined}
          />
        }
        colunas={[
          { chave: "parte", label: lado === "cliente" ? "Cliente" : "Fornecedor", render: (c) => (
            <div className="flex flex-col">
              <span className="text-ink">{c.parteNome}</span>
              <span className="text-caption text-faint truncate max-w-[44ch]">{c.objeto}</span>
            </div>
          ) },
          { chave: "vigencia", label: "Vigência", render: (c) => (
            <span className="text-muted tabular-nums">{fmtDia(c.inicio)} → {fmtDia(c.fim)}</span>
          ) },
          { chave: "valor", label: "Valor", alinhar: "direita", render: (c) => <BRL value={c.valor} /> },
          { chave: "vendas", label: "Vendas", render: (c) => (
            c.vendas
              ? <span className="text-muted tabular-nums">{vendasDoContrato(c).length} previstas</span>
              : <span className="text-faint">—</span>
          ) },
          { chave: "situacao", label: "Situação", render: (c) => (
            <span className="inline-flex items-center gap-[6px] text-caption text-muted">
              <span className="w-[7px] h-[7px] rounded-pill" style={{ background: contratoAtivo(c, hoje()) ? "var(--color-positive)" : "var(--color-placeholder)" }} />
              {contratoAtivo(c, hoje()) ? "Ativo" : "Encerrado"}
            </span>
          ) },
        ]}
        acoes={(c) => (
          <>
            <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(c)} />
            <AcaoLinha label="Excluir" icone="trash-2" perigo onClick={() => {
              if (!window.confirm(`Excluir o contrato "${c.objeto}"?`)) return;
              setItens(removerContrato(c.id));
              show("Contrato removido.");
            }} />
          </>
        )}
      />

      {editando && (
        <FormContrato
          inicial={editando}
          onClose={() => setEditando(null)}
          onSalvo={(c) => { setItens(salvarContrato(c)); setEditando(null); show("Contrato salvo."); }}
        />
      )}
      {node}
    </div>
  );
}

const vazio = (lado: "fornecedor" | "cliente"): Contrato => ({
  id: "", lado, parteId: "", parteNome: "", objeto: "", valor: 0,
  inicio: hoje(), fim: "", descricao: "",
  projetos: [{ id: "", percentual: 100 }],
  centros: [{ id: "", percentual: 100 }],
  anexoNome: "", criadoEm: hoje(), vendas: null,
});

/* ------------------------------- formulário ------------------------------- */

function FormContrato({
  inicial, onClose, onSalvo,
}: { inicial: Contrato; onClose: () => void; onSalvo: (c: Contrato) => void }) {
  const [c, setC] = React.useState<Contrato>({ ...inicial, id: inicial.id || novoIdRegistro() });
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [erroAnexo, setErroAnexo] = React.useState("");

  const { data: partes } = usePartiesList();
  const { data: produtos } = useProductsList();
  const { data: contas } = useAccounts();
  const projetos = React.useMemo(() => listProjetos(), []);
  const centros = React.useMemo(() => listCentrosCusto(), []);
  const cats = React.useMemo(() => listPlanoContas().filter((x) => x.natureza === "receita" && x.paiId), []);

  const elegiveis = React.useMemo(
    () => (partes ?? []).filter((p) => (c.lado === "cliente" ? p.is_customer : p.is_supplier)),
    [partes, c.lado],
  );

  const set = <K extends keyof Contrato>(k: K, v: Contrato[K]) => setC((s) => ({ ...s, [k]: v }));

  const salvar = () => {
    const e = validarContrato(c);
    setErros(e);
    if (Object.keys(e).length > 0) return;
    onSalvo(c);
  };

  const previstas = React.useMemo(() => (c.vendas ? vendasDoContrato(c) : []), [c]);

  return (
    <FormModal
      title={inicial.id ? "Editar contrato" : `Novo contrato de ${c.lado}`}
      size="large"
      onClose={onClose}
      onSave={salvar}
    >
      <Campo label={c.lado === "cliente" ? "Cliente" : "Fornecedor"} obrigatorio erro={erros.parteId}>
        <Select
          value={c.parteId}
          onChange={(v) => setC((s) => ({ ...s, parteId: v, parteNome: elegiveis.find((p) => p.id === v)?.name ?? "" }))}
          placeholder={`Selecione o ${c.lado}`}
          options={elegiveis.map((p) => ({ value: p.id, label: p.name }))}
        />
      </Campo>

      <Campo label="Objeto do contrato" obrigatorio erro={erros.objeto}>
        <Input value={c.objeto} onChange={(e) => set("objeto", e.target.value)} placeholder="Ex.: Assessoria contábil mensal" />
      </Campo>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo label="Valor do contrato" obrigatorio erro={erros.valor}>
          <CurrencyInput value={c.valor} onValueChange={(v) => set("valor", v)} />
        </Campo>
        <Campo label="Início da vigência" obrigatorio erro={erros.periodo}>
          <DateField value={c.inicio} onChange={(v) => set("inicio", v)} />
        </Campo>
        <Campo label="Fim da vigência" obrigatorio>
          <DateField value={c.fim} onChange={(v) => set("fim", v)} />
        </Campo>
      </div>

      <Campo
        label="Descrição"
        erro={erros.descricao}
        ajuda={`${c.descricao.length}/512 caracteres`}
      >
        <Textarea value={c.descricao} onChange={(e) => set("descricao", e.target.value.slice(0, 512))} rows={3} />
      </Campo>

      <Rateio
        titulo="Projetos"
        singular="projeto"
        vazioLabel="Selecione o projeto"
        opcoes={projetos.map((p) => ({ value: p.id, label: p.nome }))}
        linhas={c.projetos}
        erro={erros.projetos}
        onChange={(l) => set("projetos", l)}
      />
      <Rateio
        titulo="Centros de custo"
        singular="centro de custo"
        vazioLabel="Selecione o centro de custo"
        opcoes={centros.map((x) => ({ value: x.id, label: x.nome }))}
        linhas={c.centros}
        erro={erros.centros}
        onChange={(l) => set("centros", l)}
      />

      {/* Vendas recorrentes são EXCLUSIVAS do contrato de cliente — dizer isso
          na tela evita o operador procurar a chave no lugar errado. */}
      {c.lado === "fornecedor" ? (
        <div className="flex items-start gap-3 rounded-card bg-surface-2 p-4">
          <Icon name="info" size={16} color="var(--color-text-tertiary)" className="mt-[2px] shrink-0" />
          <p className="m-0 text-caption text-muted">
            A criação de vendas recorrentes é exclusiva dos contratos de Cliente. Para gerar vendas mês a mês
            a partir de um contrato, cadastre um contrato de Cliente.
          </p>
        </div>
      ) : (
        <BlocoVendas
          cfg={c.vendas}
          erros={erros}
          produtos={(produtos ?? []).map((p) => ({ value: p.id, label: p.name }))}
          contas={(contas?.accounts ?? []).map((a) => ({ value: a.id, label: a.name }))}
          categorias={cats.map((x) => ({ value: x.id, label: x.nome }))}
          previstas={previstas}
          onChange={(v) => set("vendas", v)}
        />
      )}

      <BlocoForm titulo="Anexo (opcional)">
        <p className="m-0 text-caption text-faint">Um único arquivo, até 5 MB.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="inline-flex items-center gap-2 rounded-pill bg-surface-2 px-4 py-[9px] text-label text-ink cursor-pointer hover:bg-surface-3 transition-colors">
            <Icon name="upload" size={15} color="currentColor" />
            {c.anexoNome || "Selecionar arquivo…"}
            <input
              type="file"
              className="hidden"
              onChange={(e) => {
                const arq = e.target.files?.[0];
                if (!arq) return;
                // O limite é checado ANTES de guardar: um arquivo grande demais
                // recusado depois do "salvar" perderia o resto do formulário.
                if (!anexoCabe(arq.size)) {
                  setErroAnexo(`O arquivo tem ${(arq.size / 1024 / 1024).toFixed(1)} MB — o limite é ${LIMITE_ANEXO / 1024 / 1024} MB.`);
                  return;
                }
                setErroAnexo("");
                set("anexoNome", arq.name);
              }}
            />
          </label>
          {c.anexoNome && (
            <button onClick={() => set("anexoNome", "")} className="text-caption text-muted hover:text-negative">
              Remover
            </button>
          )}
        </div>
        {erroAnexo && <span className="text-caption text-negative">{erroAnexo}</span>}
      </BlocoForm>
    </FormModal>
  );
}

/* --------------------------------- rateio --------------------------------- */

function Rateio({
  titulo, singular, vazioLabel, opcoes, linhas, erro, onChange,
}: {
  titulo: string; singular: string; vazioLabel: string;
  opcoes: { value: string; label: string }[];
  linhas: LinhaRateio[]; erro?: string;
  onChange: (l: LinhaRateio[]) => void;
}) {
  const soma = somaRateio(linhas);
  const ok = rateioValido(linhas);
  const vazio = linhas.every((l) => !l.id);

  return (
    <BlocoForm titulo={titulo}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-caption text-faint">A soma dos percentuais deve totalizar 100%.</span>
        {!vazio && (
          <span className={`text-caption font-medium tabular-nums ${ok ? "text-positive" : "text-negative"}`}>
            Soma: {soma.toFixed(2).replace(".", ",")}%
          </span>
        )}
      </div>
      {opcoes.length === 0 ? (
        <p className="m-0 text-caption text-faint">
          Nenhum {singular} cadastrado — cadastre em Cadastros para poder ratear.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {linhas.map((l, k) => (
            <div key={k} className="flex items-center gap-2">
              <Select
                value={l.id}
                onChange={(v) => onChange(linhas.map((x, i) => (i === k ? { ...x, id: v } : x)))}
                placeholder={vazioLabel}
                options={opcoes}
                containerClassName="flex-1 min-w-0"
              />
              <Input
                type="number"
                value={String(l.percentual)}
                onChange={(e) => onChange(linhas.map((x, i) => (i === k ? { ...x, percentual: Number(e.target.value) || 0 } : x)))}
                containerClassName="w-[110px]"
              />
              {linhas.length > 1 && (
                <button
                  onClick={() => onChange(linhas.filter((_, i) => i !== k))}
                  aria-label="Remover linha"
                  className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2"
                >
                  <Icon name="minus" size={15} color="currentColor" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => onChange([...linhas, { id: "", percentual: 0 }])}
            className="inline-flex items-center gap-1 self-start text-caption text-muted hover:text-ink"
          >
            <Icon name="plus" size={14} color="currentColor" />
            Adicionar
          </button>
        </div>
      )}
      {erro && <span className="text-caption text-negative">{erro}</span>}
    </BlocoForm>
  );
}

/* ------------------------------ vendas do contrato ------------------------------ */

function BlocoVendas({
  cfg, erros, produtos, contas, categorias, previstas, onChange,
}: {
  cfg: ConfigVendas | null;
  erros: Record<string, string>;
  produtos: { value: string; label: string }[];
  contas: { value: string; label: string }[];
  categorias: { value: string; label: string }[];
  previstas: { competencia: string; vencimento: string; valor: number }[];
  onChange: (v: ConfigVendas | null) => void;
}) {
  const padrao = (): ConfigVendas => ({
    produtoId: "", contaId: "", metodo: "Pix", categoria: "", valorMensal: 0,
    competencia: "dia_fixo", dataPrimeira: hoje(), vencimento: "mesmo_mes",
    diaVencimento: 10, emitirNF: false,
  });
  const set = <K extends keyof ConfigVendas>(k: K, v: ConfigVendas[K]) =>
    onChange({ ...(cfg ?? padrao()), [k]: v });

  return (
    <div className="rounded-card bg-surface-2 p-4 flex flex-col gap-4">
      <Switch
        checked={!!cfg}
        onChange={(v) => onChange(v ? padrao() : null)}
        label="Criar vendas associadas ao contrato"
      />
      <p className="m-0 text-caption text-muted">
        Gera uma venda por mês dentro da vigência do contrato, com conta a receber vinculada e,
        se configurado, NF com emissão agendada mês a mês.
      </p>

      {cfg && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Campo label="Produto/Serviço" obrigatorio erro={erros.vendaProduto}>
              <Select value={cfg.produtoId} onChange={(v) => set("produtoId", v)} placeholder="Selecione o produto" options={produtos} />
            </Campo>
            <Campo label="Conta bancária" obrigatorio erro={erros.vendaConta}>
              <Select value={cfg.contaId} onChange={(v) => set("contaId", v)} placeholder="Selecione a conta" options={contas} />
            </Campo>
            <Campo label="Método de pagamento">
              <Select value={cfg.metodo} onChange={(v) => set("metodo", v)} options={METODOS.map((m) => ({ value: m, label: m }))} />
            </Campo>
            <Campo label="Categoria" obrigatorio erro={erros.vendaCategoria}>
              <Select value={cfg.categoria} onChange={(v) => set("categoria", v)} placeholder="Selecione a categoria" options={categorias} />
            </Campo>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Campo label="Valor mensal" obrigatorio erro={erros.vendaValor}>
              <CurrencyInput value={cfg.valorMensal} onValueChange={(v) => set("valorMensal", v)} />
            </Campo>
            <Campo label="Competência">
              <Select
                value={cfg.competencia}
                onChange={(v) => set("competencia", v as ConfigVendas["competencia"])}
                options={[
                  { value: "dia_fixo", label: "Dia fixo a cada mês" },
                  { value: "mesma_data", label: "Mesma data para todas" },
                ]}
              />
            </Campo>
            <Campo label="Data de competência (1º pagamento)">
              <DateField value={cfg.dataPrimeira} onChange={(v) => set("dataPrimeira", v)} />
            </Campo>
            <Campo label="Opção de vencimento">
              <Select
                value={cfg.vencimento}
                onChange={(v) => set("vencimento", v as ConfigVendas["vencimento"])}
                options={[
                  { value: "mesmo_mes", label: "Vencimento no mesmo mês" },
                  { value: "mes_seguinte", label: "Vencimento no mês seguinte" },
                ]}
              />
            </Campo>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <Campo label="Dia do vencimento" obrigatorio erro={erros.vendaDia}>
              <Input
                type="number" min={1} max={31}
                value={String(cfg.diaVencimento)}
                onChange={(e) => set("diaVencimento", Number(e.target.value) || 0)}
              />
            </Campo>
            <Switch checked={cfg.emitirNF} onChange={(v) => set("emitirNF", v)} label="Emitir NF automaticamente" />
          </div>

          {/* A tabela do que SERÁ criado. Ninguém assina um recorrente sem ver
              as parcelas — e é aqui que um dia 31 em fevereiro se revela. */}
          <div>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-label font-medium text-ink">Vendas a criar</span>
              <span className="text-caption text-faint tabular-nums">
                {previstas.length} {previstas.length === 1 ? "venda" : "vendas"} ·{" "}
                {previstas.reduce((s, v) => s + v.valor, 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </span>
            </div>
            {previstas.length === 0 ? (
              <Card>
                <p className="m-0 py-4 text-center text-caption text-muted">
                  Informe a vigência e a data do primeiro pagamento para ver as vendas que serão criadas.
                </p>
              </Card>
            ) : (
              <Card padded={false} className="overflow-hidden max-h-[240px] overflow-y-auto">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b border-border-soft">
                      <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Competência</th>
                      <th className="px-4 py-2 text-left text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Vencimento</th>
                      <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previstas.map((v, k) => (
                      <tr key={k} className="border-b border-border-soft last:border-0">
                        <td className="px-4 py-2 text-caption text-muted tabular-nums">{fmtDia(v.competencia)}</td>
                        <td className="px-4 py-2 text-caption text-ink tabular-nums">{fmtDia(v.vencimento)}</td>
                        <td className="px-4 py-2 text-right text-caption text-ink tabular-nums"><BRL value={v.valor} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
