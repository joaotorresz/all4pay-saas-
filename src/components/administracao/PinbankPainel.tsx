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
 */
import * as React from "react";
import Link from "next/link";
import { Card, Button, Input, Select, Switch, StatusBadge, BRL } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { useContasBancarias } from "@/components/registros/hooks";
import { usePermissoes } from "@/components/app/usePermissoes";
import {
  lerPinbank, configurarVinculo, reprocessarPinbank, SITUACOES_PENDENTES,
  type EstadoPinbank, type VinculoTela,
} from "@/lib/pinbank/cliente";
import { PRAZOS_PADRAO, type PrazosPinbank, type TaxasPinbank } from "@/core/pinbank";

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
          Na demonstração não há maquininha conectada. Em produção, cada venda, cancelamento e estorno de uma maquininha Pinbank vinculada à empresa entra sozinho como venda e contas a receber.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-col gap-3">
          <span className="a4p-label text-muted">Como funciona</span>
          <ol className="m-0 pl-5 flex flex-col gap-1 text-label text-ink">
            <li>A equipe da Quattro vincula o seu estabelecimento Pinbank a esta empresa.</li>
            <li>Quem administra a empresa escolhe a conta do repasse, informa as taxas contratadas e ativa.</li>
            <li>A partir daí, toda venda aprovada vira venda e contas a receber (por parcela, com a taxa ao lado); cancelamento e estorno desfazem o que ainda não caiu na conta.</li>
          </ol>
          <span className="text-caption text-muted max-w-[80ch]">
            As datas e as taxas são as do contrato que você informar: a Pinbank não as manda na venda. Elas aparecem em <Link className="underline" href="/contas-a-receber/titulos">Títulos a receber</Link> e na <Link className="underline" href="/dashboard/sales-invoices">lista de vendas</Link>.
          </span>
        </div>
      </Card>

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
                        <th key={h} className="py-2 pr-4 text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{h}</th>
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
      </div>
    </Card>
  );
}
