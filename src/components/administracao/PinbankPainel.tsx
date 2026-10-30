"use client";

/**
 * Maquininha Pinbank — o painel da EMPRESA (cartão de Integrações).
 *
 * As duas chaves do vínculo aparecem na tela na ordem em que acontecem:
 *   1. a plataforma vincula o estabelecimento da Pinbank a esta empresa
 *      (a tela só mostra; pedir o vínculo é falar com o suporte);
 *   2. quem ADMINISTRA a empresa ativa — escolhe a conta do repasse e diz as
 *      taxas que contratou. Só então as vendas viram dinheiro.
 *
 * ⚠️ A taxa é digitada em PERCENTUAL ("1,99") e gravada em fração (0,0199): é
 * como a pessoa lê o contrato. O banco recusa fração ≥ 1, que é o engano de
 * quem digitou o percentual no lugar errado.
 *
 * ⚠️ Taxa em branco NÃO é zero: a venda entra sem o custo de adquirência e o
 * evento diz que a taxa não estava cadastrada. Zero afirmaria uma maquininha
 * sem custo.
 *
 * ⚠️ A TARIFA FIXA é a única em REAIS (R$ 1,00 por venda, não 1%): sai uma vez
 * por venda, antes da taxa da forma, que é cobrada sobre o que sobra. A
 * ANTECIPAÇÃO é percentual AO MÊS e só cobra com o repasse antecipado, no
 * crédito. As duas foram medidas no extrato de produção em 14/10/2026.
 */
import * as React from "react";
import { Card, Button, Input, CurrencyInput, Select, Switch, StatusBadge, BRL } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { formatBRL } from "@/lib/format";
import {
  REGRA_PADRAO, avisosDaRegra, encargosDaFatura, problemasDaRegra, type RegraEncargos,
} from "@/core/cobranca/fatura";
import { useContasBancarias } from "@/components/registros/hooks";
import { usePermissoes } from "@/components/app/usePermissoes";
import {
  lerPinbank, configurarVinculo, configurarCobranca, lerEncargos, definirEncargos, reprocessarPinbank, SITUACOES_PENDENTES,
  type EstadoPinbank, type VinculoTela,
} from "@/lib/pinbank/cliente";
import { PRAZOS_PADRAO, TARIFA_FIXA_MAXIMA, ANTECIPACAO_MENSAL_MAXIMA, type PrazosPinbank, type TaxasPinbank } from "@/core/pinbank";
import { PinbankConferencia } from "./PinbankConferencia";

const FORMAS_TAXA: { id: keyof TaxasPinbank; label: string }[] = [
  { id: "debito", label: "Débito" },
  { id: "credito_vista", label: "Crédito à vista" },
  { id: "parcelado", label: "Crédito parcelado" },
  { id: "pix", label: "Pix" },
  { id: "voucher", label: "Voucher" },
];
const PRAZOS: { id: keyof PrazosPinbank; label: string }[] = [
  { id: "debito", label: "Débito (dias)" },
  { id: "credito", label: "Crédito (dias)" },
  { id: "pix", label: "Pix (dias)" },
  { id: "antecipado", label: "Antecipado (dias)" },
];

const SITUACAO: Record<string, { rotulo: string; tom: "positive" | "warning" | "neutral" | "ink" }> = {
  processado: { rotulo: "Lançado", tom: "positive" },
  ignorado: { rotulo: "Sem efeito", tom: "neutral" },
  recebido: { rotulo: "Recebido", tom: "neutral" },
  sem_vinculo: { rotulo: "Sem vínculo", tom: "warning" },
  aguardando_ativacao: { rotulo: "Aguardando ativação", tom: "warning" },
  bloqueado: { rotulo: "Assinatura vencida", tom: "warning" },
  erro: { rotulo: "Erro", tom: "warning" },
};

const NOME_EVENTO: Record<string, string> = {
  "Compra.TransacaoPendente": "Venda pendente",
  "Compra.TransacaoRealizada": "Venda aprovada",
  "Compra.TransacaoNegada": "Venda negada",
  "Compra.TransacaoCancelada": "Venda cancelada",
  "Compra.TransacaoDesfeita": "Venda desfeita",
  "Compra.TransacaoReembolsada": "Estorno",
  "Compra.PixCobrancaPendente": "Pix pendente",
  "Compra.PixTransferenciaRealizada": "Pix recebido",
  "Compra.PixTransferenciaNegada": "Pix negado",
  "Compra.PixCobrancaInvalidada": "Cobrança Pix expirada",
};

// ⚠️ `recebido_em` é um INSTANTE (timestamptz), não uma data: aqui o `Date` é o
// certo, e o fuso é o de quem opera. Fatiar a string mostraria a hora UTC.
const FMT_DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
});
const dataHora = (iso: string) => FMT_DATA_HORA.format(new Date(iso)).replace(",", "");
const paraPct = (f: number | null | undefined) =>
  typeof f === "number" ? String(Math.round(f * 10000) / 100).replace(".", ",") : "";
const deCampoPct = (s: string): number | null => {
  const t = s.trim().replace("%", "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) / 10000 : NaN;
};

export function PinbankPainel({ toast }: { toast: (s: string) => void }) {
  const [estado, setEstado] = React.useState<EstadoPinbank | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [reprocessando, setReprocessando] = React.useState(false);
  const { pode } = usePermissoes();
  const administra = pode("administrar");

  const carregar = React.useCallback(async () => {
    try {
      setEstado(await lerPinbank());
      setErro(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, []);
  React.useEffect(() => { void carregar(); }, [carregar]);

  async function reprocessar() {
    setReprocessando(true);
    try {
      const r = await reprocessarPinbank();
      const lancados = r.contagem.processado ?? 0;
      toast(r.total === 0 ? "Nenhum evento pendente." : `${r.total} evento(s) reprocessado(s) · ${lancados} lançado(s).`);
      await carregar();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setReprocessando(false);
    }
  }

  if (isDemo) {
    return (
      <Card>
        <p className="m-0 text-label text-muted max-w-[80ch]">
          Na demonstração não há maquininha conectada.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {erro && (
        <Card><p className="m-0 text-label text-negative">Não foi possível ler a maquininha: {erro}</p></Card>
      )}

      {estado && estado.vinculos.length === 0 && !erro && (
        <Card>
          <p className="m-0 text-label text-muted max-w-[80ch]">
            Nenhuma maquininha vinculada a esta empresa. Peça ao suporte da Quattro o vínculo, informando o código do estabelecimento na Pinbank.
          </p>
        </Card>
      )}

      {estado?.vinculos.map((v) => (
        <VinculoForm key={v.id} vinculo={v} administra={administra} toast={toast}
          onSalvo={async (ativou) => { await carregar(); if (ativou) await reprocessar(); }} />
      ))}

      {estado && (
        <Card>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-h3 font-semibold text-ink">Últimos eventos</span>
              <Button variant="secondary" disabled={!administra || reprocessando || estado.pendentes === 0} onClick={reprocessar}>
                {reprocessando ? "Reprocessando…" : `Reprocessar ${estado.pendentes} pendente(s)`}
              </Button>
            </div>
            {estado.eventos.length === 0 ? (
              <span className="text-label text-muted">Nenhum evento recebido ainda.</span>
            ) : (
              <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Eventos da maquininha">
                <table className="w-full text-label">
                  <thead>
                    <tr className="text-left">
                      {["Recebido", "Evento", "NSU", "Valor", "Situação", "Motivo"].map((h) => (
                        <th key={h} className="py-2 pr-4 text-[11px] font-medium text-faint">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {estado.eventos.map((e) => {
                      const s = SITUACAO[e.situacao] ?? { rotulo: e.situacao, tom: "neutral" as const };
                      return (
                        <tr key={e.event_id} className="border-t border-border-soft align-top">
                          <td className="py-2 pr-4 tabular-nums whitespace-nowrap">{dataHora(e.recebido_em)}</td>
                          <td className="py-2 pr-4 whitespace-nowrap">{NOME_EVENTO[e.event_type] ?? e.event_type}</td>
                          <td className="py-2 pr-4 tabular-nums">{e.nsu ?? "—"}</td>
                          <td className="py-2 pr-4 text-right whitespace-nowrap">
                            {typeof e.valor_centavos === "number" ? <BRL value={e.valor_centavos / 100} /> : "—"}
                          </td>
                          <td className="py-2 pr-4 whitespace-nowrap">
                            <StatusBadge tone={SITUACOES_PENDENTES.includes(e.situacao) || e.situacao === "sem_vinculo" ? "warning" : s.tom}>{s.rotulo}</StatusBadge>
                          </td>
                          <td className="py-2 pr-4 text-muted max-w-[48ch]">{e.motivo ?? ""}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}

function VinculoForm({
  vinculo, administra, toast, onSalvo,
}: {
  vinculo: VinculoTela;
  administra: boolean;
  toast: (s: string) => void;
  onSalvo: (ativou: boolean) => Promise<void>;
}) {
  const contas = useContasBancarias();
  const [conta, setConta] = React.useState(vinculo.conta_id ?? "");
  const [taxas, setTaxas] = React.useState<Record<string, string>>(
    Object.fromEntries(FORMAS_TAXA.map((f) => [f.id, paraPct(vinculo.taxas?.[f.id])])),
  );
  const [prazos, setPrazos] = React.useState<Record<string, string>>(
    Object.fromEntries(PRAZOS.map((p) => [p.id, vinculo.prazos?.[p.id] != null ? String(vinculo.prazos[p.id]) : ""])),
  );
  const [antecipado, setAntecipado] = React.useState(vinculo.antecipado);
  const [tarifa, setTarifa] = React.useState<number>(
    typeof vinculo.taxas?.tarifa_fixa === "number" ? vinculo.taxas.tarifa_fixa : 0,
  );
  const [antecipacao, setAntecipacao] = React.useState(paraPct(vinculo.taxas?.antecipacao_mes));
  const [salvando, setSalvando] = React.useState(false);

  const opcoesConta = (contas.data ?? [])
    .filter((c) => c.ativo || c.id === vinculo.conta_id)
    .map((c) => ({ value: c.id, label: c.ativo ? c.nome : `${c.nome} (inativa)` }));

  async function salvar(ativo: boolean) {
    const t: TaxasPinbank = {};
    for (const f of FORMAS_TAXA) {
      const v = deCampoPct(taxas[f.id] ?? "");
      if (Number.isNaN(v)) { toast(`Taxa de ${f.label.toLowerCase()} não é um número.`); return; }
      if (v != null) t[f.id] = v;
    }
    // A tarifa em REAIS; em branco (zero) é "sem tarifa" — não há aviso a dar.
    if (tarifa < 0 || tarifa > TARIFA_FIXA_MAXIMA) { toast("Tarifa fixa: use um valor de até R$ 100,00 por venda."); return; }
    if (tarifa > 0) t.tarifa_fixa = Math.round(tarifa * 100) / 100;
    // A antecipação em PERCENTUAL ao mês, gravada em fração (1,55 → 0,0155), até
    // 10% ao mês — o mesmo teto do banco: "15,5" no lugar de "1,55" deixaria o
    // líquido das vendas parceladas negativo.
    const a = deCampoPct(antecipacao);
    if (Number.isNaN(a) || (a != null && (a < 0 || a > ANTECIPACAO_MENSAL_MAXIMA))) {
      toast("Antecipação: use o percentual ao mês (1,55 para 1,55% ao mês), de 0 a 10%.");
      return;
    }
    if (a != null) t.antecipacao_mes = a;
    const p: PrazosPinbank = {};
    for (const q of PRAZOS) {
      const s = (prazos[q.id] ?? "").trim();
      if (!s) continue;
      const n = Number(s);
      if (!Number.isInteger(n) || n < 0 || n > 365) { toast(`${q.label}: use dias inteiros de 0 a 365.`); return; }
      p[q.id] = n;
    }
    if (ativo && !conta) { toast("Escolha a conta em que o repasse cai antes de ativar."); return; }
    setSalvando(true);
    try {
      await configurarVinculo({ id: vinculo.id, contaId: conta || null, taxas: t, prazos: p, antecipado, ativo });
      toast(ativo && !vinculo.ativo ? "Maquininha ativada. Os eventos que esperavam entram agora." : "Configuração salva.");
      await onSalvo(ativo && !vinculo.ativo);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  const rotulo = vinculo.nome ?? (vinculo.estabelecimento_id ? `Estabelecimento ${vinculo.estabelecimento_id}` : vinculo.chave_gateway ?? "Maquininha");

  return (
    <Card>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-h3 font-semibold text-ink">{rotulo}</span>
            <span className="text-caption text-muted tabular-nums">
              {vinculo.estabelecimento_id ? `Estabelecimento ${vinculo.estabelecimento_id}` : ""}
              {vinculo.estabelecimento_id && vinculo.chave_gateway ? " · " : ""}
              {vinculo.chave_gateway ? `Chave ${vinculo.chave_gateway}` : ""}
            </span>
            <span className="text-caption text-muted tabular-nums">
              Código no extrato (EC): {vinculo.codigo_cliente ?? "não cadastrado"}
            </span>
          </div>
          <StatusBadge tone={vinculo.ativo ? "positive" : "warning"}>
            {vinculo.ativo ? "Ativa" : "Aguardando ativação"}
          </StatusBadge>
        </div>

        <Select label="Conta do repasse" required value={conta} onChange={setConta}
          placeholder="Escolha a conta" options={opcoesConta} disabled={!administra} />

        <div className="flex flex-col gap-2">
          <span className="a4p-label text-muted">Taxas contratadas (%)</span>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {FORMAS_TAXA.map((f) => (
              <Input key={f.id} label={f.label} inputMode="decimal" placeholder="não informada" suffix="%"
                value={taxas[f.id] ?? ""} disabled={!administra}
                onChange={(e) => setTaxas((s) => ({ ...s, [f.id]: e.target.value }))} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="a4p-label text-muted">Tarifa por venda</span>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <CurrencyInput label="Tarifa fixa por venda" value={tarifa} onValueChange={setTarifa}
              placeholder="sem tarifa" disabled={!administra} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="a4p-label text-muted">Prazo do repasse</span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {PRAZOS.map((q) => (
              <Input key={q.id} label={q.label} inputMode="numeric" placeholder={String(PRAZOS_PADRAO[q.id])}
                value={prazos[q.id] ?? ""} disabled={!administra}
                onChange={(e) => setPrazos((s) => ({ ...s, [q.id]: e.target.value }))} />
            ))}
          </div>
          <Switch checked={antecipado} onChange={setAntecipado} disabled={!administra}
            label="Recebo antecipado (todas as parcelas no prazo da antecipação)" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Input label="Antecipação (% ao mês)" inputMode="decimal" placeholder="não informada" suffix="%"
              value={antecipacao} disabled={!administra}
              onChange={(e) => setAntecipacao(e.target.value)} />
          </div>
          {antecipado && !antecipacao.trim() && (
            <span className="text-caption text-warning max-w-[80ch]">
              Sem a taxa de antecipação, as vendas no crédito entram sem esse custo, e cada uma avisa que ela falta.
            </span>
          )}
        </div>

        {administra ? (
          <div className="flex flex-wrap gap-3">
            {vinculo.ativo ? (
              <>
                <Button variant="primary" disabled={salvando} onClick={() => salvar(true)}>Salvar</Button>
                <Button variant="secondary" disabled={salvando} onClick={() => salvar(false)}>Desativar</Button>
              </>
            ) : (
              <Button variant="primary" disabled={salvando} onClick={() => salvar(true)}>Salvar e ativar</Button>
            )}
          </div>
        ) : (
          <span className="text-caption text-muted">Só quem administra a empresa ativa e configura a maquininha.</span>
        )}

        <CobrancaDaConta vinculo={vinculo} administra={administra} toast={toast} onSalvo={() => onSalvo(false)} />
        {vinculo.cobranca_ativa && <EncargosDaCobranca administra={administra} toast={toast} />}

        {administra && <PinbankConferencia vinculo={vinculo} />}
      </div>
    </Card>
  );
}

/**
 * A segunda chave da cobrança por Pix e boleto: a plataforma cadastra o código
 * da conta (EC) no `/admin`; aqui quem administra a empresa liga. A recusa vem
 * do banco com a frase (maquininha inativa, código não cadastrado).
 */
function CobrancaDaConta({
  vinculo, administra, toast, onSalvo,
}: {
  vinculo: VinculoTela;
  administra: boolean;
  toast: (s: string) => void;
  onSalvo: () => Promise<void>;
}) {
  const [salvando, setSalvando] = React.useState(false);
  const pendencia = !vinculo.ativo
    ? "Ative a maquininha antes de ligar a cobrança."
    : vinculo.codigo_cliente == null
      ? "O código da conta Pinbank desta empresa ainda não foi cadastrado pela plataforma."
      : null;

  async function alternar(ativa: boolean) {
    setSalvando(true);
    try {
      await configurarCobranca({ id: vinculo.id, ativa });
      toast(ativa ? "Cobrança por Pix e boleto ligada. Os botões aparecem na baixa dos títulos a receber." : "Cobrança por Pix e boleto desligada.");
      await onSalvo();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="a4p-label text-muted">Cobrança por Pix e boleto</span>
      <Switch checked={vinculo.cobranca_ativa} onChange={alternar}
        disabled={!administra || salvando || (!vinculo.cobranca_ativa && pendencia != null)}
        label="Cobrar títulos a receber por Pix e boleto pela conta Pinbank" />
      {!vinculo.cobranca_ativa && pendencia && (
        <span className="text-caption text-muted max-w-[80ch]">{pendencia}</span>
      )}
    </div>
  );
}

/** "2,5" → 2.5; vazio → NaN (o campo obrigatório reprova; o opcional vira null). */
function numeroDigitado(v: string): number {
  const t = v.trim().replace(/\./g, "").replace(",", ".");
  return t === "" ? NaN : Number(t);
}
const comVirgula = (n: number) => String(n).replace(".", ",");

/**
 * MULTA E JUROS DO BOLETO (30/10/2026, pedido do dono): a regra da empresa.
 * Só quem administra muda; o banco confere a faixa de novo. O exemplo embaixo
 * sai da MESMA conta que a página do link usa (`encargosDaFatura`).
 */
function EncargosDaCobranca({ administra, toast }: { administra: boolean; toast: (s: string) => void }) {
  const [carregado, setCarregado] = React.useState(false);
  const [gravada, setGravada] = React.useState<RegraEncargos | null>(null);
  const [multa, setMulta] = React.useState(comVirgula(REGRA_PADRAO.multaPct));
  const [juros, setJuros] = React.useState(comVirgula(REGRA_PADRAO.jurosMesPct));
  const [carencia, setCarencia] = React.useState("0");
  const [aceitarAte, setAceitarAte] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    lerEncargos()
      .then((r) => {
        if (!vivo) return;
        setGravada(r);
        if (r) {
          setMulta(comVirgula(r.multaPct));
          setJuros(comVirgula(r.jurosMesPct));
          setCarencia(String(r.carenciaDias));
          setAceitarAte(r.aceitarAteDias === null ? "" : String(r.aceitarAteDias));
        }
      })
      .catch(() => undefined)
      .finally(() => vivo && setCarregado(true));
    return () => { vivo = false; };
  }, []);

  const regra: RegraEncargos = {
    multaPct: numeroDigitado(multa),
    jurosMesPct: numeroDigitado(juros),
    carenciaDias: numeroDigitado(carencia),
    aceitarAteDias: aceitarAte.trim() === "" ? null : numeroDigitado(aceitarAte),
  };
  const problemas = problemasDaRegra(regra);
  const avisos = problemas.length ? [] : avisosDaRegra(regra);
  const exemplo = problemas.length ? null : encargosDaFatura(1000, "2026-01-10", "2026-01-20", regra);

  async function salvar() {
    setSalvando(true);
    try {
      await definirEncargos(regra);
      setGravada(regra);
      toast("Multa e juros salvos. Valem para os boletos emitidos daqui em diante.");
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  if (!carregado) return null;
  const travado = !administra || salvando;
  return (
    <div className="flex flex-col gap-3" aria-label="Multa e juros do boleto">
      <span className="a4p-label text-muted">Multa e juros do boleto</span>
      <span className="text-caption text-muted max-w-[80ch]">
        {gravada
          ? "Cobrados pelo banco quando o cliente paga o boleto depois do vencimento. O Pix tem valor fixo e não leva encargo."
          : "Ainda sem regra: o boleto sai sem multa e sem juros. Os valores abaixo são o padrão permitido para consumidor."}
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Input label="Multa" suffix="%" inputMode="decimal" value={multa} onChange={(e) => setMulta(e.target.value)} disabled={travado} />
        <Input label="Juros ao mês" suffix="%" inputMode="decimal" value={juros} onChange={(e) => setJuros(e.target.value)} disabled={travado} />
        <Input label="Cobrar a partir de" suffix="dias" inputMode="numeric" value={carencia} onChange={(e) => setCarencia(e.target.value)} disabled={travado} />
        <Input label="Aceitar pagamento até" suffix="dias" inputMode="numeric" placeholder="Sem limite" value={aceitarAte} onChange={(e) => setAceitarAte(e.target.value)} disabled={travado} />
      </div>
      <span className="text-caption text-muted max-w-[80ch]">
        “Cobrar a partir de” é a tolerância depois do vencimento (0 = no dia seguinte). “Aceitar pagamento até” é quantos dias depois do vencimento o boleto ainda pode ser pago.
      </span>
      {problemas.map((p) => <span key={p} className="text-caption text-negative">{p}</span>)}
      {avisos.map((a) => <span key={a} className="text-caption text-warning">{a}</span>)}
      {exemplo && (
        <span className="text-caption text-ink max-w-[80ch]">
          Exemplo: um boleto de {formatBRL(1000)} pago 10 dias depois do vencimento fica em{" "}
          <span className="tabular-nums">{formatBRL(exemplo.total)}</span>
          {exemplo.total > 1000 ? ` (multa de ${formatBRL(exemplo.multa)} e juros de ${formatBRL(exemplo.juros)})` : " (dentro da tolerância, sem encargo)"}
          {exemplo.expirada ? ", mas já passou do prazo que a empresa aceita." : "."}
        </span>
      )}
      {administra ? (
        <div><Button variant="secondary" disabled={salvando || problemas.length > 0} onClick={salvar}>Salvar multa e juros</Button></div>
      ) : (
        <span className="text-caption text-muted">Só quem administra a empresa muda a multa e os juros.</span>
      )}
    </div>
  );
}
