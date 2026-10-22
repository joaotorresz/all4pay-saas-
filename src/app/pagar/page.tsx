import type { Metadata } from "next";
import { MolduraPublica } from "@/components/app/MolduraPublica";
import { CopiarTexto } from "@/components/checkout/CopiarTexto";
import { BRL } from "@/components/ui";
import { createAdmin } from "@/lib/supabase/admin";
import { cobrancaPinbankLiberada } from "@/lib/pinbank/api";
import { gerarQR, qrParaSVG } from "@/lib/qrcode";
import { dataBR } from "@/lib/format";
import { linhaDigitavelLegivel } from "@/core/pinbank/cobranca";

/**
 * O LINK DE PAGAMENTO — `/pagar?t=<token>`, aberto pelo CLIENTE da empresa,
 * sem login: o valor, o vencimento e o Pix e/ou o boleto já EMITIDOS pela conta
 * Pinbank da empresa (etapa 4 de `docs/rodada-10/cobranca.md`, MVP).
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

type CobrancaLink = {
  tipo: "pix" | "boleto";
  valor: number;
  vencimento: string;
  textoQrCode: string | null;
  linhaDigitavel: string | null;
};
type Leitura = {
  situacao: "aberto" | "pago" | "indisponivel";
  empresa: string | null;
  descricao: string | null;
  valor: number;
  vencimento: string | null;
  cobrancas: CobrancaLink[];
};

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

function qrSvg(texto: string): string {
  try {
    return qrParaSVG(gerarQR(texto), 240, undefined, "QR code do Pix");
  } catch {
    return "";
  }
}

export default async function PagarPage({ searchParams }: { searchParams: { t?: string | string[] } }) {
  const t = typeof searchParams.t === "string" ? searchParams.t.trim().toLowerCase() : "";
  const r = await ler(t);

  let conteudo: React.ReactNode;
  if (r === "invalido") {
    conteudo = <Aviso titulo="Link inválido" texto="Este link de pagamento não existe ou foi cancelado. Peça um novo a quem o enviou." />;
  } else if (r === "fora_do_ar") {
    conteudo = <Aviso titulo="Pagamento indisponível agora" texto="Não foi possível abrir este pagamento. Tente de novo em alguns minutos." />;
  } else if (r.situacao === "pago") {
    conteudo = <Aviso titulo="Pagamento recebido" texto={`${r.empresa ?? "A empresa"} já registrou o recebimento deste valor. Não é preciso pagar de novo.`} />;
  } else if (r.situacao === "indisponivel") {
    conteudo = <Aviso titulo="Pagamento indisponível" texto={`Esta cobrança mudou ou foi cancelada. Fale com ${r.empresa ?? "a empresa"} para receber o link atualizado.`} />;
  } else {
    const pix = r.cobrancas.find((c) => c.tipo === "pix" && c.textoQrCode);
    const boleto = r.cobrancas.find((c) => c.tipo === "boleto" && c.linhaDigitavel);
    const svg = pix?.textoQrCode ? qrSvg(pix.textoQrCode) : "";
    conteudo = (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <span className="text-caption text-muted">{r.empresa ?? "Pagamento"}</span>
          <span className="text-h1 text-ink tabular-nums"><BRL value={r.valor} /></span>
          {r.vencimento && <span className="text-label text-muted">Vence em <span className="tabular-nums">{dataBR(r.vencimento)}</span></span>}
          {r.descricao && <span className="text-body text-muted leading-[1.5]">{r.descricao}</span>}
        </div>

        {pix?.textoQrCode && (
          <section className="flex flex-col gap-3 rounded-md bg-surface-1 p-4" aria-label="Pagar com Pix">
            <h2 className="text-h3 text-ink">Pagar com Pix</h2>
            {svg && <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />}
            <span className="text-caption text-muted">Ou copie o código e cole no app do seu banco, em Pix copia e cola.</span>
            <code className="block break-all rounded-sm bg-white p-3 text-caption text-ink">{pix.textoQrCode}</code>
            <CopiarTexto texto={pix.textoQrCode} rotulo="Copiar código Pix" />
          </section>
        )}

        {boleto?.linhaDigitavel && (
          <section className="flex flex-col gap-3 rounded-md bg-surface-1 p-4" aria-label="Pagar com boleto">
            <h2 className="text-h3 text-ink">Pagar com boleto</h2>
            <span className="text-caption text-muted">Copie a linha digitável e pague no app do seu banco.</span>
            <code className="block break-all rounded-sm bg-white p-3 text-caption text-ink tabular-nums">{linhaDigitavelLegivel(boleto.linhaDigitavel)}</code>
            <CopiarTexto texto={boleto.linhaDigitavel} rotulo="Copiar linha do boleto" />
          </section>
        )}

        <p className="text-caption text-muted leading-[1.5]">
          O dinheiro vai para a conta de {r.empresa ?? "quem cobra"} na Pinbank. A Quattro só mostra a cobrança.
        </p>
      </div>
    );
  }

  return (
    <MolduraPublica>
      <div className="ds-visor mx-auto w-full max-w-[520px] px-4 py-10">{conteudo}</div>
    </MolduraPublica>
  );
}
