/**
 * estoque — a guarda do núcleo e do contrato do estoque (etapa 1).
 *
 *   npm run estoque        (dentro de npm test)
 *
 * O banco prova a conta do saldo em `scripts/estoque.sql`. Esta guarda prova o
 * resto, sem banco:
 *
 *   1. a situação (negativo, sem estoque, abaixo do mínimo, ok) por casos
 *      literais;
 *   2. sem custo, o valor em estoque é INDISPONÍVEL com motivo, nunca R$ 0;
 *   3. a leitura da quantidade digitada ("1.5", "1.250,5");
 *   4. o movimento: custo só na entrada, quantidade positiva, motivo;
 *   5. contrato: nenhuma tela nem a camada do cliente soma venda ou lê
 *      `sale_items` para o estoque (o saldo vem pronto do banco); um escritor
 *      só de `estoque_movimentos`; um leitor só de `ESTOQUE`.
 *
 * ⚠️ Regra 11: os esperados são números literais, e as varreduras do contrato
 * são reprovadas por um texto plantado (teste negativo) antes de valerem.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  situacaoEstoque, valorEmEstoque, lerQuantidade, errosDoMovimento, linhaDoMovimento,
  saldoDaLinha, formatarQuantidade,
} from "../src/core/estoque/index.ts";

let falhas = 0;
let casos = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  casos++;
  if (!cond) { falhas++; console.log(`✗ ${nome}${det ? ` — ${det}` : ""}`); }
};

/* ── 1. situação ── */
ok("situação: saldo negativo", situacaoEstoque({ saldo: -2, minimo: 5 }) === "negativo");
ok("situação: zero é sem estoque", situacaoEstoque({ saldo: 0, minimo: null }) === "sem_estoque");
ok("situação: abaixo do mínimo", situacaoEstoque({ saldo: 3, minimo: 6 }) === "abaixo_minimo");
ok("situação: no mínimo exato ainda está ok", situacaoEstoque({ saldo: 6, minimo: 6 }) === "ok");
ok("situação: sem mínimo não avisa", situacaoEstoque({ saldo: 1, minimo: null }) === "ok");

/* ── 2. valor em estoque ── */
const semCusto = valorEmEstoque({ saldo: 10, custoMedio: null });
ok("valor: sem custo é indisponível, não zero", semCusto.tipo === "indisponivel" && semCusto.codigo === "sem_custo" && semCusto.motivo.length > 0,
  JSON.stringify(semCusto));
const comCusto = valorEmEstoque({ saldo: 13, custoMedio: 18.6667 });
ok("valor: saldo × custo médio, em centavos", comCusto.tipo === "valor" && comCusto.valor === 242.67, JSON.stringify(comCusto));
const custoZero = valorEmEstoque({ saldo: 4, custoMedio: 0 });
ok("valor: custo zero informado é valor zero (zero é um valor)", custoZero.tipo === "valor" && custoZero.valor === 0);
const negativo = valorEmEstoque({ saldo: -1, custoMedio: 10 });
ok("valor: saldo negativo não vira valor negativo", negativo.tipo === "indisponivel" && negativo.codigo === "saldo_negativo");

/* ── 3. leitura da quantidade ── */
ok("quantidade: ponto decimal do celular", lerQuantidade("1.5") === 1.5);
ok("quantidade: vírgula decimal com milhar", lerQuantidade("1.250,5") === 1250.5);
ok("quantidade: inteiro", lerQuantidade(" 12 ") === 12);
ok("quantidade: texto não é número", Number.isNaN(lerQuantidade("abc")));
ok("quantidade: negativo não passa", Number.isNaN(lerQuantidade("-3")));
ok("quantidade: vazio não é zero", Number.isNaN(lerQuantidade("")));
ok("quantidade: formatação brasileira com sinal de menos", formatarQuantidade(-1.5) === "−1,5" && formatarQuantidade(1250) === "1.250");

/* ── 4. movimento ── */
const base = { produtoId: "p1", tipo: "entrada" as const, quantidade: 5, custoUnitario: 20, data: "2026-11-04", motivo: "Compra" };
ok("movimento: entrada completa passa", errosDoMovimento(base).length === 0);
ok("movimento: custo na saída é erro", errosDoMovimento({ ...base, tipo: "saida" }).includes("custo"));
ok("movimento: quantidade zero é erro", errosDoMovimento({ ...base, quantidade: 0 }).includes("quantidade"));
ok("movimento: quantidade ilegível é erro", errosDoMovimento({ ...base, quantidade: NaN }).includes("quantidade"));
ok("movimento: motivo em branco é erro", errosDoMovimento({ ...base, motivo: "   " }).includes("motivo"));
ok("movimento: sem produto é erro", errosDoMovimento({ ...base, produtoId: "" }).includes("produto"));
const linha = linhaDoMovimento({ ...base, tipo: "saida", custoUnitario: null, motivo: "  Perda  " });
ok("movimento: a linha da saída vai sem custo e com motivo aparado", linha.custo_unitario === null && linha.motivo === "Perda" && linha.tipo === "saida");
const s = saldoDaLinha({ product_id: "p1", name: "X", sku: null, unidade: "un", inicial: "10.000", entradas: "5.000", saidas: "2.000",
  vendido: "0", saldo: "13.000", minimo: null, custo_medio: null });
ok("leitura: numeric do banco vira número, e custo vazio continua vazio", s.saldo === 13 && s.custoMedio === null && s.minimo === null);

/* ── 5. contrato ── */
const arquivos = (dir: string): string[] => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
});
const ler = (p: string) => readFileSync(p, "utf8");

/** Quem soma venda para o estoque no cliente (lê `sale_items` ou soma `qty`). */
const semComentario = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const somaVenda = (texto: string) => /sale_items|\.qty\b|vendido\s*[+\-]=|reduce\([\s\S]{0,80}?saldo/.test(semComentario(texto));
ok("contrato [negativo]: a varredura acusa ler sale_items no cliente", somaVenda('s.from("sale_items").select("qty")'));
ok("contrato: comentário que explica a regra não conta como leitura", !somaVenda("// a venda mora em sale_items\n/* sale_items */ const x = 1;"));
ok("contrato [negativo]: a varredura acusa somar saldo no cliente", somaVenda("linhas.reduce((a, l) => a + l.saldo, 0)"));
const camadaEstoque = ["src/lib/estoque.ts", ...arquivos("src/components/estoque"), ...arquivos("src/core/estoque")];
const somam = camadaEstoque.filter((p) => somaVenda(ler(p)));
ok("contrato: nenhuma tela nem a camada do cliente refaz a conta do saldo", somam.length === 0, somam.join(", "));

/** Escrita em estoque_movimentos. */
const escreve = (texto: string) => /from\(\s*["'`]estoque_movimentos["'`]\s*\)\s*\.(insert|update|upsert|delete)/.test(texto);
ok("contrato [negativo]: a varredura acusa uma segunda escrita", escreve('await s.from("estoque_movimentos").insert({})'));
const escritores = arquivos("src").filter((p) => escreve(ler(p)));
ok("contrato: um escritor só de estoque_movimentos (lib/estoque.ts)",
  escritores.length === 1 && escritores[0].endsWith(join("lib", "estoque.ts")), escritores.join(", "));

/** Leitura da variável do interruptor. */
const leVariavel = (texto: string) => /env(\.|\[["'])ESTOQUE\b/.test(texto);
ok("contrato [negativo]: a varredura acusa ler process.env.ESTOQUE", leVariavel('if (process.env.ESTOQUE === "ligado")'));
const leitores = arquivos("src").filter((p) => leVariavel(ler(p)));
ok("contrato: um leitor só de ESTOQUE (core/estoque/ligado.ts)",
  leitores.length === 1 && leitores[0].endsWith(join("estoque", "ligado.ts")), leitores.join(", "));

/** A aba só aparece com o interruptor, lido no servidor pela página. */
const pagina = ler("src/app/dashboard/registrations/products/page.tsx");
ok("contrato: a página passa o interruptor lido no servidor", /estoque=\{estoqueLigado\(\)\}/.test(pagina) && !/"use client"/.test(pagina));

/**
 * O "Controla estoque?" mora no cadastro do produto. Na tela de Produtos e
 * serviços o lápis abria só o tipo fiscal (sem o interruptor), e o estoque
 * ficava sem porta de entrada (05/11/2026, print do dono).
 */
const abreCadastro = (t: string) => /<ProdutoServicoForm[\s\S]{0,120}produto=\{/.test(semComentario(t));
ok("contrato [negativo]: a varredura acusa a tela que não abre o cadastro na edição",
  !abreCadastro('import { ProdutoServicoForm } from "x";\n<FormFiscal produto={p} />'));
ok("contrato: o lápis de Produtos e serviços abre o cadastro (onde fica \"Controla estoque?\")",
  abreCadastro(ler("src/components/registros/ProdutosRegistroView.tsx")));

if (falhas) {
  console.log(`estoque: ${falhas} de ${casos} casos falharam`);
  process.exit(1);
}
console.log(`estoque: ${casos} casos verdes`);
