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
