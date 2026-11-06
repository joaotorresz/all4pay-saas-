"use client";

/**
 * ESTOQUE — leitura do saldo e gravação do movimento (cliente).
 *
 * ⚠️ O saldo vem PRONTO da view `estoque_saldos` (o banco é quem soma). Esta
 * camada só lê e grava; a regra de tela mora em `core/estoque`.
 *
 * ⚠️ O movimento é fato: aqui só existe INSERIR. Corrigir é lançar o contrário
 * ou mandar para a lixeira (`excluir_logico`), como o banco exige.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { TETO_LINHAS } from "@/lib/supabase/consulta";
import { isDemo } from "@/lib/demo";
import {
  saldoDaLinha, linhaDoMovimento, errosDoMovimento,
  type LinhaSaldoBanco, type NovoMovimento, type SaldoProduto,
} from "@/core/estoque";
import type { MovimentoDaNota, VinculoFornecedor } from "@/core/estoque/nfe";

export const CHAVE_SALDOS = ["estoque-saldos"] as const;

/* ─────────────────────────── demonstração ─────────────────────────── */
// A demonstração não tem banco: os saldos de exemplo moram na memória da aba
// (nunca no navegador) e somem ao recarregar, como o resto da demonstração.
let saldosDemo: SaldoProduto[] = [
  { produtoId: "prd-1", nome: "Notebook Pro 14", sku: "NB-14", unidade: "un", inicial: 12, entradas: 6, saidas: 1, vendido: 9, saldo: 8, minimo: 5, custoMedio: 5200 },
  { produtoId: "prd-2", nome: "Monitor 27 4K", sku: "MN-27", unidade: "un", inicial: 20, entradas: 0, saidas: 0, vendido: 17, saldo: 3, minimo: 6, custoMedio: 1380 },
  { produtoId: "prd-3", nome: "Teclado mecânico", sku: "TC-01", unidade: "un", inicial: 40, entradas: 30, saidas: 2, vendido: 22, saldo: 46, minimo: 10, custoMedio: 212.5 },
  { produtoId: "prd-4", nome: "Cadeira ergonômica", sku: "CAD-ER", unidade: "un", inicial: 6, entradas: 0, saidas: 0, vendido: 6, saldo: 0, minimo: 2, custoMedio: null },
];

function movimentarDemo(m: NovoMovimento): void {
  saldosDemo = saldosDemo.map((s) => {
    if (s.produtoId !== m.produtoId) return s;
    const entra = m.tipo === "entrada" ? m.quantidade : 0;
    const sai = m.tipo === "saida" ? m.quantidade : 0;
    return { ...s, entradas: s.entradas + entra, saidas: s.saidas + sai, saldo: s.saldo + entra - sai };
  });
}

let vinculosDemo: VinculoFornecedor[] = [];
const notasDemo = new Map<string, Set<number>>();

/* ─────────────────────────────── leitura ─────────────────────────────── */

export async function listarSaldos(): Promise<SaldoProduto[]> {
  if (isDemo) return saldosDemo;
  const s = createClient();
  const { data, error } = await s
    .from("estoque_saldos")
    .select("product_id,name,sku,unidade,inicial,entradas,saidas,vendido,saldo,minimo,custo_medio")
    .order("name")
    .limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  return ((data ?? []) as LinhaSaldoBanco[]).map(saldoDaLinha);
}

export function useSaldosEstoque() {
  return useQuery({ queryKey: CHAVE_SALDOS, queryFn: listarSaldos });
}

/* ─────────────────────────────── gravação ─────────────────────────────── */

/** A recusa do banco vem com o código na frente ("estoque_produto_controla: …"); a tela mostra a frase. */
export function mensagemDoBanco(msg: string): string {
  const m = /^estoque_[a-z_]+:\s*(.+)$/.exec(msg.trim());
  if (m) return m[1];
  if (/estoque_movimentos_escrita_exige_papel|row-level security/i.test(msg)) return "Seu papel nesta empresa não lança movimento de estoque.";
  return msg;
}

export async function registrarMovimento(m: NovoMovimento): Promise<void> {
  if (errosDoMovimento(m).length) throw new Error("Revise os campos do movimento.");
  if (isDemo) { movimentarDemo(m); return; }
  const s = createClient();
  const { error } = await s.from("estoque_movimentos").insert(linhaDoMovimento(m));
  if (error) throw new Error(mensagemDoBanco(error.message));
}

export function useRegistrarMovimento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: registrarMovimento,
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_SALDOS }),
  });
}

/** O estoque mínimo é campo do cadastro do produto. Vazio tira o aviso. */
export async function definirMinimo(produtoId: string, minimo: number | null): Promise<void> {
  if (minimo !== null && !(Number.isFinite(minimo) && minimo >= 0)) throw new Error("O mínimo não pode ser negativo.");
  if (isDemo) {
    saldosDemo = saldosDemo.map((s) => (s.produtoId === produtoId ? { ...s, minimo } : s));
    return;
  }
  const s = createClient();
  const { error } = await s.from("products").update({ stock_min: minimo }).eq("id", produtoId);
  if (error) throw new Error(mensagemDoBanco(error.message));
}

export function useDefinirMinimo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ produtoId, minimo }: { produtoId: string; minimo: number | null }) => definirMinimo(produtoId, minimo),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAVE_SALDOS }),
  });
}

/* ───────────────────── entrada pela NF-e de compra (etapa 2) ───────────────────── */

export const CHAVE_VINCULOS = ["estoque-vinculos-fornecedor"] as const;

/** O que a pessoa já escolheu para os códigos dos fornecedores (só sugere). */
export async function listarVinculos(): Promise<VinculoFornecedor[]> {
  if (isDemo) return vinculosDemo;
  const s = createClient();
  const { data, error } = await s
    .from("estoque_vinculos_fornecedor")
    .select("fornecedor_cnpj,codigo,product_id,fator")
    .limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { fornecedor_cnpj: string; codigo: string; product_id: string; fator: number | string }[])
    .map((v) => ({ fornecedorCnpj: v.fornecedor_cnpj, codigo: v.codigo, produtoId: v.product_id, fator: Number(v.fator) || 1 }));
}

export function useVinculosFornecedor() {
  return useQuery({ queryKey: CHAVE_VINCULOS, queryFn: listarVinculos });
}

/**
 * Os itens desta nota que já deram entrada (movimento vivo). A tela avisa e
 * não oferece de novo; o banco recusaria do mesmo jeito (índice único).
 */
export async function itensJaImportados(chave: string): Promise<number[]> {
  if (isDemo) return Array.from(notasDemo.get(chave) ?? []);
  const s = createClient();
  const { data, error } = await s
    .from("estoque_movimentos")
    .select("nfe_item")
    .eq("nfe_chave", chave)
    .limit(TETO_LINHAS);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { nfe_item: number }[]).map((l) => l.nfe_item);
}

/**
 * Grava a entrada da nota: TODOS os itens num insert só (ou entram todos, ou
 * nenhum) e, depois, lembra o produto de cada código do fornecedor.
 *
 * ⚠️ O vínculo é preferência, não fato: se lembrar falhar, a entrada já está
 * gravada e a tela avisa que só a sugestão não foi salva.
 */
export async function registrarEntradaNota(
  movimentos: MovimentoDaNota[], vinculos: VinculoFornecedor[],
): Promise<{ vinculoSalvo: boolean }> {
  if (!movimentos.length) throw new Error("Escolha o produto de ao menos um item.");
  for (const m of movimentos) if (errosDoMovimento(m).length) throw new Error("Revise os itens da nota.");
  if (isDemo) {
    const ja = notasDemo.get(movimentos[0].nfeChave) ?? new Set<number>();
    if (movimentos.some((m) => ja.has(m.nfeItem))) throw new Error("Esta nota já deu entrada no estoque.");
    movimentos.forEach((m) => { movimentarDemo(m); ja.add(m.nfeItem); });
    notasDemo.set(movimentos[0].nfeChave, ja);
    const chaves = new Set(vinculos.map((v) => `${v.fornecedorCnpj}|${v.codigo}`));
    vinculosDemo = [...vinculosDemo.filter((v) => !chaves.has(`${v.fornecedorCnpj}|${v.codigo}`)), ...vinculos];
    return { vinculoSalvo: true };
  }
  const s = createClient();
  const { error } = await s.from("estoque_movimentos").insert(movimentos.map((m) => ({
    ...linhaDoMovimento(m),
    origem: "nfe",
    nfe_chave: m.nfeChave,
    nfe_item: m.nfeItem,
    fornecedor_cnpj: m.fornecedorCnpj || null,
  })));
  if (error) {
    if (/estoque_movimentos_nfe_unica|duplicate key/i.test(error.message)) throw new Error("Esta nota já deu entrada no estoque.");
    throw new Error(mensagemDoBanco(error.message));
  }
  if (!vinculos.length) return { vinculoSalvo: true };
  const { error: e2 } = await s.from("estoque_vinculos_fornecedor").upsert(
    vinculos.map((v) => ({ fornecedor_cnpj: v.fornecedorCnpj, codigo: v.codigo, product_id: v.produtoId, fator: v.fator })),
    { onConflict: "org_id,fornecedor_cnpj,codigo" },
  );
  return { vinculoSalvo: !e2 };
}

export function useRegistrarEntradaNota() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ movimentos, vinculos }: { movimentos: MovimentoDaNota[]; vinculos: VinculoFornecedor[] }) =>
      registrarEntradaNota(movimentos, vinculos),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAVE_SALDOS });
      qc.invalidateQueries({ queryKey: CHAVE_VINCULOS });
    },
  });
}
