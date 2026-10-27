/**
 * JORNADA: o TXT do Domínio, como o escritório o recebe.
 *
 * O plano de contas ganha código para DUAS categorias, escritas com caixa
 * diferente da do lançamento ("Venda" × "venda") — o casamento era por chave
 * exata e todo lançamento caía em "sem código contábil" com o código
 * cadastrado. Depois: as pendências são listadas, o arquivo sai em ANSI com
 * CRLF, cada linha tem o layout declarado, a contagem é a da tela, a soma dos
 * D/C é a dos cartões, e a PRÉVIA é exatamente o começo do arquivo.
 *
 * ⚠️ O código entra pelo CADASTRO da categoria (o dataset da demonstração,
 * a mesma morada que a tela de Plano de contas grava).
 */
import { readFileSync } from "node:fs";
import { novoUsuario, verificador, brl } from "./kit.mjs";

const PLANO = [
  { id: "e2e-g1", nome: "Receitas", codigo: "3", natureza: "receita", paiId: null },
  { id: "e2e-venda", nome: "Venda", codigo: "3.1.01", natureza: "receita", paiId: "e2e-g1" },
  { id: "e2e-g2", nome: "Despesas", codigo: "4", natureza: "despesa", paiId: null },
  { id: "e2e-forn", nome: "Fornecedor", codigo: "4.1.02", natureza: "despesa", paiId: "e2e-g2" },
];

export default async function contabilDominio(navegador) {
  const v = verificador("contabil-dominio");
  const u = await novoUsuario(navegador);
  // O código contábil mora no CADASTRO (categories.code; em demonstração, o
  // dataset). Uma categoria criada pela tela materializa o dataset; depois as
  // duas do plano ganham código com a caixa DIFERENTE da do lançamento.
  await u.ir("/dashboard/registrations/chart-of-accounts");
  await u.page.getByRole("button", { name: "Nova categoria ou grupo" }).first().click();
  await u.page.waitForTimeout(400);
  await u.page.getByPlaceholder("Ex.: Produto Online").fill("Grupo E2E Domínio");
  await u.page.getByPlaceholder("Ex.: 3.1.01").fill("9");
  await u.page.getByRole("button", { name: "Salvar", exact: true }).last().click();
  await u.page.waitForTimeout(1500);
  await u.page.evaluate((plano) => {
    const ds = JSON.parse(localStorage.getItem("a4p_imported_dataset") ?? "null");
    if (!ds) return;
    const cats = ds.cadastros?.categories ?? [];
    for (const p of plano.filter((x) => x.paiId)) {
      const ja = cats.find((c) => c.name.toLowerCase() === p.nome.toLowerCase());
      if (ja) ja.code = p.codigo;
      else cats.push({ id: p.id, kind: p.natureza, name: p.nome, parent_id: null, code: p.codigo, dre_linha: null, active: true });
    }
    ds.cadastros = { ...(ds.cadastros ?? {}), categories: cats };
    localStorage.setItem("a4p_imported_dataset", JSON.stringify(ds));
  }, PLANO);

  await u.ir("/dashboard/accounting/dominio-export");
  const sel = u.page.getByLabel("Conta bancária", { exact: true });
  const contas = (await sel.locator("option").evaluateAll((os) => os.map((o) => o.value))).filter(Boolean);
  v.ok(contas.length > 0, "há conta bancária para escolher", String(contas.length));

  // Procura uma conta e um mês (corrente para trás) com arquivo E pendência:
  // a jornada precisa das duas metades — o que sai e o que fica de fora.
  let achou = false;
  for (let passo = 0; passo < 4 && !achou; passo++) {
    if (passo > 0) await u.page.getByRole("button", { name: "Mês anterior" }).click();
    for (const c of contas) {
      await sel.selectOption(c);
      await u.page.getByRole("button", { name: "Carregar lançamentos" }).click();
      await u.page.waitForTimeout(500);
      const comArquivo = await u.page.getByRole("button", { name: "Gerar lanctos.txt" }).isEnabled();
      const comPendencia = /ficaram de fora|ficou de fora/.test(await u.texto());
      if (comArquivo && comPendencia) { achou = true; break; }
    }
  }
  v.ok(achou, "uma conta/mês com lançamento codificado E pendência");
  if (!achou) { await u.ctx.close(); return v.falhas(); }

  const t = (await u.texto()).replace(/\n+/g, " ");
  const kpi = (rot) => { const m = t.match(new RegExp(`${rot}\\s*(−|-)?\\s*R\\$\\s*([\\d.]+)\\s*,(\\d{2})`)); return m ? Number(m[2].replace(/\./g, "") + "." + m[3]) : NaN; };
  const n = Number((t.match(/Lançamentos\s+(\d+)\s+Débitos/) ?? [])[1]);
  const debitos = kpi("Débitos \\(saídas\\)"), creditos = kpi("Créditos \\(entradas\\)");
  v.ok(n > 0, "a tela diz quantos lançamentos vão no arquivo", String(n));
  v.ok(/ficaram de fora|ficou de fora/.test(t) && /não tem código contábil/.test(t), "as categorias sem código são LISTADAS como pendência");
  const preview = (await u.page.locator("pre").first().innerText()).replace(/\r/g, "").trimEnd().split("\n");

  const [dl] = await Promise.all([
    u.page.waitForEvent("download", { timeout: 30000 }),
    u.page.getByRole("button", { name: "Gerar lanctos.txt" }).click(),
  ]);
  const bytes = readFileSync(await dl.path());
  const semCR = bytes.some((b, i) => b === 0x0a && bytes[i - 1] !== 0x0d);
  v.ok(!semCR && bytes.includes(0x0d), "o arquivo sai com quebra CRLF");
  let utf8Valido = true;
  try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { utf8Valido = false; }
  const temAlto = bytes.some((b) => b >= 0x80);
  v.ok(!temAlto || !utf8Valido, "o arquivo é ANSI (bytes acima de 0x7F não formam UTF-8)", temAlto ? "com acento" : "sem acento no mês");
  const txt = new TextDecoder("windows-1252").decode(bytes);
  const linhas = txt.split("\r\n").filter(Boolean);
  v.ok(linhas.length === n, "o arquivo tem uma linha por lançamento da tela", `${linhas.length} × ${n}`);
  const layout = /^\d{8};[^;]+;[DC];\d+,\d{2};[^;]*;[^;]*;[^;]*$/;
  v.ok(linhas.every((l) => layout.test(l)), "toda linha segue o layout declarado (DDMMAAAA;conta;D/C;valor;…)", linhas.find((l) => !layout.test(l)) ?? "");
  v.ok(linhas.every((l) => ["3.1.01", "4.1.02"].includes(l.split(";")[1])), "só entram as categorias com código, pelo código do plano");
  const soma = (nat) => Math.round(linhas.filter((l) => l.split(";")[2] === nat).reduce((s, l) => s + Number(l.split(";")[3].replace(",", ".")), 0) * 100) / 100;
  v.ok(Math.abs(soma("D") - debitos) < 0.01 && Math.abs(soma("C") - creditos) < 0.01, "a soma dos D e dos C do arquivo é a dos cartões", `${soma("D")}/${soma("C")} × ${debitos}/${creditos}`);
  v.ok(preview.length === Math.min(4, n) && preview.every((l, i) => l === linhas[i]), "a PRÉVIA é exatamente o começo do arquivo", `${preview[0]} × ${linhas[0]}`);

  // Envio de NFs ao contador: o status e o próximo envio.
  await u.ir("/dashboard/accounting/nfe-export");
  const e = (await u.texto()).replace(/\n+/g, " ");
  const hoje = new Date();
  const prox = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1);
  const esperado = `01/${String(prox.getMonth() + 1).padStart(2, "0")}/${prox.getFullYear()}`;
  v.ok(/Status\s+Inativo/.test(e), "sem e-mail verificado, o envio está inativo");
  v.ok(e.includes(`Próximo envio ${esperado}, 21:00`), "o próximo envio é o dia 1º do mês seguinte às 21h", esperado);

  v.ok(u.erros.length === 0, "nenhum erro de página ou de console", u.erros.slice(0, 2).join(" | "));
  await u.ctx.close();
  return v.falhas();
}
