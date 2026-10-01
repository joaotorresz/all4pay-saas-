"use client";

/**
 * Persistência dos cadastros que AINDA moram no estado da empresa (contratos,
 * extras de contato e de produto) — e a leitura, SÓ leitura, das moradas
 * antigas de contas bancárias e plano de contas.
 *
 * ⚠️ Contas bancárias, centros, projetos e plano de contas passaram a morar nas
 * TABELAS (`lib/cadastros-hierarquia`, migration `20260930180000`). O que ficou
 * deles aqui é o leitor do cadastro antigo deste navegador.
 *
 * Síncrono de propósito — os formulários precisam do dado na hora.
 */
import { chaveCategoria } from "@/core/categorias/chave";
import type { ContaBancaria, CategoriaPlano, Contrato } from "@/core/registros";

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

/* ------------------- contas bancárias · plano de contas (ANTIGOS) ------------------- */

/**
 * ⚠️ **SÓ LEITURA, e só do que ficou no navegador.** Desde a migration
 * `20260930180000` a conta bancária mora em `financial_accounts` e o plano de
 * contas em `categories` — os dois lidos e gravados por
 * `lib/cadastros-hierarquia`. Estas chaves guardavam id NUMÉRICO próprio, e os
 * lançamentos apontam para UUID: as duas moradas só se encontravam pelo nome.
 *
 * Os ESCRITORES daqui foram REMOVIDOS (não desligados): um escritor que ainda
 * existe é um escritor que a próxima tela chama. O que ficou é o que a tela
 * nova precisa para oferecer "Trazer para o cadastro" e o que os consumidores
 * ainda não migrados (parte 2: formulários) leem. A guarda `CAD` cobra que
 * nenhum escritor volte.
 */

const K_CONTAS = "a4p_contas_bancarias";

export const listContasBancarias = (): ContaBancaria[] => ler<ContaBancaria[]>(K_CONTAS, []);

/** Bancos oferecidos no select — os mesmos que o resto do app já reconhece. */
export const BANCOS = [
  "Itaú", "Bradesco", "Banco do Brasil", "Santander", "Caixa Econômica",
  "Nubank", "Inter", "C6 Bank", "BTG Pactual", "Sicoob", "Sicredi",
  "Safra", "Banrisul", "PagBank", "Mercado Pago", "Stone", "Outro",
];

const K_PLANO = "a4p_plano_contas";
const K_USOS = "a4p_plano_usos";

export const listPlanoContas = (): CategoriaPlano[] => ler<CategoriaPlano[]>(K_PLANO, []);
export const listUsosPadrao = (): Record<string, string> => ler<Record<string, string>>(K_USOS, {});

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
    if (c.dreLinha) out[chaveCategoria(c.nome)] = c.dreLinha;
  }
  return out;
}
