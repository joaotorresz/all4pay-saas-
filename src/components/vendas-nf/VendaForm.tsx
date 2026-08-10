"use client";

/**
 * Nova venda — o formulário em página cheia.
 *
 * A peça central é **Valores e taxas**: cinco pares de taxa + fornecedor
 * (plataforma, antecipação, streaming, coprodutor, afiliado) e o **valor
 * líquido calculado**. Num negócio digital é ali que o dinheiro some — a venda
 * de R$1.000 na plataforma vira R$700 na conta, e o dono só descobre no fim
 * do mês. Mostrar o líquido ao lado do bruto é o ponto da tela.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card, Button, Icon, Input, Textarea, Select, DateField, CurrencyInput, Checkbox, BRL,
} from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useAccounts } from "@/components/visao-geral/hooks";
import { usePartiesList, useProductsList } from "@/components/lancamentos/hooks";
import { listPlanoContas } from "@/lib/registros";
import { listProjetos, listCentrosCusto } from "@/lib/iuli-cadastros";
import { rateioValido, somaRateio, type LinhaRateio } from "@/core/registros";
import {
  validarVenda, valorLiquido, somaDasTaxas, totalDosItens,
  STATUS_VENDA, METODOS_PAGAMENTO, PLATAFORMAS, STATUS_NF,
  type Venda, type ItemVenda, type StatusVenda, type MetodoPagamento, type StatusNF,
} from "@/core/vendas";
import { listarVendas, salvarVenda, proximoNumero, novoId } from "@/lib/vendas-store";
import { pctDeInteiro } from "@/lib/format";

const hoje = () => new Date().toISOString().slice(0, 10);
const semTaxa = () => ({ valor: 0, fornecedorId: "" });

const vazia = (): Venda => ({
  id: "", numero: "", clienteId: "", clienteNome: "",
  competencia: hoje(), vencimento: hoje(),
  itens: [{ produtoId: "", nome: "", quantidade: 1, precoUnitario: 0 }],
  valorTotal: 0, valorTotalComJuros: 0,
  taxaPlataforma: semTaxa(), taxaAntecipacao: semTaxa(), taxaStreaming: semTaxa(),
  comissaoCoprodutor: semTaxa(), comissaoAfiliado: semTaxa(),
  contaId: "", operacao: "venda", status: "iniciada", metodo: "pix",
  idExterno: "", categoria: "", tipoPagamento: "avista", plataforma: "", chaveTransacao: "",
  pago: false, valorPago: 0, dataPagamento: null,
  projetos: [], centros: [],
  descricao: "", textoDocumentoFiscal: "", observacoes: "",
  statusNF: "a_emitir", numeroNF: "", criadoEm: hoje(),
});

const TAXAS: { chave: keyof Pick<Venda, "taxaPlataforma" | "taxaAntecipacao" | "taxaStreaming" | "comissaoCoprodutor" | "comissaoAfiliado">; label: string }[] = [
  { chave: "taxaPlataforma", label: "Taxa plataforma" },
  { chave: "taxaAntecipacao", label: "Taxa antecipação" },
  { chave: "taxaStreaming", label: "Taxa streaming" },
  { chave: "comissaoCoprodutor", label: "Comissão de coprodutor" },
  { chave: "comissaoAfiliado", label: "Comissão de vendedor/afiliado" },
];

export function VendaForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const qc = useQueryClient();
  const { show, node } = useToast();
  const { data: contas } = useAccounts();
  const { data: partes } = usePartiesList();
  const { data: produtos } = useProductsList();

  const [v, setV] = React.useState<Venda>(vazia);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [salvando, setSalvando] = React.useState(false);

  // Editar: carrega a venda existente (o id vem na query).
  React.useEffect(() => {
    const id = sp.get("id");
    if (!id) { setV((s) => ({ ...s, id: novoId("vd"), numero: proximoNumero() })); return; }
    const achada = listarVendas().find((x) => x.id === id);
    if (achada) setV(achada);
  }, [sp]);

  const set = <K extends keyof Venda>(k: K, val: Venda[K]) => setV((s) => ({ ...s, [k]: val }));

  const clientes = React.useMemo(() => (partes ?? []).filter((p) => p.is_customer), [partes]);
  const fornecedores = React.useMemo(() => (partes ?? []).filter((p) => p.is_supplier), [partes]);
  const categorias = React.useMemo(
    () => listPlanoContas().filter((c) => c.natureza === "receita" && c.paiId),
    [],
  );
  const cadProjetos = React.useMemo(() => listProjetos(), []);
  const cadCentros = React.useMemo(() => listCentrosCusto(), []);

  const cliente = clientes.find((c) => c.id === v.clienteId);
  const totalItens = totalDosItens(v.itens);
  const liquido = valorLiquido(v);
  const taxas = somaDasTaxas(v);

  /** O total dos itens sugere o valor total — mas não sobrescreve o digitado. */
  React.useEffect(() => {
    if (totalItens > 0 && v.valorTotal === 0) setV((s) => ({ ...s, valorTotal: totalItens }));
  }, [totalItens, v.valorTotal]);

  const setItem = (i: number, patch: Partial<ItemVenda>) =>
    setV((s) => ({ ...s, itens: s.itens.map((x, k) => (k === i ? { ...x, ...patch } : x)) }));

  const salvar = () => {
    const e = validarVenda(v);
    if (!rateioValido(v.projetos)) e.projetos = "O rateio por projeto precisa somar 100%.";
    if (!rateioValido(v.centros)) e.centros = "O rateio por centro de custo precisa somar 100%.";
    setErros(e);
    if (Object.keys(e).length > 0) { show("Revise os campos obrigatórios."); return; }
    setSalvando(true);
    try {
      salvarVenda({ ...v, clienteNome: cliente?.name ?? v.clienteNome });
      qc.invalidateQueries();
      show("Venda salva.");
      router.push("/dashboard/sales-invoices");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <button onClick={() => router.back()} className="inline-flex items-center gap-1 self-start text-caption text-muted hover:text-ink">
        <Icon name="chevron-left" size={14} color="currentColor" />
        Cancelar
      </button>

      {/* ------------------------------ cliente ------------------------------ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Bloco titulo="DADOS DO CLIENTE">
          <Campo label="Cliente" obrigatorio erro={erros.clienteId}>
            <Select
              value={v.clienteId}
              onChange={(id) => setV((s) => ({ ...s, clienteId: id, clienteNome: clientes.find((c) => c.id === id)?.name ?? "" }))}
              placeholder="Selecione o cliente"
              options={clientes.map((c) => ({ value: c.id, label: c.name }))}
            />
          </Campo>
          {/* E-mail e telefone vêm do cadastro: quem lança a venda não deve
              redigitar o que já existe, nem manter duas versões do dado. */}
          {cliente && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Somente label="E-mail" valor={cliente.email || "—"} />
              <Somente label="Telefone" valor={cliente.phone || "—"} />
            </div>
          )}
        </Bloco>

        <Bloco titulo="DATAS">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Data de competência" obrigatorio erro={erros.competencia}>
              <DateField value={v.competencia} onChange={(x) => set("competencia", x)} />
            </Campo>
            <Campo label="Data de vencimento" obrigatorio erro={erros.vencimento}>
              <DateField value={v.vencimento} onChange={(x) => set("vencimento", x)} />
            </Campo>
          </div>
        </Bloco>
      </div>

      {/* ------------------------------ produtos ------------------------------ */}
      <Card>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] font-medium tracking-[0.08em] text-faint">PRODUTOS</span>
          {totalItens > 0 && (
            <span className="text-caption text-muted tabular-nums">
              Soma dos itens: <b className="text-ink"><BRL value={totalItens} /></b>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3 mt-3">
          {v.itens.map((it, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_120px_190px_auto] gap-4 items-end">
              <Campo label={i === 0 ? "Produto" : ""} obrigatorio={i === 0}>
                <Select
                  value={it.produtoId}
                  onChange={(id) => setItem(i, {
                    produtoId: id,
                    nome: (produtos ?? []).find((p) => p.id === id)?.name ?? "",
                    precoUnitario: it.precoUnitario || ((produtos ?? []).find((p) => p.id === id)?.sale_price ?? 0),
                  })}
                  placeholder="Selecione o produto"
                  options={(produtos ?? []).map((p) => ({ value: p.id, label: p.name }))}
                />
              </Campo>
              <Campo label={i === 0 ? "Quantidade" : ""} obrigatorio={i === 0}>
                <Input type="number" min={1} value={String(it.quantidade)}
                  onChange={(e) => setItem(i, { quantidade: Number(e.target.value) || 0 })} />
              </Campo>
              <Campo label={i === 0 ? "Preço unitário" : ""} obrigatorio={i === 0}>
                <CurrencyInput value={it.precoUnitario} onValueChange={(x) => setItem(i, { precoUnitario: x })} />
              </Campo>
              <button
                onClick={() => setV((s) => ({ ...s, itens: s.itens.filter((_, k) => k !== i) }))}
                disabled={v.itens.length === 1}
                aria-label="Remover produto"
                className="p-[10px] rounded-md text-muted hover:text-negative hover:bg-surface-2 disabled:opacity-30"
              >
                <Icon name="trash-2" size={15} color="currentColor" />
              </button>
            </div>
          ))}
        </div>
        {erros.itens && <span className="mt-2 text-caption text-negative">{erros.itens}</span>}
        <Button
          variant="ghost" className="mt-3"
          onClick={() => setV((s) => ({ ...s, itens: [...s.itens, { produtoId: "", nome: "", quantidade: 1, precoUnitario: 0 }] }))}
        >
          <Icon name="plus" size={15} color="currentColor" />
          Adicionar produto
        </Button>
      </Card>

      {/* --------------------------- valores e taxas --------------------------- */}
      <Card>
        <span className="text-[11px] font-medium tracking-[0.08em] text-faint">VALORES E TAXAS</span>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] gap-6 mt-3">
          <div className="flex flex-col gap-4">
            <span className="text-h3 font-semibold text-ink">Valor recebido</span>
            <Campo label="Valor total" obrigatorio erro={erros.valorTotal}>
              <CurrencyInput value={v.valorTotal} onValueChange={(x) => set("valorTotal", x)} />
            </Campo>
            <Campo label="Valor total com juros" ajuda="Quando o cliente pagou parcelado com acréscimo.">
              <CurrencyInput value={v.valorTotalComJuros} onValueChange={(x) => set("valorTotalComJuros", x)} />
            </Campo>

            {/* O líquido é o número que interessa — e por isso fica ao lado,
                não escondido no fim da tela. */}
            <div className="rounded-card bg-surface-2 p-4 flex flex-col gap-1">
              <span className="text-caption text-muted">Valor líquido</span>
              <span className={`text-[24px] leading-none font-semibold tabular-nums ${liquido < 0 ? "text-negative" : "text-ink"}`}>
                <BRL value={liquido} />
              </span>
              <span className="text-caption text-faint tabular-nums">
                {(v.valorTotalComJuros || v.valorTotal) > 0
                  ? `${pctDeInteiro(((liquido / (v.valorTotalComJuros || v.valorTotal)) * 100))} do bruto · taxas ${taxas.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                  : "Informe o valor total para ver o líquido."}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <span className="text-h3 font-semibold text-ink">Taxas e fornecedores</span>
            {TAXAS.map((t) => (
              <div key={t.chave} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Campo label={t.label}>
                  <CurrencyInput
                    value={v[t.chave].valor}
                    onValueChange={(x) => set(t.chave, { ...v[t.chave], valor: x })}
                  />
                </Campo>
                <Campo label="Fornecedor">
                  <Select
                    value={v[t.chave].fornecedorId}
                    onChange={(id) => set(t.chave, { ...v[t.chave], fornecedorId: id })}
                    placeholder="Selecione um fornecedor"
                    options={fornecedores.map((f) => ({ value: f.id, label: f.name }))}
                    disabled={fornecedores.length === 0}
                  />
                </Campo>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* ---------------------------- dados gerais ---------------------------- */}
      <Card>
        <span className="text-[11px] font-medium tracking-[0.08em] text-faint">DADOS GERAIS</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
          <Campo label="Conta bancária" obrigatorio erro={erros.contaId}>
            <Select value={v.contaId} onChange={(x) => set("contaId", x)} placeholder="Selecione a conta"
              options={(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))} />
          </Campo>
          <Campo label="Operação">
            <Select value={v.operacao} onChange={(x) => set("operacao", x as Venda["operacao"])}
              options={[{ value: "venda", label: "Venda" }, { value: "remessa", label: "Remessa" }]} />
          </Campo>
          <Campo label="Status">
            <Select value={v.status} onChange={(x) => set("status", x as StatusVenda)}
              options={STATUS_VENDA.map((s) => ({ value: s.id, label: s.label }))} />
          </Campo>
          <Campo label="Método de pagamento">
            <Select value={v.metodo} onChange={(x) => set("metodo", x as MetodoPagamento)}
              options={METODOS_PAGAMENTO.map((m) => ({ value: m.id, label: m.label }))} />
          </Campo>
          <Campo label="ID externo" ajuda="O identificador da venda na plataforma de origem.">
            <Input value={v.idExterno} onChange={(e) => set("idExterno", e.target.value)} />
          </Campo>
          <Campo label="Categoria da conta a receber" obrigatorio erro={erros.categoria}>
            <Select value={v.categoria} onChange={(x) => set("categoria", x)} placeholder="Selecione a categoria"
              options={categorias.map((c) => ({ value: c.id, label: c.nome }))} />
          </Campo>
          <Campo label="Tipo de pagamento">
            <Select value={v.tipoPagamento} onChange={(x) => set("tipoPagamento", x as Venda["tipoPagamento"])}
              options={[{ value: "avista", label: "À vista" }, { value: "parcelado", label: "Parcelado" }]} />
          </Campo>
          <Campo label="Plataforma de pagamento">
            <Select value={v.plataforma} onChange={(x) => set("plataforma", x)} placeholder="Selecione"
              options={PLATAFORMAS.map((p) => ({ value: p, label: p }))} />
          </Campo>
          <Campo label="Chave da transação">
            <Input value={v.chaveTransacao} onChange={(e) => set("chaveTransacao", e.target.value)} />
          </Campo>
        </div>
      </Card>

      {/* ------------------------- recebimento e nota ------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Card>
          <span className="text-[11px] font-medium tracking-[0.08em] text-faint">RECEBIMENTO</span>
          <div className="mt-3">
            <Checkbox checked={v.pago} onChange={(e) => setV((s) => ({
              ...s, pago: e.target.checked,
              // Marcar como pago pré-preenche valor e data — é o caso comum.
              valorPago: e.target.checked && !s.valorPago ? (s.valorTotalComJuros || s.valorTotal) : s.valorPago,
              dataPagamento: e.target.checked && !s.dataPagamento ? hoje() : s.dataPagamento,
            }))} label="Pago?" />
          </div>
          {v.pago && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-4 border-t border-border-soft">
              <Campo label="Valor pago" obrigatorio erro={erros.valorPago}>
                <CurrencyInput value={v.valorPago} onValueChange={(x) => set("valorPago", x)} />
              </Campo>
              <Campo label="Data do pagamento" obrigatorio erro={erros.dataPagamento}>
                <DateField value={v.dataPagamento ?? hoje()} onChange={(x) => set("dataPagamento", x)} />
              </Campo>
            </div>
          )}
        </Card>

        <Card>
          <span className="text-[11px] font-medium tracking-[0.08em] text-faint">NOTA FISCAL</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <Campo label="Status da NF">
              <Select value={v.statusNF} onChange={(x) => set("statusNF", x as StatusNF)}
                options={STATUS_NF.map((s) => ({ value: s.id, label: s.label }))} />
            </Campo>
            <Campo label="Número da NF">
              <Input value={v.numeroNF} onChange={(e) => set("numeroNF", e.target.value)} />
            </Campo>
          </div>
        </Card>
      </div>

      {/* --------------------- projeto e centro de custo --------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Rateio titulo="Projetos" singular="projeto"
          opcoes={cadProjetos.map((p) => ({ value: p.id, label: p.nome }))}
          linhas={v.projetos} onChange={(l) => set("projetos", l)} erro={erros.projetos} />
        <Rateio titulo="Centros de custo" singular="centro de custo"
          opcoes={cadCentros.map((c) => ({ value: c.id, label: c.nome }))}
          linhas={v.centros} onChange={(l) => set("centros", l)} erro={erros.centros} />
      </div>

      {/* -------------------------- campos de texto -------------------------- */}
      <Card>
        <span className="text-[11px] font-medium tracking-[0.08em] text-faint">CAMPOS DE TEXTO</span>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-3">
          <Campo label="Descrição">
            <Textarea value={v.descricao} onChange={(e) => set("descricao", e.target.value)} rows={3} />
          </Campo>
          <Campo label="Texto do documento fiscal" ajuda="Sai na descrição da nota.">
            <Textarea value={v.textoDocumentoFiscal} onChange={(e) => set("textoDocumentoFiscal", e.target.value)} rows={3} />
          </Campo>
          <Campo label="Observações">
            <Textarea value={v.observacoes} onChange={(e) => set("observacoes", e.target.value)} rows={3} />
          </Campo>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button variant="primary" disabled={salvando} onClick={salvar}>
          <Icon name="check" size={15} color="currentColor" />
          {salvando ? "Salvando…" : "Salvar venda"}
        </Button>
      </div>
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="h-full">
      <span className="text-[11px] font-medium tracking-[0.08em] text-faint">{titulo}</span>
      <div className="flex flex-col gap-4 mt-3">{children}</div>
    </Card>
  );
}

function Campo({
  label, obrigatorio, erro, ajuda, children,
}: { label: string; obrigatorio?: boolean; erro?: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      {label && (
        <label className="text-caption font-medium text-muted">
          {label}
          {obrigatorio && (
            <span className="ml-2 rounded-pill bg-surface-3 text-[10px] text-muted px-[6px] py-[1px] align-middle">
              Obrigatório
            </span>
          )}
        </label>
      )}
      {children}
      {erro ? <span className="text-caption text-negative">{erro}</span>
        : ajuda ? <span className="text-caption text-faint">{ajuda}</span> : null}
    </div>
  );
}

function Somente({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      <div className="rounded-md bg-surface-2 px-3 py-[10px] text-label text-ink truncate">{valor}</div>
    </div>
  );
}

function Rateio({
  titulo, singular, opcoes, linhas, onChange, erro,
}: {
  titulo: string; singular: string;
  opcoes: { value: string; label: string }[];
  linhas: LinhaRateio[];
  onChange: (l: LinhaRateio[]) => void;
  erro?: string;
}) {
  const soma = somaRateio(linhas);
  const ok = rateioValido(linhas);
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <span className="text-h3 font-semibold text-ink">{titulo}</span>
        <div className="flex items-center gap-3">
          {linhas.some((l) => l.id) && (
            <span className={`text-caption font-medium tabular-nums ${ok ? "text-positive" : "text-negative"}`}>
              {soma.toFixed(2).replace(".", ",")}%
            </span>
          )}
          <Button variant="ghost" disabled={opcoes.length === 0}
            onClick={() => onChange([...linhas, { id: "", percentual: linhas.length === 0 ? 100 : 0 }])}>
            <Icon name="plus" size={14} color="currentColor" />
            Adicionar
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {opcoes.length === 0 ? (
          <span className="text-caption text-faint">Nenhum {singular} cadastrado.</span>
        ) : linhas.length === 0 ? (
          <span className="text-caption text-faint">Nenhuma alocação cadastrada.</span>
        ) : linhas.map((l, k) => (
          <div key={k} className="flex items-center gap-2">
            <Select value={l.id} onChange={(x) => onChange(linhas.map((y, i) => (i === k ? { ...y, id: x } : y)))}
              placeholder={`Selecione o ${singular}`} options={opcoes} containerClassName="flex-1 min-w-0" />
            <Input type="number" value={String(l.percentual)} containerClassName="w-[100px]"
              onChange={(e) => onChange(linhas.map((y, i) => (i === k ? { ...y, percentual: Number(e.target.value) || 0 } : y)))} />
            <button onClick={() => onChange(linhas.filter((_, i) => i !== k))} aria-label="Remover"
              className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2">
              <Icon name="minus" size={15} color="currentColor" />
            </button>
          </div>
        ))}
      </div>
      {erro && <span className="mt-2 text-caption text-negative">{erro}</span>}
    </Card>
  );
}
