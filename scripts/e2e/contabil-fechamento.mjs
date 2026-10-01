/**
 * JORNADA: o relatório de fechamento mensal, exportado em DOCX.
 *
 * Gera o fechamento do mês anterior, baixa o DOCX e o ABRE (python-docx). O
 * arquivo é o que vai assinado para o sócio: o Resultado Líquido do mês nele
 * é o da linha do DRE, e a Margem EBITDA é EBITDA ÷ receita LÍQUIDA do mesmo
 * mês — a definição do cartão do DRE (o fechamento dividia pela bruta).
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { novoUsuario, verificador } from "./kit.mjs";

const num = (s) => {
  const t = String(s).replace(/\s+/g, "");
  const neg = /^[−-]/.test(t);
  return (neg ? -1 : 1) * Number(t.replace(/[^\d,]/g, "").replace(",", "."));
};

export default async function contabilFechamento(navegador) {
  const v = verificador("contabil-fechamento");
  const u = await novoUsuario(navegador);

  // O DRE do mês anterior, linha a linha.
  const hoje = new Date();
  const ant = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const rotulo = `${String(ant.getMonth() + 1).padStart(2, "0")}/${ant.getFullYear()}`;
  await u.ir("/dashboard/reports/dre");
  const cab = await u.page.locator("thead th").evaluateAll((ths) => ths.map((t) => t.innerText.trim()));
  const k = cab.slice(1).findIndex((c) => c.startsWith(rotulo));
  const cel = async (id) => Number(await u.page.locator(`tr[data-linha="${id}"] td[data-celula="${k}"]`).first().getAttribute("data-valor"));
  const resultado = await cel("resultado_liquido"), ebitda = await cel("ebitda"), liquida = await cel("receita_liquida");
  v.ok(k >= 0 && liquida > 0, "o DRE tem o mês anterior com receita", `${rotulo} · ${liquida}`);

  await u.ir("/dashboard/reports/monthly-closing?painel=relatorio");
  await u.page.getByRole("button", { name: "Novo fechamento" }).click();
  await u.page.getByRole("button", { name: "Gerar fechamento" }).click();
  await u.page.waitForTimeout(1200);
  const [dl] = await Promise.all([
    u.page.waitForEvent("download", { timeout: 30000 }),
    u.page.getByRole("button", { name: "Exportar DOCX" }).click(),
  ]);
  const caminho = join(mkdtempSync(join(tmpdir(), "e2e-docx-")), "fechamento.docx");
  copyFileSync(await dl.path(), caminho);
  let doc = null;
  try {
    doc = JSON.parse(execFileSync("python3", ["-c", `
import docx, json, sys
d = docx.Document(sys.argv[1])
print(json.dumps({"p": [p.text for p in d.paragraphs], "t": [[[c.text for c in r.cells] for r in t.rows] for t in d.tables]}))
`, caminho]).toString());
  } catch { doc = null; }
  v.ok(!!doc && doc.t.length >= 2, "o DOCX abre no python-docx, com as tabelas", doc ? `${doc.t.length} tabelas` : "não abriu");
  if (doc) {
    const kpis = doc.t[0];
    const margem = kpis.find((r) => r[0] === "Margem EBITDA");
    const esperada = Math.round((ebitda / liquida) * 1000) / 10;
    v.ok(margem && Math.abs(num(margem[1]) - esperada) < 0.051, "a Margem EBITDA do DOCX é EBITDA ÷ receita líquida do mês (a do DRE)", `${margem?.[1]} × ${esperada}%`);
    const dreDoc = doc.t[1];
    const iCol = dreDoc[0].findIndex((c) => c.startsWith(rotulo));
    const linhaRes = dreDoc.find((r) => /Resultado L[íi]quido/.test(r[0]));
    v.ok(iCol > 0 && linhaRes && Math.abs(num(linhaRes[iCol]) - resultado) < 0.01, "o Resultado Líquido do mês no DOCX é o do DRE", `${linhaRes?.[iCol]} × ${resultado}`);
  }

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
