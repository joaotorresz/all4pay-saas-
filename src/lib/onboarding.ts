/**
 * Persistência do "Criar empresa" — grava as escolhas estruturais do wizard
 * (contas bancárias, centros de custo, unidades) no Supabase em live, sem
 * duplicar o que o seed_org já criou na organização (dedup por nome).
 * Em demo é no-op (o ambiente já vem do seed/importação).
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import type { Estrutura } from "@/core/onboarding";
import { TETO_LINHAS } from "@/lib/supabase/consulta";

export interface ResultadoEstrutura {
  contas: number;
  centros: number;
  unidades: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "").trim();
/** Slug do banco para casar com as cores conhecidas (itau/bradesco/…). */
const bankSlug = (banco: string) => {
  const n = norm(banco);
  if (n.includes("itau")) return "itau";
  if (n.includes("bradesco")) return "bradesco";
  if (n.includes("santander")) return "santander";
  if (n.includes("nubank")) return "nubank";
  if (n.includes("inter")) return "inter";
  if (n.includes("brasil")) return "bb";
  if (n.includes("caixa")) return "caixa";
  return n.replace(/[^a-z0-9]/g, "").slice(0, 12) || "outro";
};

/**
 * Aplica a estrutura financeira declarada no onboarding. Lê os nomes já
 * existentes e insere só os novos (o seed_org cria centros/unidades/conta
 * padrão; aqui adicionamos os bancos/centros próprios do usuário).
 */
export async function aplicarEstrutura(estrutura: Estrutura): Promise<ResultadoEstrutura> {
  const out: ResultadoEstrutura = { contas: 0, centros: 0, unidades: 0 };
  if (isDemo) return out;
  const s = createClient();
  /*
   * ⚠️ **ESCRITOR QUE ENGOLIA ERRO.** Cada insert era `if (!error) out.x = n` —
   * a recusa do banco virava "zero criado" sem aviso, e as duas telas de
   * cadastro ainda envolviam a chamada num `try {} catch {}`. A pessoa
   * terminava o cadastro, entrava, e as contas que ela escolheu simplesmente
   * não existiam. Agora a primeira recusa LANÇA, com a mensagem do banco e o
   * nome do que falhou; a tela a mostra e o "Concluir" seguinte tenta de novo
   * — sem duplicar, porque tudo aqui deduplica por nome.
   */
  const falhou = (oque: string, msg: string) => {
    throw new Error(`Não foi possível criar ${oque}: ${msg}`);
  };

  // Centros de custo
  const centros = estrutura.centrosCusto.map((x) => x.trim()).filter(Boolean);
  if (centros.length) {
    const { data, error: e1 } = await s.from("cost_centers").select("name").limit(TETO_LINHAS);
    if (e1) falhou("os centros de custo", e1.message);
    const have = new Set((data ?? []).map((r) => norm((r as { name: string }).name)));
    const novos = centros.filter((n) => !have.has(norm(n)));
    if (novos.length) {
      const { error } = await s.from("cost_centers").insert(novos.map((name) => ({ name })));
      if (error) falhou("os centros de custo", error.message);
      out.centros = novos.length;
    }
  }

  // Unidades
  const unidades = estrutura.unidades.map((x) => x.trim()).filter(Boolean);
  if (unidades.length) {
    const { data, error: e1 } = await s.from("units").select("name").limit(TETO_LINHAS);
    if (e1) falhou("as unidades", e1.message);
    const have = new Set((data ?? []).map((r) => norm((r as { name: string }).name)));
    const novos = unidades.filter((n) => !have.has(norm(n)));
    if (novos.length) {
      const { error } = await s.from("units").insert(novos.map((name) => ({ name, abbrev: norm(name).slice(0, 4) })));
      if (error) falhou("as unidades", error.message);
      out.unidades = novos.length;
    }
  }

  // Contas bancárias (banco · tipo) — as do usuário, além da conta inicial do seed
  const contas = estrutura.contas.filter((c) => c.banco?.trim() && c.banco !== "—");
  if (contas.length) {
    const { data, error: e1 } = await s.from("financial_accounts").select("name").limit(TETO_LINHAS);
    if (e1) falhou("as contas", e1.message);
    const have = new Set((data ?? []).map((r) => norm((r as { name: string }).name)));
    // ⚠️ O nome da conta é ÚNICO por empresa no banco (20260930180000): dois
    // "Itaú · Corrente" no mesmo lote fariam o insert inteiro ser recusado, e
    // nenhuma conta nasceria. Por isso o lote também se deduplica por dentro.
    const rows = contas
      // O saldo informado no cadastro é o nível da conta — `balance` é a
      // autoridade do saldo no sistema inteiro (core/indicadores.saldoEm).
      .map((c) => ({ name: `${c.banco} · ${c.tipo}`.trim(), bank: bankSlug(c.banco), balance: Math.round((c.saldo ?? 0) * 100) / 100 }))
      .filter((r) => {
        if (have.has(norm(r.name))) return false;
        have.add(norm(r.name));
        return true;
      });
    if (rows.length) {
      const { error } = await s.from("financial_accounts").insert(rows);
      if (error) falhou("as contas", error.message);
      out.contas = rows.length;
    }
  }

  return out;
}
