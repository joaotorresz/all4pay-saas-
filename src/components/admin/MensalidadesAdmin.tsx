"use client";

/**
 * MENSALIDADES DO ERP — em Administração › Cobrança. A plataforma gera a fatura
 * do mês de uma empresa, acompanha se o Pix ou o boleto já saiu e, conferido o
 * recebimento no extrato da conta Pinbank da Quattro, DÁ BAIXA — o que renova a
 * assinatura por mais um mês a partir do fim do período.
 *
 * ⚠️ A baixa e o cancelamento não têm desfazer (a baixa já moveu o prazo do
 * cliente; o cancelamento perdoa dinheiro): os dois pedem confirmação, e o
 * cancelamento, o motivo. Quem decide é o banco (`admin_mensalidade_*`).
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BRL, Button, Card, CurrencyInput, DateField, Input, Select, Skeleton, StatusBadge } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { dataBR } from "@/lib/format";
import {
  baixarMensalidade, cancelarMensalidade, gerarMensalidade, getAdminOrgs, getMensalidades,
  type MensalidadeFatura, type SituacaoMensalidade,
} from "@/lib/admin";

const NOME: Record<SituacaoMensalidade, string> = { aberta: "Em aberto", paga: "Paga", cancelada: "Cancelada" };
const TOM: Record<SituacaoMensalidade, "warning" | "positive" | "neutral"> = { aberta: "warning", paga: "positive", cancelada: "neutral" };
const COBRANCA: Record<string, string> = { reservada: "gerando", emitida: "emitido", falhou: "recusado", incerta: "não confirmado", cancelada: "cancelado" };

const mesAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const mesDe = (c: string) => `${c.slice(5, 7)}/${c.slice(0, 4)}`;

export function MensalidadesAdmin() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const faturas = useQuery({ queryKey: ["admin-mensalidades"], queryFn: getMensalidades });
  const orgs = useQuery({ queryKey: ["admin-orgs"], queryFn: getAdminOrgs });

  const [org, setOrg] = React.useState("");
  const [mes, setMes] = React.useState(mesAtual);
  const [valor, setValor] = React.useState(0);
  const [vencimento, setVencimento] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [acao, setAcao] = React.useState<{ id: string; tipo: "baixa" | "cancelar" } | null>(null);
  const [motivo, setMotivo] = React.useState("");

  const recarregar = async () => {
    await qc.invalidateQueries({ queryKey: ["admin-mensalidades"] });
    await qc.invalidateQueries({ queryKey: ["admin-orgs"] });
  };

  const gerar = async () => {
    if (!org) return show("Escolha a empresa.");
    if (!/^\d{4}-\d{2}$/.test(mes)) return show("Informe o mês como AAAA-MM.");
    setEnviando(true);
    try {
      await gerarMensalidade(org, `${mes}-01`, valor || null, vencimento || null);
      show("Fatura gerada. A empresa já pode pagar em Assinatura e plano.");
      setValor(0);
      setVencimento("");
      await recarregar();
    } catch (e) {
      show(e instanceof Error ? e.message : "Não foi possível gerar a fatura.");
    } finally {
      setEnviando(false);
    }
  };

  const confirmar = async (f: MensalidadeFatura) => {
    if (!acao) return;
    setEnviando(true);
    try {
      if (acao.tipo === "baixa") {
        const ate = await baixarMensalidade(f.id, motivo);
        show(`Baixa feita. ${f.empresa} tem acesso até ${dataBR(ate)}.`);
      } else {
        await cancelarMensalidade(f.id, motivo);
        show("Fatura cancelada.");
      }
      setAcao(null);
      setMotivo("");
      await recarregar();
    } catch (e) {
      show(e instanceof Error ? e.message : "Não foi possível concluir.");
    } finally {
      setEnviando(false);
    }
  };

  const opcoes = (orgs.data ?? [])
    .slice()
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
    .map((o) => ({ value: o.orgId, label: o.nome }));

  return (
    <Card
      padded={false}
      info={{
        titulo: "Mensalidades do ERP",
        oQue: "A fatura mensal de cada empresa, paga por Pix ou boleto na conta Pinbank da Quattro.",
        comoCalcula: "Sem valor informado, a fatura usa o valor da assinatura e, sem ele, o preço do plano. A baixa renova o acesso por um mês a partir do fim do período (ou de hoje, se já venceu).",
      }}
    >
      <div className="px-5 py-3 border-b border-border-soft text-label font-medium text-muted">Mensalidades do ERP</div>

      <div className="px-5 py-4 border-b border-border-soft grid grid-cols-1 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 sm:items-end">
        <Select label="Empresa" value={org} onChange={(v) => setOrg(v)} options={opcoes} placeholder="Escolha a empresa" />
        <Input label="Mês" value={mes} onChange={(e) => setMes(e.target.value)} placeholder="AAAA-MM" inputMode="numeric" />
        <CurrencyInput label="Valor (opcional)" value={valor} onValueChange={setValor} />
        <DateField label="Vencimento (opcional)" value={vencimento} onChange={setVencimento} />
        <Button onClick={() => void gerar()} disabled={enviando}>{enviando && !acao ? "Gerando…" : "Gerar fatura"}</Button>
      </div>

      {faturas.isLoading ? (
        <div className="p-5"><Skeleton className="h-24 w-full" /></div>
      ) : faturas.isError ? (
        <div className="px-5 py-4 text-caption text-muted">
          Não foi possível ler as faturas. {faturas.error instanceof Error ? faturas.error.message : ""}
        </div>
      ) : (faturas.data ?? []).length === 0 ? (
        <div className="px-5 py-4 text-caption text-muted">Nenhuma fatura gerada ainda.</div>
      ) : (
        <>
          <div className="hidden sm:grid grid-cols-[2fr_0.8fr_1fr_1fr_1.2fr_1.6fr] gap-3 px-5 py-2 text-[11px] font-medium text-faint border-b border-border-soft">
            <span>Empresa</span><span>Mês</span><span className="text-right">Valor</span><span>Vencimento</span><span>Situação</span><span />
          </div>
          {(faturas.data ?? []).map((f, i) => (
            <div key={f.id} className={`px-5 py-3 flex flex-col gap-3 ${i ? "border-t border-border-soft" : ""}`}>
              <div className="grid grid-cols-1 sm:grid-cols-[2fr_0.8fr_1fr_1fr_1.2fr_1.6fr] gap-3 sm:items-center">
                <span className="text-[14px] text-ink truncate">{f.empresa}</span>
                <span className="text-caption text-muted tabular-nums">{mesDe(f.competencia)}</span>
                <span className="text-label text-ink tabular-nums sm:text-right"><BRL value={f.valor} /></span>
                <span className="text-caption text-muted tabular-nums">{dataBR(f.vencimento)}</span>
                <span className="flex flex-col gap-1">
                  <StatusBadge tone={TOM[f.situacao]}>{NOME[f.situacao]}</StatusBadge>
                  <span className="text-caption text-faint">
                    {f.situacao === "paga" && f.acessoAte
                      ? <>acesso até <span className="tabular-nums">{dataBR(f.acessoAte)}</span></>
                      : [f.pix && `Pix ${COBRANCA[f.pix] ?? f.pix}`, f.boleto && `boleto ${COBRANCA[f.boleto] ?? f.boleto}`].filter(Boolean).join(" · ") || (f.situacao === "aberta" ? "nenhum Pix ou boleto ainda" : f.motivo ?? "")}
                  </span>
                </span>
                <span className="flex gap-2 sm:justify-end flex-wrap">
                  {f.situacao === "aberta" && (
                    <>
                      <Button variant="secondary" onClick={() => { setAcao({ id: f.id, tipo: "baixa" }); setMotivo(""); }}>Dar baixa</Button>
                      <Button variant="ghost" onClick={() => { setAcao({ id: f.id, tipo: "cancelar" }); setMotivo(""); }}>Cancelar</Button>
                    </>
                  )}
                </span>
              </div>
              {acao?.id === f.id && (
                <div className="flex flex-col gap-2 rounded-md bg-surface-1 p-4">
                  <span className="text-caption text-muted leading-[1.5]">
                    {acao.tipo === "baixa"
                      ? "Confirme só depois de ver o dinheiro no extrato da conta Pinbank da Quattro. A baixa renova o acesso da empresa por um mês e não se desfaz."
                      : "Cancelar perdoa esta fatura. Um Pix ou boleto já emitido continua pagável na Pinbank até o vencimento; se for pago, gere outra fatura e dê baixa."}
                  </span>
                  <Input
                    label={acao.tipo === "baixa" ? "Como foi conferido (opcional)" : "Motivo do cancelamento"}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder={acao.tipo === "baixa" ? "Ex.: Pix conferido no extrato de 05/11" : "Ex.: cortesia de lançamento"}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button variant="ghost" onClick={() => setAcao(null)} disabled={enviando}>Voltar</Button>
                    <Button onClick={() => void confirmar(f)} disabled={enviando}>
                      {enviando ? "Salvando…" : acao.tipo === "baixa" ? "Confirmar baixa" : "Cancelar fatura"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {node}
    </Card>
  );
}
