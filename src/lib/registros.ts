"use client";

/**
 * Persistência dos cadastros do módulo de registros (por EMPRESA, demo-safe).
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
import { linhaDREvalida } from "@/core/registros";

/* --------------------------------- base --------------------------------- */

/**
 * ⚠️ **A persistência é POR EMPRESA — via `store-org`, não `localStorage` cru.**
 *
 * Estas chaves (`a4p_plano_contas`, `a4p_contas_bancarias`, `a4p_centros_custo`,
 * `a4p_projetos`, `a4p_contratos`) já estavam classificadas em `CHAVES_ORG`
 * desde a ONDA 7 — a lista dizia que eram dado de NEGÓCIO e deviam morar no
 * servidor. Só que este arquivo tinha um `ler`/`gravar` PRÓPRIO, escrevendo
 * direto no navegador: a classificação estava certa e não valia nada, porque
 * ninguém a consumia.
 *
 * O efeito era o que a ONDA 7 já tinha nomeado: trocar de máquina perde o plano
 * de contas, dois sócios da mesma empresa nunca veem as mesmas categorias, e
 * limpar o cache apaga a estrutura contábil inteira. Num plano de contas isso é
 * pior que em qualquer outra chave, porque os lançamentos ficam apontando para
 * ids de categoria que deixaram de existir.
 *
 * A API continua SÍNCRONA (o `store-org` mantém o cache local na frente e
 * hidrata do servidor) — nenhum formulário precisou virar assíncrono.
 */
import { ler, gravar } from "@/lib/store-org";

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

/**
 * ⚠️ **O PLANO NASCE VAZIO — e o que saiu daqui foram 32 categorias de
 * fábrica.**
 *
 * O plano padrão era opinativo para "negócios digitais": Taxa Comissao
 * Coprodutor, Tarifa De Streaming, Saque da Plataforma. Uma transportadora, uma
 * clínica ou uma loja abria o formulário e via trinta e duas categorias que não
 * são dela, com as três ou quatro que servem escondidas no meio — e o caminho
 * mais curto era escolher a menos errada. Categoria escolhida por aproximação é
 * lançamento na linha errada do DRE, todo mês, sem nada na tela parecendo
 * defeito.
 *
 * Vazio, o formulário faz a pergunta certa na primeira vez: a lista está vazia,
 * o campo oferece CRIAR o que a pessoa digitou, e a criação exige a linha do
 * DRE. O plano que nasce é o da empresa, e cada categoria dele foi uma decisão.
 */
export const listPlanoContas = (): CategoriaPlano[] => ler<CategoriaPlano[]>(K_PLANO, []);

/**
 * Cria (ou substitui) UMA categoria — o caminho que o formulário de lançamento
 * usa quando a pessoa cria a categoria sem sair de lá.
 *
 * ⚠️ Recusa a linha do DRE que não existe para a natureza. A validação mora
 * aqui, e não só no componente, porque este é o ponto por onde TODA criação
 * passa: uma checagem que vive na tela some no dia em que uma segunda tela
 * chamar a mesma função.
 */
export function salvarCategoria(c: CategoriaPlano): CategoriaPlano[] {
  if (c.dreLinha && !linhaDREvalida(c.dreLinha, c.natureza)) {
    throw new Error(`A linha "${c.dreLinha}" não existe no DRE para uma categoria de ${c.natureza}.`);
  }
  const out = [...listPlanoContas().filter((x) => x.id !== c.id), { ...c, id: c.id || novoIdRegistro() }];
  gravar(K_PLANO, out);
  return out;
}
export function salvarPlanoContas(cats: CategoriaPlano[]): CategoriaPlano[] {
  gravar(K_PLANO, cats);
  return cats;
}
/** Volta ao estado inicial — que agora é o VAZIO, não um plano de fábrica. */
export const resetarPlanoContas = (): CategoriaPlano[] => {
  gravar(K_PLANO, []);
  return [];
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

/* ------------------------- plano de contas → DRE ------------------------- */

/**
 * O MAPA que liga a categoria à linha do DRE — `nome (minúsculo)` → id da linha.
 *
 * ⚠️ **É por aqui que o vínculo sai do cadastro e chega ao relatório.** Ele é
 * montado na TELA e entregue por parâmetro a `montarDRE`/`montarDFC`
 * (`FiltroRelatorio.linhaPorCategoria`), porque `core/relatorios` é puro: ler o
 * plano lá dentro faria o mesmo relatório dar números diferentes conforme o
 * navegador.
 *
 * A chave é o NOME e não o id porque é o nome que viaja no lançamento
 * (`RiskMovement.category` é texto, resolvido de `categories.name`). Categoria
 * sem linha declarada simplesmente não entra no mapa — e aí o relatório cai na
 * classificação por palavra-chave, como sempre fez.
 */
export function linhasDeCategoria(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of listPlanoContas()) {
    if (c.dreLinha) out[c.nome.trim().toLowerCase()] = c.dreLinha;
  }
  return out;
}
