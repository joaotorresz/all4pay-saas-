/**
 * agentes — a moldura dos agentes da Quattro AI (Etapa 1 do plano "AI first").
 *
 *   npm run agentes        (dentro de npm test)
 *
 * Cobra:
 *  1. o ROTEAMENTO, caso a caso, com o destino escrito à mão (não recalculado):
 *     desligado avisa, nível 1 pede, nível 2 só faz dentro do valor E do dia,
 *     contas a pagar nunca faz sozinho, mesmo com nível 3 gravado;
 *  2. o catálogo e o BANCO dizem a mesma coisa: os cinco ids, o padrão
 *     (desligado no nível 1) e o teto do nível de cada agente — lidos do texto
 *     da migration, por âncora literal;
 *  3. a decisão tem as duas metades: o interruptor `AGENTES` tem leitor único,
 *     a tela não cria proposta e decide só pela função do banco.
 *
 * A guarda do banco (o que ele RECUSA de verdade) é `scripts/agentes.sql`.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { AGENTES, configPadrao, rotear, type ConfigAgente, type Destino, type IdAgente } from "@/core/agentes";

const falhas: string[] = [];
const ok = (nome: string, cond: boolean, det = "") => {
  if (cond) console.log(`✓ ${nome}`);
  else { falhas.push(nome); console.log(`✗ FAIL ${nome}${det ? `\n    ${det}` : ""}`); }
};
const ler = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");

/* ── 1. o roteamento ─────────────────────────────────────────────────────── */
const c = (agente: IdAgente, o: Partial<ConfigAgente>): ConfigAgente =>
  ({ agente, ativo: true, nivel: 1, limiteValor: 0, limiteDia: 0, ...o });

const CASOS: { nome: string; cfg: ConfigAgente; valor: number | null; feitas: number; espera: Destino }[] = [
  { nome: "desligado só avisa, mesmo no nível 3", cfg: c("cobranca", { ativo: false, nivel: 3 }), valor: null, feitas: 0, espera: "avisar" },
  { nome: "nível 0 só avisa", cfg: c("cobranca", { nivel: 0 }), valor: 10, feitas: 0, espera: "avisar" },
  { nome: "nível 1 pede aprovação", cfg: c("cobranca", { nivel: 1, limiteValor: 1e6, limiteDia: 100 }), valor: 1, feitas: 0, espera: "aprovar" },
  { nome: "nível 2 sem limite por dia pede aprovação", cfg: c("cobranca", { nivel: 2, limiteValor: 500 }), valor: 100, feitas: 0, espera: "aprovar" },
  { nome: "nível 2 dentro do valor e do dia faz", cfg: c("cobranca", { nivel: 2, limiteValor: 500, limiteDia: 10 }), valor: 500, feitas: 9, espera: "executar" },
  { nome: "nível 2 acima do valor pede", cfg: c("cobranca", { nivel: 2, limiteValor: 500, limiteDia: 10 }), valor: 500.01, feitas: 0, espera: "aprovar" },
  { nome: "nível 2 com o dia cheio pede", cfg: c("cobranca", { nivel: 2, limiteValor: 500, limiteDia: 10 }), valor: 1, feitas: 10, espera: "aprovar" },
  { nome: "nível 2 ação sem valor faz dentro do dia", cfg: c("cobranca", { nivel: 2, limiteDia: 5 }), valor: null, feitas: 0, espera: "executar" },
  { nome: "nível 2 com limite de valor zero não faz ação com valor", cfg: c("cobranca", { nivel: 2, limiteDia: 5 }), valor: 1, feitas: 0, espera: "aprovar" },
  { nome: "nível 2 valor inválido pede", cfg: c("cobranca", { nivel: 2, limiteValor: 500, limiteDia: 5 }), valor: Number.NaN, feitas: 0, espera: "aprovar" },
  { nome: "nível 3 faz", cfg: c("conciliacao", { nivel: 3 }), valor: 99999, feitas: 999, espera: "executar" },
  { nome: "contas a pagar com nível 3 gravado continua pedindo", cfg: c("contas_pagar", { nivel: 3, limiteValor: 1e9, limiteDia: 1000 }), valor: 10, feitas: 0, espera: "aprovar" },
  { nome: "caixa com nível 2 gravado continua pedindo", cfg: c("caixa", { nivel: 2, limiteValor: 1e9, limiteDia: 1000 }), valor: null, feitas: 0, espera: "aprovar" },
  { nome: "fechamento com nível 3 gravado continua pedindo", cfg: c("fechamento", { nivel: 3 }), valor: null, feitas: 0, espera: "aprovar" },
];
for (const k of CASOS) {
  const r = rotear({ config: k.cfg, valor: k.valor, feitasHoje: k.feitas });
  ok(`rota: ${k.nome}`, r === k.espera, `deu ${r}, esperado ${k.espera}`);
}

/* ── 2. catálogo × banco ─────────────────────────────────────────────────── */
const migr = ler("supabase/migrations/20261104120000_agentes.sql");
const IDS = ["cobranca", "conciliacao", "contas_pagar", "caixa", "fechamento"];
ok("catálogo: os cinco agentes, nesta ordem", JSON.stringify(AGENTES.map((a) => a.id)) === JSON.stringify(IDS));
const checkIds = "check (agente in ('cobranca','conciliacao','contas_pagar','caixa','fechamento'))";
ok("banco: as duas tabelas aceitam só os cinco ids", migr.split(checkIds).length - 1 === 2);
ok("banco: contas a pagar, caixa e fechamento não passam do nível 1",
  /constraint agentes_nivel_maximo check \(\s*agente not in \('contas_pagar','caixa','fechamento'\) or nivel <= 1\)/.test(migr));
const TETO: Record<string, number> = { cobranca: 3, conciliacao: 3, contas_pagar: 1, caixa: 1, fechamento: 1 };
for (const a of AGENTES) ok(`catálogo: nível máximo de ${a.id} = ${TETO[a.id]}`, a.nivelMaximo === TETO[a.id]);
for (const id of IDS) {
  const p = configPadrao(id as IdAgente);
  ok(`padrão de ${id}: desligado, nível 1, sem limite`, !p.ativo && p.nivel === 1 && p.limiteValor === 0 && p.limiteDia === 0);
  ok(`banco: ${id} nasce no nível 1 no seed e no gatilho`, new RegExp(`\\('${id}'(::text)?,\\s+1::smallint\\)`).test(migr));
}
ok("banco: tudo nasce desligado (seed e gatilho)", (migr.match(/p\.agente, false, p\.nivel/g) ?? []).length === 2);
ok("banco: a sessão só LÊ a fila", /grant select on public\.agente_propostas to authenticated;/.test(migr)
  && !/grant [^;]*(insert|update)[^;]* on public\.agente_propostas to authenticated/.test(migr));
ok("banco: decidir exige aprovar ou administrar NA empresa da proposta",
  /tem_permissao\('aprovar', v\.org_id\) or public\.tem_permissao\('administrar', v\.org_id\)/.test(migr));
ok("banco: estado terminal não muda",
  /if old\.estado in \('recusada','executada','falhou','expirada'\) then\s+raise exception/.test(migr));

/* ── 3. as duas metades da decisão ───────────────────────────────────────── */
const arquivos = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
const raiz = new URL("../", import.meta.url).pathname;
const leitores = arquivos(join(raiz, "src")).filter((f) => /\bAGENTES\s*===|env\.AGENTES\b|process\.env\.AGENTES\b/.test(readFileSync(f, "utf8")));
ok("interruptor: AGENTES tem um leitor só (core/agentes/ligado.ts)",
  leitores.length === 1 && leitores[0].endsWith("src/core/agentes/ligado.ts"), leitores.join(", "));
const lib = ler("src/lib/agentes.ts");
const tela = ler("src/components/agentes/AgentesView.tsx");
ok("tela: não cria proposta", !/agente_propostas"\)\s*\.(insert|upsert|update|delete)/.test(lib + tela));
ok("tela: decide pela função do banco", /rpc\("agente_decidir"/.test(lib));
ok("tela: o agente em construção não liga", /disabled=\{!desc\.pronto\}/.test(tela));
ok("interruptores: o dos agentes aparece na área da plataforma",
  /agentes: sim\(agentesLigados\(env\)\)/.test(ler("src/lib/interruptores.ts")));

if (falhas.length) { console.log(`\nagentes: ${falhas.length} falha(s)`); process.exit(1); }
console.log("\nagentes: tudo verde");
