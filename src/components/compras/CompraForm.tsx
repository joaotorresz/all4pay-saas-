"use client";

/**
 * Nova Compra — o pedido de compra.
 *
 * Duas coisas dão caráter a este formulário e valem a leitura:
 *
 * 1. **As duas datas não são redundância.** Vencimento é caixa (quando o
 *    dinheiro sai, e é ela que manda no aging); competência é resultado (de que
 *    mês é a despesa no DRE). Comprar em março para pagar em junho é uma
 *    despesa de março que sai do caixa em junho — sem os dois campos, um dos
 *    dois relatórios mente.
 * 2. **Parcelado mostra as datas ANTES de gravar.** Escolher "6x" e descobrir
 *    depois onde as parcelas caíram é como o financeiro perde a confiança na
 *    tela; a prévia é o contrato do que vai ser criado.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card, Button, Icon, Input, Select, DateField, CurrencyInput, Textarea, Checkbox, BRL,
} from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { getParties, getCategories, getAccountsList, getCostCenters } from "@/lib/data";
import { listProjetos } from "@/lib/iuli-cadastros";
import {
  validarCompra, parcelasDaCompra, rateioFecha, anexoAceito, statusInicial,
  TIPOS_PAGAMENTO, ESPECIES, FORMATOS_ANEXO,
  type Compra, type RateioCompra, type AnexoCompra,
  type TipoPagamentoCompra, type EspecieDoc,
} from "@/core/compras";
import { salvarCompra, proximoNumeroCompra, novoId } from "@/lib/compras-store";

const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtDia = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function CompraForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const { show: toast, node } = useToast();

  const fornecedores = useQuery({ queryKey: ["parties", "supplier"], queryFn: () => getParties("supplier") });
  const contas = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const categorias = useQuery({ queryKey: ["categories", "despesa"], queryFn: () => getCategories("despesa") });
  const centros = useQuery({ queryKey: ["cost-centers"], queryFn: getCostCenters });
  const [projetos, setProjetos] = React.useState<{ id: string; nome: string }[]>([]);
  React.useEffect(() => {
    setProjetos(listProjetos().map((p) => ({ id: p.id, nome: p.nome })));
  }, []);

  const [fornecedorId, setFornecedorId] = React.useState("");
  const [contaId, setContaId] = React.useState("");
  const [categoria, setCategoria] = React.useState("");
  const [tipoPagamento, setTipoPagamento] = React.useState<TipoPagamentoCompra>("a_vista");
  const [parcelas, setParcelas] = React.useState(2);
  const [vencimento, setVencimento] = React.useState(hojeISO());
  const [competencia, setCompetencia] = React.useState(hojeISO());
  const [valor, setValor] = React.useState(0);
  const [documentoFiscal, setDocumentoFiscal] = React.useState("");
  const [especie, setEspecie] = React.useState<EspecieDoc | "">("");
  const [pago, setPago] = React.useState(false);
  const [dataPagamento, setDataPagamento] = React.useState(hojeISO());
  const [rateioProjetos, setRateioProjetos] = React.useState<RateioCompra[]>([]);
  const [rateioCentros, setRateioCentros] = React.useState<RateioCompra[]>([]);
  const [anexos, setAnexos] = React.useState<AnexoCompra[]>([]);
  const [erroAnexo, setErroAnexo] = React.useState<string | null>(null);
  const [descricao, setDescricao] = React.useState("");
  const [infoPagamento, setInfoPagamento] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [salvando, setSalvando] = React.useState(false);

  const rascunho = (): Compra => ({
    id: novoId("compra"),
    numero: proximoNumeroCompra(),
    fornecedorId,
    fornecedor: fornecedores.data?.find((f) => f.id === fornecedorId)?.name ?? "",
    contaId,
    categoria,
    tipoPagamento,
    parcelas: tipoPagamento === "parcelado" ? parcelas : 1,
    vencimento,
    competencia,
    valor,
    documentoFiscal,
    especie: especie || null,
    pago,
    dataPagamento: pago ? dataPagamento : null,
    projetos: rateioProjetos,
    centros: rateioCentros,
    anexos,
    descricao,
    infoPagamento,
    observacoes,
    status: statusInicial(pago),
    criadoPor: "Você",
    criadoEm: hojeISO(),
  });

  // A prévia usa o rascunho corrente — é o mesmo motor que vai gerar os
  // títulos, então o que a tela mostra é literalmente o que será criado.
  const previa = React.useMemo(
    () => (valor > 0 && vencimento ? parcelasDaCompra(rascunho()) : []),
    // `rascunho` é recriado a cada render e só estes quatro campos mudam a
    // prévia — incluí-lo remontaria a lista a cada tecla digitada em qualquer
    // campo do formulário.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valor, vencimento, tipoPagamento, parcelas],
  );

  function salvar() {
    const c = rascunho();
    const e = validarCompra(c);
    setErros(e);
    if (Object.keys(e).length > 0) {
      toast("Revise os campos obrigatórios.");
      return;
    }
    setSalvando(true);
    salvarCompra(c);
    qc.invalidateQueries();
    toast(
      c.status === "aprovada"
        ? "Compra registrada e aprovada — já paga, os títulos entraram no caixa."
        : "Compra criada. Ela entra no caixa quando for aprovada.",
    );
    router.push("/dashboard/purchases");
  }

  function anexar(files: FileList | null) {
    if (!files) return;
    const novos: AnexoCompra[] = [];
    for (const f of Array.from(files)) {
      // Conferido ANTES de guardar: aceitar e reclamar depois deixa o operador
      // achando que o documento subiu.
      const erro = anexoAceito(f.name, f.size);
      if (erro) { setErroAnexo(`${f.name}: ${erro}`); return; }
      novos.push({ nome: f.name, tamanho: f.size });
    }
    setErroAnexo(null);
    setAnexos((a) => [...a, ...novos]);
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-label text-muted">Criar um novo pedido de compra</p>

      <Card>
        <div className="flex flex-col gap-5">
          <span className="text-h3 font-semibold text-ink">Informações básicas</span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Select
              label="Fornecedor" required invalid={!!erros.fornecedorId}
              value={fornecedorId} onChange={setFornecedorId}
              placeholder="Selecione um fornecedor"
              options={(fornecedores.data ?? []).map((f) => ({ value: f.id, label: f.name }))}
            />
            <Select
              label="Conta bancária" required invalid={!!erros.contaId}
              value={contaId} onChange={setContaId}
              placeholder="Selecione uma conta bancária"
              options={(contas.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
            <Select
              label="Categoria" required invalid={!!erros.categoria}
              value={categoria} onChange={setCategoria}
              placeholder="Selecione uma categoria"
              options={(categorias.data ?? []).map((c) => ({ value: c.name, label: c.name }))}
            />
            <Select
              label="Tipo de pagamento" required
              value={tipoPagamento} onChange={(v) => setTipoPagamento(v as TipoPagamentoCompra)}
              options={TIPOS_PAGAMENTO.map((t) => ({ value: t.id, label: t.label }))}
            />
            {tipoPagamento === "parcelado" && (
              <div className="flex flex-col gap-[6px]">
                <label className="text-label font-medium text-muted">
                  Parcelas <span className="text-negative">*</span>
                </label>
                <Input
                  type="number" min={2} max={120}
                  value={String(parcelas)}
                  onChange={(e) => setParcelas(Math.max(2, Number(e.target.value) || 2))}
                />
                {erros.parcelas
                  ? <span className="text-caption text-negative">{erros.parcelas}</span>
                  : <span className="text-caption text-faint">Uma parcela por mês, a partir do vencimento.</span>}
              </div>
            )}
            <div className="flex flex-col gap-[6px]">
              <DateField
                label="Data de vencimento" required invalid={!!erros.vencimento}
                value={vencimento} onChange={setVencimento}
              />
              <span className="text-caption text-faint">Quando o dinheiro sai — é o que define o aging.</span>
            </div>
            <div className="flex flex-col gap-[6px]">
              <DateField
                label="Data de competência" required invalid={!!erros.competencia}
                value={competencia} onChange={setCompetencia}
              />
              <span className="text-caption text-faint">De que mês é a despesa no resultado (DRE).</span>
            </div>
            <div className="flex flex-col gap-[6px]">
              <CurrencyInput
                label="Valor da compra" required invalid={!!erros.valor}
                value={valor} onValueChange={setValor}
              />
              {erros.valor && <span className="text-caption text-negative">{erros.valor}</span>}
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-label font-medium text-muted">Documento fiscal</label>
              <Input value={documentoFiscal} onChange={(e) => setDocumentoFiscal(e.target.value)} placeholder="Número da nota" />
            </div>
            <div className="flex flex-col gap-[6px]">
              <Select
                label="Espécie" value={especie} onChange={(v) => setEspecie(v as EspecieDoc | "")}
                placeholder="Selecione a espécie"
                options={ESPECIES.map((e) => ({ value: e.id, label: e.label }))}
              />
              <span className="text-caption text-faint">NF-e para produtos · NFS-e para serviços</span>
            </div>
          </div>

          {previa.length > 1 && (
            <div className="rounded-md bg-surface-2 px-4 py-3">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
                Parcelas que serão criadas
              </span>
              <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
                {previa.map((p) => (
                  <span key={p.numero} className="text-caption text-muted tabular-nums">
                    {p.numero}/{previa.length} · {fmtDia(p.vencimento)} · <BRL value={p.valor} />
                  </span>
                ))}
              </div>
              <p className="m-0 mt-2 text-caption text-faint">
                O resto dos centavos vai na última parcela — a soma bate com o valor da compra.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-h3 font-semibold text-ink">Pagamento</span>
          <Checkbox checked={pago} onChange={(e) => setPago(e.target.checked)} label="Marcar como pago" />
          {pago && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-[6px]">
                <DateField
                  label="Data do pagamento" required invalid={!!erros.dataPagamento}
                  value={dataPagamento} onChange={setDataPagamento}
                />
                {erros.dataPagamento && <span className="text-caption text-negative">{erros.dataPagamento}</span>}
              </div>
              <p className="m-0 self-end text-caption text-faint max-w-[46ch]">
                Uma compra já paga entra APROVADA: o dinheiro saiu da conta, então ela não
                pode ficar aguardando autorização — as duas telas discordariam.
              </p>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-5">
          <span className="text-h3 font-semibold text-ink">Alocação</span>
          <Rateio
            titulo="Projetos" vazio="Nenhum projeto atribuído"
            opcoes={projetos.map((p) => ({ value: p.id, label: p.nome }))}
            linhas={rateioProjetos} setLinhas={setRateioProjetos} erro={erros.projetos}
          />
          <Rateio
            titulo="Centros de custo" vazio="Nenhum centro de custo atribuído"
            opcoes={(centros.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            linhas={rateioCentros} setLinhas={setRateioCentros} erro={erros.centros}
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <span className="text-h3 font-semibold text-ink">Anexos</span>
          <label className="flex flex-col items-center justify-center gap-2 py-10 rounded-md border border-dashed border-border cursor-pointer hover:bg-surface-2/60 transition-colors">
            <Icon name="upload" size={22} color="var(--color-text-tertiary)" />
            <span className="text-label text-ink">Arraste um arquivo ou clique para selecionar</span>
            <span className="text-caption text-faint">
              Tamanho máximo: 1 MB · Formatos: {FORMATOS_ANEXO.join(", ")}
            </span>
            <input
              type="file" multiple className="hidden"
              accept={FORMATOS_ANEXO.join(",")}
              onChange={(e) => anexar(e.target.files)}
            />
          </label>
          {erroAnexo && <span className="text-caption text-negative">{erroAnexo}</span>}
          {anexos.length > 0 && (
            <ul className="m-0 p-0 list-none flex flex-col gap-2">
              {anexos.map((a, k) => (
                <li key={`${a.nome}-${k}`} className="flex items-center justify-between gap-3 text-label text-muted">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <Icon name="paperclip" size={14} color="currentColor" />
                    <span className="truncate">{a.nome}</span>
                    <span className="text-caption text-faint tabular-nums">{(a.tamanho / 1024).toFixed(0)} KB</span>
                  </span>
                  <button
                    onClick={() => setAnexos((l) => l.filter((_, i) => i !== k))}
                    aria-label={`Remover ${a.nome}`}
                    className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2 transition-colors"
                  >
                    <Icon name="x" size={14} color="currentColor" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-h3 font-semibold text-ink">Informações adicionais</span>
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Descrição</label>
            <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição da compra" />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Informações de pagamento</label>
            <Input value={infoPagamento} onChange={(e) => setInfoPagamento(e.target.value)} placeholder="Chave PIX, dados bancários…" />
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Observações</label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={4} placeholder="Observações sobre a compra…" />
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.push("/dashboard/purchases")}>Cancelar</Button>
        <Button variant="primary" onClick={salvar} disabled={salvando}>
          <Icon name="check" size={15} color="currentColor" />
          Criar compra
        </Button>
      </div>
      {node}
    </div>
  );
}

/* --------------------------------- rateio --------------------------------- */

function Rateio({
  titulo, vazio, opcoes, linhas, setLinhas, erro,
}: {
  titulo: string;
  vazio: string;
  opcoes: { value: string; label: string }[];
  linhas: RateioCompra[];
  setLinhas: (l: RateioCompra[]) => void;
  erro?: string;
}) {
  const [escolha, setEscolha] = React.useState("");
  const [pct, setPct] = React.useState("100");
  const soma = linhas.reduce((s, l) => s + l.percentual, 0);
  const fecha = rateioFecha(linhas);

  function adicionar() {
    const op = opcoes.find((o) => o.value === escolha);
    if (!op) return;
    const p = Number(pct.replace(",", "."));
    if (!Number.isFinite(p) || p <= 0) return;
    setLinhas([...linhas.filter((l) => l.id !== op.value), { id: op.value, nome: op.label, percentual: p }]);
    setEscolha("");
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-label font-medium text-muted">{titulo}</span>
      {linhas.length === 0 ? (
        <span className="text-label text-faint">{vazio}</span>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {linhas.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 text-label text-ink">
              <span>{l.nome}</span>
              <span className="flex items-center gap-2">
                <span className="text-muted tabular-nums">{l.percentual}%</span>
                <button
                  onClick={() => setLinhas(linhas.filter((x) => x.id !== l.id))}
                  aria-label={`Remover ${l.nome}`}
                  className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2 transition-colors"
                >
                  <Icon name="x" size={14} color="currentColor" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_110px_auto] gap-3">
        <Select
          value={escolha} onChange={setEscolha}
          placeholder={opcoes.length === 0 ? "Nenhum cadastrado" : `Selecione ${titulo === "Projetos" ? "um projeto" : "um centro de custo"}`}
          options={opcoes}
        />
        <Input value={pct} onChange={(e) => setPct(e.target.value)} />
        <Button variant="secondary" onClick={adicionar} disabled={!escolha}>Adicionar</Button>
      </div>
      {linhas.length > 0 && (
        <span className={`text-caption ${fecha ? "text-faint" : "text-negative"}`}>
          Soma: {soma.toFixed(2).replace(".", ",")}%{fecha ? "" : " — o rateio precisa fechar em 100%."}
        </span>
      )}
      {erro && <span className="text-caption text-negative">{erro}</span>}
    </div>
  );
}
