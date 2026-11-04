import type { Metadata } from "next";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { AvisoDoLink } from "@/components/checkout/AvisoDoLink";
import { BoletoImpresso } from "@/components/checkout/BoletoImpresso";
import { ImprimirBoleto } from "@/components/checkout/ImprimirBoleto";
import { lerLinkDePagamento, tokenDoLink } from "@/lib/checkout-leitura";
import { credorDoCadastro } from "@/core/cobranca";

/**
 * O BOLETO DO LINK DE PAGAMENTO — `/pagar/boleto?t=<token>` (30/10/2026): o
 * "Visualizar" e o "Imprimir" da fatura, como na Asaas. Mesma leitura e mesmo
 * portão de `/pagar` (`lib/checkout-leitura`); só desenha o boleto que a
 * empresa já emitiu.
 *
 * ⚠️ Rota PÚBLICA (liberada em `src/middleware.ts`, junto de `/pagar`).
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Boleto · Quattro",
  robots: { index: false, follow: false },
};

export default async function BoletoPage({ searchParams }: { searchParams: { t?: string | string[]; imprimir?: string } }) {
  const t = tokenDoLink(searchParams.t);
  const r = await lerLinkDePagamento(t);

  let conteudo: React.ReactNode;
  if (r === "invalido") {
    conteudo = <AvisoDoLink titulo="Link inválido" texto="Este link de pagamento não existe ou foi cancelado. Peça um novo a quem o enviou." />;
  } else if (r === "fora_do_ar") {
    conteudo = <AvisoDoLink titulo="Boleto indisponível agora" texto="Não foi possível abrir este boleto. Tente de novo em alguns minutos." />;
  } else {
    const boleto = r.situacao === "aberto" ? r.cobrancas.find((x) => x.tipo === "boleto" && x.linhaDigitavel) : undefined;
    conteudo = boleto?.linhaDigitavel ? (
      <div className="flex flex-col gap-4">
        <ImprimirBoleto automatico={searchParams.imprimir === "1"} />
        <BoletoImpresso
          credor={credorDoCadastro(r.empresa, r.credor ?? null)}
          pagador={r.comprador?.nome ?? null}
          valor={boleto.valor}
          vencimento={boleto.vencimento}
          linhaDigitavel={boleto.linhaDigitavel}
          descricao={r.descricao}
        />
      </div>
    ) : (
      <AvisoDoLink titulo="Sem boleto para pagar" texto="Esta cobrança não tem boleto em aberto. Volte ao link de pagamento para ver as outras formas." />
    );
  }

  return (
    <MolduraPublica>
      <div className="ds-visor mx-auto w-full max-w-[860px] px-4 py-10">{conteudo}</div>
    </MolduraPublica>
  );
}
