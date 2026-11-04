/**
 * O INTERRUPTOR DOS AGENTES — o único leitor de `AGENTES`.
 *
 * ⚠️ Sem `AGENTES=ligado` nenhum agente trabalha, em empresa nenhuma, mesmo
 * com o `ativo` da empresa ligado. É a decisão da plataforma; a da empresa
 * vem depois.
 */
export function agentesLigados(env: Record<string, string | undefined> = process.env): boolean {
  return env.AGENTES === "ligado";
}
