"use client";

/**
 * A PONTE entre o motor de folha e o resto do produto.
 *
 * Guarda os colaboradores (por organização, via `store-org`) e resolve o
 * REGIME da empresa a partir da fonte única do perfil fiscal — o mesmo
 * resolvedor que a tela de impostos usa.
 *
 * ⚠️ O regime não é digitado aqui. Ele decide se a contribuição patronal de
 * 20% entra ou não no custo de cada funcionário, e uma segunda cópia dele
 * divergiria da primeira no dia em que a empresa mudasse de anexo — deixando
 * a folha calculando com um regime e o imposto com outro.
 */
import { ler, gravar, CHAVES_ORG } from "@/lib/store-org";
import { loadCompany } from "@/lib/company";
import { regimeDoCadastro, type Regime, type Anexo } from "@/core/fiscal/perfil";
import type { Colaborador } from "@/core/folha";

export function listColaboradores(): Colaborador[] {
  return ler<Colaborador[]>(CHAVES_ORG.colaboradores, []);
}

export function saveColaborador(c: Colaborador): void {
  const todos = listColaboradores();
  const i = todos.findIndex((x) => x.id === c.id);
  if (i >= 0) todos[i] = c; else todos.push(c);
  gravar(CHAVES_ORG.colaboradores, todos);
}

export function removeColaborador(id: string): Colaborador[] {
  const antes = listColaboradores();
  gravar(CHAVES_ORG.colaboradores, antes.filter((c) => c.id !== id));
  // Devolve o estado anterior para a ação destrutiva poder desfazer.
  return antes;
}

export function restaurarColaboradores(lista: Colaborador[]): void {
  gravar(CHAVES_ORG.colaboradores, lista);
}

/**
 * O regime e o anexo da empresa, da fonte única.
 *
 * ⚠️ `nao_declarado` é um valor de primeira classe, não um buraco para
 * preencher com um padrão: assumir "presumido" acrescentaria 28% de encargo
 * patronal ao custo de cada funcionário de uma empresa do Simples, e o número
 * sairia com a mesma cara de certo. A tela avisa e manda declarar.
 */
export function regimeDaEmpresa(): { regime: Regime; anexo: Anexo | null } {
  const empresa = loadCompany();
  const db = (empresa?.db ?? {}) as Record<string, unknown>;
  const regime = regimeDoCadastro(db);
  const bruto = String(db.anexo ?? db.anexoSimples ?? "").trim().toUpperCase();
  const anexo = (["I", "II", "III", "IV", "V"] as const).find((a) => a === bruto) ?? null;
  return { regime, anexo };
}
