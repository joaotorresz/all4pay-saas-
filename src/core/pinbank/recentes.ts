/**
 * AS VENDAS RECENTES DA MAQUININHA — o card "Transações recentes na
 * maquininha" da Home (pedido do dono, 16/10/2026).
 *
 * A venda chega da Pinbank pelo webhook (`/api/pinbank/webhook`): o aviso
 * `Compra.*` vira linha em `pinbank_transacoes` (o estado da venda) e o evento
 * bruto, sem dado sensível, fica em `pinbank_eventos` (forma, parcelas e
 * bandeira). Este módulo só LÊ o que o banco já tem e monta a lista da tela:
 * nada aqui grava venda, e nada aqui chama a Pinbank.
 *
 * ⚠️ O total de HOJE soma só as vendas APROVADAS. Negada, cancelada, desfeita
 * e reembolsada aparecem na lista com a situação escrita (quem está no balcão
 * quer ver que a venda não passou), mas não são dinheiro que entrou.
 *
 * ⚠️ "Hoje" é o dia em São Paulo, não em UTC: uma venda às 22h do dia 16 é do
 * dia 16, e o `ocorrido_em` dela já é dia 17 em UTC.
 *
 * Puro, tipado, demo-safe.
 */
import { formaDaTransacao, type FormaPinbank } from "./evento";

export const RECENTES_VERSION = "pinbank-recentes/1.0.0";

/** Uma venda como o banco a devolve (transação + o último evento dela). */
export interface VendaMaquininhaBruta {
  nsu: number;
  status: string;
  /** Em reais, depois de estornos parciais. */
  valor: number;
  /** ISO com fuso (timestamptz). */
  ocorridoEm: string;
  formaPagamento?: string | null;
  numeroParcelas?: number | string | null;
  bandeira?: string | null;
  ehPix?: boolean;
}

export interface VendaMaquininha {
  nsu: number;
  /** "Aprovada", "Negada"… como a Pinbank manda. */
  status: string;
  aprovada: boolean;
  valor: number;
  ocorridoEm: string;
  /** Dia em São Paulo, `YYYY-MM-DD`. */
  dia: string;
  /** Hora em São Paulo, `HH:MM`. */
  hora: string;
  forma: FormaPinbank;
  parcelas: number;
  /** "Crédito 3x · Visa", "Pix", "Débito · Elo". */
  descricao: string;
}

export interface PainelMaquininha {
  vendas: VendaMaquininha[];
  hoje: { quantidade: number; total: number };
}

const FUSO = "America/Sao_Paulo";

/** Dia e hora de um instante em São Paulo (o fuso é fixo, não o da máquina). */
export function diaEHora(iso: string): { dia: string; hora: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { dia: "", hora: "" };
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` };
}

const NOME: Record<FormaPinbank, string> = {
  debito: "Débito",
  credito_vista: "Crédito à vista",
  parcelado: "Crédito",
  voucher: "Voucher",
  pix: "Pix",
  desconhecida: "Cartão",
};

/** A bandeira como se escreve ("MASTERCARD" → "Mastercard"). */
function nomeBandeira(b: string | null | undefined): string | null {
  const t = (b ?? "").trim();
  if (!t) return null;
  return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

export function descreverVenda(forma: FormaPinbank, parcelas: number, bandeira: string | null | undefined): string {
  const base = forma === "parcelado" ? `${NOME.parcelado} ${parcelas}x` : NOME[forma];
  const b = forma === "pix" ? null : nomeBandeira(bandeira);
  return b ? `${base} · ${b}` : base;
}

/**
 * A lista da tela: as mais recentes primeiro, até `limite`, e o total
 * aprovado do dia `hoje` (`YYYY-MM-DD`, em São Paulo). O total olha TODAS as
 * linhas recebidas, não só as que cabem na lista.
 */
export function montarPainelMaquininha(linhas: VendaMaquininhaBruta[], hoje: string, limite = 6): PainelMaquininha {
  const vendas = linhas
    .filter((l) => Number.isFinite(l.valor) && l.valor >= 0 && !!l.ocorridoEm)
    .map<VendaMaquininha>((l) => {
      const parcelasBrutas = Number(l.numeroParcelas ?? 1);
      const parcelas = Number.isFinite(parcelasBrutas) && parcelasBrutas >= 1 ? Math.floor(parcelasBrutas) : 1;
      const forma = formaDaTransacao(l.formaPagamento ?? null, !!l.ehPix, parcelas);
      const { dia, hora } = diaEHora(l.ocorridoEm);
      return {
        nsu: l.nsu, status: l.status, aprovada: l.status === "Aprovada", valor: l.valor, ocorridoEm: l.ocorridoEm,
        dia, hora, forma, parcelas, descricao: descreverVenda(forma, parcelas, l.bandeira),
      };
    })
    .sort((a, b) => (a.ocorridoEm < b.ocorridoEm ? 1 : a.ocorridoEm > b.ocorridoEm ? -1 : b.nsu - a.nsu));
  const doDia = vendas.filter((v) => v.dia === hoje && v.aprovada);
  const total = Math.round(doDia.reduce((s, v) => s + v.valor * 100, 0)) / 100;
  return { vendas: vendas.slice(0, Math.max(0, limite)), hoje: { quantidade: doDia.length, total } };
}
