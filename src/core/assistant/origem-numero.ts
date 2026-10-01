/**
 * De onde sai cada número que a IA cita — a tela que mostra o MESMO número
 * (Rodada 5; pendência declarada da ONDA 14: "o link clicável de cada número
 * para a tela de origem").
 *
 * ⚠️ CONSERVADOR DE PROPÓSITO. Um rótulo ambíguo ("Vencido", "Total", "Valor")
 * fica SEM link: levar a pessoa à tela errada é pior que não levar — ela
 * compara, não acha o número e conclui que a IA inventou. Calculadoras
 * (parcela, markup, payback) também ficam sem link: o número nasce da
 * pergunta, não existe em tela nenhuma.
 *
 * ⚠️ Toda rota daqui tem de existir no inventário e NÃO ser alias — a guarda
 * cobra (um link para um redirecionamento é um 308 a cada clique).
 */
export interface OrigemNumero { rota: string; tela: string }

const REGRAS: { re: RegExp; origem: OrigemNumero }[] = [
  { re: /^(saldo|saldo atual)$/i, origem: { rota: "/", tela: "Início" } },
  { re: /^(runway|burn|queima\/m[eê]s|dias de caixa|ruptura|prob\. ruptura \(60d\)|caixa fica negativo|proje[cç][aã]o)$/i,
    origem: { rota: "/fluxo-caixa", tela: "Fluxo de caixa" } },
  { re: /^(receita bruta|receita l[ií]quida|ebitda|margem ebitda|lucro l[ií]quido|margem (bruta|l[ií]quida)|carga tribut[aá]ria)$/i,
    origem: { rota: "/dashboard/reports/dre", tela: "DRE" } },
  { re: /^(total a receber|recebido no m[eê]s|total recebido|a receber)$/i,
    origem: { rota: "/contas-a-receber", tela: "Contas a receber" } },
  { re: /^(total a pagar|total pago|a pagar)$/i,
    origem: { rota: "/contas-a-pagar", tela: "Contas a pagar" } },
  { re: /^(t[ií]tulos vencidos|total em atraso)$/i,
    origem: { rota: "/dashboard/financial/overdue", tela: "Inadimplência" } },
  { re: /^custo fixo$/i, origem: { rota: "/contas-a-pagar/recorrentes", tela: "Contas recorrentes" } },
];

/** A tela de origem do número com este rótulo — ou `null` quando não há uma só. */
export function origemDoNumero(rotulo: string): OrigemNumero | null {
  const r = rotulo.trim();
  return REGRAS.find((x) => x.re.test(r))?.origem ?? null;
}

/** As rotas que este mapa promete — para a guarda conferir no inventário. */
export const ROTAS_DE_ORIGEM: readonly string[] = Array.from(new Set(REGRAS.map((x) => x.origem.rota)));
