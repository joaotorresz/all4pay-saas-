"use client";

/**
 * Nova conta a receber / a pagar — o formulário em página cheia.
 *
 * É o mesmo formulário nos dois lados; muda o vocabulário (Cliente ×
 * Fornecedor), o campo **Espécie** (só no pagar, porque é a nota que ampara a
 * despesa) e a **chave PIX** do fornecedor, que aparece assim que ele é
 * escolhido — quem paga precisa dela na mão, não em outra tela.
 *
 * As duas regras condicionais do print:
 *  • marcar "realizado" revela data, valor recebido/pago e desconto/juros —
 *    porque só um título liquidado tem essas três coisas;
 *  • marcar "repetir" revela frequência e quantidade, ambas obrigatórias: uma
 *    recorrência sem fim gera lançamento para sempre.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Card, Button, Icon, Input, Textarea, Select, DateField, CurrencyInput, Checkbox, BRL,
} from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { useAccounts } from "@/components/visao-geral/hooks";
import { usePartiesList } from "@/components/lancamentos/hooks";
import { PartyForm } from "@/components/lancamentos/PartyForm";
import { listPlanoContas, extraParty } from "@/lib/registros";
import { listProjetos, listCentrosCusto } from "@/lib/iuli-cadastros";
import { listContratos } from "@/lib/registros";
import { rateioValido, somaRateio, type LinhaRateio } from "@/core/registros";
import { appendImported } from "@/lib/imported";
import { vincularProjeto } from "@/lib/projeto-vinculo";
import { isDemo } from "@/lib/demo";
import { createLancamento } from "@/lib/data";
import type { Direcao } from "@/core/movimentacoes";
import type { RecurrenceFreq } from "@/lib/types";

const hoje = () => new Date().toISOString().slice(0, 10);

const FREQUENCIAS = [
  { value: "diaria", label: "Diária", dias: 1 },
  { value: "semanal", label: "Semanal", dias: 7 },
  { value: "mensal", label: "Mensal", dias: 0 },
  { value: "bimestral", label: "Bimestral", dias: 0 },
  { value: "trimestral", label: "Trimestral", dias: 0 },
  { value: "anual", label: "Anual", dias: 0 },
];
const MESES_FREQ: Record<string, number> = { mensal: 1, bimestral: 2, trimestral: 3, anual: 12 };

const ESPECIES = [
  { value: "nfe", label: "NF-e (Danfe) — Produtos" },
  { value: "nfse", label: "NFS-e — Serviços" },
];

const EXT_OK = ["png", "jpg", "jpeg", "pdf", "xml", "xls", "xlsx"];
const LIMITE = 10 * 1024 * 1024;

export function TituloForm({ direcao }: { direcao: Direcao }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { show, node } = useToast();
  const { data: contas } = useAccounts();
  const { data: partes } = usePartiesList();

  const receber = direcao === "receber";
  const rotuloParte = receber ? "Cliente" : "Fornecedor";
  const rotuloAcao = receber ? "Recebimento" : "Pagamento";

  const [f, setF] = React.useState({
    parteId: "", contratoId: "", competencia: hoje(), vencimento: hoje(), valor: 0,
    contaId: "", categoria: "", mostrarDRE: true, descricao: "", documentoFiscal: "",
    especie: "", dadosPagamento: "",
    realizado: false, conciliada: false, dataRealizado: hoje(), valorRealizado: 0, descontoJuros: 0,
    repetir: false, frequencia: "mensal", ocorrencias: 12,
  });
  const [projetos, setProjetos] = React.useState<LinhaRateio[]>([]);
  const [centros, setCentros] = React.useState<LinhaRateio[]>([]);
  const [anexos, setAnexos] = React.useState<{ nome: string; tamanho: number }[]>([]);
  const [erroAnexo, setErroAnexo] = React.useState("");
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [novaParte, setNovaParte] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const cadProjetos = React.useMemo(() => listProjetos(), []);
  const cadCentros = React.useMemo(() => listCentrosCusto(), []);
  const categorias = React.useMemo(
    () => listPlanoContas().filter((c) => c.natureza === (receber ? "receita" : "despesa") && c.paiId),
    [receber],
  );
  const elegiveis = React.useMemo(
    () => (partes ?? []).filter((p) => (receber ? p.is_customer : p.is_supplier)),
    [partes, receber],
  );
  const contratos = React.useMemo(
    () => listContratos().filter((c) => c.lado === (receber ? "cliente" : "fornecedor")),
    [receber],
  );

  const parteEscolhida = elegiveis.find((p) => p.id === f.parteId);
  const pix = parteEscolhida ? extraParty(parteEscolhida.id).chavePix : "";

  /** Escolher o cliente pré-preenche a categoria padrão que ele já tem. */
  React.useEffect(() => {
    if (!f.parteId) return;
    const padrao = extraParty(f.parteId).categoriaPadrao;
    if (padrao) setF((s) => (s.categoria ? s : { ...s, categoria: padrao }));
  }, [f.parteId]);

  /** Marcar realizado pré-preenche o valor com o valor do título. */
  React.useEffect(() => {
    if (f.realizado && f.valorRealizado === 0 && f.valor > 0) {
      setF((s) => ({ ...s, valorRealizado: s.valor }));
    }
  }, [f.realizado, f.valor, f.valorRealizado]);

  const validar = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!f.parteId) e.parteId = `Selecione o ${rotuloParte.toLowerCase()}.`;
    if (!f.competencia) e.competencia = "Informe a data de competência.";
    if (!f.vencimento) e.vencimento = "Informe a data de vencimento.";
    if (!f.valor || f.valor <= 0) e.valor = "Informe o valor.";
    if (!f.contaId) e.contaId = "Selecione a conta bancária.";
    if (!f.categoria) e.categoria = "Selecione a categoria.";
    if (f.realizado) {
      if (!f.dataRealizado) e.dataRealizado = `Informe a data de ${rotuloAcao.toLowerCase()}.`;
      if (!f.valorRealizado || f.valorRealizado <= 0) e.valorRealizado = "Informe o valor realizado.";
    }
    if (f.repetir) {
      if (!f.frequencia) e.frequencia = "Selecione a frequência.";
      // Sem quantidade, a recorrência geraria lançamento para sempre.
      if (!f.ocorrencias || f.ocorrencias < 2) e.ocorrencias = "Informe ao menos 2 ocorrências.";
    }
    if (!rateioValido(projetos)) e.projetos = "O rateio por projeto precisa somar 100%.";
    if (!rateioValido(centros)) e.centros = "O rateio por centro de custo precisa somar 100%.";
    return e;
  };

  /** As datas de vencimento de cada ocorrência, para a pessoa VER o que vai criar. */
  const ocorrencias = React.useMemo(() => {
    if (!f.repetir || !f.vencimento) return [];
    const n = Math.min(Math.max(2, f.ocorrencias || 0), 120);
    const [a, m, d] = f.vencimento.split("-").map(Number);
    const passoDias = FREQUENCIAS.find((x) => x.value === f.frequencia)?.dias ?? 0;
    const passoMeses = MESES_FREQ[f.frequencia] ?? 0;
    return Array.from({ length: n }, (_, k) => {
      if (passoMeses) {
        const base = new Date(a, m - 1 + passoMeses * k, 1);
        const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
        // Dia 31 num mês de 30 vira o último dia — nunca "escorrega" para o mês
        // seguinte, o que adiantaria a cobrança em um mês.
        return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
      }
      const dt = new Date(a, m - 1, d + passoDias * k);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
    });
  }, [f.repetir, f.vencimento, f.frequencia, f.ocorrencias]);

  const salvar = async () => {
    const e = validar();
    setErros(e);
    if (Object.keys(e).length > 0) {
      show("Revise os campos obrigatórios.");
      return;
    }
    setSalvando(true);
    try {
      const datas = f.repetir ? ocorrencias : [f.vencimento];
      if (isDemo) {
        // Em demo o lançamento entra no dataset importado — é o mesmo caminho
        // do upload, então saldo, DRE e fluxo reagem na hora.
        datas.forEach((venc, k) => {
          const id = `mv_${Date.now().toString(36)}_${k}`;
          const liquidado = f.realizado && k === 0;
          appendImported({
            movement: {
              id,
              account_id: f.contaId,
              type: receber ? "entrada" : "saida",
              status: liquidado ? "pago" : "pendente",
              amount: f.valor,
              due_date: venc,
              paid_date: liquidado ? f.dataRealizado : null,
              reconciled: f.conciliada,
              category: categorias.find((c) => c.id === f.categoria)?.nome ?? null,
              description: f.descricao || null,
              party_id: f.parteId,
            } as never,
          });
          const proj = projetos.find((p) => p.id)?.id;
          if (proj) vincularProjeto(id, proj);
        });
      } else {
        await createLancamento({
          kind: receber ? "receita" : "despesa",
          party_id: f.parteId || null,
          project_id: projetos.find((p) => p.id)?.id ?? null,
          competence_date: f.competencia,
          description: f.descricao.trim(),
          amount: f.valor,
          category_id: f.categoria || null,
          cost_center_id: centros.find((c) => c.id)?.id ?? null,
          reference_code: f.documentoFiscal.trim() || null,
          splits: null,
          repeat: f.repetir ? { freq: f.frequencia as RecurrenceFreq, count: f.ocorrencias, until: null } : null,
          installments: 1,
          due_date: f.vencimento,
          payment_method: null,
          account_id: f.contaId || null,
          settled: f.realizado,
          nsu: null,
        });
      }
      qc.invalidateQueries();
      show(`Conta a ${direcao} criada${datas.length > 1 ? ` (${datas.length} ocorrências)` : ""}.`);
      router.push(`/dashboard/financial/accounts-and-transfers?tab=${receber ? "receivables" : "payables"}`);
    } catch {
      show("Não foi possível salvar. Tente novamente.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 self-start text-caption text-muted hover:text-ink"
      >
        <Icon name="chevron-left" size={14} color="currentColor" />
        Cancelar
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* ------------------------------- a parte ------------------------------- */}
        <Bloco titulo={rotuloParte.toUpperCase()}>
          <Campo label={rotuloParte} obrigatorio erro={erros.parteId}>
            <div className="flex items-center gap-2">
              <Select
                value={f.parteId}
                onChange={(v) => set("parteId", v)}
                placeholder="Digite nome ou documento…"
                options={elegiveis.map((p) => ({ value: p.id, label: `${p.name}${p.doc ? ` · ${p.doc}` : ""}` }))}
                containerClassName="flex-1 min-w-0"
              />
              {/* Atalho de criação rápida: quem lança a conta descobre ali que o
                  cliente não está cadastrado, e mandar a pessoa para outra tela
                  perderia o formulário inteiro. */}
              <button
                onClick={() => setNovaParte(true)}
                aria-label={`Novo ${rotuloParte.toLowerCase()}`}
                title={`Novo ${rotuloParte.toLowerCase()}`}
                className="inline-flex items-center justify-center w-10 h-10 rounded-md bg-surface-2 text-ink hover:bg-surface-3 transition-colors shrink-0"
              >
                <Icon name="plus" size={16} color="currentColor" />
              </button>
            </div>
          </Campo>
          {!receber && pix && (
            <div className="rounded-md bg-surface-2 px-3 py-2 flex items-center gap-2">
              <Icon name="credit-card" size={14} color="var(--color-text-tertiary)" />
              <span className="text-caption text-muted">Chave PIX:</span>
              <span className="text-caption text-ink truncate">{pix}</span>
            </div>
          )}
          <Campo label="Contrato" ajuda="Opcional — vincula o título a um contrato vigente.">
            <Select
              value={f.contratoId}
              onChange={(v) => set("contratoId", v)}
              options={[{ value: "", label: "Nenhum contrato" }, ...contratos.map((c) => ({ value: c.id, label: `${c.parteNome} · ${c.objeto}` }))]}
              disabled={contratos.length === 0}
            />
          </Campo>
        </Bloco>

        {/* ---------------------------- datas e valor ---------------------------- */}
        <Bloco titulo="DATAS E VALOR">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Data de competência" obrigatorio erro={erros.competencia} ajuda="Quando o fato aconteceu — é o que o DRE lê.">
              <DateField value={f.competencia} onChange={(v) => set("competencia", v)} />
            </Campo>
            <Campo label="Data de vencimento" obrigatorio erro={erros.vencimento} ajuda="Quando cai — é o que a cobrança lê.">
              <DateField value={f.vencimento} onChange={(v) => set("vencimento", v)} />
            </Campo>
          </div>
          <Campo label="Valor" obrigatorio erro={erros.valor}>
            <CurrencyInput value={f.valor} onValueChange={(v) => set("valor", v)} />
          </Campo>
        </Bloco>

        {/* ---------------------------- dados gerais ---------------------------- */}
        <Bloco titulo="DADOS GERAIS">
          <Campo label="Conta bancária" obrigatorio erro={erros.contaId}>
            <Select
              value={f.contaId}
              onChange={(v) => set("contaId", v)}
              placeholder="Selecione uma opção"
              options={(contas?.accounts ?? []).map((c) => ({ value: c.id, label: c.name }))}
            />
          </Campo>
          <Campo label="Categoria" obrigatorio erro={erros.categoria}>
            <Select
              value={f.categoria}
              onChange={(v) => set("categoria", v)}
              placeholder="Selecione…"
              options={categorias.map((c) => ({ value: c.id, label: c.nome }))}
            />
          </Campo>
          {!receber && (
            <Campo label="Espécie" ajuda="A nota que ampara a despesa.">
              <Select
                value={f.especie}
                onChange={(v) => set("especie", v)}
                placeholder="Selecione uma opção"
                options={ESPECIES}
              />
            </Campo>
          )}
          <Checkbox
            checked={f.mostrarDRE}
            onChange={(e) => set("mostrarDRE", e.target.checked)}
            label="Mostrar no DRE"
          />
        </Bloco>

        {/* ---------------------------- campos de texto ---------------------------- */}
        <Bloco titulo="CAMPOS DE TEXTO">
          <Campo label="Descrição">
            <Input value={f.descricao} onChange={(e) => set("descricao", e.target.value)} />
          </Campo>
          <Campo label="Documento fiscal" ajuda="NF ou referência do extrato que ampara a transação.">
            <Input value={f.documentoFiscal} onChange={(e) => set("documentoFiscal", e.target.value)} />
          </Campo>
          <Campo label="Dados de pagamento" ajuda="Código de pagamento (boleto, PIX, etc.).">
            <Textarea value={f.dadosPagamento} onChange={(e) => set("dadosPagamento", e.target.value)} rows={2} />
          </Campo>
        </Bloco>
      </div>

      {/* --------------------------- realizado (condicional) --------------------------- */}
      <Card>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{rotuloAcao.toUpperCase()}</span>
        <div className="flex flex-col gap-2 mt-3">
          <Checkbox
            checked={f.realizado}
            onChange={(e) => set("realizado", e.target.checked)}
            label={`${rotuloAcao} realizado`}
          />
          <Checkbox
            checked={f.conciliada}
            onChange={(e) => set("conciliada", e.target.checked)}
            label="Conciliada com extrato"
            disabled={!f.realizado}
          />
        </div>
        {f.realizado && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-border-soft">
            <Campo label={`Data de ${rotuloAcao.toLowerCase()}`} obrigatorio erro={erros.dataRealizado}>
              <DateField value={f.dataRealizado} onChange={(v) => set("dataRealizado", v)} />
            </Campo>
            <Campo label={`Valor ${receber ? "recebido" : "pago"}`} obrigatorio erro={erros.valorRealizado}>
              <CurrencyInput value={f.valorRealizado} onValueChange={(v) => set("valorRealizado", v)} />
            </Campo>
            <Campo
              label="Desconto / Juros"
              ajuda={f.valor && f.valorRealizado
                ? `Diferença: ${(f.valorRealizado - f.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
                : undefined}
            >
              <CurrencyInput value={f.descontoJuros} onValueChange={(v) => set("descontoJuros", v)} />
            </Campo>
          </div>
        )}
      </Card>

      {/* ---------------------------- repetir (condicional) ---------------------------- */}
      <Card>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">REPETIR</span>
        <div className="mt-3">
          <Checkbox checked={f.repetir} onChange={(e) => set("repetir", e.target.checked)} label="Repetir lançamento" />
        </div>
        {f.repetir && (
          <div className="mt-4 pt-4 border-t border-border-soft flex flex-col gap-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Frequência" obrigatorio erro={erros.frequencia}>
                <Select value={f.frequencia} onChange={(v) => set("frequencia", v)} options={FREQUENCIAS} />
              </Campo>
              <Campo label="Quantidade de ocorrências" obrigatorio erro={erros.ocorrencias}>
                <Input
                  type="number" min={2} max={120}
                  value={String(f.ocorrencias)}
                  onChange={(e) => set("ocorrencias", Number(e.target.value) || 0)}
                />
              </Campo>
            </div>
            {ocorrencias.length > 0 && (
              <div className="rounded-card bg-surface-2 p-3">
                <div className="text-caption text-muted mb-2">
                  {ocorrencias.length} lançamentos ·{" "}
                  <b className="text-ink tabular-nums">
                    {(f.valor * ocorrencias.length).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </b>{" "}
                  no total
                </div>
                <div className="flex flex-wrap gap-1">
                  {ocorrencias.slice(0, 12).map((d) => (
                    <span key={d} className="rounded-pill bg-white px-2 py-[2px] text-caption text-muted tabular-nums">
                      {d.split("-").reverse().join("/")}
                    </span>
                  ))}
                  {ocorrencias.length > 12 && (
                    <span className="text-caption text-faint self-center">+{ocorrencias.length - 12}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* -------------------------- projeto e centro de custo -------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Rateio
          titulo="Projetos" singular="projeto"
          opcoes={cadProjetos.map((p) => ({ value: p.id, label: p.nome }))}
          linhas={projetos} onChange={setProjetos} erro={erros.projetos}
        />
        <Rateio
          titulo="Centros de custo" singular="centro de custo"
          opcoes={cadCentros.map((c) => ({ value: c.id, label: c.nome }))}
          linhas={centros} onChange={setCentros} erro={erros.centros}
        />
      </div>

      {/* --------------------------------- anexos --------------------------------- */}
      <Card>
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">ANEXOS</span>
        <label className="mt-3 flex flex-col items-center justify-center gap-2 rounded-card bg-surface-2 border border-dashed border-border py-10 cursor-pointer hover:bg-surface-3 transition-colors">
          <Icon name="upload" size={20} color="var(--color-text-tertiary)" />
          <span className="text-label text-muted">Arraste arquivos para cá ou clique para selecionar</span>
          <span className="text-caption text-faint">{EXT_OK.join(", ")} · até 10 MB</span>
          <input
            type="file" multiple className="hidden"
            onChange={(e) => {
              const novos: { nome: string; tamanho: number }[] = [];
              for (const arq of Array.from(e.target.files ?? [])) {
                const ext = arq.name.split(".").pop()?.toLowerCase() ?? "";
                // Checar ANTES de guardar: recusar depois do "salvar" perderia
                // o resto do formulário.
                if (!EXT_OK.includes(ext)) { setErroAnexo(`"${arq.name}": formato não aceito.`); continue; }
                if (arq.size > LIMITE) { setErroAnexo(`"${arq.name}": passa de 10 MB.`); continue; }
                novos.push({ nome: arq.name, tamanho: arq.size });
              }
              if (novos.length) setErroAnexo("");
              setAnexos((a) => [...a, ...novos]);
            }}
          />
        </label>
        {erroAnexo && <span className="mt-2 text-caption text-negative">{erroAnexo}</span>}
        <div className="mt-3 flex flex-col gap-1">
          {anexos.length === 0
            ? <span className="text-caption text-faint">Nenhum anexo.</span>
            : anexos.map((a, k) => (
              <div key={k} className="flex items-center justify-between gap-3 py-1">
                <span className="text-caption text-ink truncate">{a.nome}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-caption text-faint tabular-nums">{(a.tamanho / 1024).toFixed(0)} KB</span>
                  <button onClick={() => setAnexos((l) => l.filter((_, i) => i !== k))}
                    className="text-caption text-muted hover:text-negative">Remover</button>
                </div>
              </div>
            ))}
        </div>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button variant="primary" disabled={salvando} onClick={salvar}>
          <Icon name="check" size={15} color="currentColor" />
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
      </div>

      {novaParte && (
        <PartyForm
          role={receber ? "customer" : "supplier"}
          onClose={() => setNovaParte(false)}
          onToast={(m) => { show(m); setNovaParte(false); qc.invalidateQueries({ queryKey: ["parties-list"] }); }}
        />
      )}
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card className="h-full">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{titulo}</span>
      <div className="flex flex-col gap-4 mt-3">{children}</div>
    </Card>
  );
}

function Campo({
  label, obrigatorio, erro, ajuda, children,
}: { label: string; obrigatorio?: boolean; erro?: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">
        {label}
        {obrigatorio && (
          <span className="ml-2 rounded-pill bg-surface-3 text-[10px] text-muted px-[6px] py-[1px] align-middle">
            Obrigatório
          </span>
        )}
      </label>
      {children}
      {erro ? <span className="text-caption text-negative">{erro}</span>
        : ajuda ? <span className="text-caption text-faint">{ajuda}</span> : null}
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
          <Button
            variant="ghost"
            disabled={opcoes.length === 0}
            onClick={() => onChange([...linhas, { id: "", percentual: linhas.length === 0 ? 100 : 0 }])}
          >
            <Icon name="plus" size={14} color="currentColor" />
            Adicionar
          </Button>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {opcoes.length === 0 ? (
          <span className="text-caption text-faint">
            Nenhum {singular} cadastrado — cadastre em Cadastros para poder ratear.
          </span>
        ) : linhas.length === 0 ? (
          <span className="text-caption text-faint">Nenhuma alocação cadastrada.</span>
        ) : linhas.map((l, k) => (
          <div key={k} className="flex items-center gap-2">
            <Select
              value={l.id}
              onChange={(v) => onChange(linhas.map((x, i) => (i === k ? { ...x, id: v } : x)))}
              placeholder={`Selecione o ${singular}`}
              options={opcoes}
              containerClassName="flex-1 min-w-0"
            />
            <Input
              type="number"
              value={String(l.percentual)}
              onChange={(e) => onChange(linhas.map((x, i) => (i === k ? { ...x, percentual: Number(e.target.value) || 0 } : x)))}
              containerClassName="w-[100px]"
            />
            <button
              onClick={() => onChange(linhas.filter((_, i) => i !== k))}
              aria-label="Remover" className="p-[6px] rounded-md text-muted hover:text-negative hover:bg-surface-2"
            >
              <Icon name="minus" size={15} color="currentColor" />
            </button>
          </div>
        ))}
      </div>
      {erro && <span className="mt-2 text-caption text-negative">{erro}</span>}
    </Card>
  );
}
