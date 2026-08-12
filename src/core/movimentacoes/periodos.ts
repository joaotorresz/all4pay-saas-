/**
 * OS DOZE PERÍODOS — os cortes de tempo da faixa de sazonalidade e as duas
 * agregações que os preenchem.
 *
 * ⚠️ **Saiu do componente (`CarrosselSazonalidade.tsx`) sem mudar uma linha de
 * cálculo.** Enquanto morava num `.tsx`, nenhuma guarda alcançava: o
 * `engine-audit` roda em Node com `--experimental-strip-types`, que não parseia
 * JSX. Uma agregação de dinheiro que nenhum teste consegue importar é uma
 * agregação sem rede — e esta é a que responde "quanto vence em cada mês".
 * O componente segue reexportando tudo, então nenhum ponto de chamada mudou.
 */
import { dataDe, magnitude, assinado } from "@/core/indicadores";
import type { RiskInput } from "@/core/risk-engine/types";
import { filtrarTitulos, type Direcao } from "./index";

export type Granularidade = "mes" | "semana";

export interface PeriodoSazonal {
  key: string;
  label: string;
  de: string;
  ate: string;
  entradas: number;
  saidas: number;
  resultado: number;
  /**
   * O TOTAL do período — só a agregação por vencimento o preenche.
   *
   * ⚠️ Campo próprio, e não `resultado` reaproveitado: as duas grandezas
   * respondem perguntas diferentes e uma delas pode ser negativa. Guardá-las na
   * mesma casa faria a faixa de títulos herdar a cor e o sinal do resultado no
   * dia em que alguém mexesse no desenho — que é o mesmo defeito de duas
   * leituras num rótulo só.
   */
  total?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`);

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** Os doze períodos terminando no de hoje, do mais antigo ao atual. */
export function montarPeriodos(hojeISO: string, gran: Granularidade): PeriodoSazonal[] {
  const hoje = parse(hojeISO);
  const out: PeriodoSazonal[] = [];
  for (let i = 11; i >= 0; i--) {
    if (gran === "mes") {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      const fim = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      out.push({
        key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`,
        label: `${MESES[d.getMonth()]}${d.getFullYear() !== hoje.getFullYear() ? ` '${String(d.getFullYear()).slice(2)}` : ""}`,
        de: iso(d), ate: iso(fim), entradas: 0, saidas: 0, resultado: 0,
      });
    } else {
      const dom = new Date(hoje); dom.setDate(hoje.getDate() - hoje.getDay() - i * 7);
      const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
      out.push({
        key: `w-${iso(dom)}`,
        label: `${dom.getDate()}/${MES_ABBR[dom.getMonth()]} – ${sab.getDate()}/${MES_ABBR[sab.getMonth()]}`,
        de: iso(dom), ate: iso(sab), entradas: 0, saidas: 0, resultado: 0,
      });
    }
  }
  return out;
}

/**
 * Preenche os períodos com os movimentos.
 *
 * ⚠️ A data de caixa vem de `core/indicadores` (`dataDe`), e o pendente entra
 * pelo VENCIMENTO — a faixa mostra o que já aconteceu E o que está previsto,
 * porque a pergunta sazonal é sobre o mês, não sobre o extrato bancário.
 */
export function periodosComValores(
  input: RiskInput | undefined,
  hojeISO: string,
  gran: Granularidade,
): PeriodoSazonal[] {
  const ps = montarPeriodos(hojeISO, gran);
  if (!input) return ps;
  for (const m of input.movements) {
    if (m.status === "cancelado") continue;
    const d = dataDe(m, "caixa") ?? m.due_date?.slice(0, 10);
    if (!d) continue;
    const p = ps.find((x) => d >= x.de && d <= x.ate);
    if (!p) continue;
    if (m.type === "entrada") p.entradas += magnitude(m);
    else p.saidas += magnitude(m);
  }
  for (const p of ps) p.resultado = p.entradas - p.saidas;
  return ps;
}

/**
 * O TOTAL A PAGAR (ou a receber) de cada período — agregação NOVA, ao lado da
 * de resultado, nunca no lugar dela.
 *
 * ⚠️ **Por que uma função nova e não um parâmetro na de cima.** A de resultado
 * é consumida pelo extrato, onde a pergunta é "como foi o mês" — entradas menos
 * saídas, com sinal e com cor. Aqui a pergunta é "quanto vence neste período",
 * e ela **não tem sinal**: uma soma de obrigações é uma grandeza positiva ou é
 * zero. Mudar a existente para servir às duas faria o extrato mudar de leitura
 * junto, e o mesmo mês passaria a dizer coisas diferentes conforme quem
 * chamasse.
 *
 * ⚠️ **A DATA é o VENCIMENTO**, não a de caixa. A faixa somava pelo caixa
 * enquanto a tabela e os cards filtravam por vencimento, e as duas leituras
 * discordavam na mesma tela — a tela precisava de uma frase explicando a
 * diferença. Saindo os dois do mesmo `filtrarTitulos`, a explicação deixa de
 * ser necessária: a barra do mês é o total dos títulos que a tabela lista.
 *
 * ⚠️ **Não pode dar negativo, e isso não é um `Math.abs` escondido.** O
 * conjunto vem de `filtrarTitulos(direcao)`, que já fixou o SENTIDO (só saídas
 * no pagar, só entradas no receber); com o sentido fixo não há o que subtrair,
 * e `magnitude` é a leitura canônica do valor de um lançamento (ONDA 1: o
 * `amount` é magnitude, a direção mora no `type`). Período sem título soma
 * ZERO — que é a resposta "nada vence aqui", e não uma ausência.
 */
export function periodosPorVencimento(
  input: RiskInput | undefined,
  hojeISO: string,
  gran: Granularidade,
  direcao: Direcao,
): PeriodoSazonal[] {
  const titulos = input ? filtrarTitulos(input, direcao) : [];
  /**
   * ⚠️ **A FAIXA VAI ATÉ ONDE HOUVER TÍTULO, e não para em hoje.**
   *
   * `montarPeriodos` monta doze meses TERMINANDO no mês corrente — a leitura
   * sazonal, que olha para trás. Numa tela de títulos isso esconde o que a
   * pessoa acabou de lançar: uma compra em 12x ou o salário agendado para
   * dezembro ficavam fora da faixa, sem cápsula para clicar e sem coluna no
   * gráfico. Quem lançou concluía que o lançamento não entrou.
   *
   * Estender é aritmética sobre o dado, não uma janela fixa: o último mês é o
   * do vencimento mais distante que EXISTE. Teto de 36 meses à frente para um
   * título com data digitada errada (2099) não gerar mil cápsulas.
   */
  const ultimo = titulos.reduce(
    (max, m) => { const d = m.due_date?.slice(0, 10) ?? ""; return d > max ? d : max; },
    "",
  );
  const ps = montarPeriodos(hojeISO, gran).map((p) => ({ ...p, total: 0 }));
  if (ultimo) {
    const fimAtual = ps[ps.length - 1]?.ate ?? hojeISO;
    let guarda = 0;
    while (ultimo > (ps[ps.length - 1]?.ate ?? fimAtual) && guarda++ < TETO_FUTURO) {
      ps.push({ ...proximoPeriodo(ps[ps.length - 1], gran), total: 0 });
    }
  }
  if (!input) return ps;
  for (const m of titulos) {
    const d = m.due_date?.slice(0, 10);
    if (!d) continue;
    const p = ps.find((x) => d >= x.de && d <= x.ate);
    if (!p) continue;
    p.total = (p.total ?? 0) + magnitude(m);
  }
  return ps;
}

/** Quantos períodos a faixa aceita ADIANTE do mês corrente. */
const TETO_FUTURO = 36;

/**
 * O período seguinte a um dado — mesma aritmética de `montarPeriodos`, para as
 * duas nunca discordarem sobre onde um mês começa.
 */
function proximoPeriodo(ultimo: PeriodoSazonal, gran: Granularidade): PeriodoSazonal {
  if (gran === "semana") {
    const dom = new Date(`${ultimo.ate}T00:00:00Z`); dom.setUTCDate(dom.getUTCDate() + 1);
    const sab = new Date(dom); sab.setUTCDate(dom.getUTCDate() + 6);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    return {
      key: `w-${iso(dom)}`,
      label: `${dom.getUTCDate()}/${MES_ABBR[dom.getUTCMonth()]} – ${sab.getUTCDate()}/${MES_ABBR[sab.getUTCMonth()]}`,
      de: iso(dom), ate: iso(sab), entradas: 0, saidas: 0, resultado: 0,
    };
  }
  const [a, m] = ultimo.key.split("-").map(Number);
  const ini = new Date(Date.UTC(a, m, 1));
  const fim = new Date(Date.UTC(a, m + 1, 0));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const anoAtual = new Date(`${ultimo.ate}T00:00:00Z`).getUTCFullYear();
  return {
    key: `${ini.getUTCFullYear()}-${pad(ini.getUTCMonth() + 1)}`,
    label: `${MESES[ini.getUTCMonth()]}${ini.getUTCFullYear() !== anoAtual ? ` '${String(ini.getUTCFullYear()).slice(2)}` : ""}`,
    de: iso(ini), ate: iso(fim), entradas: 0, saidas: 0, resultado: 0,
  };
}

/** Soma assinada dos movimentos de um período — usada pelas guardas. */
export const resultadoDoPeriodo = (input: RiskInput, p: PeriodoSazonal): number =>
  input.movements
    .filter((m) => m.status !== "cancelado")
    .filter((m) => {
      const d = dataDe(m, "caixa") ?? m.due_date?.slice(0, 10);
      return !!d && d >= p.de && d <= p.ate;
    })
    .reduce((s, m) => s + assinado(m), 0);

