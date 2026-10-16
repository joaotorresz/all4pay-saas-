/**
 * Parâmetros comuns das chamadas ao Claude (rotas de servidor).
 *
 * ⚠️ Os modelos atuais PENSAM por padrão (pensamento adaptativo), e o que eles
 * pensam conta no `max_tokens`. Com tetos de 200–1.800 o raciocínio podia
 * consumir a saída inteira antes da resposta: a chamada voltava sem texto, o
 * JSON não era lido e a rota caía no fallback de regras — em silêncio, com a
 * chave configurada. Estas tarefas são curtas e estruturadas, então o esforço
 * é BAIXO e o teto tem folga para o pensamento caber antes da resposta.
 * Paga-se só o que é gerado: o teto maior não encarece a chamada.
 */
export const MODELO_CLAUDE = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";

export const SAIDA_CLAUDE = {
  max_tokens: 4096,
  output_config: { effort: "low" },
} as const;
