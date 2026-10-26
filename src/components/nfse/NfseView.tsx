"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, BRL, Button, Input, Select, CurrencyInput, Checkbox, InfoHint } from "@/components/ui";
import { formatBRL } from "@/lib/format";
import { useToast } from "@/components/listas/ListChrome";
import { listParties } from "@/lib/cadastros";
import {
  listNfse, criarNfse, transmitirNfse, enviarAoTomador, cancelarNfse, hydrateNfse, atualizarNfse,
  issDe, type Nfse, type StatusNfse,
} from "@/lib/nfse";
import type { Party } from "@/lib/types";
import { refletirCancelamentoNaVenda, refletirNotaNaVenda } from "@/lib/vendas-nf";
import { isDemo } from "@/lib/demo";

const STATUS: Record<StatusNfse, { label: string; cor: string }> = {
  rascunho: { label: "Rascunho", cor: "var(--color-muted)" },
  processando: { label: "Processando", cor: "var(--color-warning)" },
  autorizada: { label: "Autorizada", cor: "var(--color-positive)" },
  rejeitada: { label: "Rejeitada", cor: "var(--color-negative)" },
  enviada: { label: "Enviada", cor: "var(--color-positive)" },
  cancelada: { label: "Cancelada", cor: "var(--color-faint)" },
};
const SERVICOS = [
  "1.05 — Licenciamento de software", "1.07 — Suporte técnico em TI",
  "17.01 — Assessoria / consultoria", "10.02 — Agenciamento / comissão",
  "7.02 — Execução de obra / engenharia", "37.01 — Outros serviços",
];
const fmtDia = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

export function NfseView() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const parties = useQuery({ queryKey: ["parties-list"], queryFn: listParties });
  const [lista, setLista] = React.useState<Nfse[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  React.useEffect(() => { hydrateNfse().then(() => setLista(listNfse())); }, []);
  const refresh = async () => { setLista(listNfse()); await qc.invalidateQueries(); };

  const clientes = (parties.data ?? []).filter((p: Party) => p.is_customer !== false);

  // form
  const [tomadorId, setTomadorId] = React.useState("");
  const [discriminacao, setDiscriminacao] = React.useState("");
  const [codigo, setCodigo] = React.useState(SERVICOS[0]);
  const [valor, setValor] = React.useState(0);
  const [municipio, setMunicipio] = React.useState("São Paulo");
  const [iss, setIss] = React.useState(5);
  const [aguardar, setAguardar] = React.useState(false);

  const emitir = async () => {
    const t = clientes.find((c: Party) => c.id === tomadorId);
    if (!t || valor <= 0 || !discriminacao.trim()) { show("Informe tomador, discriminação e valor"); return; }
    let nf;
    try {
      nf = await criarNfse({ tomadorId, tomadorNome: t.name, discriminacao: discriminacao.trim(), codigoServico: codigo, valorServico: valor, municipio, issAliquota: iss, aguardarPagamento: aguardar });
    } catch (e) {
      // A mensagem real do banco — "tente novamente" não conserta uma recusa.
      show(`A nota não foi criada: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setTomadorId(""); setDiscriminacao(""); setValor(0);
    setLista(listNfse());
    if (aguardar) { show("NFS-e em rascunho — emitirá ao receber o pagamento"); return; }
    await transmitir(nf.id);
  };

  const transmitir = async (id: string) => {
    setBusy(id);
    setLista(listNfse().map((n) => (n.id === id ? { ...n, status: "processando" } : n)));
    try {
      const nf = await transmitirNfse(id);
      if (nf && nf.status !== "processando") await refletirNotaNaVenda(nf);
      await refresh();
      // ⚠️ Dizia "receita e ISS na DRE". O ISS NÃO entra no DRE: ele fica
      // calculado na nota (ver `refletirNaDRE`). A frase afirmava uma dedução
      // que nenhum relatório faz.
      if (nf?.status === "autorizada") show(`NFS-e ${nf.numero} autorizada — receita no DRE e recebimento em Títulos a receber`);
      else if (nf?.status === "processando") show("A nota está na prefeitura. Toque em Atualizar daqui a pouco para ver o resultado");
      else show(nf?.motivoRejeicao ?? "NFS-e rejeitada");
    } catch (e) {
      await refresh();
      show(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const atualizar = async (id: string) => {
    setBusy(id);
    try {
      const nf = await atualizarNfse(id);
      if (nf && nf.status !== "processando") await refletirNotaNaVenda(nf);
      await refresh();
      if (nf?.status === "autorizada") show(`NFS-e ${nf.numero} autorizada — receita no DRE e recebimento em Títulos a receber`);
      else if (nf?.status === "rejeitada") show(nf.motivoRejeicao ?? "A prefeitura recusou a nota");
      else show("A prefeitura ainda está processando a nota");
    } catch (e) {
      show(e instanceof Error ? e.message : String(e));
    } finally { setBusy(null); }
  };

  const enviar = async (id: string) => { await enviarAoTomador(id); setLista(listNfse()); show("Nota enviada ao tomador (reusa a Cobrança WhatsApp/e-mail)"); };
  const cancelar = async (id: string) => {
    // A nota ANTES de cancelar: o cancelamento esvazia os vínculos dela, e é
    // por eles que se acha a venda que a nota fechava.
    const antes = lista.find((n) => n.id === id);
    // Cancelar uma nota autorizada não tem volta: era um clique num "x" sem
    // pergunta nenhuma.
    if (!window.confirm(`Cancelar a NFS-e${antes?.numero ? ` nº ${antes.numero}` : ""}? O cancelamento não pode ser desfeito.`)) return;
    // A prefeitura exige o motivo do cancelamento (de 15 a 255 letras).
    let justificativa = "";
    if (!isDemo) {
      const j = window.prompt("Motivo do cancelamento (mínimo de 15 letras), como vai para a prefeitura:");
      if (j === null) return;
      justificativa = j;
    }
    try {
      await cancelarNfse(id, justificativa);
      const venda = antes ? await refletirCancelamentoNaVenda(antes) : null;
      await refresh();
      // ⚠️ Dizia "lançamentos vinculados removidos" também quando a nota era de
      // uma venda — e a receita da venda FICA (ela não nasceu da nota).
      show(venda
        ? "NFS-e cancelada — a venda volta a constar com a nota cancelada; o título a receber da venda continua"
        : "NFS-e cancelada — a receita lançada pela nota saiu de Títulos a receber");
    } catch (e) {
      show(`A nota não foi cancelada: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start pb-4">
      {/* Nova NFS-e */}
      <Card className="lg:col-span-1 flex flex-col gap-3" info={{ titulo: "Nova NFS-e", oQue: "Emite uma nota fiscal de serviço avulsa para um tomador, calculando o ISS e lançando a receita em Títulos a receber. Para a nota de uma venda já registrada, use “Emitir NF” na lista de vendas — assim a receita não é lançada duas vezes.", comoCalcula: "ISS igual ao valor do serviço vezes a alíquota informada; o líquido é o valor menos o ISS." }}>
        <span className="text-label font-medium text-muted">Nova NFS-e</span>
        <Select label="Tomador" value={tomadorId} onChange={setTomadorId} options={[{ value: "", label: "Selecione…" }, ...clientes.map((c: Party) => ({ value: c.id, label: c.name }))]} />
        <Select label="Código de serviço (LC 116)" value={codigo} onChange={setCodigo} options={SERVICOS.map((s) => ({ value: s, label: s }))} />
        <div className="flex flex-col gap-[6px]">
          <span className="text-label font-medium text-muted">Discriminação</span>
          <Input value={discriminacao} onChange={(e) => setDiscriminacao(e.target.value)} placeholder="Descrição do serviço prestado" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <CurrencyInput label="Valor do serviço" value={valor} onValueChange={setValor} />
          <div className="flex flex-col gap-[6px]">
            <span className="text-label font-medium text-muted">ISS (%)</span>
            <Input type="number" value={String(iss)} onChange={(e) => setIss(Math.max(0, Math.min(10, Number(e.target.value) || 0)))} />
          </div>
        </div>
        <Input label="Município de incidência" value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
        <div className="flex items-center justify-between text-caption">
          <span className="text-faint">ISS estimado</span>
          <span className="text-ink tabular-nums"><BRL value={Math.round(valor * (iss / 100) * 100) / 100} /> · líquido <BRL value={Math.round((valor - valor * (iss / 100)) * 100) / 100} /></span>
        </div>
        <Checkbox checked={aguardar} onChange={(e) => setAguardar(e.target.checked)} label="Aguardar pagamento para emitir" />
        <Button variant="primary" size="sm" onClick={emitir}>{aguardar ? "Salvar (emite ao pagar)" : "Emitir NFS-e"}</Button>
        <span className="text-caption text-faint">{isDemo
          ? "Na demonstração a transmissão é simulada; o estado “processando” espelha a espera da prefeitura."
          : "A nota vai à prefeitura da sua empresa com o certificado digital dela. A prefeitura calcula o ISS pelo cadastro dela; o valor acima é estimativa. Nota marcada “Teste” não tem valor fiscal."}</span>
      </Card>

      {/* Lista de notas */}
      <Card padded={false} className="lg:col-span-2">
        <div className="px-5 pt-[16px] pb-2 flex items-center justify-between">
          <span className="text-body font-medium text-ink inline-flex items-center gap-1">Notas fiscais de serviço<InfoHint align="left" titulo="Notas fiscais de serviço" oQue="Lista as NFS-e emitidas e seu andamento, da transmissão à autorização ou cancelamento." comoCalcula="Cada nota autorizada lança a receita bruta no DRE e o recebimento em Títulos a receber. O ISS fica calculado na nota: ele não vira conta a pagar nem dedução no DRE por aqui." /></span>
          <span className="text-caption text-faint">{lista.length}</span>
        </div>
        <div className="hidden md:grid grid-cols-[1.3fr_0.5fr_0.7fr_0.8fr_0.6fr_1.4fr] gap-3 px-5 py-2 text-caption text-faint border-b border-border-soft">
          <span>Tomador</span><span>Número</span><span>Competência</span><span className="text-right">Valor</span><span className="text-right">ISS</span><span>Situação</span>
        </div>
        <div className="flex flex-col max-h-[540px] overflow-y-auto">
          {lista.length === 0 ? (
            <p className="text-caption text-faint text-center py-8">Nenhuma nota emitida.</p>
          ) : lista.map((n) => (
            <div key={n.id} className="grid grid-cols-[1.3fr_0.5fr_0.7fr_0.8fr_0.6fr_1.4fr] gap-3 items-center px-5 py-3 border-t border-border-soft first:border-t-0">
              <span className="min-w-0">
                <span className="text-[14px] text-ink truncate block">{n.tomadorNome}</span>
                <span className="text-caption text-faint truncate block">{n.codigoServico.split(" — ")[0]} · {n.municipio}</span>
                {n.status === "rejeitada" && n.motivoRejeicao && <span className="text-caption text-negative truncate block" title={n.motivoRejeicao}>{n.motivoRejeicao}</span>}
                {(n.urlPdf || n.urlXml) && (
                  <span className="text-caption flex gap-2">
                    {n.urlPdf && <a href={n.urlPdf} target="_blank" rel="noopener noreferrer" className="text-muted underline hover:text-ink">PDF</a>}
                    {n.urlXml && <a href={n.urlXml} target="_blank" rel="noopener noreferrer" className="text-muted underline hover:text-ink">XML</a>}
                  </span>
                )}
              </span>
              <span className="text-caption text-muted tabular-nums">{n.numero ?? "—"}</span>
              <span className="text-caption text-muted tabular-nums">{fmtDia(n.competencia)}</span>
              <span className="text-caption text-ink tabular-nums text-right"><BRL value={n.valorServico} /></span>
              <span className="text-caption text-muted tabular-nums text-right"><BRL value={issDe(n)} /></span>
              <span className="flex items-center justify-between gap-2 min-w-0">
                <span className="flex flex-col min-w-0">
                  <span className="inline-flex items-center gap-1 text-caption whitespace-nowrap" style={{ color: STATUS[n.status].cor }}>
                    {n.status === "processando" && <span className="inline-block w-3 h-3 rounded-full border-2 border-warning/30 border-t-warning animate-spin" />}
                    {STATUS[n.status].label}
                  </span>
                  {n.ambiente === "homologacao" && <span className="text-caption text-faint whitespace-nowrap" title="Emitida no ambiente de teste da prefeitura: não tem valor fiscal">Teste</span>}
                </span>
                <span className="flex items-center gap-1 shrink-0">
                  {(n.status === "rascunho" || n.status === "rejeitada") && <button disabled={busy === n.id} onClick={() => transmitir(n.id)} className="text-caption font-medium text-on-lime bg-lime rounded-pill px-2 py-[3px]">{n.status === "rejeitada" ? "Reenviar" : "Transmitir"}</button>}
                  {n.status === "processando" && !isDemo && <button disabled={busy === n.id} onClick={() => atualizar(n.id)} className="text-caption font-medium text-ink bg-surface-2 rounded-pill px-2 py-[3px]">Atualizar</button>}
                  {n.status === "autorizada" && <button onClick={() => enviar(n.id)} className="text-caption font-medium text-ink bg-surface-2 rounded-pill px-2 py-[3px]">Enviar</button>}
                  {(n.status === "autorizada" || n.status === "enviada") && <button onClick={() => cancelar(n.id)} title="Cancelar" className="inline-flex p-[4px] rounded-md hover:bg-surface-2"><Icon name="x" size={12} color="var(--color-text-tertiary)" /></button>}
                </span>
              </span>
            </div>
          ))}
        </div>

      </Card>
      {node}
    </div>
  );
}
