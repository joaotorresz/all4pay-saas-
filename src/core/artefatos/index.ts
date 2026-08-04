/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ARTEFATO EXTERNO — o que pode sair do sistema, e com que ressalva
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Um arquivo que sai daqui perde o contexto da tela e ganha autoridade. A
 * planilha vai para o contador, o PDF vai para o banco, o documento vai para o
 * investidor — e nenhum deles tem como saber que a linha "Saldo projetado" era
 * projeção, porque na planilha ela é só um número numa célula, do lado de
 * números que são fato.
 *
 * A regra: **projeção e estimativa não saem sem marca.** Não é bloqueio por
 * bloqueio — projetar é útil e o usuário tem direito de exportar a projeção
 * dele. O que não pode é ela sair parecendo extrato.
 *
 * Três decisões:
 *
 *  1. **Marcar, não impedir**, quando é estimativa ou projeção: o rótulo entra
 *     na própria célula/linha e uma nota no rodapé explica. Impedir empurraria
 *     a pessoa para o print de tela, que é a mesma exportação sem nenhuma marca.
 *  2. **IMPEDIR quando o número é inválido** — janela impossível, indicador com
 *     aviso. Aí não há o que marcar: o número não significa nada, e um número
 *     sem significado dentro de uma planilha assinada é o pior dos dois mundos.
 *  3. A decisão é do NÚCLEO, não do botão. Cada tela que exporta tinha a sua
 *     regra (ou nenhuma), e "nenhuma" era a mais comum.
 *
 * Puro, tipado, sem I/O. Versão `artefatos/1.0.0`.
 */
import type { Procedencia, Natureza } from "@/core/indicadores";

export const ARTEFATOS_VERSION = "artefatos/1.0.0";

export type Formato = "xlsx" | "pdf" | "docx" | "txt" | "csv";

export interface ItemExportado {
  /** O rótulo como ele vai aparecer no arquivo. */
  rotulo: string;
  procedencia: Procedencia;
}

export type Veredito =
  | { pode: true; marcados: string[]; nota: string | null }
  | { pode: false; motivo: string; itens: string[] };

const SUFIXO: Record<Natureza, string> = {
  fato: "",
  estimativa: " (estimativa)",
  projecao: " (projeção)",
};

/**
 * O rótulo como ele deve sair NO ARQUIVO.
 *
 * ⚠️ O sufixo entra no RÓTULO, não numa coluna extra ao lado: colunas somem no
 * copiar-e-colar, no filtro e na impressão. O que está grudado no nome da linha
 * viaja com ela.
 */
export const rotuloExportado = (i: ItemExportado): string =>
  `${i.rotulo}${SUFIXO[i.procedencia.natureza]}`;

/**
 * Decide se o conjunto pode virar arquivo.
 *
 * ⚠️ O bloqueio é só para o indicador INVÁLIDO (com `aviso`: janela impossível,
 * divisão sem base). Ele existe porque exportar um zero que significa "sua
 * pergunta não fazia sentido" cria um documento que afirma, com a força de uma
 * planilha, que a empresa não teve receita no período.
 */
export function avaliarExportacao(itens: readonly ItemExportado[], formato: Formato): Veredito {
  const invalidos = itens.filter((i) => !!i.procedencia.aviso);
  if (invalidos.length > 0) {
    return {
      pode: false,
      motivo:
        "Há indicadores que não puderam ser calculados no período pedido. "
        + "Exportar um zero que significa “a pergunta não fecha” cria um documento que afirma o contrário.",
      itens: invalidos.map((i) => `${i.rotulo}: ${i.procedencia.aviso}`),
    };
  }
  const marcados = itens.filter((i) => i.procedencia.natureza !== "fato");
  return {
    pode: true,
    marcados: marcados.map(rotuloExportado),
    nota: marcados.length === 0 ? null : notaDeRodape(marcados, formato),
  };
}

/**
 * A nota que acompanha o arquivo.
 *
 * ⚠️ Nomeia CADA item marcado em vez de dizer "alguns valores são projeções":
 * um aviso genérico transfere para o leitor o trabalho de adivinhar quais, e
 * ninguém faz esse trabalho — assume-se que é tudo fato, que é o padrão de
 * leitura de uma planilha.
 */
export function notaDeRodape(marcados: readonly ItemExportado[], formato: Formato): string {
  const projecoes = marcados.filter((i) => i.procedencia.natureza === "projecao").map((i) => i.rotulo);
  const estimativas = marcados.filter((i) => i.procedencia.natureza === "estimativa").map((i) => i.rotulo);
  const partes: string[] = [];
  if (projecoes.length > 0) {
    partes.push(
      `PROJEÇÃO (depende de os títulos previstos serem pagos nas datas previstas): ${projecoes.join(", ")}.`,
    );
  }
  if (estimativas.length > 0) {
    partes.push(`ESTIMATIVA (medida por média ou semelhança, não contada uma a uma): ${estimativas.join(", ")}.`);
  }
  const onde = formato === "xlsx" ? "planilha" : formato === "docx" ? "documento" : "arquivo";
  return `Nesta ${onde}, nem todo valor é apuração de lançamentos. ${partes.join(" ")}`;
}
