/**
 * GOLDEN DO REGIME DECLARADO — o número de quem declarou o regime não muda.
 *
 * ⚠️ O card "uma só regimeDaEmpresa, sem assumir Lucro Presumido" tirou o padrão
 * silencioso de Presumido das telas e cálculos de imposto. A regra que o
 * acompanha é a mais importante: para a empresa que DECLAROU o regime, o
 * resultado tem de ser IDÊNTICO ao de antes. Quem passa a ver coisa diferente é
 * só quem não declarou — e passa a ver o aviso, não outro número.
 *
 * `scripts/fixtures/regime-golden.json` foi gravado rodando ESTE mesmo roteiro
 * contra o código ANTERIOR à mudança (commit 0852b2d, com o resolvedor antigo
 * `regimeDaEmpresa(db, padrao = "presumido")` e os 15,38% inline da Nova venda).
 * Os valores são LITERAIS no arquivo, não recalculados aqui — um golden que se
 * regrava a cada execução concorda por construção e não mede nada.
 *
 * Só entra regime DECLARADO. O não declarado é justamente o que mudou, e é
 * cobrado à parte no fim deste arquivo (tem de dar "não declarado", nunca
 * Presumido).
 *
 *   npm run regime-golden            → compara com o golden
 *   npm run regime-golden -- --gravar → regrava (só com decisão escrita no PR)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { regimeDoCadastro } from "@/core/fiscal/perfil";
import { perfilTributario, cargaProjetada } from "@/core/tax/regime";
import { regimeConfigurado } from "@/core/tax/duplicidade";
import {
  configPadrao, provisionarImpostos, contasAPagarDosImpostos, impostoEstimadoDaVenda,
  IMPOSTOS, type ConfigImpostos, type Venda,
} from "@/core/vendas";

const ARQ = "scripts/fixtures/regime-golden.json";

/** Todas as formas DECLARADAS que o cadastro grava (onboarding, edição, legado). */
const DECLARADOS: Record<string, unknown>[] = [
  { regimeTributario: "Simples Nacional" }, { regime: "simples" }, { regime: "Simples Nacional" },
  { regimeTributario: "Lucro Presumido" }, { regime: "presumido" }, { regime: "Lucro Presumido" },
  { regimeTributario: "Lucro Real" }, { regime: "real" },
  { regimeTributario: "MEI" }, { regime: "mei" },
  { regimeTributario: "SIMPLES NACIONAL" }, { regime: "  Lucro Presumido  " },
  { regimeTributario: "Simples Nacional", regime: "presumido" },
  { regimeTributario: "Lucro Real", regime: "simples" },
  { regimeTributario: "Simples Nacional", anexoSimples: "III" },
  { regimeTributario: "Simples Nacional", anexoSimples: "IV" },
  { regime: "presumido", anexoSimples: "IV" },
];

const REGIMES_TAX = ["simples", "presumido", "real", "mei"] as const;
const REGIMES_VENDAS = ["simples", "presumido", "real"] as const;
const RECEITAS = [0, 0.01, 1_000, 123_456.78, 1_000_000];

const V = (o: Partial<Venda>): Venda => ({
  id: "v", numero: "2026-0001", clienteId: "c1", clienteNome: "Alpha",
  competencia: "2026-08-10", vencimento: "2026-08-20",
  itens: [{ produtoId: "p1", nome: "Curso", quantidade: 2, precoUnitario: 500 }],
  valorTotal: 1_000, valorTotalComJuros: 0,
  taxaPlataforma: { valor: 0, fornecedorId: "" },
  taxaAntecipacao: { valor: 0, fornecedorId: "" },
  taxaStreaming: { valor: 0, fornecedorId: "" },
  comissaoCoprodutor: { valor: 0, fornecedorId: "" },
  comissaoAfiliado: { valor: 0, fornecedorId: "" },
  contaId: "ac1", operacao: "venda", status: "completa", metodo: "pix",
  idExterno: "", categoria: "cat1", tipoPagamento: "avista", plataforma: "Hotmart",
  chaveTransacao: "", pago: false, valorPago: 0, dataPagamento: null,
  projetos: [], centros: [], descricao: "", textoDocumentoFiscal: "", observacoes: "",
  statusNF: "a_emitir", numeroNF: "", criadoEm: "2026-08-10", ...o,
} as Venda);

/** O mesmo lote do `engine-audit` (bloco vendas/impostos) + um valor quebrado. */
const VENDAS: Venda[] = [
  V({ id: "a", status: "completa", valorTotal: 1_000, statusNF: "emitida" }),
  V({ id: "b", status: "aprovada", valorTotal: 500, statusNF: "a_emitir" }),
  V({ id: "c", status: "iniciada", valorTotal: 300, statusNF: "negada" }),
  V({ id: "d", status: "chargeback", valorTotal: 200, statusNF: "cancelada" }),
  V({ id: "e", status: "completa", valorTotal: 12_345.67, valorTotalComJuros: 12_999.99 }),
];

const completa = (c: ConfigImpostos): ConfigImpostos => ({
  ...c,
  fornecedores: { municipal: "fm", estadual: "fe", federal: "ff" },
  categorias: Object.fromEntries(IMPOSTOS.map((i) => [i, "cat"])) as ConfigImpostos["categorias"],
  contaId: "ac1",
});

function snapshot() {
  return {
    // O resolvedor, sobre tudo que está DECLARADO.
    resolvedor: DECLARADOS.map((db) => ({ db, regime: regimeDoCadastro(db) })),
    regimeConfigurado: DECLARADOS.map((db) => ({ db, r: regimeConfigurado(db) })),
    // O perfil de cada regime e a carga projetada (ProjecaoCarga + fiscal/ImpostosView).
    perfil: REGIMES_TAX.map((r) => perfilTributario(r)),
    carga: REGIMES_TAX.flatMap((r) => RECEITAS.map((x) => ({ r, x, v: cargaProjetada(x, r) }))),
    // O provisionamento por venda (vendas-nf/OutrasViews) e as contas a pagar.
    config: REGIMES_VENDAS.map((r) => configPadrao(r)),
    provisao: REGIMES_VENDAS.map((r) => {
      const cfg = completa(configPadrao(r));
      const p = provisionarImpostos(VENDAS, cfg);
      return { r, p, contas: contasAPagarDosImpostos(p, cfg, "2026-08") };
    }),
    // A estimativa da Nova venda, para cada regime declarado.
    novaVenda: REGIMES_TAX.flatMap((r) => RECEITAS.map((x) => ({ r, x, v: impostoEstimadoDaVenda(x, r) }))),
  };
}

const atual = JSON.parse(JSON.stringify(snapshot()));

if (process.argv.includes("--gravar")) {
  writeFileSync(ARQ, JSON.stringify(atual, null, 2) + "\n");
  console.log(`golden gravado em ${ARQ}`);
  process.exit(0);
}

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`✓ ${nome}`);
  else { falhas++; console.log(`✗ ${nome}${det ? ` — ${det}` : ""}`); }
};

const golden = JSON.parse(readFileSync(ARQ, "utf8"));
for (const k of Object.keys(golden)) {
  const a = JSON.stringify(atual[k]);
  const g = JSON.stringify(golden[k]);
  let det = "";
  if (a !== g) {
    const ga = golden[k] as unknown[]; const aa = atual[k] as unknown[];
    const i = ga.findIndex((x, j) => JSON.stringify(x) !== JSON.stringify(aa[j]));
    det = `primeira diferença no item ${i}: golden ${JSON.stringify(ga[i])} × atual ${JSON.stringify(aa[i])}`;
  }
  ok(`golden: ${k} idêntico ao código anterior (${(golden[k] as unknown[]).length} casos)`, a === g, det);
}
// ⚠️ Um golden que não recebeu valor não prova nada: o provisionamento tem de
// ter imposto de verdade no Presumido e no Real.
const prov = golden.provisao as { r: string; p: { total: number } }[];
ok("golden: o caso exercita dinheiro (Presumido e Real com imposto > 0)",
   prov.filter((x) => x.r !== "simples").every((x) => x.p.total > 0));

/* ---- O que MUDOU, e só isto: o não declarado ---------------------------- */
const VAZIOS: (Record<string, unknown> | null | undefined)[] =
  [null, undefined, {}, { regime: "" }, { regimeTributario: "  " }, { regime: "qualquer coisa" }];
ok("não declarado: o resolvedor nunca devolve Presumido",
   VAZIOS.every((db) => regimeDoCadastro(db) === "nao_declarado"));
const nd = perfilTributario("nao_declarado");
ok("não declarado: o perfil não tem tabela nem carga", nd.tributos === null && nd.cargaTotal === 0
   && cargaProjetada(1_000_000, "nao_declarado") === 0);
ok("não declarado: o perfil manda declarar em Configurações",
   /não declarado/i.test(nd.observacao) && /Configurações/.test(nd.observacao));
ok("não declarado: a Nova venda não estima imposto", impostoEstimadoDaVenda(1_000, "nao_declarado") === null);

console.log(falhas ? `\n✗ ${falhas} falha(s)` : "\n✓ TODOS — regime declarado idêntico ao código anterior · não declarado nunca vira Presumido");
process.exit(falhas ? 1 : 0);
