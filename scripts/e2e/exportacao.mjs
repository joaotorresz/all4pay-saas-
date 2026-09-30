/**
 * JORNADA: exportar para o contador.
 *
 * O arquivo SAI DA EMPRESA — quem acha a divergência é o contador, semanas
 * depois. Então a jornada confere o que o dono vê ANTES do botão contra o que
 * sai no arquivo: o resultado líquido da tela é o do CSV do DRE, e o CSV do
 * razão tem uma linha por lançamento contado na tela. E uma transferência
 * entre contas entra no razão como "fora do DRE" e não mexe no resultado.
 */
import { readFileSync } from "node:fs";
import { novoUsuario, verificador, brl } from "./kit.mjs";

async function resumo(u) {
  await u.ir("/exportar");
  const t = (await u.texto()).replace(/\n+/g, " ");
  const num = (rot) => Number((t.match(new RegExp(`${rot}\\s*(\\d+)`)) ?? [])[1] ?? NaN);
  const r = t.match(/Resultado líquido\s*(−|-)?\s*R\$\s*([\d.]+)\s*(,\d{2})?/);
  return {
    lancamentos: num("Lançamentos"), noDre: num("No DRE"), fora: num("Fora do DRE"),
    resultado: r ? (r[1] ? -1 : 1) * brl(r[2] + (r[3] ?? "")) : NaN,
  };
}

async function baixarCSV(u, rotulo) {
  const [dl] = await Promise.all([
    u.page.waitForEvent("download", { timeout: 30000 }),
    u.page.getByRole("button", { name: rotulo }).click(),
  ]);
  return readFileSync(await dl.path(), "utf8").replace(/^﻿/, "");
}

/** "-1234,56" / "1234.56" / "1.234,56" → número. */
const numCSV = (s) => {
  const v = String(s ?? "").replace(/"/g, "").trim();
  if (/,\d{1,2}$/.test(v)) return Number(v.replace(/\./g, "").replace(",", "."));
  return Number(v);
};

export default async function exportacao(navegador) {
  const v = verificador("exportacao");
  const u = await novoUsuario(navegador);

  const antes = await resumo(u);
  v.ok(antes.lancamentos > 0, "a tela diz quantos lançamentos vão no arquivo ANTES do botão", String(antes.lancamentos));

  const dre = await baixarCSV(u, "CSV do DRE");
  // A linha da CASCATA ("Resultado Líquido";"="), não a do cabeçalho do arquivo.
  const linhaRes = dre.split(/\r?\n/).find((l) => /^"?Resultado L[íi]quido"?;"?="?;/i.test(l.trim()));
  const valorRes = linhaRes ? numCSV(linhaRes.split(";")[2]) : NaN;
  v.ok(Math.abs(valorRes - antes.resultado) < 0.02,
    "o resultado líquido do CSV do DRE é o da tela", `${valorRes} × ${antes.resultado}`);

  const razao = await baixarCSV(u, "CSV do razão");
  const linhas = razao.split(/\r?\n/).filter(Boolean);
  const iCab = linhas.findIndex((l) => /Compet[êe]ncia/i.test(l) && /Valor/i.test(l));
  const dados = iCab >= 0 ? linhas.slice(iCab + 1).filter((l) => l.split(";").length > 3) : [];
  const cab = dre.split(/\r?\n/).find((l) => /^"?Lançamentos"?;/.test(l)) ?? "";
  v.ok(/;"?\d+"?$/.test(cab.trim()), "a contagem de lançamentos sai inteira no arquivo (não '58,00')", cab);
  v.ok(dados.length === antes.lancamentos,
    "o CSV do razão tem uma linha por lançamento da tela", `${dados.length} × ${antes.lancamentos}`);

  // Uma transferência entre contas: entra no razão, fica FORA do DRE, e o resultado não se move.
  await u.ir("/dashboard/financial/accounts-and-transfers?novo=1");
  const sel = u.page.locator('select[aria-label="Selecione uma conta"]');
  await sel.nth(0).selectOption({ index: 1 });
  await sel.nth(1).selectOption({ index: 2 });
  await u.page.locator('input[placeholder="0,00"]').first().fill("77700");
  await u.page.getByRole("button", { name: "Salvar transferência" }).click();
  await u.page.waitForTimeout(1500);

  const depois = await resumo(u);
  v.ok(depois.lancamentos === antes.lancamentos + 2, "a transferência entra no razão com os dois lados",
    `${antes.lancamentos} → ${depois.lancamentos}`);
  v.ok(depois.fora === antes.fora + 2, "e os dois lados ficam FORA do DRE, listados", `${antes.fora} → ${depois.fora}`);
  v.ok(Math.abs(depois.resultado - antes.resultado) < 0.02, "o resultado líquido não se move",
    `${antes.resultado} → ${depois.resultado}`);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
