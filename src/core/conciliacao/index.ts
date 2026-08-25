/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONCILIAÇÃO — casar o extrato com o que o sistema registrou
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **MEDIDO em produção (19/08/2026), e é pior do que o A4P-029 dizia:**
 * 889 lançamentos liquidados sem transação bancária casada, **R$ 10.708.977,57**,
 * **5,5% conciliado**, o mais antigo pendente de **03/07/2025**.
 *
 * ⚠️ E a causa não é o casador: existem **52 transações bancárias** contra 941
 * lançamentos liquidados. Não há com o que casar. Melhorar o algoritmo sem
 * trazer o extrato é otimizar a ponta errada — fica DITO aqui para a próxima
 * sessão não perseguir o casador achando que o problema é ele.
 *
 * O que este motor resolve é o DEPOIS: quando o extrato chegar, casar bem,
 * dizer o que não casou, e nunca casar duas vezes a mesma coisa.
 */

export const CONCILIACAO_VERSION = "conciliacao/1.0.0";

/** Um lado: o que o banco diz que aconteceu. */
export type LinhaExtrato = {
  id: string;
  data: string;
  /** Positivo = entrou; negativo = saiu. */
  valor: number;
  descricao: string;
};

/** O outro lado: o que o sistema registrou. */
export type TituloConciliavel = {
  id: string;
  data: string;
  valor: number;
  tipo: "entrada" | "saida";
  descricao: string;
};

/**
 * A tolerância, SEMPRE explícita.
 *
 * ⚠️ **Casar valores diferentes sem declarar a tolerância é o defeito.** Um
 * match "aproximado" invisível esconde que R$ 1.000 foi casado com R$ 987 — e
 * a diferença de R$ 13 vira um resíduo que ninguém procura. Aqui a tolerância
 * entra por parâmetro, aparece no resultado, e a tela a mostra.
 */
export type Tolerancia = {
  /** Dias de diferença aceitos entre a data do banco e a do título. */
  dias: number;
  /** Diferença de valor aceita, em reais. `0` = só o exato. */
  centavos: number;
};

export const TOLERANCIA_EXATA: Tolerancia = { dias: 0, centavos: 0 };
export const TOLERANCIA_PADRAO: Tolerancia = { dias: 3, centavos: 0 };

export type TipoMatch = "exato" | "aproximado" | "multiplo";

export type Match = {
  extratoIds: string[];
  tituloIds: string[];
  tipo: TipoMatch;
  /** A diferença que sobrou, em reais. Zero no exato. */
  diferenca: number;
  /** A tolerância USADA — vai para a tela, não fica implícita. */
  tolerancia: Tolerancia;
};

const dias = (a: string, b: string) =>
  Math.abs(new Date(a + "T00:00:00").getTime() - new Date(b + "T00:00:00").getTime()) / 86_400_000;

/** O valor com sinal do título — a convenção de sinal da ONDA 1. */
const assinado = (t: TituloConciliavel) => (t.tipo === "entrada" ? t.valor : -t.valor);

const cent = (n: number) => Math.round(n * 100);

/**
 * Casa extrato × títulos.
 *
 * ⚠️ **Nenhum id entra em dois matches.** Casar o mesmo lançamento com dois
 * títulos dobra a baixa: dois títulos ficam quitados por um dinheiro só, e o
 * saldo do sistema descola do banco pelo valor do segundo. É a invariante que
 * a guarda cobra primeiro.
 *
 * A ordem é deliberada: **exato primeiro**, depois aproximado, depois múltiplo.
 * Começar pelo múltiplo consumiria em uma soma um título que casaria sozinho e
 * certo com outra linha.
 */
export function conciliar(
  extrato: LinhaExtrato[], titulos: TituloConciliavel[], tol: Tolerancia = TOLERANCIA_PADRAO,
): { matches: Match[]; extratoSobrando: LinhaExtrato[]; titulosSobrando: TituloConciliavel[] } {
  const usadosE = new Set<string>();
  const usadosT = new Set<string>();
  const matches: Match[] = [];

  const livresT = () => titulos.filter((t) => !usadosT.has(t.id));

  // 1. EXATO — mesmo centavo, mesmo dia.
  for (const e of extrato) {
    if (usadosE.has(e.id)) continue;
    const alvo = livresT().find((t) => cent(assinado(t)) === cent(e.valor) && dias(t.data, e.data) === 0);
    if (!alvo) continue;
    usadosE.add(e.id); usadosT.add(alvo.id);
    matches.push({ extratoIds: [e.id], tituloIds: [alvo.id], tipo: "exato", diferenca: 0, tolerancia: TOLERANCIA_EXATA });
  }

  // 2. APROXIMADO — dentro da tolerância DECLARADA.
  for (const e of extrato) {
    if (usadosE.has(e.id)) continue;
    let melhor: TituloConciliavel | null = null;
    let melhorDif = Infinity;
    for (const t of livresT()) {
      const dif = Math.abs(cent(assinado(t)) - cent(e.valor)) / 100;
      if (dif > tol.centavos) continue;
      const dd = dias(t.data, e.data);
      if (dd > tol.dias) continue;
      // ⚠️ Sinal OPOSTO nunca casa, nem dentro da tolerância: uma entrada não
      // quita uma saída, e casar os dois some com duas coisas de uma vez.
      if (Math.sign(assinado(t)) !== Math.sign(e.valor)) continue;
      const custo = dif * 1000 + dd;
      if (custo < melhorDif) { melhor = t; melhorDif = custo; }
    }
    if (!melhor) continue;
    usadosE.add(e.id); usadosT.add(melhor.id);
    matches.push({
      extratoIds: [e.id], tituloIds: [melhor.id], tipo: "aproximado",
      diferenca: Math.round((assinado(melhor) - e.valor) * 100) / 100, tolerancia: tol,
    });
  }

  // 3. MÚLTIPLO — uma linha do banco contra VÁRIOS títulos (o pagamento em
  //    lote), e vários lançamentos do banco contra UM título (a parcela paga
  //    em duas transferências). Só soma EXATA: aproximar uma soma multiplica a
  //    tolerância pelo número de parcelas e o resíduo cresce sem ninguém ver.
  for (const e of extrato) {
    if (usadosE.has(e.id)) continue;
    const candidatos = livresT().filter(
      (t) => Math.sign(assinado(t)) === Math.sign(e.valor) && dias(t.data, e.data) <= tol.dias);
    const combo = somaExata(candidatos, cent(e.valor));
    if (!combo) continue;
    usadosE.add(e.id); for (const t of combo) usadosT.add(t.id);
    matches.push({
      extratoIds: [e.id], tituloIds: combo.map((t) => t.id), tipo: "multiplo",
      diferenca: 0, tolerancia: { dias: tol.dias, centavos: 0 },
    });
  }
  for (const t of titulos) {
    if (usadosT.has(t.id)) continue;
    const livresE = extrato.filter((e) => !usadosE.has(e.id)
      && Math.sign(e.valor) === Math.sign(assinado(t)) && dias(t.data, e.data) <= tol.dias);
    const combo = somaExataExtrato(livresE, cent(assinado(t)));
    if (!combo) continue;
    usadosT.add(t.id); for (const e of combo) usadosE.add(e.id);
    matches.push({
      extratoIds: combo.map((e) => e.id), tituloIds: [t.id], tipo: "multiplo",
      diferenca: 0, tolerancia: { dias: tol.dias, centavos: 0 },
    });
  }

  return {
    matches,
    extratoSobrando: extrato.filter((e) => !usadosE.has(e.id)),
    titulosSobrando: titulos.filter((t) => !usadosT.has(t.id)),
  };
}

/**
 * Subconjunto que soma EXATAMENTE o alvo (em centavos).
 *
 * ⚠️ Teto de 6 itens e de 2^6 combinações: um pagamento em lote real tem 2 a 5
 * títulos, e deixar a busca crescer transforma a tela em travamento — e uma
 * combinação de 12 parcelas que "soma" é quase sempre coincidência, não o fato.
 */
function somaExata(itens: TituloConciliavel[], alvoCent: number): TituloConciliavel[] | null {
  const pool = itens.slice(0, 6);
  for (let mascara = 1; mascara < (1 << pool.length); mascara++) {
    let soma = 0; const escolha: TituloConciliavel[] = [];
    for (let i = 0; i < pool.length; i++) if (mascara & (1 << i)) { soma += cent(assinado(pool[i])); escolha.push(pool[i]); }
    if (escolha.length >= 2 && soma === alvoCent) return escolha;
  }
  return null;
}
function somaExataExtrato(itens: LinhaExtrato[], alvoCent: number): LinhaExtrato[] | null {
  const pool = itens.slice(0, 6);
  for (let mascara = 1; mascara < (1 << pool.length); mascara++) {
    let soma = 0; const escolha: LinhaExtrato[] = [];
    for (let i = 0; i < pool.length; i++) if (mascara & (1 << i)) { soma += cent(pool[i].valor); escolha.push(pool[i]); }
    if (escolha.length >= 2 && soma === alvoCent) return escolha;
  }
  return null;
}

export type Saude = {
  total: number;
  conciliados: number;
  /** 0..1 — ⚠️ derivado da CONTAGEM real, nunca guardado à parte. */
  fracao: number;
  valorEmAberto: number;
  /** ISO do pendente mais antigo, ou null. */
  maisAntigo: string | null;
  /** Dias que o mais antigo está parado. */
  diasDoMaisAntigo: number | null;
};

/**
 * ⚠️ O percentual sai da CONTAGEM, sempre. Guardar um "percentual conciliado"
 * em outro lugar cria a segunda fonte que diverge — e um painel de saúde que
 * discorda da lista é pior que não ter painel.
 */
export function saude(titulos: TituloConciliavel[], conciliadosIds: Set<string>, hoje: string): Saude {
  const total = titulos.length;
  const conciliados = titulos.filter((t) => conciliadosIds.has(t.id)).length;
  const abertos = titulos.filter((t) => !conciliadosIds.has(t.id));
  const valorEmAberto = Math.round(abertos.reduce((s, t) => s + Math.abs(t.valor), 0) * 100) / 100;
  const datas = abertos.map((t) => t.data).sort();
  const maisAntigo = datas[0] ?? null;
  return {
    total, conciliados,
    fracao: total === 0 ? 1 : conciliados / total,
    valorEmAberto, maisAntigo,
    diasDoMaisAntigo: maisAntigo === null ? null : Math.round(dias(maisAntigo, hoje)),
  };
}

/**
 * A fila, priorizada por VALOR.
 *
 * ⚠️ Por valor, não por data: conciliar cem cafés antes de uma folha de
 * pagamento é gastar a atenção onde ela rende menos. O mais antigo continua
 * visível no painel de saúde — ele é aviso, não ordem de trabalho.
 */
export function fila(titulos: TituloConciliavel[], conciliadosIds: Set<string>): TituloConciliavel[] {
  return titulos
    .filter((t) => !conciliadosIds.has(t.id))
    .sort((a, b) => Math.abs(b.valor) - Math.abs(a.valor));
}
