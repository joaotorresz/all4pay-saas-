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

/* Baixa sem conta: o dataset a jogava na PRIMEIRA conta e debitava o saldo dela. */
const saldosAntes = (await data.getAccountsList()).map((a) => `${a.id}:${a.balance}`).join();
let semConta = "";
try { await data.createLancamento({ ...base, description: "Sem conta R3", account_id: null }); }
catch (e) { semConta = e instanceof Error ? e.message : String(e); }
const saldosDepois = (await data.getAccountsList()).map((a) => `${a.id}:${a.balance}`).join();
ok("demo: baixa imediata SEM conta é recusada com o motivo (ia para a 1ª conta e debitava o saldo dela)",
   /Escolha a conta/.test(semConta) && saldosAntes === saldosDepois
   && !(imp.importedMovements() ?? []).some((m) => m.description === "Sem conta R3"), semConta || "aceitou");
await data.createLancamento({ ...base, description: "Previsto sem conta R3", account_id: null, settled: false });
ok("demo: título PREVISTO sem conta segue aceito (a conta pode ser escolhida na baixa)",
   (imp.importedMovements() ?? []).some((m) => m.description === "Previsto sem conta R3"));

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

/* ── 3b. O cache de NEGÓCIO do navegador tem dono (r4/plataforma-rev) ──
 * O carimbo do perfil protegia UMA leitura (`fetchCompany`). As outras chaves
 * de negócio — e o próprio perfil lido síncrono por `loadCompany` — seguiam
 * sem dono, e a sincronização da sessão SUBIA para a empresa aberta o que o
 * navegador tinha da anterior. `localStorage` de mentira: sem ele as funções
 * não teriam o que conferir e a guarda passaria provando o vazio. */
{
  const disco = new Map<string, string>();
  const armazem = {
    getItem: (k: string) => disco.get(k) ?? null,
    setItem: (k: string, v: string) => { disco.set(k, v); },
    removeItem: (k: string) => { disco.delete(k); },
    key: (i: number) => Array.from(disco.keys())[i] ?? null,
    clear: () => disco.clear(),
    get length() { return disco.size; },
  };
  const g = globalThis as unknown as { window?: unknown; localStorage?: unknown };
  const janelaAntes = g.window, armazemAntes = g.localStorage;
  g.window = g; g.localStorage = armazem;
  try {
    const so = await import("@/lib/store-org");
    const daEmpresaA = () => {
      disco.clear();
      disco.set(so.CHAVE_ORG_DO_CACHE, "org-a");
      disco.set("a4p_company", JSON.stringify({ db: { razaoSocial: "Empresa A" }, orgId: "org-a" }));
      disco.set("a4p_orcamentos", JSON.stringify([{ id: "o1", nome: "Orçamento da A" }]));
      disco.set("a4p_vendas_docs", JSON.stringify([{ id: "v1" }])); // congelada
      // A memória de `ler` também carrega a cópia: limpar só o disco deixaria
      // a tela mostrando a empresa A até recarregar.
      so.limparCache();
      so.ler("a4p_company", null);
    };

    daEmpresaA();
    const m = await so.migrarParaServidor(so.CHAVES_DE_NEGOCIO, "org-b");
    ok("cache-dono: o envio é RECUSADO quando o cache é de outra empresa (subia para a aberta)",
       m.enviadas === 0 && !!m.recusada && disco.has("a4p_orcamentos"), JSON.stringify(m));

    const r = so.reconciliarDonoDoCache("org-b");
    ok("cache-dono: abrir a empresa B descarta o cache da A (perfil e orçamentos)",
       r.dono === "trocou" && r.descartadas === 2 && !disco.has("a4p_company") && !disco.has("a4p_orcamentos"),
       JSON.stringify(r));
    ok("cache-dono: a leitura síncrona não devolve mais a razão social da A (a memória também sai)",
       so.ler<unknown>("a4p_company", null) === null, JSON.stringify(so.ler("a4p_company", null)));
    ok("cache-dono: a marca passa a ser a da empresa aberta", disco.get(so.CHAVE_ORG_DO_CACHE) === "org-b");
    ok("cache-dono: a chave CONGELADA fica (o resgate dela é um clique de gente, não um envio)", disco.has("a4p_vendas_docs"));

    daEmpresaA();
    const mesma = so.reconciliarDonoDoCache("org-a");
    ok("cache-dono: cache da própria empresa fica intacto e pode subir",
       mesma.dono === "mesma" && mesma.descartadas === 0 && disco.has("a4p_orcamentos"));

    daEmpresaA();
    const desconhecida = so.reconciliarDonoDoCache(null);
    ok("cache-dono: sem saber a empresa aberta, nada é apagado nem remarcado",
       desconhecida.dono === "desconhecida" && disco.has("a4p_orcamentos") && disco.get(so.CHAVE_ORG_DO_CACHE) === "org-a");

    daEmpresaA();
    disco.delete(so.CHAVE_ORG_DO_CACHE);
    const semDono = so.reconciliarDonoDoCache("org-b");
    ok("cache-dono: cache SEM marca não prova de quem é — sai, e não sobe",
       semDono.dono === "sem-dono" && !disco.has("a4p_orcamentos") && disco.get(so.CHAVE_ORG_DO_CACHE) === "org-b");

    const fonte = semComentario(readFileSync("src/lib/store-org.ts", "utf8"));
    const sinc = fonte.split("export async function sincronizarComServidor")[1]?.split("\n}\n")[0] ?? "";
    ok("cache-dono: a sincronização só envia quando o dono é a empresa aberta",
       /reconciliarDonoDoCache\(orgAtiva\)/.test(sinc) && /dono === "mesma" && orgAtiva \? \(await migrarParaServidor\(chaves, orgAtiva\)\)/.test(sinc),
       sinc.slice(0, 400));
    for (const f of ["src/components/app/SincronizacaoOrg.tsx", "src/components/administracao/ArmazenamentoView.tsx"]) {
      const t = semComentario(readFileSync(f, "utf8"));
      ok(`cache-dono: ${f.split("/").pop()} não chama migrarParaServidor por fora da conferência`,
         !/migrarParaServidor\(/.test(t) && /sincronizarComServidor\(/.test(t));
    }
    const seg = semComentario(readFileSync("src/lib/seguranca.ts", "utf8"));
    const troca = seg.split("export async function trocarOrganizacao")[1]?.split("\n}\n")[0] ?? "";
    ok("cache-dono: trocar de empresa tira o cache da que sai ANTES de recarregar, e recusa com envio pendente",
       /reconciliarDonoDoCache\(orgId\)[\s\S]*location\.reload/.test(troca) && /pendentes\.length > 0[\s\S]*throw/.test(troca));
  } finally {
    g.window = janelaAntes; g.localStorage = armazemAntes;
  }
}

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
ok("form: baixa imediata exige a conta (a mesma regra da baixa na linha)",
   /account_id: f\.settled && !f\.account_id/.test(form) && /invalid=\{invalid\("account_id"\)\}/.test(form));
ok("form: escondido também NÃO é enviado",
   /party_id: pessoal \? null/.test(form) && /cost_center_id: pessoal \? null/.test(form) && /project_id: pessoal \? null/.test(form)
   && /reference_code: pessoal \? null/.test(form) && /nsu: !pessoal &&/.test(form));

/* ── 7. Código morto apagado ── */
for (const f of ["src/components/visao-geral/MovementsTable.tsx", "src/components/visao-geral/ConciliacaoView.tsx"]) {
  ok(`morto: ${f.split("/").pop()} não volta (ninguém o importava)`, !existsSync(f));
}

console.log(`\n${falhas === 0 ? "✓ TODAS" : `✗ ${falhas} FALHA(S)`} — plataforma: escritores e leitores`);
if (falhas > 0) process.exit(1);
