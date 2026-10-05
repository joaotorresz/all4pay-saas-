/**
 * O que um evento da maquininha FAZ no ERP — puro, tipado, sem I/O e sem
 * relógio (`hoje` entra pela porta da frente).
 *
 * O planejador decide; quem grava é o banco, numa transação só
 * (`pinbank_aplicar`). Separar as duas metades é o que deixa a regra do
 * dinheiro testável sem banco e a gravação atômica sem regra espalhada.
 *
 * ⚠️ **A VENDA DA PINBANK É A MESMA VENDA DA MAQUININHA.** Os títulos saem no
 * desenho de `core/vendas/pos` (com as MESMAS categorias): por parcela, a receita
 * BRUTA a receber e a taxa daquela parcela a pagar, NA MESMA DATA do repasse.
 * O caixa fecha no líquido, o DRE mostra a receita cheia e o custo de
 * adquirência como custo. Duas portas para a mesma venda com regras diferentes
 * fariam o simulador e a maquininha real discordarem sobre o mesmo dinheiro.
 *
 * ⚠️ **A DATA E A TAXA AQUI SÃO DO CONTRATO, NÃO DA PINBANK.** O webhook não traz
 * nem a data futura de pagamento nem a taxa cobrada — elas só existem no
 * extrato consolidado (`ExtratoPos`). Até a conferência pelo extrato, o repasse
 * é estimado pelos prazos e taxas que a empresa cadastrou no vínculo. Sem taxa
 * cadastrada, a venda entra SEM o título da taxa e o aviso diz isso — inventar
 * uma taxa seria afirmar um custo que ninguém informou.
 */
import { somaMeses, dividir, CATEGORIA_RECEITA_POS, CATEGORIA_TAXA_POS } from "@/core/vendas/pos";
import {
  consolidarStatus,
  type FormaPinbank,
  type StatusPinbank,
  type TransacaoPinbank,
} from "./evento";

/** O estorno é DEDUÇÃO da receita (a linha "devolu…" do DRE), não despesa. */
export const CATEGORIA_ESTORNO_POS = "Devoluções de vendas";

/** Taxas contratadas, em FRAÇÃO (0,0199 = 1,99%). `null`/ausente = não informada. */
export interface TaxasPinbank {
  debito?: number | null;
  credito_vista?: number | null;
  parcelado?: number | null;
  pix?: number | null;
  voucher?: number | null;
}

/** Prazos do repasse, em DIAS corridos a partir da venda. */
export interface PrazosPinbank {
  debito?: number;
  credito?: number;
  pix?: number;
  /** Quando a empresa antecipa: TODAS as parcelas caem neste prazo. */
  antecipado?: number;
}

/** Os prazos de mercado quando a empresa não informou os dela. */
export const PRAZOS_PADRAO: Required<PrazosPinbank> = { debito: 1, credito: 30, pix: 0, antecipado: 1 };

export interface VinculoPinbank {
  id: string;
  orgId: string;
  /** A SEGUNDA CHAVE: o admin da empresa ativou. Sem ela nada vira dinheiro. */
  ativo: boolean;
  /** Conta onde o repasse cai — a do vínculo, ou a primeira conta ativa. */
  contaId: string | null;
  taxas: TaxasPinbank;
  prazos: PrazosPinbank;
  antecipado: boolean;
}

export interface EstadoTransacao {
  status: StatusPinbank;
  ocorridoEm: string;
  valor: number;
  valorOriginal: number;
  saleDocId: string | null;
  versao: number;
}

export interface TituloExistente {
  id: string;
  type: "entrada" | "saida";
  situacao: string;
  amount: number;
  chave: string | null;
}

export interface TituloPlano {
  type: "entrada" | "saida";
  amount: number;
  due_date: string;
  competence_date: string;
  category: string;
  description: string;
  /** `pinbank:<nsu>:<parcela>:r|t` ou `pinbank:<nsu>:estorno:…` — índice único no banco. */
  chave: string;
}

/** O documento de venda, em termos da maquininha — `core/vendas/documento` o traduz. */
export interface VendaPinbank {
  nsu: number;
  total: number;
  taxaTotal: number;
  parcelas: number;
  forma: FormaPinbank;
  dataVenda: string;
  descricao: string;
  bandeira: string | null;
  autorizacao: string | null;
  nsuAdquirente: string | null;
  estabelecimento: string | null;
}

export interface NovoEstado {
  status: StatusPinbank;
  ocorridoEm: string;
  valor: number;
  valorOriginal: number;
}

export type Plano =
  | { acao: "sem_vinculo"; motivo: string }
  | { acao: "aguardando_ativacao"; motivo: string }
  | { acao: "registrar"; novoEstado: NovoEstado | null; motivo: string }
  | { acao: "criar_venda"; novoEstado: NovoEstado; venda: VendaPinbank; titulos: TituloPlano[]; avisos: string[] }
  | {
      acao: "desfazer_venda";
      novoEstado: NovoEstado;
      cancelar: string[];
      estornos: TituloPlano[];
      statusVenda: "cancelada" | "reembolsada";
      motivo: string;
    }
  | { acao: "erro"; motivo: string };

export interface EntradaPlano {
  transacao: TransacaoPinbank;
  estado: EstadoTransacao | null;
  vinculo: VinculoPinbank | null;
  /** Os títulos da venda já lançada (todos, inclusive cancelados). */
  titulos: TituloExistente[];
  hoje: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const centavos = (n: number) => Math.round(n * 100);

/** `iso` + `d` dias corridos, em UTC — sem fuso escorregando o dia. */
export function somaDias(iso: string, d: number): string {
  const [a, m, dia] = iso.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, dia + Math.round(d))).toISOString().slice(0, 10);
}

const NOME_FORMA: Record<FormaPinbank, string> = {
  debito: "débito",
  credito_vista: "crédito à vista",
  parcelado: "crédito parcelado",
  voucher: "voucher",
  pix: "Pix",
  desconhecida: "forma não identificada",
};

/** A taxa contratada para a forma, ou `null` quando a empresa não informou. */
export function taxaDaForma(forma: FormaPinbank, taxas: TaxasPinbank): number | null {
  const t =
    forma === "debito" ? taxas.debito
    : forma === "credito_vista" ? taxas.credito_vista
    : forma === "parcelado" ? taxas.parcelado
    : forma === "pix" ? taxas.pix
    : forma === "voucher" ? (taxas.voucher ?? taxas.credito_vista)
    : null;
  return typeof t === "number" && Number.isFinite(t) && t >= 0 && t < 1 ? t : null;
}

/**
 * A agenda de recebimento da venda: por parcela, a receita bruta e a taxa, na
 * data estimada do repasse.
 *
 *   · débito: D+1 · crédito à vista e voucher: D+30 · Pix: D+0;
 *   · parcelado: a 1ª em D+30 e as seguintes de mês em mês (sem escorregar:
 *     31/01 + 1 mês = 28/02);
 *   · antecipado: todas as parcelas no prazo da antecipação.
 *
 * ⚠️ **A COMPETÊNCIA NÃO SE PARCELA.** Toda parcela leva a data da VENDA como
 * competência: vender em março para receber em seis vezes é receita de março
 * inteira. O vencimento é que se espalha.
 */
export function agendaDaTransacao(t: TransacaoPinbank, v: VinculoPinbank): { titulos: TituloPlano[]; taxaTotal: number; taxa: number | null } {
  const prazos = { ...PRAZOS_PADRAO, ...v.prazos };
  const n = t.forma === "parcelado" ? Math.max(1, t.parcelas) : 1;
  const taxa = taxaDaForma(t.forma, v.taxas);
  const total = r2(Math.max(0, t.valorOriginal));
  const taxaTotal = taxa == null ? 0 : r2(total * taxa);
  const brutos = dividir(total, n);
  const taxas = dividir(taxaTotal, n);

  const vencimento = (k: number): string => {
    if (v.antecipado && t.forma !== "pix") return somaDias(t.dataVenda, prazos.antecipado);
    if (t.forma === "pix") return somaDias(t.dataVenda, prazos.pix);
    if (t.forma === "debito") return somaDias(t.dataVenda, prazos.debito);
    return somaMeses(somaDias(t.dataVenda, prazos.credito), k);
  };

  const base = `Maquininha Pinbank · ${NOME_FORMA[t.forma]}${t.bandeira ? ` ${t.bandeira}` : ""} · NSU ${t.nsu}`;
  const desc = (k: number) => (n > 1 ? `${base} · ${k + 1}/${n}` : base);
  const out: TituloPlano[] = [];
  for (let k = 0; k < n; k++) {
    const due = vencimento(k);
    if (brutos[k] > 0) {
      out.push({
        type: "entrada", amount: brutos[k], due_date: due, competence_date: t.dataVenda,
        category: CATEGORIA_RECEITA_POS, description: desc(k), chave: `pinbank:${t.nsu}:${k + 1}:r`,
      });
    }
    if (taxas[k] > 0) {
      out.push({
        type: "saida", amount: taxas[k], due_date: due, competence_date: t.dataVenda,
        category: CATEGORIA_TAXA_POS, description: `${desc(k)} · taxa`, chave: `pinbank:${t.nsu}:${k + 1}:t`,
      });
    }
  }
  return { titulos: out, taxaTotal, taxa };
}

const ehEstorno = (chave: string | null, nsu: number) => !!chave && chave.startsWith(`pinbank:${nsu}:estorno`);
const vivo = (situacao: string) => situacao !== "cancelado" && situacao !== "estornado";
const emAberto = (situacao: string) => situacao === "previsto" || situacao === "confirmado";
const recebido = (situacao: string) => situacao === "baixado" || situacao === "conciliado";

/**
 * O plano de UM evento. A ordem das perguntas é a regra:
 *
 *   1. de quem é a maquininha (vínculo) — sem dono, o evento espera;
 *   2. o dono ATIVOU — sem a segunda chave, o evento espera;
 *   3. o ciclo andou — evento atrasado ou repetido não muda nada;
 *   4. o que o novo status pede: lançar a venda, desfazê-la, ou só registrar.
 */
export function planejarEvento(e: EntradaPlano): Plano {
  const t = e.transacao;
  if (!e.vinculo) {
    return {
      acao: "sem_vinculo",
      motivo: `O estabelecimento ${t.estabelecimento.nome ?? t.estabelecimento.chaveGateway ?? t.estabelecimento.id ?? "?"} não está vinculado a nenhuma empresa.`,
    };
  }
  if (!e.vinculo.ativo) {
    return { acao: "aguardando_ativacao", motivo: "O vínculo existe, mas a empresa ainda não o ativou (conta de repasse e taxas)." };
  }

  const cons = consolidarStatus(
    e.estado ? { status: e.estado.status, ocorridoEm: e.estado.ocorridoEm } : null,
    { status: t.status, ocorridoEm: t.ocorridoEm },
  );
  if (!cons.mudou) {
    return { acao: "registrar", novoEstado: null, motivo: `Evento ${t.status} anterior ao estado atual (${e.estado?.status}) — nada muda.` };
  }
  const novoEstado: NovoEstado = { status: cons.status, ocorridoEm: cons.ocorridoEm, valor: t.valor, valorOriginal: t.valorOriginal };
  const saleDocId = e.estado?.saleDocId ?? null;

  if (cons.status === "Pendente") {
    return { acao: "registrar", novoEstado, motivo: "Aguardando o resultado da adquirente." };
  }

  if (cons.status === "Aprovada") {
    if (saleDocId) return { acao: "registrar", novoEstado, motivo: "A venda já está lançada." };
    if (!e.vinculo.contaId) {
      return { acao: "erro", motivo: "A empresa não tem conta bancária ativa para receber o repasse. Cadastre a conta e reprocesse." };
    }
    if (t.valorOriginal <= 0) return { acao: "registrar", novoEstado, motivo: "Venda aprovada com valor zero — nada a lançar." };
    const { titulos, taxaTotal, taxa } = agendaDaTransacao(t, e.vinculo);
    const avisos: string[] = [];
    if (taxa == null) {
      avisos.push(`A taxa de ${NOME_FORMA[t.forma]} não está cadastrada no vínculo: a venda entrou sem o custo de adquirência.`);
    }
    if (t.forma === "desconhecida") {
      avisos.push(`Forma de pagamento "${t.formaBruta ?? "?"}" não reconhecida: o repasse foi estimado como crédito à vista.`);
    }
    return {
      acao: "criar_venda",
      novoEstado,
      venda: {
        nsu: t.nsu, total: r2(t.valorOriginal), taxaTotal, parcelas: t.forma === "parcelado" ? t.parcelas : 1,
        forma: t.forma, dataVenda: t.dataVenda,
        descricao: `Venda na maquininha Pinbank · NSU ${t.nsu}`,
        bandeira: t.bandeira, autorizacao: t.autorizacao, nsuAdquirente: t.nsuAdquirente,
        estabelecimento: t.estabelecimento.nome,
      },
      titulos,
      avisos,
    };
  }

  // Negada, Cancelada, Desfeita, Reembolsada.
  if (!saleDocId) {
    return { acao: "registrar", novoEstado, motivo: `${cons.status} sem venda lançada — nada a desfazer.` };
  }

  const nsu = t.nsu;
  const jaEstornado = r2(e.titulos
    .filter((x) => x.type === "saida" && ehEstorno(x.chave, nsu) && vivo(x.situacao))
    .reduce((s, x) => s + x.amount, 0));
  const daVenda = e.titulos.filter((x) => !ehEstorno(x.chave, nsu));
  const statusVenda = cons.status === "Reembolsada" ? "reembolsada" : "cancelada";

  // ⚠️ REEMBOLSO PARCIAL: `valor` é o que SOBROU depois do estorno e
  // `valorOriginal` o da venda. O estornado é a diferença — e ele é INCREMENTO
  // (a documentação manda acumular, nunca substituir): só entra o que falta
  // além do que já foi lançado como estorno.
  const parcial = cons.status === "Reembolsada" && t.valor > 0 && t.valor < t.valorOriginal;
  // Um reembolso parcial depois de a venda já ter sido desfeita inteira não
  // tem o que devolver: estornar ali lançaria a saída de um dinheiro que nunca
  // entrou.
  if (parcial && !daVenda.some((x) => x.type === "entrada" && vivo(x.situacao))) {
    return { acao: "registrar", novoEstado, motivo: "Reembolso parcial de uma venda que já estava desfeita — nada a lançar." };
  }
  if (parcial) {
    const alvo = r2(t.valorOriginal - t.valor);
    const inc = r2(alvo - jaEstornado);
    return {
      acao: "desfazer_venda",
      novoEstado,
      cancelar: [],
      estornos: inc > 0 ? [estornoDe(t, inc, `pinbank:${nsu}:estorno:${centavos(alvo)}`, e.hoje)] : [],
      statusVenda,
      motivo: `Reembolso parcial de ${alvo.toFixed(2)} sobre ${t.valorOriginal.toFixed(2)}.`,
    };
  }

  // ⚠️ DESFAZER TOTAL. O que ainda não se moveu é CANCELADO (previsto e
  // confirmado → cancelado, pela máquina de estados). O que já caiu na conta
  // NÃO é reescrito — é dinheiro que se moveu, e o que se faz é lançar a saída
  // do estorno pelo LÍQUIDO recebido (bruto recebido − taxa já descontada).
  const cancelar = daVenda.filter((x) => emAberto(x.situacao)).map((x) => x.id);
  const recebidoLiquido = r2(
    daVenda.filter((x) => x.type === "entrada" && recebido(x.situacao)).reduce((s, x) => s + x.amount, 0)
    - daVenda.filter((x) => x.type === "saida" && recebido(x.situacao)).reduce((s, x) => s + x.amount, 0),
  );
  const inc = r2(recebidoLiquido - jaEstornado);
  return {
    acao: "desfazer_venda",
    novoEstado,
    cancelar,
    estornos: inc > 0 ? [estornoDe(t, inc, `pinbank:${nsu}:estorno:total`, e.hoje)] : [],
    statusVenda,
    motivo: `Venda ${cons.status.toLowerCase()} na maquininha: ${cancelar.length} título(s) em aberto cancelado(s)${inc > 0 ? `, estorno de ${inc.toFixed(2)} do que já tinha sido recebido` : ""}.`,
  };
}

function estornoDe(t: TransacaoPinbank, valor: number, chave: string, hoje: string): TituloPlano {
  return {
    type: "saida",
    amount: valor,
    // O estorno sai do PRÓXIMO repasse; sem data da Pinbank, vence hoje — é
    // dinheiro devido desde já, e escondê-lo no futuro adiaria o aviso.
    due_date: hoje,
    competence_date: t.ocorridoEm.slice(0, 10),
    category: CATEGORIA_ESTORNO_POS,
    description: `Estorno da venda na maquininha Pinbank · NSU ${t.nsu}`,
    chave,
  };
}
