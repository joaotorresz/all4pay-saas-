/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GLOSSÁRIO — uma palavra por coisa, e uma coisa por palavra
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ O produto falava quatro línguas ao mesmo tempo. "A receber" e "recebíveis"
 * apareciam na mesma tela para o mesmo objeto; "movimentações" e "tesouraria"
 * nomeavam a mesma área; "categoria" e "plano de contas" eram usados como
 * sinônimos, quando um é a folha e o outro é a árvore.
 *
 * Isso não é preciosismo de redação. Num produto que mostra números, cada
 * inconsistência textual gasta um pouco da confiança que os números precisam
 * ter: quem lê dois nomes para a mesma coisa conclui — corretamente — que
 * ninguém conferiu o conjunto, e essa dúvida contamina o valor ao lado.
 *
 * **A decisão é sempre a palavra que o usuário usa, não a que o sistema usa.**
 * O dono da padaria diz "o que tenho a receber"; ele não diz "meus recebíveis".
 * Jargão pertence ao código e aos comentários, onde precisão vale mais que
 * familiaridade.
 *
 * Puro, sem I/O. Versão `glossario/1.0.0`.
 */

import type { Procedencia } from "@/core/indicadores";

export const GLOSSARIO_VERSION = "glossario/1.0.0";

export interface Termo {
  /** A palavra que VAI para a tela. */
  termo: string;
  /** O que ela significa, em uma frase, para o usuário. */
  significa: string;
  /**
   * As grafias que NÃO podem aparecer em texto de interface.
   * A guarda varre por elas.
   */
  evitar: string[];
  /** Por que esta e não a outra. */
  porque: string;
  /**
   * Onde a palavra evitada continua legítima (papel de pessoa, nome de arquivo
   * externo, termo contábil obrigatório). Sem esta lista a guarda vira ruído e
   * alguém a desliga.
   */
  excecoes?: string[];
}

export const TERMOS: Termo[] = [
  {
    termo: "a receber",
    significa: "O que alguém deve para a empresa e ainda não pagou.",
    evitar: ["recebíveis", "recebivel", "recebíveis em aberto"],
    porque:
      "\"Recebível\" é palavra de banco e de fundo de investimento. Quem opera o caixa "
      + "de uma empresa pequena diz \"o que tenho a receber\" — e é ela quem lê esta tela.",
    excecoes: ["antecipação de recebíveis"],
  },
  {
    termo: "a pagar",
    significa: "O que a empresa deve e ainda não pagou.",
    evitar: ["pagáveis", "payables"],
    porque: "O espelho de \"a receber\". \"Pagáveis\" não é palavra que ninguém use falando.",
  },
  {
    termo: "movimentações",
    significa: "As entradas e saídas de dinheiro: o que foi lançado, baixado ou transferido.",
    evitar: ["tesouraria"],
    porque:
      "\"Tesouraria\" é o nome do DEPARTAMENTO, não da tela. Usá-lo como seção fazia o "
      + "produto parecer feito para uma empresa com departamento — e a maioria dos clientes é o dono sozinho.",
    excecoes: ["função de tesouraria", "papel na governança"],
  },
  {
    termo: "plano de contas",
    significa: "A árvore inteira: grupos e categorias, com a natureza de cada um.",
    evitar: [],
    porque:
      "É a ESTRUTURA. Já \"categoria\" é a FOLHA que se escolhe num lançamento. "
      + "Usar os dois como sinônimo faz o usuário procurar no lugar errado quando quer criar uma.",
  },
  {
    termo: "categoria",
    significa: "A classificação escolhida em um lançamento — uma folha do plano de contas.",
    evitar: ["conta contábil", "rubrica"],
    porque: "É o que aparece no formulário de lançamento; o resto é vocabulário de contador.",
    excecoes: ["código contábil (Domínio)"],
  },
  {
    termo: "lançamento",
    significa: "Um registro de entrada ou saída de dinheiro.",
    evitar: ["transação financeira", "movimento financeiro"],
    porque: "É a palavra do dia a dia de quem usa sistema financeiro no Brasil.",
  },
  {
    termo: "baixa",
    significa: "Confirmar que um título foi pago ou recebido.",
    evitar: ["liquidação", "settlement"],
    porque: "\"Dar baixa\" é o que se fala; \"liquidar\" é o que o sistema faz por dentro.",
    excecoes: ["liquidado (estado interno)"],
  },
  {
    termo: "saldo",
    significa: "Quanto existe nas contas AGORA — posição, não soma de período.",
    evitar: ["balanço de caixa", "cash position"],
    porque: "Saldo é o termo do extrato bancário, que é a referência que a pessoa tem na cabeça.",
  },
  {
    termo: "empresa",
    significa: "A organização cujos dados estão abertos.",
    evitar: ["tenant", "workspace", "organização (na tela)"],
    porque: "\"Tenant\" e \"workspace\" são palavras de quem constrói o software, não de quem o usa.",
    excecoes: ["organização (nome técnico no banco)"],
  },
  {
    termo: "projeção",
    significa: "Número sobre o futuro — depende de os títulos previstos serem pagos.",
    evitar: ["forecast", "previsão garantida"],
    porque:
      "É o par de \"fato\" na marcação de indicadores. E \"previsão garantida\" é contradição: "
      + "se fosse garantida não seria previsão.",
  },
];

/** Palavras em INGLÊS que não podem aparecer para o usuário final. */
export const ESTRANGEIRISMOS_PROIBIDOS = [
  "dashboard", "overview", "settings", "loading", "not found", "page not found",
  "something went wrong", "try again", "cash flow", "revenue", "expenses",
  "balance", "insights", "workspace", "tenant", "forecast", "payables", "receivables",
];

/* ========================================================================== */
/* FORMATO — um jeito de escrever cada tipo de número                          */
/* ========================================================================== */

/**
 * ⚠️ O percentual saía com 0, 1 e 2 casas — às vezes no MESMO arquivo. Três
 * precisões para a mesma grandeza fazem a tela parecer montada por três pessoas
 * que não se falaram, e é a partir daí que o leitor começa a conferir o número
 * na calculadora.
 *
 * A regra: **uma casa decimal**, porque é o que distingue 12,4% de 12,9% sem
 * fingir uma precisão que a base não tem. Zero casas some com a diferença; duas
 * sugerem uma exatidão que uma média de 90 dias não possui.
 */
export const REGRAS_DE_FORMATO = {
  moeda: {
    regra: "R$1.234,56 — prefixo cinza, milhar com ponto, decimal com vírgula, sempre 2 casas.",
    porque: "É o formato do extrato bancário. Qualquer variação faz o número parecer de outro sistema.",
  },
  percentual: {
    regra: "12,4% — UMA casa decimal, vírgula decimal, sem espaço antes do %.",
    porque: "Zero casas apaga a diferença que importa; duas fingem precisão que a base não tem.",
  },
  data: {
    regra: "31/08/2026 na tela; 31/08 quando o ano é óbvio pelo contexto.",
    porque: "Data por extenso ocupa a largura de três colunas e não se compara de relance.",
  },
  negativo: {
    regra: "−1.234,56 com sinal de menos (U+2212) à esquerda, na cor de negativo. Nunca parênteses.",
    porque:
      "Parênteses são convenção de balanço contábil e metade dos usuários lê como observação. "
      + "E o hífen de teclado é mais curto que o traço do numeral, o que desalinha a coluna.",
  },
  zero: {
    regra: "Zero é neutro: nunca verde, nunca vermelho.",
    porque: "Zero não é ganho nem perda; pintá-lo faz a tela afirmar algo que o número não diz.",
  },
} as const;

/**
 * Toda ocorrência de termo evitado no texto dado.
 *
 * ⚠️ Casa por palavra inteira e ignora o que está dentro de uma exceção
 * declarada — uma guarda que acusa "antecipação de recebíveis" (que é o nome do
 * produto financeiro) seria desligada na primeira semana, e com ela morreria a
 * parte que funciona.
 */
export function termosProibidosEm(texto: string): { evitado: string; use: string }[] {
  const achados: { evitado: string; use: string }[] = [];
  const baixo = texto.toLowerCase();
  for (const t of TERMOS) {
    for (const e of t.evitar) {
      const alvo = e.toLowerCase();
      if (!new RegExp(`\\b${alvo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(baixo)) continue;
      if ((t.excecoes ?? []).some((x) => baixo.includes(x.toLowerCase()))) continue;
      achados.push({ evitado: e, use: t.termo });
    }
  }
  return achados;
}

/** O glossário como texto — é ele que a tela de ajuda publica. */
export const glossarioPublicado = (): { termo: string; significa: string; emVezDe: string[] }[] =>
  TERMOS.map((t) => ({ termo: t.termo, significa: t.significa, emVezDe: t.evitar }));

/* ========================================================================== */
/* A VOZ — o que se afirma e o que se estima                                   */
/* ========================================================================== */

/**
 * ⚠️ O assistente afirmava projeção com a mesma certeza de um extrato: "O
 * runway é de 4 meses". Não é — o runway *seria* de 4 meses **se** o ritmo dos
 * últimos 90 dias continuasse igual, e ele nunca continua igual. A frase
 * assertiva não é só imprecisa: ela é a que vira decisão, porque quem lê "é"
 * não vai conferir a base.
 *
 * A correção não é encher o texto de talvez — texto cheio de ressalva não se lê,
 * e aí a ressalva também não chega. É **uma marca por frase**, no verbo:
 *
 *  - fato → afirma ("entraram", "o saldo é").
 *  - estimativa → mede com margem ("na média dos últimos 90 dias").
 *  - projeção → condiciona ("no ritmo atual, o caixa cobre…").
 *
 * O verbo condicional carrega a incerteza sem gastar uma linha inteira dizendo
 * que é incerto.
 */
export const VOZ = {
  fato: { verbo: "é", prefixo: "", nota: "" },
  estimativa: {
    verbo: "está em torno de",
    prefixo: "Na média do período, ",
    nota: "Média — muda conforme a base muda.",
  },
  projecao: {
    verbo: "cobriria",
    prefixo: "No ritmo atual, ",
    nota: "Projeção — supõe que o ritmo de hoje continue e que os títulos previstos sejam pagos.",
  },
} as const;

/**
 * Prefixa a frase conforme a natureza do número.
 *
 * ⚠️ Só a PRIMEIRA letra é rebaixada, e só quando há prefixo: emendar
 * "No ritmo atual, O runway…" deixa o texto com cara de junção automática — e
 * texto com cara de automático é lido como texto que ninguém revisou.
 */
export function comVoz(natureza: keyof typeof VOZ, frase: string): string {
  const { prefixo } = VOZ[natureza];
  if (!prefixo || !frase) return frase;
  return prefixo + frase.charAt(0).toLowerCase() + frase.slice(1);
}

/**
 * "De onde vem e de que período" — a frase que a ONDA 11 exige em todo
 * indicador não óbvio, montada do que o motor já sabe.
 */
export function textoDeOrigem(p: Procedencia): string {
  const regime =
    p.regime === "posicao" ? "posição das contas"
      : p.regime === "caixa" ? "regime de caixa (data de pagamento)"
      : "regime de competência (data de vencimento)";
  const janela = p.janela.vazia ? "período inválido" : p.janela.label;
  const base = p.regime === "posicao"
    ? `${p.lancamentos} lançamentos considerados`
    : `${p.lancamentos} lançamento${p.lancamentos === 1 ? "" : "s"}`;
  return `Período: ${janela} · ${regime} · ${base}.`;
}
