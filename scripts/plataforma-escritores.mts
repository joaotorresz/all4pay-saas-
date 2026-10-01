/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLATAFORMA — os escritores e leitores que diziam ter feito o que não fizeram
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Roda com `NEXT_PUBLIC_ALL4PAY_DEMO=true` (o script do package.json o define):
 * o escritor da DEMONSTRAÇÃO é exercitado de verdade — `createLancamento`
 * grava no dataset e a asserção confere a LINHA que entrou, o SALDO que andou
 * e o `RiskInput` que os motores leem. Sem o modo demo ela testaria o caminho
 * de produção, que precisa de banco.
 *
 * Cada asserção afirma sobre o VALOR produzido (regra "toda fixture prova que
 * o caminho testado recebeu valor"), e as que guardam uma proibição afirmam
 * sobre o proibido (o cache de OUTRA empresa, a segunda despesa descartada).
 * Provadas plantando o defeito de volta — ver docs/rodada-30-09/plataforma.md.
 */
import { readFileSync, existsSync } from "node:fs";

let falhas = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) console.log(`✓ ${nome}`);
  else { falhas++; console.log(`✗ FAIL ${nome}${detalhe ? `\n    ${detalhe}` : ""}`); }
};
const semComentario = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const { isDemo } = await import("@/lib/demo");
ok("o script roda em modo demonstração (senão testaria o caminho de produção)", isDemo);

const data = await import("@/lib/data");
const imp = await import("@/lib/imported");
const { listarCategorias } = await import("@/lib/cadastros-hierarquia");
import type { LancamentoInput } from "@/lib/types";

const cats = await listarCategorias();
const cat = cats.find((c) => c.natureza === "despesa")!;
const contas = await data.getAccountsList();
const conta = contas[1] ?? contas[0];
const base: LancamentoInput = {
  kind: "despesa", party_id: null, competence_date: "2026-10-01", description: "Mercado R3", amount: 87.65,
  category_id: cat.id, cost_center_id: null, project_id: null, reference_code: null, splits: null, repeat: null,
  installments: 1, due_date: "2026-10-01", payment_method: null, account_id: conta.id, settled: true, nsu: null,
};

/* ── 1. createLancamento GRAVA na demonstração (antes: "Despesa salva" e nada) ── */
const saldoAntes = (await data.getAccountsList()).find((a) => a.id === conta.id)!.balance;
await data.createLancamento(base);
const doMercado = () => (imp.importedMovements() ?? []).filter((m) => m.description === "Mercado R3");
const linha = doMercado()[0];
ok("demo: a despesa do \"Adicionar\" ENTRA no dataset", doMercado().length === 1, String(doMercado().length));
ok("demo: com o valor, a conta, a baixa e a procedência do formulário",
   !!linha && linha.amount === 87.65 && linha.account_id === conta.id && linha.status === "pago" && linha.origem === "manual" && linha.type === "saida",
   JSON.stringify(linha));
ok("demo: o vencimento é o DIGITADO (em UTC−3, new Date(\"2026-10-01\") virava 30/09)", linha?.due_date === "2026-10-01", linha?.due_date);
ok("demo: a categoria vai pelo NOME (é por ele que o DRE da demonstração classifica)", linha?.category === cat.nome, `${linha?.category} × ${cat.nome}`);
const saldoDepois = (await data.getAccountsList()).find((a) => a.id === conta.id)!.balance;
ok("demo: o saldo da conta cai EXATAMENTE o valor pago", Math.abs((saldoAntes - saldoDepois) - 87.65) < 0.005, `${saldoAntes} → ${saldoDepois}`);
const risco = await data.getRiscoInput();
ok("demo: o RiskInput (DRE, fluxo, risco) enxerga a despesa",
   risco.movements.some((m) => m.id === linha?.id && m.amount === 87.65 && m.category === cat.nome && m.status === "pago"));

/* A proibição: duas despesas IGUAIS no mesmo dia são duas despesas. */
await data.createLancamento(base);
ok("demo: a segunda despesa idêntica NÃO é descartada pelo dedup do dataset (em produção são duas)",
   doMercado().length === 2, String(doMercado().length));

/* Parcelado: o dia que não existe no mês vira o último dia dele. */
await data.createLancamento({ ...base, description: "Notebook R3", amount: 300, installments: 3, due_date: "2027-01-31", settled: false });
const parcelas = (imp.importedMovements() ?? []).filter((m) => m.description === "Notebook R3").map((m) => m.due_date).sort();
ok("demo: 3x a partir de 31/01 vence 31/01 · 28/02 · 31/03 (setMonth dava 03/03)",
   parcelas.join() === "2027-01-31,2027-02-28,2027-03-31", parcelas.join());
ok("vencimentoDaParcela: dezembro vira janeiro do ano seguinte", data.vencimentoDaParcela("2026-12-15", 1) === "2027-01-15");

/* Repetir: a demonstração não tem onde guardar a regra — recusa ANTES de gravar. */
let recusou = "";
try { await data.createLancamento({ ...base, description: "Aluguel R3", repeat: { freq: "mensal", count: 12, until: null } }); }
catch (e) { recusou = e instanceof Error ? e.message : String(e); }
ok("demo: repetir é RECUSADO com o motivo, e nada é gravado pela metade",
   /repetição não é gravada/.test(recusou) && !(imp.importedMovements() ?? []).some((m) => m.description === "Aluguel R3"), recusou);

/* ── 2. restoreMovement saiu (pedia cancelado → previsto, recusado pelo banco) ── */
ok("lixeira: lib/data não exporta mais restoreMovement", !("restoreMovement" in data));

/* ── 3. O cache do perfil só vale para a organização que o gravou ── */
const { cacheDaOrganizacao } = await import("@/lib/company");
const cacheA = { db: { razaoSocial: "Empresa A" }, orgId: "org-a" };
ok("perfil: cache de OUTRA organização é ausente (era devolvido como se fosse desta)", cacheDaOrganizacao(cacheA, "org-b") === null);
ok("perfil: cache sem carimbo é ausente (não dá para saber de quem é)", cacheDaOrganizacao({ db: { razaoSocial: "X" } }, "org-b") === null);
ok("perfil: cache da organização aberta vale", cacheDaOrganizacao(cacheA, "org-a") === cacheA);
ok("perfil: sem saber a organização aberta, nenhum cache vale", cacheDaOrganizacao(cacheA, null) === null);
const comp = semComentario(readFileSync("src/lib/company.ts", "utf8"));
const ramoLive = comp.split("export async function fetchCompany")[1]?.split("\n}\n")[0] ?? "";
ok("perfil: fora da demonstração, fetchCompany nunca devolve o cache cru",
   (ramoLive.match(/return loadCompany\(\)/g) ?? []).length === 1 && /if \(isDemo\) return loadCompany\(\)/.test(ramoLive)
   && /cacheDaOrganizacao\(loadCompany\(\)/.test(ramoLive), ramoLive.slice(0, 300));

/* ── 4. PIX da pessoa física sai do CPF ── */
const { dadosPixDoCadastro } = await import("@/lib/pix");
const pf = dadosPixDoCadastro({ db: { tipoPessoa: "fisica", cpf: "123.456.789-09" }, pessoal: { nome: "Ana" } });
ok("pix: cadastro de pessoa física (CPF) tem chave PIX — lia só db.cnpj", pf?.chave === "12345678909" && pf?.nome === "Ana", JSON.stringify(pf));
const pj = dadosPixDoCadastro({ db: { cnpj: "12.345.678/0001-95", fantasia: "Loja" } });
ok("pix: a pessoa jurídica segue com o CNPJ", pj?.chave === "12345678000195" && pj?.nome === "Loja", JSON.stringify(pj));

/* ── 5. Onboarding: a recusa da alçada é reportada e mostrada, sem bloquear ── */
const onb = semComentario(readFileSync("src/components/onboarding/OnboardingWizard.tsx", "utf8"));
ok("onboarding: a recusa da alçada não é engolida (catch mudo)",
   !/aplicarAlcadaDoOnboarding\([^;]*\);?\s*\}\s*catch\s*\{/.test(onb)
   && /catch \(e\) \{\s*reportar\("organizacao\.alcada"/.test(onb) && /setAvisoAlcada\(/.test(onb));

/* ── 6. Formulário: a recusa real e o modo pessoal ── */
const form = semComentario(readFileSync("src/components/lancamentos/ReceitaForm.tsx", "utf8"));
const { motivoDaRecusa } = await import("@/lib/erros");
ok("form: a mensagem do banco (message + details + hint) chega à tela",
   motivoDaRecusa({ message: "A4P05", details: "sem origem", hint: "informe a origem" }) === "A4P05 sem origem informe a origem"
   && /onToast\(`Não foi possível salvar: \$\{motivoDaRecusa\(err\)\}`\)/.test(form));
const escondidos = [
  /\{!pessoal && \(\s*<Select\s+label=\{isReceita \? "Cliente" : "Fornecedor"\}/,
  /\{!pessoal && \(\s*<Select\s+label="Centro de custo"/,
  /\{!pessoal && \(\s*<Select\s+label="Projeto"/,
  /\{!pessoal && \(\s*<Input\s+label="Código de referência"/,
  /\{!pessoal && \(\s*<Switch\s+label="Informar NSU\?"/,
];
const faltam = escondidos.filter((re) => !re.test(form)).map(String);
ok("form: no modo pessoal somem Fornecedor/Cliente, Centro de custo, Projeto, Código de referência e NSU",
   faltam.length === 0, faltam.join(" | "));
ok("form: escondido também NÃO é enviado",
   /party_id: pessoal \? null/.test(form) && /cost_center_id: pessoal \? null/.test(form) && /project_id: pessoal \? null/.test(form)
   && /reference_code: pessoal \? null/.test(form) && /nsu: !pessoal &&/.test(form));

/* ── 7. Código morto apagado ── */
for (const f of ["src/components/visao-geral/MovementsTable.tsx", "src/components/visao-geral/ConciliacaoView.tsx"]) {
  ok(`morto: ${f.split("/").pop()} não volta (ninguém o importava)`, !existsSync(f));
}

console.log(`\n${falhas === 0 ? "✓ TODAS" : `✗ ${falhas} FALHA(S)`} — plataforma: escritores e leitores`);
if (falhas > 0) process.exit(1);
