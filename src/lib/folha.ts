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
import { competenciaDoTitulo, type Colaborador, type TituloFolha } from "@/core/folha";
import type { TituloAvulso } from "@/lib/data";
import { isDemo } from "@/lib/demo";
import { removerImported } from "@/lib/imported";
import { excluirLogicoEmLote } from "@/lib/exclusao";

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
 * O regime e o anexo da empresa. O regime sai do resolvedor único
 * (`regimeDoCadastro`); este nome NÃO é outro resolvedor — até o card do regime
 * único ele se chamava `regimeDaEmpresa`, o mesmo nome da função que assumia
 * Presumido, e dois `regimeDaEmpresa` com respostas opostas é o defeito.
 *
 * ⚠️ `nao_declarado` é um valor de primeira classe, não um buraco para
 * preencher com um padrão: assumir "presumido" acrescentaria 28% de encargo
 * patronal ao custo de cada funcionário de uma empresa do Simples, e o número
 * sairia com a mesma cara de certo. A tela avisa e manda declarar.
 */
export function regimeEAnexoDaEmpresa(): { regime: Regime; anexo: Anexo | null } {
  const empresa = loadCompany();
  const db = (empresa?.db ?? {}) as Record<string, unknown>;
  const regime = regimeDoCadastro(db);
  const bruto = String(db.anexo ?? db.anexoSimples ?? "").trim().toUpperCase();
  const anexo = (["I", "II", "III", "IV", "V"] as const).find((a) => a === bruto) ?? null;
  return { regime, anexo };
}

/* ========================================================================== */
/* Os títulos da folha, a caminho do escritor único                            */
/* ========================================================================== */

/**
 * A linha que um título da folha vira no contas a pagar.
 *
 * ⚠️ **A COMPETÊNCIA É A DO MÊS DE TRABALHO, não o vencimento.** Mapear
 * `competence_date: t.vencimento` punha o salário de setembro (que vence em
 * outubro) no DRE de outubro: setembro sem folha nenhuma, outubro com duas.
 * Uma função só para isso, para as telas que agendam folha não escreverem cada
 * uma o seu mapeamento — era assim que as duas moradas começavam.
 */
export function linhaDoTituloDaFolha(t: TituloFolha, contaId: string): TituloAvulso {
  return {
    account_id: contaId,
    type: "saida",
    amount: t.valor,
    due_date: t.vencimento,
    competence_date: competenciaDoTitulo(t),
    category: t.categoria,
    description: t.descricao,
    origem: "manual",
  };
}

/**
 * Retira do contas a pagar os títulos previstos que um evento do contrato
 * substituiu (rescisão, férias com adiantamento do 13º).
 *
 * ⚠️ Exclusão LÓGICA em produção (a lixeira guarda, com o motivo), e as falhas
 * VOLTAM contadas: parar no primeiro erro deixaria o lote pela metade sem dizer
 * onde parou.
 */
export async function retirarTitulosDaFolha(ids: string[], motivo: string): Promise<{ retirados: number; falhas: string[] }> {
  if (ids.length === 0) return { retirados: 0, falhas: [] };
  if (isDemo) {
    removerImported(ids);
    return { retirados: ids.length, falhas: [] };
  }
  const r = await excluirLogicoEmLote("movements", ids, motivo);
  return { retirados: r.excluidos, falhas: r.falhas.map((f) => f.erro) };
}
