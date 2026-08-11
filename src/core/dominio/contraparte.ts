/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VALIDAÇÃO DE CONTRAPARTE — quem pode ser dono de um título.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três defeitos da mesma família, e os três nascem do mesmo lugar: a importação
 * transformou **descritivo de extrato** em **cadastro de contraparte**.
 *
 *  1. **A empresa cobrando de si mesma.** Um título de R$ 500.000 de "Juros
 *     recebidos" com o CNPJ da própria organização. Não é fraude nem erro de
 *     digitação: é uma linha de extrato — o rendimento da conta — que virou um
 *     título a receber, e o CNPJ que sobrou no descritivo era o da própria
 *     empresa. Ele entra na carteira, entra na projeção de caixa e entra na
 *     base de receita.
 *  2. **A tarifa virando fornecedor.** "ESTORNO TARIFA", "IOF ROTATIVO",
 *     "DISNEY PLUS", "APPLE COM BILL" — nomes de cobrança que viraram cadastro.
 *  3. **O score de crédito sobre nada.** Como o cadastro existe, o motor de
 *     inadimplência o trata como cliente e lhe atribui probabilidade de
 *     pagamento — um número com aparência de análise, que ainda entra na média
 *     ponderada da carteira inteira.
 *
 * ⚠️ **A regra é RECUSAR, não corrigir em silêncio.** Reclassificar sozinho
 * conserta o número e esconde que alguém (ou alguma importação) criou um
 * cadastro que não deveria existir — e o próximo extrato cria de novo. Cada
 * função devolve o problema COM a correção sugerida; quem aplica é a tela,
 * depois de mostrar.
 *
 * Puro, tipado, sem I/O. Versão `dominio/1.0.0`.
 */
import {
  type TipoContraparte, type NaturezaLancamento, podeTerScore,
} from "./index";

/* ========================================================================== */
/* Documento                                                                   */
/* ========================================================================== */

export const soDigitos = (s: string | null | undefined): string =>
  (s ?? "").replace(/\D+/g, "");

/**
 * ⚠️ Compara por DÍGITOS, nunca pela string formatada. O mesmo CNPJ chega
 * `12.345.678/0001-95` do cadastro e `12345678000195` do extrato, e comparar
 * texto deixaria a empresa passar por si mesma sem a máscara.
 */
export const mesmoDocumento = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const x = soDigitos(a), y = soDigitos(b);
  return x.length >= 11 && x === y;
};

/* ========================================================================== */
/* O que NÃO é contraparte                                                     */
/* ========================================================================== */

/**
 * Padrões que denunciam um descritivo bancário travestido de cadastro.
 *
 * ⚠️ Ancorados em `\b`. Sem a borda, `iof` casa dentro de nomes legítimos e
 * `taxa` casa em "Taxationi Consultoria" — é o mesmo defeito que fazia `iss`
 * casar dentro de "com**iss**ão" em `core/relatorios`, e que já custou caro
 * três vezes neste repositório.
 */
const PADROES: { natureza: NaturezaLancamento; re: RegExp; porque: string }[] = [
  {
    natureza: "estorno",
    re: /\b(estorno|estornado|devolucao de tarifa|reversao)\b/i,
    porque: "é a reversão de um lançamento, não alguém com quem se negocia",
  },
  {
    natureza: "financeiro",
    re: /\b(tarifa|iof|cesta de servicos?|manutencao de conta|pacote de servicos?|taxa bancaria|juros|mora|rotativo|cheque especial|anuidade)\b/i,
    porque: "é cobrança do próprio banco, e o banco não é cliente nem fornecedor comum",
  },
  {
    natureza: "imposto",
    re: /\b(das|darf|gps|inss|fgts|iss|icms|pis|cofins|irpj|csll|simples nacional|imposto|tributo)\b/i,
    porque: "é recolhimento a órgão público, não uma relação comercial",
  },
  {
    natureza: "transferencia",
    re: /\b(transferencia entre contas|movimentacao interna|resgate|aplicacao|ted mesma titularidade|p2p interno)\b/i,
    porque: "é dinheiro que continua sendo da empresa, mudando de bolso",
  },
];

export interface ContraparteSuspeita {
  /** O que ela na verdade é. */
  natureza: NaturezaLancamento;
  /** A frase que a tela mostra, em português, dizendo por quê. */
  porque: string;
  /** O tipo de contraparte que ela deveria ter. */
  tipoSugerido: TipoContraparte;
  /** A categoria para a qual o lançamento deve migrar. */
  categoriaSugerida: string;
}

const CATEGORIA_POR_NATUREZA: Record<string, string> = {
  estorno: "Estornos",
  financeiro: "Tarifas bancárias",
  imposto: "Impostos",
  transferencia: "Transferência entre contas",
};

const TIPO_POR_NATUREZA: Record<string, TipoContraparte> = {
  estorno: "nao_identificada",
  financeiro: "instituicao_financeira",
  imposto: "orgao_publico",
  transferencia: "propria_empresa",
};

/**
 * A contraparte é, na verdade, uma tarifa / imposto / transferência / estorno?
 *
 * Devolve `null` quando o nome parece uma contraparte de verdade — o caso
 * comum, e o que a função tem de acertar para não virar ruído.
 */
export function contraparteSuspeita(nome: string | null | undefined): ContraparteSuspeita | null {
  const n = (nome ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!n.trim()) return null;
  for (const p of PADROES) {
    if (!p.re.test(n)) continue;
    return {
      natureza: p.natureza,
      porque: p.porque,
      tipoSugerido: TIPO_POR_NATUREZA[p.natureza] ?? "nao_identificada",
      categoriaSugerida: CATEGORIA_POR_NATUREZA[p.natureza] ?? "Outras despesas",
    };
  }
  return null;
}

/* ========================================================================== */
/* O LADO ERRADO — o defeito que o detector de nomes NÃO pega                  */
/* ========================================================================== */

/**
 * ⚠️ **Medido antes de escrever, e mudou o conserto.** Rodei o detector de
 * nomes contra os quatro casos reportados: ele pega `ESTORNO TARIFA` e
 * `IOF ROTATIVO`, e **não pega** `DISNEY PLUS`, `APPLE COM BILL` nem `WIX` —
 * corretamente, porque esses três são fornecedores de verdade. O problema deles
 * não é o nome, é o LADO: são assinaturas que a empresa PAGA, e apareceram na
 * lista do que ela tem a RECEBER.
 *
 * Um detector de nomes nunca acharia isso, e é por isso que a regra é
 * direcional: a contraparte cujo histórico inteiro é de saída não pode ser dona
 * de um título a receber. O sinal não vem do texto, vem do extrato.
 */
export interface HistoricoDaContraparte {
  nome?: string | null;
  /** Quantos lançamentos de saída (a empresa pagou) essa contraparte tem. */
  saidas: number;
  /** Quantos de entrada (a empresa recebeu). */
  entradas: number;
}

export interface LadoErrado {
  codigo: "fornecedor_como_cliente" | "cliente_como_fornecedor";
  mensagem: string;
  tipoSugerido: TipoContraparte;
}

/**
 * A contraparte está do lado errado do título?
 *
 * ⚠️ Exige histórico: com zero movimento dos dois lados não há o que concluir,
 * e acusar sem base é o começo de um aviso que ninguém lê. Exige também que o
 * histórico seja EXCLUSIVO de um lado — quem compra e vende com a mesma empresa
 * existe, é legítimo, e acusá-lo faria a regra ser desligada.
 */
export function contraparteNoLadoErrado(
  h: HistoricoDaContraparte, tipoDoTitulo: "entrada" | "saida",
): LadoErrado | null {
  const total = h.saidas + h.entradas;
  if (total === 0) return null;
  const nome = h.nome ? `"${h.nome}"` : "Esta contraparte";

  if (tipoDoTitulo === "entrada" && h.entradas === 0 && h.saidas > 0) {
    return {
      codigo: "fornecedor_como_cliente",
      tipoSugerido: "fornecedor",
      mensagem:
        `${nome} só aparece no histórico como quem RECEBE da empresa `
        + `(${h.saidas} ${h.saidas === 1 ? "pagamento" : "pagamentos"} feitos, nenhum recebido). `
        + "Um título a receber diz que ela deve à empresa, o que contradiz tudo que "
        + "já aconteceu. Quase sempre é uma linha de extrato de assinatura ou compra "
        + "que entrou do lado errado na importação.",
    };
  }
  if (tipoDoTitulo === "saida" && h.saidas === 0 && h.entradas > 0) {
    return {
      codigo: "cliente_como_fornecedor",
      tipoSugerido: "cliente",
      mensagem:
        `${nome} só aparece no histórico como quem PAGA à empresa `
        + `(${h.entradas} ${h.entradas === 1 ? "recebimento" : "recebimentos"}, nenhum pagamento). `
        + "Um título a pagar diz que a empresa deve a ela — confira antes de provisionar a saída.",
    };
  }
  return null;
}

/* ========================================================================== */
/* O bloqueio do título                                                        */
/* ========================================================================== */

export interface Recusa {
  codigo: "cnpj_proprio" | "contraparte_nao_e_contraparte" | "sem_origem" | "extrato_nao_e_titulo";
  /** Para quem opera. Diz o que está errado E o que fazer. */
  mensagem: string;
}

export interface TituloParaValidar {
  /** Documento da contraparte, como veio. */
  documentoContraparte?: string | null;
  nomeContraparte?: string | null;
  /** De onde o título veio. Vazio é recusa. */
  origem?: string | null;
  /** A espécie declarada do registro. */
  especie?: string | null;
}

export interface OrganizacaoParaValidar {
  /** CNPJ/CPF da própria organização. */
  documento?: string | null;
  nome?: string | null;
}

/**
 * As quatro recusas de um título, com a frase que explica cada uma.
 *
 * ⚠️ A mensagem NÃO é "documento inválido". Quem está do outro lado acabou de
 * importar um extrato e não faz ideia de por que o sistema recusou; a frase
 * precisa dizer o que aconteceu de verdade — "este é o CNPJ da sua própria
 * empresa" — senão a pessoa tenta de novo com o mesmo dado.
 */
export function recusasDoTitulo(
  t: TituloParaValidar, org: OrganizacaoParaValidar,
): Recusa[] {
  const out: Recusa[] = [];

  if (t.especie === "extrato") {
    out.push({
      codigo: "extrato_nao_e_titulo",
      mensagem:
        "Este registro é um lançamento de extrato: o dinheiro já passou pela conta. "
        + "Um título é uma obrigação que ainda vai vencer, e por isso os dois não podem "
        + "ser a mesma linha. Se existe algo a receber aqui, crie o título a partir da "
        + "venda ou do contrato que o originou.",
    });
  }

  if (mesmoDocumento(t.documentoContraparte, org.documento)) {
    out.push({
      codigo: "cnpj_proprio",
      mensagem:
        `Este documento é o da própria ${org.nome ? `${org.nome}` : "organização"}. `
        + "Uma empresa não tem título a receber de si mesma — isto costuma ser uma linha "
        + "de extrato (rendimento, resgate ou transferência entre contas próprias) que "
        + "entrou como título na importação. Reclassifique como movimentação interna.",
    });
  }

  const suspeita = contraparteSuspeita(t.nomeContraparte);
  if (suspeita) {
    out.push({
      codigo: "contraparte_nao_e_contraparte",
      mensagem:
        `"${t.nomeContraparte}" ${suspeita.porque}. `
        + `Sugerido: classificar como ${suspeita.categoriaSugerida.toLowerCase()} `
        + "em vez de criar um cadastro de contraparte.",
    });
  }

  if (!t.origem || !t.origem.trim()) {
    out.push({
      codigo: "sem_origem",
      mensagem:
        "Todo título precisa dizer de onde veio — venda, contrato, importação, "
        + "lançamento manual ou conciliação. Sem isso não há como responder por que "
        + "ele existe, que é a primeira pergunta de quem encontra um título estranho "
        + "na lista de cobrança.",
    });
  }

  return out;
}

/* ========================================================================== */
/* O portão do score de crédito                                                */
/* ========================================================================== */

export interface ContraparteParaScore {
  tipo?: TipoContraparte | null;
  nome?: string | null;
  documento?: string | null;
  /** Já teve ao menos um título liquidado? Cliente sem histórico não tem o que pontuar. */
  temHistorico?: boolean;
}

export interface MotivoSemScore {
  codigo: "nao_e_cliente" | "contraparte_suspeita" | "sem_identificacao";
  mensagem: string;
}

/**
 * ⚠️ **Score é uma afirmação sobre alguém.** Atribuí-lo a "IOF ROTATIVO"
 * produz um número com aparência de análise, e — pior — esse número entra na
 * média ponderada da carteira, movendo um indicador que o dono usa para decidir
 * a quem vender a prazo.
 *
 * Devolve `null` quando a contraparte PODE ser pontuada.
 */
export function motivoSemScore(c: ContraparteParaScore): MotivoSemScore | null {
  const suspeita = contraparteSuspeita(c.nome);
  if (suspeita) {
    return {
      codigo: "contraparte_suspeita",
      mensagem:
        `"${c.nome}" ${suspeita.porque} — não há a quem atribuir probabilidade de pagamento.`,
    };
  }
  if (!c.tipo || !podeTerScore(c.tipo)) {
    return {
      codigo: "nao_e_cliente",
      mensagem:
        "Score de crédito só existe para cliente identificado. "
        + "Fornecedor, órgão público e instituição financeira não são cobrados por nós.",
    };
  }
  if (!soDigitos(c.documento) && !(c.nome ?? "").trim()) {
    return {
      codigo: "sem_identificacao",
      mensagem: "Sem nome nem documento não há contraparte a pontuar.",
    };
  }
  return null;
}

/** Atalho: a contraparte pode receber score? */
export const podePontuar = (c: ContraparteParaScore): boolean => motivoSemScore(c) === null;
