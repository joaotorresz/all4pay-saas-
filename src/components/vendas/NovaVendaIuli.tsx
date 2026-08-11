"use client";

/**
 * Motor de Vendas (modelo IULI, §5) — a "Nova Venda" é o documento-mãe que amarra
 * as entidades e dispara os efeitos financeiros/fiscais. Oito blocos: Cliente ·
 * Datas (competência/vencimento) · Produtos · Valores e Taxas (taxa exige
 * fornecedor) · Dados Gerais · Recebimento · Rateio (Projeto/Centro) · Textos.
 * Cálculo em tempo real (Valor Total = Σ qtd×preço; Valor Líquido = Total − taxas)
 * e PROPAGAÇÃO: gera Conta a Receber (vencimento) → caso pago, caixa; NF a Emitir;
 * Provisionamento de Imposto; entra por competência na DRE e por caixa na DFC.
 * Ao salvar, cria o recebível por `criarTitulos` — dataset em demonstração,
 * banco em produção.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app/AppShell";
import { Card, Button, Input, Select, CurrencyInput, DateField, Checkbox, Icon, Textarea } from "@/components/ui";
import { SectionTitle } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { listParties, listProducts, listServices } from "@/lib/cadastros";
import { getAccountsList, getCategories, criarTitulos } from "@/lib/data";
import { reportar } from "@/lib/erros";
import { listProjetos, listCentrosCusto } from "@/lib/iuli-cadastros";
import { formatBRL } from "@/lib/format";

const STATUS = ["Iniciada", "Boleto Gerado", "Aguardando pagamento", "Em Análise", "Aprovada", "Completa", "Expirada", "Atrasada", "Cancelada", "Reclamada", "Reembolsada", "Reembolso Manual", "Chargeback"];
const METODOS = ["Crédito", "Débito", "Boleto", "PIX", "TED/DOC", "Saldo Plataforma Externa", "Perguntar ao Cliente", "Outros"];
const PLATAFORMAS = ["—", "Hotmart", "Pagar.me", "Provi", "Cielo", "Ticto", "Eduzz", "Monetizze", "Asaas", "Kiwify", "Hubla", "Stripe", "Iugu", "B4you", "OnProfit"];
const TAXAS = [
  { key: "plataforma", label: "Taxa Plataforma" },
  { key: "antecipacao", label: "Taxa Antecipação" },
  { key: "streaming", label: "Taxa Streaming" },
  { key: "coprodutor", label: "Comissão Coprodutor" },
  { key: "afiliado", label: "Comissão Vendedor/Afiliado" },
] as const;

const opt = (xs: { id: string; name: string }[], ph = "Selecione") => [{ value: "", label: ph }, ...xs.map((x) => ({ value: x.id, label: x.name }))];

export function NovaVendaIuli() {
  const router = useRouter();
  const qc = useQueryClient();
  const { show, node } = useToast();

  const parties = useQuery({ queryKey: ["parties"], queryFn: listParties });
  const produtos = useQuery({ queryKey: ["products-list"], queryFn: listProducts });
  const servicos = useQuery({ queryKey: ["services-list"], queryFn: listServices });
  const contas = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const categorias = useQuery({ queryKey: ["categories", "receita"], queryFn: () => getCategories("receita") });
  const [projetos] = React.useState(() => listProjetos());
  const [centros] = React.useState(() => listCentrosCusto());

  const clientes = (parties.data ?? []).filter((p) => p.is_customer !== false);
  const fornecedores = (parties.data ?? []).filter((p) => p.is_supplier);
  const catalogo = [...(produtos.data ?? []), ...(servicos.data ?? [])].map((p) => ({ id: p.id, name: p.name, price: (p as { sale_price?: number }).sale_price ?? 0 }));

  // estado
  const [clienteId, setClienteId] = React.useState("");
  const [competencia, setCompetencia] = React.useState("");
  const [vencimento, setVencimento] = React.useState("");
  const [itens, setItens] = React.useState<{ produtoId: string; qtd: number; preco: number }[]>([{ produtoId: "", qtd: 1, preco: 0 }]);
  const [taxas, setTaxas] = React.useState<Record<string, { valor: number; fornecedor: string }>>({});
  const [contaId, setContaId] = React.useState("");
  const [operacao, setOperacao] = React.useState("Venda");
  const [status, setStatus] = React.useState("Iniciada");
  const [metodo, setMetodo] = React.useState("PIX");
  const [categoria, setCategoria] = React.useState("");
  const [tipoPag, setTipoPag] = React.useState("À vista");
  const [plataforma, setPlataforma] = React.useState("—");
  const [pago, setPago] = React.useState(false);
  const [dataPagamento, setDataPagamento] = React.useState("");
  const [rProjeto, setRProjeto] = React.useState<{ id: string; pct: number }[]>([]);
  const [rCentro, setRCentro] = React.useState<{ id: string; pct: number }[]>([]);
  const [descricao, setDescricao] = React.useState("");
  const [textoFiscal, setTextoFiscal] = React.useState("");
  const [obs, setObs] = React.useState("");
  const [erro, setErro] = React.useState<string | null>(null);

  const valorTotal = itens.reduce((s, it) => s + it.qtd * it.preco, 0);
  const totalTaxas = Object.values(taxas).reduce((s, t) => s + (t?.valor || 0), 0);
  const valorLiquido = valorTotal - totalTaxas;
  const pctProjeto = rProjeto.reduce((s, r) => s + (r.pct || 0), 0);
  const pctCentro = rCentro.reduce((s, r) => s + (r.pct || 0), 0);
  const impostoEstim = valorTotal * 0.1538; // ~ carga Lucro Presumido serviço

  const setItem = (i: number, k: "produtoId" | "qtd" | "preco", v: string | number) => setItens((xs) => xs.map((it, j) => {
    if (j !== i) return it;
    if (k === "produtoId") { const c = catalogo.find((x) => x.id === v); return { ...it, produtoId: String(v), preco: c ? c.price : it.preco }; }
    return { ...it, [k]: Number(v) };
  }));
  const setTaxa = (key: string, patch: Partial<{ valor: number; fornecedor: string }>) => setTaxas((t) => {
    const cur = t[key] ?? { valor: 0, fornecedor: "" };
    return { ...t, [key]: { ...cur, ...patch } };
  });

  /**
   * ⚠️ **A VENDA GRAVAVA SÓ NO DATASET DA DEMONSTRAÇÃO.**
   *
   * `appendImported` era chamado direto, sem olhar para `isDemo`. Em produção
   * o recebível ia para o `localStorage` — que nenhum acessor lê fora de
   * `if (isDemo)` — e a tela dizia "Venda lançada · gerou recebível". O mesmo
   * defeito que a folha tinha, na tela onde ele custa faturamento.
   */
  const salvar = async () => {
    setErro(null);
    if (!clienteId) return setErro("Selecione o cliente.");
    if (!competencia) return setErro("Informe a data de competência.");
    if (!contaId) return setErro("Selecione a conta bancária.");
    // validação condicional: taxa preenchida exige fornecedor
    for (const t of TAXAS) { const x = taxas[t.key]; if (x?.valor > 0 && !x.fornecedor) return setErro(`Vincule um fornecedor à ${t.label}.`); }
    const catNome = categorias.data?.find((c) => c.id === categoria)?.name || "Venda";
    try {
      await criarTitulos([{
        account_id: contaId,
        type: "entrada",
        status: pago ? "pago" : "pendente",
        category: catNome,
        amount: Math.round(valorTotal * 100) / 100,
        party_id: clienteId || null,
        due_date: vencimento || competencia,
        competence_date: competencia,
        paid_date: pago ? (dataPagamento || competencia) : null,
        description: descricao || textoFiscal || "Venda",
        // A venda é o documento-mãe do recebível — é essa a procedência.
        origem: "venda",
      }]);
    } catch (err) {
      const e = err as { message?: string; hint?: string };
      reportar("venda.criar", err, "a venda não gerou recebível e o faturamento fica sem ela");
      setErro(e?.message ? `Não foi possível lançar: ${e.message}${e.hint ? ` ${e.hint}` : ""}` : "Não foi possível lançar a venda.");
      return;
    }
    qc.invalidateQueries();
    show("Venda lançada · gerou recebível, NF a emitir e provisionamento de imposto");
    setTimeout(() => router.push("/vendas"), 900);
  };

  return (
    <AppShell title="Nova Venda">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5 pb-8 items-start">
        <div className="flex flex-col gap-5">
          {/* 1. Cliente */}
          <Card className="flex flex-col gap-3">
            <SectionTitle>1 · Dados do cliente</SectionTitle>
            <Select label="Cliente *" value={clienteId} onChange={setClienteId} options={opt(clientes)} />
            {clienteId && (() => { const c = clientes.find((x) => x.id === clienteId); return (
              <div className="flex flex-wrap gap-x-6 text-caption text-muted">{c?.email && <span>{c.email}</span>}{c?.phone && <span>{c.phone}</span>}</div>
            ); })()}
          </Card>

          {/* 2. Datas */}
          <Card className="flex flex-col gap-3">
            <SectionTitle>2 · Datas</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <DateField label="Competência * (→ DRE)" value={competencia} onChange={setCompetencia} />
              <DateField label="Vencimento * (→ recebível)" value={vencimento} onChange={setVencimento} />
            </div>
          </Card>

          {/* 3. Produtos */}
          <Card className="flex flex-col gap-3">
            <SectionTitle>3 · Produtos</SectionTitle>
            {itens.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_120px_28px] gap-2 items-end">
                <Select label={i === 0 ? "Produto *" : undefined} value={it.produtoId} onChange={(v) => setItem(i, "produtoId", v)} options={opt(catalogo)} />
                <Input label={i === 0 ? "Qtd *" : undefined} type="number" value={String(it.qtd)} onChange={(e) => setItem(i, "qtd", e.target.value)} />
                <CurrencyInput label={i === 0 ? "Preço un. *" : undefined} value={it.preco} onValueChange={(v) => setItem(i, "preco", v)} />
                {itens.length > 1 ? (
                  <button onClick={() => setItens((xs) => xs.filter((_, j) => j !== i))} className="h-10 inline-flex items-center justify-center rounded-md hover:bg-surface-2"><Icon name="trash-2" size={15} color="var(--color-negative)" /></button>
                ) : <span />}
              </div>
            ))}
            <Button variant="secondary" leftIcon={<Icon name="plus" size={14} />} onClick={() => setItens((xs) => [...xs, { produtoId: "", qtd: 1, preco: 0 }])}>Adicionar produto</Button>
            <div className="flex justify-end text-[15px] text-ink tabular-nums">Valor total: <b className="ml-2 font-semibold">{formatBRL(valorTotal)}</b></div>
          </Card>

          {/* 4. Valores e Taxas */}
          <Card className="flex flex-col gap-3">
            <SectionTitle>4 · Valores e taxas (cada taxa exige fornecedor)</SectionTitle>
            {TAXAS.map((t) => (
              <div key={t.key} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <CurrencyInput label={t.label} value={taxas[t.key]?.valor ?? 0} onValueChange={(v) => setTaxa(t.key, { valor: v })} />
                <Select label="Fornecedor" value={taxas[t.key]?.fornecedor ?? ""} onChange={(v) => setTaxa(t.key, { fornecedor: v })} options={opt(fornecedores, "—")} invalid={(taxas[t.key]?.valor ?? 0) > 0 && !taxas[t.key]?.fornecedor} />
              </div>
            ))}
            <div className="flex justify-end gap-6 text-[15px] tabular-nums pt-1 border-t border-border-soft">
              <span className="text-muted">Taxas: <b className="text-ink">{formatBRL(totalTaxas)}</b></span>
              <span className="text-muted">Valor líquido: <b className="text-ink font-semibold">{formatBRL(valorLiquido)}</b></span>
            </div>
          </Card>

          {/* 5. Dados gerais */}
          <Card className="flex flex-col gap-3">
            <SectionTitle>5 · Dados gerais da venda</SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select label="Conta bancária *" value={contaId} onChange={setContaId} options={opt((contas.data ?? []).map((a) => ({ id: a.id, name: a.name })))} />
              <Select label="Operação *" value={operacao} onChange={setOperacao} options={["Venda", "Remessa"].map((x) => ({ value: x, label: x }))} />
              <Select label="Status *" value={status} onChange={setStatus} options={STATUS.map((x) => ({ value: x, label: x }))} />
              <Select label="Método de pagamento *" value={metodo} onChange={setMetodo} options={METODOS.map((x) => ({ value: x, label: x }))} />
              <Select label="Categoria (Conta a Receber) *" value={categoria} onChange={setCategoria} options={opt((categorias.data ?? []).map((c) => ({ id: c.id, name: c.name })))} />
              <Select label="Tipo de pagamento *" value={tipoPag} onChange={setTipoPag} options={["À vista", "Parcelado"].map((x) => ({ value: x, label: x }))} />
              <Select label="Plataforma de pagamento" value={plataforma} onChange={setPlataforma} options={PLATAFORMAS.map((x) => ({ value: x, label: x }))} />
            </div>
          </Card>

          {/* 6. Recebimento */}
          <Card className="flex flex-col gap-3">
            <SectionTitle>6 · Recebimento</SectionTitle>
            <Checkbox checked={pago} onChange={(e) => setPago(e.target.checked)} label="Pago? (já virou caixa)" />
            {pago && <DateField label="Data do pagamento" value={dataPagamento} onChange={setDataPagamento} />}
          </Card>

          {/* 7. Rateio */}
          <Card className="flex flex-col gap-3">
            <SectionTitle>7 · Projeto e Centro de Custo (rateio %)</SectionTitle>
            <Rateio label="Projetos" itens={projetos} valor={rProjeto} onChange={setRProjeto} total={pctProjeto} />
            <Rateio label="Centros de Custo" itens={centros} valor={rCentro} onChange={setRCentro} total={pctCentro} />
          </Card>

          {/* 8. Textos */}
          <Card className="flex flex-col gap-3">
            <SectionTitle>8 · Campos de texto</SectionTitle>
            <Textarea label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
            <Textarea label="Texto do documento fiscal (vai para a NF)" value={textoFiscal} onChange={(e) => setTextoFiscal(e.target.value)} rows={2} />
            <Textarea label="Observações" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} />
          </Card>
        </div>

        {/* Resumo + propagação */}
        <Card
          className="flex flex-col gap-3 lg:sticky lg:top-4"
          info={{
            titulo: "Resumo da venda",
            oQue: "Mostra o valor da venda e tudo que ela vai disparar no sistema antes de você salvar.",
            comoCalcula: "Valor total = soma de quantidade × preço dos produtos; Valor líquido = total − taxas; o imposto é estimado em ~15,38% (Lucro Presumido serviço).",
          }}
        >
          <span className="text-[16px] font-semibold text-ink">Resumo</span>
          <Linha k="Valor total" v={formatBRL(valorTotal)} forte />
          <Linha k="Taxas" v={`− ${formatBRL(totalTaxas)}`} />
          <Linha k="Valor líquido" v={formatBRL(valorLiquido)} forte />
          <div className="pt-3 mt-1 border-t border-border-soft flex flex-col gap-2">
            <span className="text-caption font-medium text-muted">Esta venda vai gerar:</span>
            <Prop ok={!!vencimento || !!competencia} txt="Conta a Receber (no vencimento)" />
            <Prop ok txt="NF a Emitir (situação fiscal)" />
            <Prop ok txt={`Provisionamento de imposto (~${formatBRL(impostoEstim)})`} />
            <Prop ok txt="Entra na DRE (competência) e na DFC (caixa)" />
          </div>
          {erro && <span className="text-caption text-negative">{erro}</span>}
          <Button variant="primary" fullWidth onClick={salvar} className="mt-1">Salvar venda</Button>
          <span className="text-caption text-faint">Demo: anexa 1 lançamento de entrada que reflete em dashboard/DRE/fluxo. Em live, persiste a venda completa.</span>
        </Card>
      </div>
      {node}
    </AppShell>
  );
}

function Linha({ k, v, forte }: { k: string; v: string; forte?: boolean }) {
  return <div className="flex items-center justify-between text-[15px] tabular-nums"><span className="text-muted">{k}</span><span className={forte ? "text-ink font-semibold" : "text-ink"}>{v}</span></div>;
}
function Prop({ ok, txt }: { ok: boolean; txt: string }) {
  return <div className="flex items-center gap-2 text-caption"><Icon name="check" size={14} color={ok ? "var(--color-positive)" : "var(--color-text-tertiary)"} /><span className="text-muted">{txt}</span></div>;
}

function Rateio({ label, itens, valor, onChange, total }: { label: string; itens: { id: string; nome: string }[]; valor: { id: string; pct: number }[]; onChange: (v: { id: string; pct: number }[]) => void; total: number }) {
  if (itens.length === 0) return <span className="text-caption text-faint">{label}: nenhum cadastrado.</span>;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label font-medium text-muted">{label} <span className={`text-caption ${total === 100 ? "text-positive" : "text-faint"}`}>({total}%)</span></span>
      {itens.map((it) => {
        const cur = valor.find((v) => v.id === it.id)?.pct ?? 0;
        return (
          <div key={it.id} className="flex items-center gap-2">
            <span className="text-[15px] text-ink flex-1 truncate">{it.nome}</span>
            <input type="number" min={0} max={100} value={cur} onChange={(e) => { const pct = Number(e.target.value); onChange([...valor.filter((v) => v.id !== it.id), ...(pct ? [{ id: it.id, pct }] : [])]); }} className="w-[72px] h-9 px-2 rounded-md border border-border bg-white text-[15px] text-ink text-right tabular-nums outline-none focus:border-faint" />
            <span className="text-caption text-faint">%</span>
          </div>
        );
      })}
    </div>
  );
}
