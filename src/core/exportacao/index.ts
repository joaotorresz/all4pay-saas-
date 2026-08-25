/**
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPORTAÇÃO PARA O CONTADOR — o razão e o DRE, da MESMA fonte que a tela
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **ESTE MÓDULO NÃO CALCULA NADA. Não pode.**
 *
 * O padrão de falha que esta base já registrou SEIS vezes é *duas fontes para
 * um fato*: `approval_limit` em três lugares, o `resíduo = x − x`,
 * `organizations.name` derivado do e-mail, `status` × `situacao`, dois
 * publicadores de deploy, e o branch padrão disputando o tronco com o `main`.
 * Uma exportação é o lugar mais fácil do mundo para cometer a sétima — basta
 * montar a própria consulta — e é a mais cara de todas, porque o arquivo SAI DA
 * EMPRESA: quem recebe a divergência é o contador, não a revisão.
 *
 * Então a regra aqui é literal: **`montarExportacao` recebe o `Relatorio` que a
 * tela já montou** e o reescreve em linhas. Ele não abre consulta, não
 * reclassifica por palavra-chave e não recalcula sinal. Em que linha do DRE
 * cada movimento caiu, e com que valor, vem de `Relatorio.classificacao` — o
 * campo que a cascata passou a devolver justamente para que este arquivo não
 * precisasse deduzir nada. (Deduzir por palavra-chave foi como nasceram os
 * R$ 267,70 de transferência dentro da despesa.)
 *
 * ⚠️ **E O FECHAMENTO É VERIFICÁVEL:** somar o razão por linha do DRE tem de
 * reproduzir o DRE consolidado ao CENTAVO. `conferirFechamento` faz essa conta
 * e é o que `npm run exportacao` cobra — com teste negativo. Se não fechar, o
 * contador descobre antes de nós.
 */
import type { Relatorio } from "@/core/relatorios";
import type { RiskMovement } from "@/core/risk-engine/types";

export const EXPORTACAO_VERSION = "exportacao/1.0.0";

/* ────────────────────────────── o cabeçalho ─────────────────────────────── */

/**
 * ⚠️ **O contador precisa saber sob que PREMISSA os números foram montados.**
 * Uma planilha de "agosto" sem dizer se é competência ou caixa, e sem dizer se
 * inclui título previsto, é um número sem pergunta: ele bate ou não bate com o
 * que ele tem, e ninguém consegue dizer por quê. Todo campo aqui existe para
 * responder uma dessas dúvidas antes de ela virar telefonema.
 */
export interface CabecalhoExportacao {
  empresa: string;
  /** Só sai no arquivo quando existe — em branco é pior que ausente. */
  cnpj: string | null;
  /** O regime TRIBUTÁRIO declarado pela empresa (Simples, Presumido…). */
  regimeTributario: string | null;
  /** O regime CONTÁBIL do relatório. É outra coisa, e confundir os dois é caro. */
  regime: "competencia" | "caixa";
  periodoDe: string;
  periodoAte: string;
  /** ⚠️ Entra por parâmetro: motor puro não lê relógio. */
  geradoEm: string;
  visao: "com-previsto" | "so-confirmado";
  incluiCancelados: boolean;
}

/* ─────────────────────────────── o razão ────────────────────────────────── */

export interface LinhaRazao {
  movimentoId: string;
  /** Data de COMPETÊNCIA — o mês em que o fato pertence (DRE). */
  competencia: string;
  /** Data de CAIXA — quando o dinheiro andou. Vazia enquanto não liquidou. */
  caixa: string;
  descricao: string;
  contraparte: string;
  categoria: string;
  /** O id da linha do DRE — estável, para quem cruza com o consolidado. */
  linhaDreId: string;
  /** O rótulo da linha, como a tela o escreve. */
  linhaDre: string;
  /**
   * O valor COM O SINAL COM QUE ENTROU NA LINHA. Não é `amount`: uma dedução é
   * negativa, um estorno de despesa é negativo, e uma linha `+/-` carrega o
   * sinal do movimento. É este valor que soma no DRE — e é por isso que ele
   * vem da cascata em vez de ser recalculado.
   */
  valor: number;
  /** A magnitude como está no lançamento, para conferência com o extrato. */
  valorLancamento: number;
  tipo: "entrada" | "saida";
  origem: string;
  situacao: string;
  lancadoPor: string;
  conta: string;
  projeto: string;
  centro: string;
  /** Entrou no DRE consolidado? Falso ⇒ está listado mas NÃO soma. */
  noDre: boolean;
  /** Por que ficou de fora. Vazio quando entrou. */
  motivoFora: string;
}

export interface LinhaDreExportada {
  id: string;
  label: string;
  nivel: 1 | 2 | 3;
  sinal: string;
  tipo: "soma" | "total";
  valor: number;
  /** Análise vertical, como a tela mostra. `null` vira "—". */
  av: number | null;
}

export interface Exportacao {
  cabecalho: CabecalhoExportacao;
  razao: LinhaRazao[];
  dre: LinhaDreExportada[];
  resumo: {
    movimentos: number;
    movimentosNoDre: number;
    movimentosForaDoDre: number;
    cancelados: number;
    /** A soma do razão que ENTRA no DRE, no sinal contábil. */
    totalRazao: number;
    /** O resultado líquido do DRE consolidado — o número da tela. */
    resultado: number;
  };
}

const MOTIVO: Record<string, string> = {
  transferencia: "Transferência entre contas próprias — não é receita nem despesa",
  sem_linha: "Nenhuma linha do DRE aceitou este lançamento",
  cancelado: "Cancelado — incluído a pedido, não soma no resultado",
  fora_do_periodo: "Fora do período ou do filtro do relatório",
};

const texto = (v: unknown): string => (v == null ? "" : String(v));

/**
 * Reescreve o relatório da tela em linhas de arquivo.
 *
 * ⚠️ `movimentos` é a MESMA lista que alimentou `montarDRE` — a exportação não
 * a consulta, ela a recebe. Quem não está em `relatorio.classificacao` nem em
 * `relatorio.foraDoDre` foi recortado pelos filtros do próprio relatório
 * (período, conta, projeto, centro, ou cancelado) e só aparece quando o
 * operador pedir os cancelados.
 */
export function montarExportacao(
  relatorio: Relatorio,
  movimentos: RiskMovement[],
  cabecalho: CabecalhoExportacao,
  nomeDaContraparte: (id: string | null | undefined) => string = (id) => texto(id),
): Exportacao {
  const rotulo = new Map<string, string>();
  for (const l of relatorio.linhas) rotulo.set(l.id, l.label);

  const razao: LinhaRazao[] = [];
  let cancelados = 0;

  for (const m of movimentos) {
    const dentro = relatorio.classificacao[m.id];
    const fora = relatorio.foraDoDre[m.id];
    const ehCancelado = m.status === "cancelado" || m.situacao === "cancelado";

    if (!dentro && !fora) {
      // Recortado pelo próprio filtro do relatório. Cancelado entra só a pedido.
      if (!(ehCancelado && cabecalho.incluiCancelados)) continue;
    }
    if (ehCancelado) cancelados += 1;

    const motivo = dentro
      ? ""
      : ehCancelado
        ? MOTIVO.cancelado
        : (MOTIVO[fora ?? ""] ?? MOTIVO.fora_do_periodo);

    razao.push({
      movimentoId: m.id,
      // ⚠️ A competência cai no vencimento quando não foi informada — é a
      // convenção do sistema (`dataDe`), não uma escolha deste arquivo.
      competencia: texto(m.competence_date ?? m.due_date),
      caixa: texto(m.paid_date ?? ""),
      descricao: texto(m.descricao ?? ""),
      contraparte: nomeDaContraparte(m.party_id),
      categoria: texto(m.category ?? ""),
      linhaDreId: dentro ? dentro.linha : "",
      linhaDre: dentro ? (rotulo.get(dentro.linha) ?? dentro.linha) : "",
      valor: dentro ? dentro.valor : 0,
      valorLancamento: m.amount,
      tipo: m.type,
      origem: texto(m.origem ?? ""),
      situacao: texto(m.situacao ?? m.status),
      lancadoPor: texto(m.lancadoPor ?? ""),
      conta: texto(m.accountId ?? ""),
      projeto: texto(m.projeto ?? ""),
      centro: texto(m.costCenter ?? ""),
      noDre: !!dentro,
      motivoFora: motivo,
    });
  }

  const dre: LinhaDreExportada[] = relatorio.linhas.map((l) => ({
    id: l.id,
    label: l.label,
    nivel: l.nivel,
    sinal: l.sinal,
    tipo: l.tipo,
    valor: l.total.valor,
    av: l.total.av,
  }));

  const noDre = razao.filter((r) => r.noDre);
  const resultadoLinha = relatorio.linhas.find((l) => l.id === "resultado_liquido");

  return {
    cabecalho,
    razao,
    dre,
    resumo: {
      movimentos: razao.length,
      movimentosNoDre: noDre.length,
      movimentosForaDoDre: razao.length - noDre.length,
      cancelados,
      totalRazao: round2(noDre.reduce((s, r) => s + r.valor, 0)),
      resultado: resultadoLinha?.total.valor ?? 0,
    },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ──────────────────────── o fechamento, verificável ─────────────────────── */

export interface Divergencia {
  linhaId: string;
  label: string;
  noDre: number;
  noRazao: number;
  diferenca: number;
}

/**
 * ⚠️ **A CONTA QUE O CONTADOR VAI FAZER, feita antes dele.**
 *
 * Ele soma o razão por linha e confere contra o consolidado. Se não bater, o
 * primeiro a saber não pode ser ele — e é por isso que esta função existe no
 * MOTOR, e não só na guarda: a tela também a roda antes de liberar o download.
 *
 * Só as linhas `soma` são conferidas, e não é uma tolerância: as linhas `=` são
 * calculadas POR FÓRMULA sobre as outras (é o desenho da cascata, que impede
 * valor contado duas vezes), então nenhum movimento pertence a elas. Cobrá-las
 * aqui seria cobrar que a soma de um total avulso reproduzisse a fórmula — e
 * reprovaria o comportamento correto.
 *
 * Critério: UM CENTAVO. Devolve vazio quando fecha.
 */
export function conferirFechamento(exp: Exportacao): Divergencia[] {
  const porLinha = new Map<string, number>();
  for (const r of exp.razao) {
    if (!r.noDre) continue;
    porLinha.set(r.linhaDreId, round2((porLinha.get(r.linhaDreId) ?? 0) + r.valor));
  }
  const fora: Divergencia[] = [];
  for (const l of exp.dre) {
    if (l.tipo !== "soma") continue;
    const noRazao = round2(porLinha.get(l.id) ?? 0);
    const noDre = round2(l.valor);
    if (Math.abs(noRazao - noDre) > 0.005) {
      fora.push({ linhaId: l.id, label: l.label, noDre, noRazao, diferenca: round2(noRazao - noDre) });
    }
  }
  // Uma linha que só existe no razão é divergência tanto quanto uma que só
  // existe no DRE — e sem esta varredura ela passaria: o laço acima itera o DRE.
  for (const [id, v] of Array.from(porLinha.entries())) {
    if (exp.dre.some((l) => l.id === id)) continue;
    fora.push({ linhaId: id, label: `(linha ausente no DRE: ${id})`, noDre: 0, noRazao: v, diferenca: v });
  }
  return fora;
}
