"use client";

/**
 * EXTRATO DO CONTATO em PDF — a seção da ficha (`ContatoDrawer`) e o DOCUMENTO
 * que vai ao papel.
 *
 * ⚠️ O PDF sai pela impressão do navegador, em MODO DOCUMENTO
 * (`imprimirDocumento`, lib/imprimir): só o extrato vai ao papel, nada da tela
 * que estava atrás da ficha. O documento é montado por `createPortal` direto no
 * `<body>` — dentro da ficha ele herdaria o `position: fixed` e o recorte da
 * gaveta, e sairia cortado.
 *
 * ⚠️ A IDENTIFICAÇÃO DA EMPRESA vai no topo (razão social e CNPJ). Um extrato
 * sem quem o emite é uma tabela de números; o cliente que o recebe precisa
 * saber de quem é a cobrança. Sem CNPJ cadastrado, o documento DIZ isso em vez
 * de sair com o campo em branco.
 *
 * Os números saem de `core/extrato-contato`, que fecha por construção e é
 * conferido pela guarda.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Button, BRL, DateField, Icon } from "@/components/ui";
import { loadCompany, getOrganizationName } from "@/lib/company";
import { imprimirDocumento } from "@/lib/imprimir";
import { dataBR } from "@/lib/format";
import {
  montarExtratoContato, ladoPadrao, ROTULO_SITUACAO,
  type LadoExtrato, type ExtratoContato as Extrato,
} from "@/core/extrato-contato";
import type { RiskInput } from "@/core/risk-engine/types";

const primeiroDoMes = (iso: string, mesesAtras: number) => {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(a, m - 1 - mesesAtras, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const fimDoMesSeguinte = (iso: string) => {
  const [a, m] = iso.split("-").map(Number);
  const d = new Date(a, m + 1, 0); // dia 0 do mês m+2 (base 1) = último dia do mês seguinte
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function useEmpresa(): { nome: string | null; cnpj: string | null } {
  const [e, setE] = React.useState<{ nome: string | null; cnpj: string | null }>({ nome: null, cnpj: null });
  React.useEffect(() => {
    const db = loadCompany()?.db;
    const razao = typeof db?.razaoSocial === "string" ? db.razaoSocial.trim() : "";
    const cnpj = typeof db?.cnpj === "string" && db.cnpj.trim() ? db.cnpj.trim() : null;
    if (razao) { setE({ nome: razao, cnpj }); return; }
    let vivo = true;
    void getOrganizationName().then((n) => { if (vivo) setE({ nome: n || null, cnpj }); }).catch(() => undefined);
    setE({ nome: null, cnpj });
    return () => { vivo = false; };
  }, []);
  return e;
}

export function SecaoExtrato({
  input, partyId, ehCliente, ehFornecedor,
}: { input: RiskInput; partyId: string; ehCliente: boolean; ehFornecedor: boolean }) {
  const [lado, setLado] = React.useState<LadoExtrato>(() => ladoPadrao(input, partyId));
  const [de, setDe] = React.useState(() => primeiroDoMes(input.hoje, 2));
  // ⚠️ O período padrão VAI ATÉ O FIM DO MÊS SEGUINTE, não até hoje: o extrato
  // é o que se manda a quem pergunta "o que eu devo", e a conta que vence
  // semana que vem é parte da resposta. Com "até hoje", o título a vencer
  // ficava fora do documento inteiro — e o extrato dizia "nada em aberto" a
  // um cliente com fatura emitida. O vencido continua medido até HOJE.
  const [ate, setAte] = React.useState(() => fimDoMesSeguinte(input.hoje));
  const [imprimindo, setImprimindo] = React.useState(false);
  React.useEffect(() => { setLado(ladoPadrao(input, partyId)); }, [input, partyId]);

  const extrato = React.useMemo(
    () => montarExtratoContato(input, partyId, lado, de, ate),
    [input, partyId, lado, de, ate],
  );

  // O documento é montado ANTES da impressão e desmontado depois dela — sem
  // isso o `window.print()` rodaria antes de o portal existir no DOM.
  React.useEffect(() => {
    if (!imprimindo) return;
    const fim = () => setImprimindo(false);
    window.addEventListener("afterprint", fim);
    const t = requestAnimationFrame(() => imprimirDocumento());
    return () => { cancelAnimationFrame(t); window.removeEventListener("afterprint", fim); };
  }, [imprimindo]);

  const ambos = ehCliente && ehFornecedor;
  return (
    <section className="flex flex-col gap-2" data-secao-extrato>
      <div className="text-[11px] font-semibold tracking-wide text-faint">Extrato em PDF</div>
      {ambos && (
        <div className="flex gap-1" role="tablist" aria-label="Lado do extrato">
          {(["receber", "pagar"] as LadoExtrato[]).map((l) => (
            <button
              key={l} type="button" role="tab" aria-selected={lado === l} onClick={() => setLado(l)}
              className={`rounded-pill px-3 py-1 text-caption ${lado === l ? "bg-ink text-white" : "bg-surface-2 text-muted"}`}
            >
              {l === "receber" ? "Como cliente" : "Como fornecedor"}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2">
        <DateField label="De" value={de} onChange={setDe} />
        <DateField label="Até" value={ate} onChange={setAte} />
      </div>
      {extrato.problema ? (
        <p className="m-0 text-caption text-negative" role="alert">{extrato.problema}</p>
      ) : (
        <div className="rounded-card bg-surface-1 p-3 grid grid-cols-2 gap-x-3 gap-y-1 text-caption" data-previa-extrato>
          <span className="text-muted">Saldo anterior</span><span className="text-right tabular-nums text-ink"><BRL value={extrato.saldoAnterior} /></span>
          <span className="text-muted">Lançado no período</span><span className="text-right tabular-nums text-ink"><BRL value={extrato.lancado} /></span>
          <span className="text-muted">{lado === "receber" ? "Recebido" : "Pago"}</span><span className="text-right tabular-nums text-ink">−<BRL value={extrato.quitado} /></span>
          <span className="text-ink font-medium">Em aberto (vence até {dataBR(ate)})</span><span className="text-right tabular-nums text-ink font-medium" data-extrato-final><BRL value={extrato.saldoFinal} /></span>
          <span className="text-muted">Desse total, vencido</span><span className="text-right tabular-nums text-ink" data-extrato-vencido><BRL value={extrato.vencido} /></span>
        </div>
      )}
      <Button variant="outline" disabled={!!extrato.problema} onClick={() => setImprimindo(true)}>
        <Icon name="file-text" size={15} color="currentColor" />
        Gerar extrato (PDF)
      </Button>
      {imprimindo && typeof document !== "undefined" && createPortal(<DocumentoExtrato extrato={extrato} />, document.body)}
    </section>
  );
}

function DocumentoExtrato({ extrato: e }: { extrato: Extrato }) {
  const empresa = useEmpresa();
  const rot = ROTULO_SITUACAO[e.lado];
  const gerado = React.useMemo(() => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }, []);
  return (
    <div data-documento-impressao className="bg-white text-ink p-2" aria-hidden>
      <div className="flex justify-between gap-6 border-b border-border pb-3 mb-4">
        <div>
          <div className="text-h3 font-semibold">{empresa.nome ?? "Empresa sem razão social cadastrada"}</div>
          <div className="text-caption text-muted tabular-nums">
            {empresa.cnpj ? `CNPJ ${empresa.cnpj}` : "CNPJ não cadastrado (Administração → Dados da empresa)"}
          </div>
        </div>
        <div className="text-right text-caption text-muted">
          <div className="text-label text-ink font-medium">Extrato {e.lado === "receber" ? "do cliente" : "do fornecedor"}</div>
          <div>{e.contato}</div>
          <div className="tabular-nums">Período: {dataBR(e.de)} a {dataBR(e.ate)}</div>
          <div className="tabular-nums">Gerado em {gerado} · Quattro</div>
        </div>
      </div>

      <table className="w-full border-collapse text-caption">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2">Descrição</th>
            <th className="text-left py-2">Documento</th>
            <th className="text-left py-2">Vencimento</th>
            <th className="text-left py-2">{e.lado === "receber" ? "Recebimento" : "Pagamento"}</th>
            <th className="text-left py-2">Situação</th>
            <th className="text-right py-2">Valor</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-border-soft">
            <td className="py-2" colSpan={5}>Saldo anterior em aberto (vencido antes de {dataBR(e.de)})</td>
            <td className="py-2 text-right tabular-nums"><BRL value={e.saldoAnterior} /></td>
          </tr>
          {e.linhas.map((l) => (
            <tr key={l.id} className="border-b border-border-soft">
              <td className="py-2">{l.descricao}</td>
              <td className="py-2 tabular-nums">{l.documento ?? "—"}</td>
              <td className="py-2 tabular-nums">{dataBR(l.vencimento)}</td>
              <td className="py-2 tabular-nums">{l.pagamento ? dataBR(l.pagamento) : "—"}</td>
              <td className="py-2">{rot[l.situacao]}</td>
              <td className="py-2 text-right tabular-nums"><BRL value={l.valor} /></td>
            </tr>
          ))}
          {e.linhas.length === 0 && (
            <tr><td className="py-2 text-muted" colSpan={6}>Nenhum título com vencimento no período.</td></tr>
          )}
        </tbody>
      </table>

      <div className="mt-4 ml-auto max-w-[320px] grid grid-cols-2 gap-y-1 text-caption">
        <span>Saldo anterior</span><span className="text-right tabular-nums"><BRL value={e.saldoAnterior} /></span>
        <span>Lançado no período</span><span className="text-right tabular-nums"><BRL value={e.lancado} /></span>
        <span>{e.lado === "receber" ? "Recebido" : "Pago"}</span><span className="text-right tabular-nums">−<BRL value={e.quitado} /></span>
        <span className="font-semibold border-t border-border pt-1">Total em aberto</span>
        <span className="font-semibold border-t border-border pt-1 text-right tabular-nums"><BRL value={e.emAberto} /></span>
        <span>Desse total, vencido em {dataBR(e.referencia)}</span><span className="text-right tabular-nums"><BRL value={e.vencido} /></span>
      </div>
    </div>
  );
}
