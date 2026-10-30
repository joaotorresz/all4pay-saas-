import * as React from "react";
import { BRL } from "@/components/ui";
import { dataBR } from "@/lib/format";
import { itfParaSVG } from "@/lib/itf";
import { linhaDigitavelLegivel } from "@/core/pinbank/cobranca";
import { codigoDeBarrasDaLinha, nomeDoBanco } from "@/core/compras/boleto";
import { documentoLegivel, type Credor } from "@/core/cobranca";

/**
 * O BOLETO PARA VER, ESCANEAR E IMPRIMIR (30/10/2026, pedido do dono: "como a
 * Asaas"). Desenhado a partir da LINHA DIGITÁVEL que a Pinbank devolveu —
 * nenhum dado novo: o código de barras sai da linha por reposição de campos
 * (`codigoDeBarrasDaLinha`), e o desenho é o ITF da FEBRABAN (`lib/itf`).
 *
 * ⚠️ O código de barras só aparece quando a linha tem 47 dígitos (boleto
 * bancário). Linha que não fecha não vira código: um código errado seria lido
 * pelo app do banco como outro boleto.
 */
export function BoletoImpresso({
  credor,
  pagador,
  valor,
  vencimento,
  linhaDigitavel,
  descricao,
}: {
  credor: Credor;
  pagador: string | null;
  valor: number;
  vencimento: string;
  linhaDigitavel: string;
  descricao: string | null;
}) {
  const linha = linhaDigitavel.replace(/\D/g, "");
  const barras = linha.length === 47 ? codigoDeBarrasDaLinha(linha) : null;
  const svg = barras ? itfParaSVG(barras, { altura: 50 }) : "";
  const banco = linha.slice(0, 3);
  const doc = documentoLegivel(credor.documento);

  const Campo = ({ rotulo, children, className = "" }: { rotulo: string; children: React.ReactNode; className?: string }) => (
    <div className={`flex flex-col gap-0.5 border-t border-border p-2 ${className}`}>
      <span className="text-caption text-muted">{rotulo}</span>
      <span className="text-body text-ink">{children}</span>
    </div>
  );

  return (
    <div className="a4p-boleto rounded-md border border-border bg-white" aria-label="Boleto">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 p-2">
        <span className="text-label text-ink font-medium">{nomeDoBanco(banco) ?? `Banco ${banco}`}</span>
        <span className="text-label text-ink tabular-nums">{banco}</span>
        <span className="text-label text-ink tabular-nums break-all">{linhaDigitavelLegivel(linha)}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px]">
        <Campo rotulo="Local de pagamento">Pagável em qualquer banco ou app de banco até o vencimento</Campo>
        <Campo rotulo="Vencimento" className="sm:border-l"><span className="tabular-nums">{dataBR(vencimento)}</span></Campo>
        <Campo rotulo="Beneficiário">{[credor.razaoSocial || credor.nome, doc].filter(Boolean).join(" · ")}</Campo>
        <Campo rotulo="Valor do documento" className="sm:border-l"><span className="tabular-nums"><BRL value={valor} /></span></Campo>
        <Campo rotulo="Pagador">{pagador || "—"}</Campo>
        <Campo rotulo="Instruções" className="sm:border-l">{descricao || "Não receber após o vencimento sem consultar o beneficiário."}</Campo>
      </div>
      {svg ? (
        <div className="border-t border-border p-3" dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <p className="border-t border-border p-3 text-caption text-muted">Use a linha digitável acima para pagar.</p>
      )}
    </div>
  );
}
