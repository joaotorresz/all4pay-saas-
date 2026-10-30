import * as React from "react";
import { BRL, StatusBadge, classesDoBotao } from "@/components/ui";
import { CopiarTexto } from "@/components/checkout/CopiarTexto";
import { BoletoImpresso } from "@/components/checkout/BoletoImpresso";
import { FormasDePagamento } from "@/components/checkout/FormasDePagamento";

import { gerarQR, qrParaSVG } from "@/lib/qrcode";
import { dataBR } from "@/lib/format";
import { linhaDigitavelLegivel } from "@/core/pinbank/cobranca";
import { credorDoCadastro, documentoLegivel } from "@/core/cobranca";
import { situacaoDaFatura } from "@/core/cobranca/fatura";

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

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption text-muted">{rotulo}</span>
      <span className="text-body text-ink">{children}</span>
    </div>
  );
}

export function FaturaView({ r, hoje, token }: { r: LeituraFatura; hoje: string; token: string }) {
  const c = credorDoCadastro(r.empresa, r.credor ?? null);
  const doc = documentoLegivel(c.documento);
  const sit = situacaoDaFatura(r.situacao, r.vencimento, hoje);
  const pix = r.situacao === "aberto" ? r.cobrancas.find((x) => x.tipo === "pix" && x.textoQrCode) : undefined;
  const boleto = r.situacao === "aberto" ? r.cobrancas.find((x) => x.tipo === "boleto" && x.linhaDigitavel) : undefined;
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
        <div className="flex flex-col gap-1">
          <span className="text-caption text-muted">Valor</span>
          <span className="text-h1 text-ink tabular-nums"><BRL value={r.valor} /></span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {r.vencimento && (
            <Dado rotulo="Vencimento">
              <span className="tabular-nums">{dataBR(r.vencimento)}</span>
              {sit.prazo && <span className="text-muted"> · {sit.prazo}</span>}
            </Dado>
          )}
          {r.comprador?.nome && <Dado rotulo="Cliente">{r.comprador.nome}</Dado>}
        </div>
        {r.descricao && <Dado rotulo="Descrição">{r.descricao}</Dado>}
      </section>

      {r.situacao === "pago" && (
        <section data-card="1" className="rounded-card bg-white p-6">
          <p className="text-body text-ink leading-[1.5]">{c.nome} já registrou o recebimento deste valor. Não é preciso pagar de novo.</p>
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
            {svg && <div className="flex justify-center" dangerouslySetInnerHTML={{ __html: svg }} />}
            <span className="text-caption text-muted">Ou copie o código e cole no app do seu banco, em Pix copia e cola.</span>
            <code className="block break-all rounded-md bg-surface-1 p-3 text-caption text-ink">{pix.textoQrCode}</code>
            <CopiarTexto texto={pix.textoQrCode} rotulo="Copiar código Pix" />
          </div>
        ) : undefined}
      />

      <p className="text-caption text-muted leading-[1.5] px-2">
        Fatura emitida por {c.razaoSocial || c.nome} pela plataforma Quattro. O dinheiro vai direto para a conta da empresa; a Quattro só mostra a cobrança.
      </p>
    </div>
  );
}
