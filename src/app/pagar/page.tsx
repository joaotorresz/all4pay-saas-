import type { Metadata } from "next";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { FaturaView } from "@/components/checkout/FaturaView";
import { lerLinkDePagamento, tokenDoLink } from "@/lib/checkout-leitura";
import { AvisoDoLink } from "@/components/checkout/AvisoDoLink";
import { hojeEm } from "@/core/automacoes/tempo";
import { pixAtualizadoLiberado } from "@/lib/pinbank/api";

/**
 * O LINK DE PAGAMENTO — `/pagar?t=<token>`, aberto pelo CLIENTE da empresa,
 * sem login: a FATURA no modelo da Asaas (28/10/2026) — a empresa que cobra,
 * a situação, o valor, o vencimento, o cliente e o Pix e/ou o boleto já
 * EMITIDOS pela conta Pinbank da empresa (`components/checkout/FaturaView`).
 *
 * ⚠️ Rota PÚBLICA (liberada em `src/middleware.ts`). A leitura é SÓ do
 * servidor: `pinbank_checkout_ler` executa apenas como `service_role`, depois
 * do interruptor da cobrança. A página não mexe em título. Ela só cria UMA
 * cobrança: o Pix do dia na fatura vencida (Pix atualizado, 30/10/2026,
 * `PINBANK_PIX_ATUALIZADO`), pelo botão que chama `/api/pinbank/checkout/pix`
 * — valor recalculado e conferido no banco, vale até 23:59.
 *
 * ⚠️ A baixa automática depende do webhook de liquidação da Pinbank (etapa 6).
 * Até lá, a empresa dá a baixa à mão quando o dinheiro cai.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Pagamento · Quattro",
  robots: { index: false, follow: false },
};

export default async function PagarPage({ searchParams }: { searchParams: { t?: string | string[] } }) {
  const t = tokenDoLink(searchParams.t);
  const r = await lerLinkDePagamento(t);

  let conteudo: React.ReactNode;
  if (r === "invalido") {
    conteudo = <AvisoDoLink titulo="Link inválido" texto="Este link de pagamento não existe ou foi cancelado. Peça um novo a quem o enviou." />;
  } else if (r === "fora_do_ar") {
    conteudo = <AvisoDoLink titulo="Pagamento indisponível agora" texto="Não foi possível abrir este pagamento. Tente de novo em alguns minutos." />;
  } else {
    conteudo = <FaturaView r={r} hoje={hojeEm(new Date())} token={t} pixAtualizado={pixAtualizadoLiberado()} />;
  }

  return (
    <MolduraPublica>
      <div className="ds-visor mx-auto w-full max-w-[640px] px-4 py-10">{conteudo}</div>
    </MolduraPublica>
  );
}
