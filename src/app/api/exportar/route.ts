/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ARQUIVO DO CONTADOR — geração no SERVIDOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **ESTA ROTA NÃO CONSULTA O BANCO, e isso é a decisão inteira.**
 *
 * O caminho óbvio seria ela refazer a consulta e montar o DRE por conta
 * própria. Seria a SÉTIMA "duas fontes para um fato" desta base — e a pior
 * delas, porque o resultado SAI DA EMPRESA: o arquivo discordaria da tela que o
 * dono acabou de conferir, e quem descobriria é o contador.
 *
 * Então a tela monta o relatório com `montarDRE` — a MESMA função que desenha a
 * tabela —, reescreve em linhas com `montarExportacao`, e manda as LINHAS para
 * cá. Existe UMA computação dos números no sistema inteiro; o servidor faz o
 * que só ele sabe fazer, que é virar bytes de planilha.
 *
 * ⚠️ E ela **reconfere o fechamento antes de responder**. Não é desconfiança do
 * cliente: é que um arquivo que não fecha é exatamente o que o contador vai
 * devolver, e recusar aqui custa um erro na tela em vez de um telefonema em
 * outubro. A recusa NOMEIA a linha divergente.
 *
 * Escopo declarado: nada de e-mail, nada de agendamento. Baixar e pronto.
 */
import { NextResponse } from "next/server";
import { conferirFechamento, type Exportacao } from "@/core/exportacao";
import { planilhasDaExportacao, csvDaExportacao } from "@/core/exportacao/planilha";
import { gerarXLSX } from "@/lib/xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Corpo = {
  exportacao?: Exportacao;
  formato?: "xlsx" | "csv";
  /** Qual arquivo, quando CSV — o XLSX leva os dois numa aba cada. */
  arquivo?: "razao" | "dre";
};

const TETO_LINHAS = 200_000;

export async function POST(req: Request) {
  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ erro: "Corpo inválido." }, { status: 400 });
  }

  const exp = corpo.exportacao;
  if (!exp?.cabecalho || !Array.isArray(exp.razao) || !Array.isArray(exp.dre)) {
    return NextResponse.json({ erro: "Exportação ausente ou incompleta." }, { status: 400 });
  }
  if (exp.razao.length > TETO_LINHAS) {
    return NextResponse.json(
      { erro: `O período tem ${exp.razao.length} lançamentos, acima do teto de ${TETO_LINHAS}. Exporte em partes.` },
      { status: 413 },
    );
  }

  /*
   * ⚠️ A conferência é a mesma função que a guarda `npm run exportacao` roda.
   * Duas implementações do fechamento seriam, elas próprias, duas fontes.
   */
  const fora = conferirFechamento(exp);
  if (fora.length > 0) {
    return NextResponse.json(
      {
        erro: "O razão não fecha com o DRE — o arquivo não foi gerado.",
        divergencias: fora.map((d) => ({
          linha: d.label,
          noDre: d.noDre,
          noRazao: d.noRazao,
          diferenca: d.diferenca,
        })),
      },
      { status: 409 },
    );
  }

  const periodo = `${exp.cabecalho.periodoDe}_a_${exp.cabecalho.periodoAte}`;

  if (corpo.formato === "csv") {
    const qual = corpo.arquivo === "dre" ? "dre" : "razao";
    const texto = csvDaExportacao(exp)[qual];
    return new NextResponse(texto, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="all4pay_${qual}_${periodo}.csv"`,
        "cache-control": "no-store",
      },
    });
  }

  const bytes = gerarXLSX(planilhasDaExportacao(exp));
  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="all4pay_contador_${periodo}.xlsx"`,
      "cache-control": "no-store",
    },
  });
}
