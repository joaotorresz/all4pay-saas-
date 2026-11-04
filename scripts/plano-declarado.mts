/**
 * plano-declarado — a entrada declara o plano de contas, com a sugestão da
 * Quattro AI (Fase 4.1 do plano, 04/11/2026).
 *
 *   npm run plano-declarado        (dentro de npm test)
 *
 * O defeito de origem (Rodada 4): ninguém terminava a entrada com o plano de
 * contas declarado, e o DRE de todo cliente novo saía por palpite. O palpite
 * põe INSS patronal e FGTS na DEDUÇÃO DA RECEITA (47,54% da receita bruta na
 * organização auditada). A guarda reprova se alguém desfizer:
 *
 *   VALOR
 *   1. a sugestão leva encargo de folha (INSS patronal, FGTS) a Despesas
 *      Operacionais, e mantém o palpite no resto; "INSS sobre a receita"
 *      (CPRB) continua dedução;
 *   2. a lista do que falta declarar deixa de fora a categoria declarada,
 *      "Sem categoria" e a transferência entre contas;
 *   3. confirmar as sugestões tira o INSS da dedução: dedução R$ 0 e despesa
 *      operacional R$ 8.000 + R$ 3.000 (antes: dedução R$ 8.000);
 *   4. o passo "Declare o plano de contas" da jornada só fica feito com a
 *      leitura das linhas e nada pendente ("não sei" não é "feito").
 *
 *   FORMA
 *   5. a importação e Primeiros passos mostram o cartão; a jornada recebe as
 *      linhas declaradas;
 *   6. o "Revisar e declarar" pré-marca a SUGESTÃO (não o palpite cru) e grava
 *      pelo escritor do Plano de contas.
 *
 * ⚠️ Os números esperados são literais (regra 11).
 */
import { readFileSync } from "node:fs";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { sugerirLinhaDRE, planoParaDeclarar } from "@/core/registros/sugestao";
import { montarRelatorio, ESTRUTURA_DRE } from "@/core/relatorios";
import { montarJornada } from "@/lib/adoption";

let falhas = 0;
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`  ✓ ${nome}`);
  else { falhas++; console.log(`  ✗ ${nome}${det ? ` — ${det}` : ""}`); }
};

console.log("\nvalor");
ok("1. INSS patronal vai a Despesas Operacionais",
   sugerirLinhaDRE("INSS patronal (GPS)", "despesa", "deducoes").linha === "despesas_operacionais");
ok("1. FGTS vai a Despesas Operacionais", sugerirLinhaDRE("FGTS", "despesa", "deducoes").linha === "despesas_operacionais");
ok("1. a sugestão do encargo diz o motivo", /encargo de folha/i.test(sugerirLinhaDRE("FGTS", "despesa", "deducoes").motivo));
ok("1. INSS sobre a receita (CPRB) continua dedução",
   sugerirLinhaDRE("INSS sobre a receita (CPRB)", "despesa", "deducoes").linha === "deducoes");
ok("1. sem regra própria, a sugestão é o palpite",
   sugerirLinhaDRE("Aluguel", "despesa", "despesas_operacionais").linha === "despesas_operacionais"
   && sugerirLinhaDRE("ISS", "despesa", "deducoes").linha === "deducoes");
ok("1. receita não vira encargo", sugerirLinhaDRE("Vendas de salários", "receita", "receita_bruta").linha === "receita_bruta");

const mv = (id: string, type: "entrada" | "saida", amount: number, category: string): RiskMovement => ({
  id, type, status: "pago", amount, due_date: "2026-09-10", paid_date: "2026-09-10", category,
}) as RiskMovement;
const input = { movements: [
  mv("v", "entrada", 50_000, "Vendas"),
  mv("i", "saida", 8_000, "INSS patronal (GPS)"),
  mv("a", "saida", 3_000, "Aluguel"),
  mv("s", "saida", 1_000, "Software"),
  mv("t", "saida", 5_000, "Transferência entre contas"),
  mv("x", "saida", 700, "Sem categoria"),
] } as unknown as RiskInput;
const declaradas = { software: "despesas_operacionais" };
const pend = planoParaDeclarar(input, declaradas);
const nomes = pend.map((c) => c.nome).sort();
ok("2. faltam Aluguel, INSS e Vendas (nem Software, nem sem categoria, nem transferência)",
   JSON.stringify(nomes) === JSON.stringify(["Aluguel", "INSS patronal (GPS)", "Vendas"]), JSON.stringify(nomes));
const inss = pend.find((c) => c.nome.startsWith("INSS"));
ok("2. o palpite do INSS é a dedução (o defeito que a sugestão corrige)", inss?.palpite === "deducoes", inss?.palpite);

const filtro = (linhas: Record<string, string>) => ({
  intervalo: { de: "2026-09-01", ate: "2026-09-30" }, regime: "competencia", linhaPorCategoria: linhas,
}) as Parameters<typeof montarRelatorio>[2];
// A soma por linha é feita aqui, movimento a movimento, sobre a classificação.
const linhaDe = (rel: ReturnType<typeof montarRelatorio>, id: string) =>
  Math.abs(Object.values(rel.classificacao).filter((c) => c.linha === id).reduce((s, c) => s + c.valor, 0));
const antes = montarRelatorio(input, ESTRUTURA_DRE, filtro(declaradas));
const confirmadas = { ...declaradas, ...Object.fromEntries(pend.map((c) => [c.nome.toLowerCase(), c.sugestao.linha])) };
const depois = montarRelatorio(input, ESTRUTURA_DRE, filtro(confirmadas));
ok("3. antes de confirmar, a dedução é R$ 8.000", linhaDe(antes, "deducoes") === 8000, String(linhaDe(antes, "deducoes")));
ok("3. depois de confirmar, a dedução é R$ 0", linhaDe(depois, "deducoes") === 0, String(linhaDe(depois, "deducoes")));
ok("3. depois de confirmar, a despesa operacional é R$ 12.700 (INSS, aluguel, software e o sem categoria)",
   linhaDe(depois, "despesas_operacionais") === 12700, String(linhaDe(depois, "despesas_operacionais")));
ok("3. depois de confirmar, nada falta declarar", planoParaDeclarar(input, confirmadas).length === 0);

const passo = (d?: Record<string, string>, base: RiskInput = input) =>
  montarJornada(base, new Set(), d).estagios.flatMap((e) => e.passos).find((p) => p.id === "plano-de-contas");
ok("4. a jornada tem o passo do plano de contas", !!passo(confirmadas));
// Só transferência: nada a declarar, e mesmo assim sem a leitura não há "feito".
const soTransferencia = { movements: [mv("t2", "saida", 900, "Transferência entre contas")] } as unknown as RiskInput;
ok("4. sem a leitura das linhas, o passo fica aberto", passo(undefined, soTransferencia)?.feito === false);
ok("4. com a leitura e nada pendente, o passo fica feito", passo({}, soTransferencia)?.feito === true);
ok("4. com categoria pendente, o passo fica aberto", passo(declaradas)?.feito === false);
ok("4. tudo declarado, o passo fica feito", passo(confirmadas)?.feito === true);

console.log("\nforma");
// Só o comentário que abre a linha ("accept=\"image/*\"" não é comentário).
const semComentario = (t: string) =>
  t.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\*[\s\S]*?\*\//gm, "").replace(/^\s*\/\/.*$/gm, "");
const upload = semComentario(readFileSync("src/components/upload/UploadView.tsx", "utf8"));
ok("5. a importação mostra o cartão do plano de contas", /<DeclararPlanoCard \/>/.test(upload));
const jornada = semComentario(readFileSync("src/components/comece/Jornada.tsx", "utf8"));
ok("5. Primeiros passos mostra o cartão", /<DeclararPlanoCard \/>/.test(jornada));
ok("5. a jornada recebe as linhas declaradas", /montarJornada\(input, vistas, declaradas\)/.test(jornada));
const card = semComentario(readFileSync("src/components/registros/DeclararPlanoCard.tsx", "utf8"));
ok("5. o cartão lê as linhas declaradas e a regra única", /linhasDeclaradasDasCategorias/.test(card) && /planoParaDeclarar\(input, declaradas\)/.test(card));
const dec = semComentario(readFileSync("src/components/relatorios/DeclararPalpite.tsx", "utf8"));
ok("6. o declarar pré-marca a sugestão", /sugerirLinhaDRE\(c\.nome, c\.natureza, c\.linha\)/.test(dec)
   && !/linhaDREvalida\(c\.linha, c\.natureza\) \? c\.linha/.test(dec));
ok("6. grava pelo escritor do Plano de contas", /await declararLinhas\(/.test(dec));

if (falhas > 0) {
  console.log(`\n✗ plano-declarado: ${falhas} falha(s)\n`);
  process.exit(1);
}
console.log("\n✓ plano-declarado: a entrada declara o plano de contas, e o INSS sai da dedução da receita\n");
