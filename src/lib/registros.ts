"use client";

/**
 * Persistência dos cadastros do módulo de registros (localStorage, demo-safe).
 *
 * Contas bancárias vivem em `financial_accounts` (nome, banco, saldo) — o resto
 * do que estas telas cadastram (tipo, agência, número, código Domínio, dias de
 * fatura) NÃO tem coluna. Em vez de inventar migração agora, os campos extras
 * ficam aqui indexados pelo id da conta: a tela funciona inteira, o saldo
 * continua vindo da fonte real, e a promoção para tabela é um passo isolado.
 *
 * Síncrono de propósito — os formulários precisam do dado na hora.
 */
import type { ContaBancaria, CategoriaPlano, Contrato } from "@/core/registros";

/* --------------------------------- base --------------------------------- */

function ler<T>(chave: string, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    const s = localStorage.getItem(chave);
    return s ? (JSON.parse(s) as T) : padrao;
  } catch {
    return padrao;
  }
}
function gravar(chave: string, v: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(chave, JSON.stringify(v)); } catch { /* cota cheia */ }
}

let seq = 0;
/** Id curto e copiável, no formato dos prints (numérico crescente). */
export const novoIdRegistro = (): string => `${217_000 + Date.now() % 100_000 + seq++}`;

/* ---------------------------- contas bancárias ---------------------------- */

const K_CONTAS = "a4p_contas_bancarias";

export const listContasBancarias = (): ContaBancaria[] => ler<ContaBancaria[]>(K_CONTAS, []);

export function salvarContaBancaria(c: ContaBancaria): ContaBancaria[] {
  const atual = listContasBancarias().filter((x) => x.id !== c.id);
  const out = [{ ...c, id: c.id || novoIdRegistro() }, ...atual];
  gravar(K_CONTAS, out);
  return out;
}
export function removerContaBancaria(id: string): ContaBancaria[] {
  const out = listContasBancarias().filter((c) => c.id !== id);
  gravar(K_CONTAS, out);
  return out;
}

/** Bancos oferecidos no select — os mesmos que o resto do app já reconhece. */
export const BANCOS = [
  "Itaú", "Bradesco", "Banco do Brasil", "Santander", "Caixa Econômica",
  "Nubank", "Inter", "C6 Bank", "BTG Pactual", "Sicoob", "Sicredi",
  "Safra", "Banrisul", "PagBank", "Mercado Pago", "Stone", "Outro",
];

/* ------------------------------ plano de contas ------------------------------ */

const K_PLANO = "a4p_plano_contas";
const K_USOS = "a4p_plano_usos";

/** Plano inicial opinativo (negócios digitais) — o ponto de partida editável. */
function planoPadrao(): CategoriaPlano[] {
  const cats: CategoriaPlano[] = [];
  const add = (nome: string, natureza: "receita" | "despesa", paiId: string | null, id: string) =>
    cats.push({ id, nome, codigo: "", natureza, paiId });

  add("Receitas de Produtos", "receita", null, "217266");
  add("Produto Físico", "receita", "217266", "217267");
  add("Produto Online", "receita", "217266", "217268");
  add("Outros Produtos", "receita", "217266", "217269");
  add("Receitas de Serviços", "receita", null, "217270");
  add("Mentoria", "receita", "217270", "217271");
  add("Treinamento", "receita", "217270", "217272");
  add("Consultoria", "receita", "217270", "217273");
  add("Receitas Financeiras", "receita", null, "217274");
  add("Rendimento de Aplicações", "receita", "217274", "217275");
  add("Devolução de Estorno", "receita", "217274", "217276");
  add("Reserva a Receber", "receita", "217274", "217277");
  add("Saque da Plataforma", "receita", "217274", "217278");
  add("Reembolso", "receita", "217274", "217279");

  add("Custos de Venda", "despesa", null, "217280");
  add("Taxa Plataforma", "despesa", "217280", "217281");
  add("Taxa de Antecipação", "despesa", "217280", "217282");
  add("Taxa Comissao Coprodutor", "despesa", "217280", "217283");
  add("Taxa Comissao Afiliado", "despesa", "217280", "217284");
  add("Tarifa De Streaming", "despesa", "217280", "217285");
  add("Chargeback", "despesa", "217280", "217286");
  add("Reembolsado", "despesa", "217280", "217287");
  add("Despesas Operacionais", "despesa", null, "217288");
  add("Folha de Pagamento", "despesa", "217288", "217289");
  add("Marketing", "despesa", "217288", "217290");
  add("Software e Assinaturas", "despesa", "217288", "217291");
  add("Aluguel", "despesa", "217288", "217292");
  add("Despesas Financeiras", "despesa", null, "217293");
  add("Tarifas Bancárias", "despesa", "217293", "217294");
  add("Juros", "despesa", "217293", "217295");
  add("Bloqueio Judicial", "despesa", "217293", "217296");
  add("Reserva a Pagar", "despesa", "217293", "217297");
  add("Impostos", "despesa", null, "217298");
  add("Simples Nacional", "despesa", "217298", "217299");
  return cats;
}

export function listPlanoContas(): CategoriaPlano[] {
  const salvo = ler<CategoriaPlano[] | null>(K_PLANO, null);
  // Sem nada salvo, serve o plano padrão SEM gravar: quem nunca editou continua
  // vendo o padrão atualizado quando ele melhorar.
  return salvo && salvo.length > 0 ? salvo : planoPadrao();
}
export function salvarPlanoContas(cats: CategoriaPlano[]): CategoriaPlano[] {
  gravar(K_PLANO, cats);
  return cats;
}
export const resetarPlanoContas = (): CategoriaPlano[] => {
  gravar(K_PLANO, []);
  return planoPadrao();
};

export const listUsosPadrao = (): Record<string, string> => ler<Record<string, string>>(K_USOS, {});
export function salvarUsoPadrao(funcaoId: string, categoriaId: string): Record<string, string> {
  const out = { ...listUsosPadrao(), [funcaoId]: categoriaId };
  gravar(K_USOS, out);
  return out;
}

/* -------------------------------- contratos -------------------------------- */

const K_CONTRATOS = "a4p_contratos";

export const listContratos = (): Contrato[] => ler<Contrato[]>(K_CONTRATOS, []);
export function salvarContrato(c: Contrato): Contrato[] {
  const atual = listContratos().filter((x) => x.id !== c.id);
  const out = [{ ...c, id: c.id || novoIdRegistro() }, ...atual];
  gravar(K_CONTRATOS, out);
  return out;
}
export function removerContrato(id: string): Contrato[] {
  const out = listContratos().filter((c) => c.id !== id);
  gravar(K_CONTRATOS, out);
  return out;
}

/* ------------------------- extras de party / produto ------------------------- */

/**
 * Campos que os cadastros de cliente/fornecedor pedem e a tabela `parties`
 * ainda não tem (categoria padrão, PIX, ativo, bloco PJ). Mesma estratégia das
 * contas: indexado pelo id, sem tocar no schema.
 */
export interface ExtraParty {
  categoriaPadrao?: string;
  chavePix?: string;
  observacao?: string;
  ativo?: boolean;
  nomeFantasia?: string;
  inscricaoMunicipal?: string;
  inscricaoEstadual?: string;
  optanteSimples?: "sim" | "nao" | "";
  contribuinteEstadual?: "sim" | "nao" | "";
  identificadorEstrangeiro?: string;
  dataFundacao?: string;
  faturamentoMensal?: number;
  site?: string;
  pais?: string;
}

const K_EXTRA_PARTY = "a4p_party_extra";

export const listExtrasParty = (): Record<string, ExtraParty> =>
  ler<Record<string, ExtraParty>>(K_EXTRA_PARTY, {});
export const extraParty = (id: string): ExtraParty => listExtrasParty()[id] ?? {};
export function salvarExtraParty(id: string, e: ExtraParty): void {
  gravar(K_EXTRA_PARTY, { ...listExtrasParty(), [id]: { ...extraParty(id), ...e } });
}

/** Tipo fiscal do produto — decide o que sai (ou não) na nota. */
export type TipoProduto = "sem_nf" | "produto" | "servico" | "split";
export const TIPOS_PRODUTO: { id: TipoProduto; label: string }[] = [
  { id: "sem_nf", label: "Não vou emitir NFs" },
  { id: "produto", label: "Produto" },
  { id: "servico", label: "Serviço" },
  { id: "split", label: "Split" },
];

export interface ExtraProduto { tipo?: TipoProduto; ativo?: boolean; descricao?: string }

const K_EXTRA_PROD = "a4p_produto_extra";
export const listExtrasProduto = (): Record<string, ExtraProduto> =>
  ler<Record<string, ExtraProduto>>(K_EXTRA_PROD, {});
export const extraProduto = (id: string): ExtraProduto => listExtrasProduto()[id] ?? {};
export function salvarExtraProduto(id: string, e: ExtraProduto): void {
  gravar(K_EXTRA_PROD, { ...listExtrasProduto(), [id]: { ...extraProduto(id), ...e } });
}
