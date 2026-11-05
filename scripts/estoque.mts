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
 *   5. a entrada pela NF-e de compra: leitura do XML, custo de aquisição,
 *      sugestão do produto, fator de unidade e o que não é nota de compra;
 *   6. contrato: nenhuma tela nem a camada do cliente soma venda ou lê
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
import {
  lerNFe, sugerirProduto, movimentosDaNota, vinculosDaEntrada, errosDaEntrada,
} from "../src/core/estoque/nfe.ts";

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

/* ── 6. entrada pela NF-e de compra (etapa 2) ──
 * Uma nota literal, com namespace como a SEFAZ entrega. Os custos esperados
 * foram feitos à mão:
 *   item 1: (240 + 10 frete − 6 desconto + 12 IPI) ÷ 2 CX = 128 por CX;
 *           com 12 UN por CX: 24 UN a 10,6667;
 *   item 2: (50 + 3,50 ICMS-ST) ÷ 5 = 10,70; "SEM GTIN" não é código de barras;
 *   item 3: (30 + 0,30 seguro + 0,20 outras) ÷ 1,5 KG = 20,3333.
 */
const CHAVE_NFE = "35261112345678000190550010000012341000012347";
const det = (n: number, prod: string, imposto = "") =>
  `<det nItem="${n}"><prod>${prod}</prod><imposto>${imposto}</imposto></det>`;
const XML_NFE = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe xmlns="http://www.portalfiscal.inf.br/nfe">
<infNFe Id="NFe${CHAVE_NFE}" versao="4.00">
<ide><cUF>35</cUF><mod>55</mod><serie>1</serie><nNF>1234</nNF><dhEmi>2026-11-03T14:20:00-03:00</dhEmi><tpNF>1</tpNF></ide>
<emit><CNPJ>12345678000190</CNPJ><xNome>Caf&#233; &amp; Cia Distribuidora</xNome></emit>
<dest><CNPJ>98765432000110</CNPJ><xNome>Loja da Guarda</xNome></dest>
${det(1, "<cProd>CX-CAN</cProd><cEAN>7891234567895</cEAN><xProd>Caneca 300ml cx 12</xProd><NCM>69120000</NCM><uCom>cx</uCom><qCom>2.0000</qCom><vUnCom>120.0000000000</vUnCom><vProd>240.00</vProd><vFrete>10.00</vFrete><vDesc>6.00</vDesc>",
  "<ICMS><ICMS00><vICMS>0</vICMS></ICMS00></ICMS><IPI><IPITrib><vIPI>12.00</vIPI></IPITrib></IPI>")}
${det(2, "<cProd>CAM-01</cProd><cEAN>SEM GTIN</cEAN><xProd>Camiseta</xProd><uCom>UN</uCom><qCom>5</qCom><vUnCom>10</vUnCom><vProd>50.00</vProd>",
  "<ICMS><ICMS10><vICMSST>3.50</vICMSST></ICMS10></ICMS><IPI><IPINT><CST>53</CST></IPINT></IPI>")}
${det(3, "<cProd>GRAO</cProd><cEAN></cEAN><xProd>Café em grão</xProd><uCom>KG</uCom><qCom>1.5000</qCom><vUnCom>20</vUnCom><vProd>30.00</vProd><vSeg>0.30</vSeg><vOutro>0.20</vOutro>")}
<total><ICMSTot><vNF>340.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

const lida = lerNFe(XML_NFE);
ok("nfe: a nota literal é lida", lida.ok, lida.ok ? "" : lida.motivo);
if (lida.ok) {
  const n = lida.nota;
  ok("nfe: chave, número, série, emissão e total", n.chave === CHAVE_NFE && n.numero === "1234" && n.serie === "1" && n.emissao === "2026-11-03" && n.valorTotal === 340,
    JSON.stringify({ c: n.chave, n: n.numero, s: n.serie, e: n.emissao, t: n.valorTotal }));
  ok("nfe: fornecedor com acento e & decodificados", n.fornecedor.cnpj === "12345678000190" && n.fornecedor.nome === "Café & Cia Distribuidora", n.fornecedor.nome);
  ok("nfe: o destinatário vem para a pessoa conferir", n.destinatario.documento === "98765432000110" && n.destinatario.nome === "Loja da Guarda");
  ok("nfe: três itens na ordem", n.itens.map((i) => i.item).join(",") === "1,2,3");
  const [i1, i2, i3] = n.itens;
  ok("nfe: item 1 com frete, desconto e IPI no custo (128 por CX)", i1.custoUnitario === 128 && i1.quantidade === 2 && i1.unidade === "CX" && i1.codigo === "CX-CAN" && i1.ean === "7891234567895" && i1.ncm === "69120000",
    JSON.stringify(i1));
  ok("nfe: item 2 com ICMS-ST no custo (10,70) e SEM GTIN vira sem código de barras", i2.custoUnitario === 10.7 && i2.ean === null, JSON.stringify(i2));
  ok("nfe: item 3 com seguro e outras despesas (20,3333 por KG)", i3.custoUnitario === 20.3333 && i3.quantidade === 1.5 && i3.ean === null, JSON.stringify(i3));

  // sugestão do produto
  const prods = [{ produtoId: "p-can", sku: "CX-CAN" }, { produtoId: "p-cam", sku: "7891234567895" }, { produtoId: "p-cafe", sku: null }];
  const vinc = [{ fornecedorCnpj: "12.345.678/0001-90", codigo: "CX-CAN", produtoId: "p-cafe", fator: 12 }];
  const sv = sugerirProduto(i1, n.fornecedor.cnpj, vinc, prods);
  ok("nfe: o vínculo deste fornecedor vence o SKU, e traz o fator", sv?.produtoId === "p-cafe" && sv.como === "vinculo" && sv.fator === 12, JSON.stringify(sv));
  const outroForn = sugerirProduto(i1, "11111111000111", vinc, prods);
  ok("nfe: o vínculo de OUTRO fornecedor não vale; cai no SKU", outroForn?.produtoId === "p-can" && outroForn.como === "sku" && outroForn.fator === 1, JSON.stringify(outroForn));
  const morto = sugerirProduto(i1, n.fornecedor.cnpj, vinc, prods.filter((p) => p.produtoId !== "p-cafe"));
  ok("nfe: vínculo com produto que não controla mais estoque é ignorado", morto?.produtoId === "p-can", JSON.stringify(morto));
  ok("nfe: o código de barras casa com o SKU", sugerirProduto({ ...i1, codigo: "X" }, n.fornecedor.cnpj, [], prods)?.como === "ean");
  ok("nfe: sem vínculo, SKU nem código de barras, ninguém é escolhido (nunca por nome parecido)",
    sugerirProduto(i3, n.fornecedor.cnpj, [], [...prods, { produtoId: "p-x", sku: "Café em grão" }]) === null);

  // os movimentos da confirmação
  const escolhas = [
    { item: 1, produtoId: "p-can", fator: 12 },
    { item: 2, produtoId: null, fator: 1 },
    { item: 3, produtoId: "p-cafe", fator: 1000 },
  ];
  const movs = movimentosDaNota(n, escolhas);
  ok("nfe: um movimento por item escolhido; o item sem produto fica de fora", movs.length === 2 && movs.map((m) => m.nfeItem).join(",") === "1,3");
  ok("nfe: 2 CX × 12 = 24 UN a 10,6667", movs[0].quantidade === 24 && movs[0].custoUnitario === 10.6667 && movs[0].tipo === "entrada", JSON.stringify(movs[0]));
  ok("nfe: 1,5 KG × 1000 = 1500 g a 0,0203", movs[1].quantidade === 1500 && movs[1].custoUnitario === 0.0203, JSON.stringify(movs[1]));
  ok("nfe: o movimento leva a chave, a data da emissão, o CNPJ do fornecedor e o motivo",
    movs[0].nfeChave === CHAVE_NFE && movs[0].data === "2026-11-03" && movs[0].fornecedorCnpj === "12345678000190"
    && movs[0].motivo === "Compra · NF-e 1234 · Café & Cia Distribuidora", JSON.stringify(movs[0]));
  ok("nfe: o movimento da nota passa na mesma regra do movimento manual", movs.every((m) => errosDoMovimento(m).length === 0));
  const vs = vinculosDaEntrada(n, escolhas);
  ok("nfe: lembra o produto e o fator de cada código escolhido", vs.length === 2 && vs[0].codigo === "CX-CAN" && vs[0].fator === 12 && vs[0].fornecedorCnpj === "12345678000190", JSON.stringify(vs));
  ok("nfe: nenhum item escolhido é erro", errosDaEntrada(n, [{ item: 1, produtoId: null, fator: 1 }]).includes("nenhum_item"));
  ok("nfe: fator zero é erro", errosDaEntrada(n, [{ item: 1, produtoId: "p", fator: 0 }]).includes("fator"));
  ok("nfe: item que a nota não tem é erro", errosDaEntrada(n, [{ item: 9, produtoId: "p", fator: 1 }]).includes("item_desconhecido"));
}

// o que não é NF-e de compra
const recusa = (xml: string, trecho: RegExp, nome: string) => {
  const r = lerNFe(xml);
  ok(`nfe [negativo]: ${nome}`, !r.ok && trecho.test(r.motivo), r.ok ? "passou" : r.motivo);
};
recusa("%PDF-1.4 ...", /não é um XML/, "PDF do DANFE");
recusa(XML_NFE.replace("<mod>55</mod>", "<mod>65</mod>").split(CHAVE_NFE).join("35261112345678000190650010000012341000012340"), /NFC-e/, "NFC-e (cupom)");
recusa(XML_NFE.split(CHAVE_NFE).join(CHAVE_NFE.slice(0, 43) + "0"), /dígito verificador/, "chave com dígito errado");
recusa('<CompNfse><Nfse><InfNfse></InfNfse></Nfse></CompNfse>', /NFS-e/, "nota de serviço");
recusa('<procEventoNFe><evento></evento></procEventoNFe>', /evento/, "XML de cancelamento");
recusa(XML_NFE.replace(/<det [\s\S]*<\/det>/, ""), /não tem itens/, "nota sem itens");
recusa(XML_NFE.replace("<qCom>5</qCom>", "<qCom>0</qCom>"), /item 2/, "item com quantidade zero");

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
