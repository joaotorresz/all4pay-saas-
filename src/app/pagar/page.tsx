import type { Metadata } from "next";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { FaturaView, type LeituraFatura } from "@/components/checkout/FaturaView";
import { createAdmin } from "@/lib/supabase/admin";
import { cobrancaPinbankLiberada } from "@/lib/pinbank/api";
import { hojeEm } from "@/core/automacoes/tempo";

/**
 * O LINK DE PAGAMENTO — `/pagar?t=<token>`, aberto pelo CLIENTE da empresa,
 * sem login: a FATURA no modelo da Asaas (28/10/2026) — a empresa que cobra,
 * a situação, o valor, o vencimento, o cliente e o Pix e/ou o boleto já
 * EMITIDOS pela conta Pinbank da empresa (`components/checkout/FaturaView`).
 *
 * ⚠️ Rota PÚBLICA (liberada em `src/middleware.ts`). A leitura é SÓ do
 * servidor: `pinbank_checkout_ler` executa apenas como `service_role`, depois
 * do interruptor da cobrança. A página não cria cobrança nem mexe em título —
 * só mostra o que a empresa emitiu.
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

type Leitura = LeituraFatura;

const TOKEN = /^[0-9a-f]{64}$/;

async function ler(token: string): Promise<Leitura | "invalido" | "fora_do_ar"> {
  if (!TOKEN.test(token)) return "invalido";
  if (!cobrancaPinbankLiberada().liberada) return "fora_do_ar";
  const admin = createAdmin();
  if (!admin) return "fora_do_ar";
  const { data, error } = await admin.rpc("pinbank_checkout_ler", { p_token: token });
  if (error) return "fora_do_ar";
  if (!data) return "invalido";
  return data as Leitura;
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col gap-2 text-center">
      <h1 className="text-h2 text-ink">{titulo}</h1>
      <p className="text-body text-muted leading-[1.5]">{texto}</p>
    </div>
  );
}

export default async function PagarPage({ searchParams }: { searchParams: { t?: string | string[] } }) {
  const t = typeof searchParams.t === "string" ? searchParams.t.trim().toLowerCase() : "";
  const r = await ler(t);

  let conteudo: React.ReactNode;
  if (r === "invalido") {
    conteudo = <Aviso titulo="Link inválido" texto="Este link de pagamento não existe ou foi cancelado. Peça um novo a quem o enviou." />;
  } else if (r === "fora_do_ar") {
    conteudo = <Aviso titulo="Pagamento indisponível agora" texto="Não foi possível abrir este pagamento. Tente de novo em alguns minutos." />;
  } else {
    conteudo = <FaturaView r={r} hoje={hojeEm(new Date())} />;
  }

  return (
    <MolduraPublica>
      <div className="ds-visor mx-auto w-full max-w-[640px] px-4 py-10">{conteudo}</div>
    </MolduraPublica>
  );
}
