import * as React from "react";
import { BRL, StatusBadge, classesDoBotao } from "@/components/ui";
import { CopiarTexto } from "@/components/checkout/CopiarTexto";
import { BoletoImpresso } from "@/components/checkout/BoletoImpresso";
import { FormasDePagamento } from "@/components/checkout/FormasDePagamento";
import { GerarPixDoDia } from "@/components/checkout/GerarPixDoDia";

import { gerarQR, qrParaSVG } from "@/lib/qrcode";
import { dataBR } from "@/lib/format";
import { linhaDigitavelLegivel } from "@/core/pinbank/cobranca";
import { credorDoCadastro, documentoLegivel } from "@/core/cobranca";
import { encargosDaFatura, lerRegraEncargos, pixDaFatura, situacaoDaFatura } from "@/core/cobranca/fatura";

/**
 * A FATURA PÚBLICA no modelo da Asaas (decisão do dono, 28/10/2026): o
 * cabeçalho com a empresa que cobra, a situação, os dados da fatura, o
 * comprador e as formas de pagamento já emitidas.
 *
 * Só desenha: quem lê é `src/app/pagar/page.tsx`, pelo servidor.
 */
export type CobrancaLink = {
  tipo: "pix" | "boleto";
  valor: number;
  vencimento: string;
  textoQrCode: string | null;
  linhaDigitavel: string | null;
  /** A multa e os juros que o BANCO registrou neste boleto (null = sem encargo). */
  encargos?: unknown;
  /** Só no Pix atualizado: o dia cujo valor ele cobra (vale até 23:59 desse dia). */
  diaReferencia?: string | null;
};
export type LeituraFatura = {
  situacao: "aberto" | "pago" | "indisponivel";
  empresa: string | null;
  /** O cadastro da empresa (só as chaves permitidas pela leitura). Ausente num banco sem a migration. */
  credor?: Record<string, unknown> | null;
  comprador?: { nome?: string | null } | null;
  descricao: string | null;
  valor: number;
  vencimento: string | null;
  cobrancas: CobrancaLink[];
};

function qrSvg(texto: string): string {
  try {
    return qrParaSVG(gerarQR(texto), 240, undefined, "QR code do Pix");
  } catch {
    return "";
  }
}

/** Um card de valor, como os da Asaas: rótulo pequeno em cima, número embaixo. */
function CardValor({ rotulo, children, destaque = false }: { rotulo: string; children: React.ReactNode; destaque?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-surface-1 p-4 min-w-0">
      <span className="text-caption text-muted">{rotulo}</span>
      <span className={destaque ? "text-h2 text-ink tabular-nums" : "text-h3 text-ink tabular-nums"}>{children}</span>
    </div>
  );
}

const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const pctBR = (n: number) => `${String(n).replace(".", ",")}%`;

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-muted">{rotulo}</span>
      <span className="text-body text-ink">{children}</span>
    </div>
  );
}

export function FaturaView({ r, hoje, token, pixAtualizado = false }: { r: LeituraFatura; hoje: string; token: string; pixAtualizado?: boolean }) {
  const c = credorDoCadastro(r.empresa, r.credor ?? null);
  const doc = documentoLegivel(c.documento);
  const sit = situacaoDaFatura(r.situacao, r.vencimento, hoje);
  const boletoEmitido = r.situacao === "aberto" ? r.cobrancas.find((x) => x.tipo === "boleto" && x.linhaDigitavel) : undefined;
  // ⚠️ A regra é a REGISTRADA no boleto, nunca a configuração de hoje da empresa.
  const regra = boletoEmitido ? lerRegraEncargos(boletoEmitido.encargos) : null;
  const enc = encargosDaFatura(r.valor, r.vencimento, hoje, regra);
  const comEncargo = enc.total > r.valor;
  // Passou do prazo que a empresa aceita: o banco recusa o boleto, e a página não o oferece.
  const encerrada = r.situacao === "aberto" && enc.expirada;
  // O Pix original tem valor fixo: com multa e juros correndo, ele pagaria menos do que é devido.
  // Vencida, vale só o Pix DO DIA com o valor de hoje (ou o botão que o gera).
  const { pix, doDia, podeGerar } = pixDaFatura(r.cobrancas, {
    aberto: r.situacao === "aberto", encerrada, comEncargo, totalHoje: enc.total, hoje, pixAtualizadoLigado: pixAtualizado,
  });
  const boleto = encerrada ? undefined : boletoEmitido;
  const svg = pix?.textoQrCode ? qrSvg(pix.textoQrCode) : "";
  const contato = [c.email, c.telefone].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-4">
      <section data-card="1" className="rounded-card bg-white p-6 flex flex-col gap-1" aria-label="Quem está cobrando">
        <h1 className="text-h2 text-ink">{c.nome}</h1>
        {(c.razaoSocial && c.razaoSocial !== c.nome) || doc ? (
          <span className="text-caption text-muted">{[c.razaoSocial !== c.nome ? c.razaoSocial : "", doc].filter(Boolean).join(" · ")}</span>
        ) : null}
        {contato && <span className="text-caption text-muted">{contato}</span>}
        {(c.endereco ?? []).map((l) => <span key={l} className="text-caption text-muted">{l}</span>)}
      </section>

      <section data-card="1" className="rounded-card bg-white p-6 flex flex-col gap-5" aria-label="Dados da fatura">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-h3 text-ink">Dados da fatura</h2>
          <StatusBadge tone={sit.tom}>{sit.rotulo}</StatusBadge>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {comEncargo ? (
            <>
              <CardValor rotulo="Valor atualizado" destaque><BRL value={enc.total} /></CardValor>
              <CardValor rotulo="Valor original"><BRL value={r.valor} /></CardValor>
              <CardValor rotulo={`Multa (${pctBR(regra!.multaPct)})`}><BRL value={enc.multa} /></CardValor>
              <CardValor rotulo={`Juros (${pctBR(regra!.jurosMesPct)} ao mês)`}><BRL value={enc.juros} /></CardValor>
            </>
          ) : (
            <>
              <CardValor rotulo="Valor" destaque><BRL value={r.valor} /></CardValor>
              {r.vencimento && <CardValor rotulo="Vencimento">{dataBR(r.vencimento)}</CardValor>}
              <CardValor rotulo="Situação"><span className="text-body">{maiuscula(sit.prazo ?? sit.rotulo)}</span></CardValor>
              <CardValor rotulo="Multa e juros">
                <span className="text-body">
                  {regra && (regra.multaPct > 0 || regra.jurosMesPct > 0)
                    ? `${pctBR(regra.multaPct)} + ${pctBR(regra.jurosMesPct)} ao mês${regra.carenciaDias > 0 ? `, após ${regra.carenciaDias} ${regra.carenciaDias === 1 ? "dia" : "dias"}` : ""}`
                    : "Não cobrados"}
                </span>
              </CardValor>
            </>
          )}
        </div>
        {comEncargo && (
          <span className="text-caption text-muted leading-[1.5]">
            Vencida em {dataBR(r.vencimento!)}{sit.prazo ? ` (${sit.prazo})` : ""}. A multa e os juros são cobrados pelo banco no pagamento do boleto
            {enc.aceitaAte ? `, que pode ser pago até ${dataBR(enc.aceitaAte)}` : ""}.
          </span>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {r.comprador?.nome && <Dado rotulo="Cliente">{r.comprador.nome}</Dado>}
        </div>
        {r.descricao && <Dado rotulo="Descrição">{r.descricao}</Dado>}
      </section>

      {r.situacao === "pago" && (
        <section data-card="1" className="rounded-card bg-white p-6">
          <p className="text-body text-ink leading-[1.5]">{c.nome} já registrou o recebimento deste valor. Não é preciso pagar de novo.</p>
        </section>
      )}
      {encerrada && (
        <section data-card="1" className="rounded-card bg-white p-6">
          <p className="text-body text-ink leading-[1.5]">
            O prazo para pagar esta cobrança terminou em {dataBR(enc.aceitaAte!)}. Fale com {c.nome} para receber uma nova cobrança.
          </p>
        </section>
      )}
      {r.situacao === "indisponivel" && (
        <section data-card="1" className="rounded-card bg-white p-6">
          <p className="text-body text-ink leading-[1.5]">Esta cobrança mudou ou foi cancelada. Fale com {c.nome} para receber o link atualizado.</p>
        </section>
      )}

      <FormasDePagamento
        boleto={boleto?.linhaDigitavel ? (
          <div className="flex flex-col gap-3">
            {/* A miniatura do boleto (como a Asaas): clicar abre o boleto inteiro. */}
            <a
              href={`/pagar/boleto?t=${token}`}
              target="_blank"
              rel="noopener"
              aria-label="Visualizar o boleto"
              className="block h-[200px] overflow-hidden rounded-md bg-surface-1 p-3"
            >
              <div aria-hidden className="pointer-events-none origin-top-left scale-[0.6] w-[166%]">
                <BoletoImpresso
                  credor={c}
                  pagador={r.comprador?.nome ?? null}
                  valor={boleto.valor}
                  vencimento={boleto.vencimento}
                  linhaDigitavel={boleto.linhaDigitavel}
                  descricao={r.descricao}
                />
              </div>
            </a>
            <div className="flex flex-wrap justify-center gap-2">
              <a href={`/pagar/boleto?t=${token}`} target="_blank" rel="noopener" className={classesDoBotao("primary")}>Visualizar</a>
              <a href={`/pagar/boleto?t=${token}&imprimir=1`} target="_blank" rel="noopener" className={classesDoBotao("secondary")}>Imprimir</a>
            </div>
            <span className="text-caption text-muted">Ou copie a linha digitável e pague no app do seu banco.</span>
            <code className="block break-all rounded-md bg-surface-1 p-3 text-caption text-ink tabular-nums">{linhaDigitavelLegivel(boleto.linhaDigitavel)}</code>
            <CopiarTexto texto={boleto.linhaDigitavel} rotulo="Copiar linha do boleto" />
          </div>
        ) : undefined}
        pix={pix?.textoQrCode ? (
          <div className="flex flex-col gap-3">
            {doDia && <span className="text-caption text-muted">Pix com o valor de hoje, já com a multa e os juros. Vale até 23:59.</span>}
            {svg && <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />}
            <span className="text-caption text-muted">Ou copie o código e cole no app do seu banco, em Pix copia e cola.</span>
            <code className="block break-all rounded-md bg-surface-1 p-3 text-caption text-ink">{pix.textoQrCode}</code>
            <CopiarTexto texto={pix.textoQrCode} rotulo="Copiar código Pix" />
          </div>
        ) : podeGerar ? <GerarPixDoDia token={token} /> : undefined}
      />

      <p className="text-caption text-muted leading-[1.5] px-2">
        Fatura emitida por {c.razaoSocial || c.nome} pela plataforma Quattro. O dinheiro vai direto para a conta da empresa; a Quattro só mostra a cobrança.
      </p>
    </div>
  );
}
