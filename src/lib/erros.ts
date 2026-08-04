"use client";

/**
 * O canal de falhas — onde o erro que ninguém veria passa a ter dono e alerta.
 *
 * ⚠️ **`reportar()` NUNCA lança.** Se a instrumentação puder derrubar a tela,
 * ela vira a primeira coisa que alguém remove no primeiro incidente — e aí o
 * silêncio volta, agora com a desculpa pronta.
 *
 * A regra de uso, que a guarda cobra: **todo `catch` em volta de chamada a
 * servidor ou rede chama isto.** Ler cache local e devolver o padrão pode
 * continuar silencioso (perder um cache custa uma requisição); perder uma
 * dimensão inteira do relatório, não.
 */
import { montarFalha, paraAlertar, type Falha } from "@/core/erros";

/** Memória da sessão. O histórico longo é do `audit_log`, não daqui. */
const falhas: Falha[] = [];
const TETO = 200;

export const EVENTO_FALHA = "a4p:falha";

/**
 * Registra uma falha, com dono e impacto.
 *
 * @param origem   `modulo.operacao` — a chave que decide o dono.
 * @param erro     o que veio do `catch`.
 * @param impacto  o que o usuário deixa de ter, em uma frase.
 * @param degradado `true` quando o sistema seguiu por outro caminho e a tela
 *                  não quebrou. É o caso mais perigoso: ninguém reporta.
 */
export function reportar(
  origem: string, erro: unknown, impacto: string, degradado = false,
): Falha | null {
  try {
    const f = montarFalha({ origem, erro, impacto, degradado, quando: new Date().toISOString() });
    falhas.push(f);
    if (falhas.length > TETO) falhas.splice(0, falhas.length - TETO);

    // O console é o primeiro destino porque é onde alguém já está olhando
    // quando o problema aparece. O dono vai na primeira linha de propósito.
    console.error(
      `[falha·${f.dono}] ${f.origem} (${f.categoria}${f.codigo ? ` ${f.codigo}` : ""})`
      + `${f.degradado ? " — DEGRADADO, o usuário não viu" : ""}: ${f.mensagem} | impacto: ${f.impacto}`,
    );

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(EVENTO_FALHA, { detail: f }));
    }
    return f;
  } catch {
    // Instrumentação que quebra é pior que instrumentação que falta.
    return null;
  }
}

export const falhasDaSessao = (): Falha[] => [...falhas];
export const falhasParaAlertar = (): Falha[] => paraAlertar(falhas);
export const limparFalhas = (): void => { falhas.length = 0; };

/**
 * Envolve uma chamada ao Supabase que devolve `{ data, error }`.
 *
 * ⚠️ O padrão `const { data, error } = await …; if (error) throw error;` estava
 * espalhado, e onde não havia `throw` havia um `catch {}` vazio. Este ajudante
 * dá um lugar só para a decisão: **reporta sempre**, e devolve o padrão em vez
 * de derrubar quando há um caminho alternativo declarado.
 */
export async function comFalha<T>(
  origem: string,
  impacto: string,
  chamada: () => PromiseLike<{ data: T | null; error: unknown }>,
  padrao: T,
): Promise<T> {
  try {
    const { data, error } = await chamada();
    if (error) {
      reportar(origem, error, impacto, true);
      return padrao;
    }
    return data ?? padrao;
  } catch (e) {
    reportar(origem, e, impacto, true);
    return padrao;
  }
}
