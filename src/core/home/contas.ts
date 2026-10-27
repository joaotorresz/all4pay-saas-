/**
 * SALDO TOTAL EM CONTAS — o card principal da Home (pedido do dono, 27/10/2026).
 *
 * Soma o saldo de TODAS as contas cadastradas e mostra quanto está em cada
 * banco. Puro: recebe as contas como vieram do banco (`financial_accounts`),
 * nunca os lançamentos — o nível do saldo é do banco (`core/indicadores`,
 * convenção 4), e somar movimentos aqui seria uma segunda conta do mesmo número.
 *
 * Duas contas do mesmo banco viram UMA bolinha (o pedido é "uma bolinha com a
 * logo do banco"), com o número de contas dito ao lado. A chave do banco vem
 * em `bank`; sem ela, o nome da conta decide.
 */

export const CONTAS_HOME_VERSION = "home-contas/1.0.0";

export interface ContaDoSaldo {
  id: string;
  name: string;
  bank: string | null | undefined;
  balance: number;
}

export interface SaldoDoBanco {
  /** A chave do banco (`itau`) ou, sem ela, o nome da conta. */
  banco: string;
  /** Nome para mostrar: a conta, se for uma só; senão o primeiro nome antes do "·". */
  nome: string;
  saldo: number;
  contas: number;
  /** Parte do total POSITIVO (0–1); `null` quando não há saldo positivo para dividir. */
  parte: number | null;
}

export interface SaldoEmContas {
  total: number;
  bancos: SaldoDoBanco[];
  /** Quantas contas entraram na soma. */
  contas: number;
}

const chave = (c: ContaDoSaldo) => (c.bank ?? "").trim().toLowerCase() || c.name.trim().toLowerCase();
const nomeCurto = (n: string) => n.split("·")[0].trim() || n.trim();

export function saldoEmContas(contas: ContaDoSaldo[]): SaldoEmContas {
  const grupos = new Map<string, { nomes: string[]; saldo: number; contas: number; banco: string }>();
  for (const c of contas) {
    const v = Number.isFinite(c.balance) ? c.balance : 0;
    const k = chave(c);
    const g = grupos.get(k) ?? { nomes: [], saldo: 0, contas: 0, banco: (c.bank ?? "").trim() || c.name };
    g.nomes.push(c.name);
    g.saldo += v;
    g.contas += 1;
    grupos.set(k, g);
  }
  const lista = Array.from(grupos.values());
  // Centavos inteiros: somar float deixaria 0,1 + 0,2 com resto no fim.
  const total = Math.round(lista.reduce((s, g) => s + Math.round(g.saldo * 100), 0)) / 100;
  const positivo = lista.reduce((s, g) => s + Math.max(0, g.saldo), 0);
  const bancos = lista
    .map((g) => ({
      banco: g.banco,
      nome: g.contas === 1 ? g.nomes[0] : nomeCurto(g.nomes[0]),
      saldo: Math.round(g.saldo * 100) / 100,
      contas: g.contas,
      parte: positivo > 0 ? Math.max(0, g.saldo) / positivo : null,
    }))
    .sort((a, b) => b.saldo - a.saldo);
  return { total, bancos, contas: contas.length };
}
