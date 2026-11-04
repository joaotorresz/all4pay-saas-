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
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
const tela = ler("src/components/ia/ChatAgente.tsx") + ler("src/components/ia/QuattroAIHub.tsx");
ok("tela: não cria proposta", !/agente_propostas"\)\s*\.(insert|upsert|update|delete)/.test(lib + tela));
ok("tela: decide pela função do banco", /rpc\("agente_decidir"/.test(lib));
{
  const { abrirConversaAgente: abrir } = await import("@/core/agentes/conversa");
  const { configPadrao: cp } = await import("@/core/agentes");
  const ab = abrir(cp("caixa"));
  ok("tela: o agente em construção não liga (a conversa não oferece nível)",
    ab.estado.etapa === "em_construcao" && ab.falas.every((f) => !f.pergunta));
}
ok("interruptores: o dos agentes aparece na área da plataforma",
  /agentes: sim\(agentesLigados\(env\)\)/.test(ler("src/lib/interruptores.ts")));

/* ── 4. o agente de cobrança (Etapa 2) ───────────────────────────────────────
 * O agente lê a MESMA régua e propõe uma cobrança por cliente no dia. O
 * caminho real (`rodarAgenteCobranca`) roda contra um banco em memória com as
 * três travas que importam aqui: a chave única da proposta, a da reserva do
 * envio e a máquina de estados (estado terminal não muda). */
{
  const A = await import("@/core/automacoes");
  const C = await import("@/core/agentes/cobranca");
  const S = await import("@/lib/agentes-servidor");
  type RM = import("@/core/risk-engine/types").RiskMovement;
  type Ctx = import("@/core/automacoes").ContextoAutomacao;
  const mv = (id: string, amount: number, due: string, party: string | null): RM =>
    ({ id, type: "entrada", status: "pendente", amount, due_date: due, paid_date: null, category: "Vendas", party_id: party, accountId: null }) as RM;
  const HOJE = "2026-09-30";
  const movs: RM[] = [
    mv("r-3a", 900, "2026-09-27", "C1"),     // D+3, WhatsApp autorizado
    mv("r-3b", 400.5, "2026-09-27", "C1"),   // D+3, MESMO cliente: uma cobrança só
    mv("r-10", 700, "2026-09-20", "C2"),     // D+10, só e-mail
    mv("r-60", 4_000, "2026-08-01", "C3"),   // D+60: manual, nunca proposto
    mv("r-sem", 50, "2026-09-27", "C4"),     // D+3 sem contato: pulado
  ];
  const ctxDe = (hoje: string, envios: Ctx["envios"] = [], m: RM[] = movs): Ctx => ({
    orgId: "org-a", hoje, credor: { nome: "Aurora", razaoSocial: "Padaria Aurora Ltda", documento: "12345678000195" },
    input: { hoje, saldoAtual: 10_000, movements: m, partyNames: { C1: "Cliente Um", C2: "Cliente Dois", C3: "Cliente Tres", C4: "Cliente Quatro" }, horizonDias: 60 },
    contas: [], membros: [], aprovacoesPendentes: 0, mesesTravados: [], envios, appUrl: "https://app.exemplo",
    contatos: {
      C1: { id: "C1", nome: "Cliente Um", telefone: "(11) 99999-0001", whatsapp: "autorizado" },
      C2: { id: "C2", nome: "Cliente Dois", email: "dois@cliente.com" },
      C3: { id: "C3", nome: "Cliente Tres", telefone: "11999990003", whatsapp: "autorizado" },
    },
  });
  const regua = { ...A.configPadrao("regua_cobranca"), ativo: false };

  const { propostas, pulados } = C.propostasDeCobranca(regua, ctxDe(HOJE));
  const um = propostas.find((p) => p.chave === "cliente:C1:2026-09-30");
  const dois = propostas.find((p) => p.chave === "cliente:C2:2026-09-30");
  ok("cobrança: uma proposta por cliente que chega à etapa hoje (C1 e C2), mesmo com a régua desligada",
    propostas.length === 2 && !!um && !!dois, propostas.map((p) => p.chave).join(", "));
  ok("cobrança: o valor é o total em aberto do cliente (900 + 400,50)", um?.valor === 1300.5 && dois?.valor === 700, `${um?.valor} ${dois?.valor}`);
  ok("cobrança: título e motivo em português, com o prazo e o canal",
    um?.titulo === "Cobrar Cliente Um" && um.porque.startsWith("Venceu há 3 dias, 2 títulos. Vai pelo WhatsApp")
    && !!dois?.porque.includes("Vai pelo e-mail"), `${um?.titulo} | ${um?.porque} | ${dois?.porque}`);
  ok("cobrança: a etapa manual (D+60) nunca vira proposta", !propostas.some((p) => p.dados.titulos.includes("r-60")));
  ok("cobrança: quem não tem como receber fica de fora, com motivo", pulados.length === 1 && /sem telefone nem e-mail/.test(pulados[0].motivo), JSON.stringify(pulados));
  ok("cobrança: a chave é a da régua (a mesma trava do dia)", um?.mensagem.chave === um?.chave && um?.mensagem.tipo === "regua_cobranca");
  const jaCobrado = C.propostasDeCobranca(regua, ctxDe(HOJE, [{ tipo: "regua_cobranca", chave: "cliente:C1:2026-09-30", canal: "whatsapp", status: "enviado", em: `${HOJE}T12:00:00Z` }]));
  ok("cobrança: o cliente já cobrado hoje por outra porta não é proposto de novo",
    jaCobrado.propostas.length === 1 && jaCobrado.propostas[0].chave === "cliente:C2:2026-09-30");

  const cfgA = (o: Partial<ConfigAgente>): ConfigAgente => ({ agente: "cobranca", ativo: true, nivel: 1, limiteValor: 0, limiteDia: 0, ...o });
  // Na ordem fixa C1 (R$ 1.300,50), C2 (R$ 700,00).
  const ordem = [um!, dois!];
  const dest = (o: Partial<ConfigAgente>, feitas: number) => C.planejarCobranca(ordem, cfgA(o), feitas).map((x) => x.destino).join(",");
  ok("cobrança: nível 1 pede aprovação de tudo", dest({ nivel: 1, limiteValor: 1e6, limiteDia: 100 }, 0) === "aprovar,aprovar");
  ok("cobrança: nível 2 faz só o que cabe no valor (700 ≤ 1.000; 1.300,50 pede)",
    dest({ nivel: 2, limiteValor: 1000, limiteDia: 5 }, 0) === "aprovar,executar", dest({ nivel: 2, limiteValor: 1000, limiteDia: 5 }, 0));
  ok("cobrança: nível 2 conta o limite do dia DENTRO da mesma leva",
    dest({ nivel: 2, limiteValor: 1e6, limiteDia: 1 }, 0) === "executar,aprovar");
  ok("cobrança: nível 2 com o dia já cheio pede tudo", dest({ nivel: 2, limiteValor: 1e6, limiteDia: 1 }, 1) === "aprovar,aprovar");

  const R = (resultado: string, erro?: string) => C.resultadoDoEnvio({ tipo: "regua_cobranca", canal: "whatsapp", destino: "x", resultado: resultado as never, erro });
  ok("cobrança: enviado é feita", R("enviado").estado === "executada");
  ok("cobrança: SIMULADO não é feita (nada saiu)", R("simulado").estado === "falhou" && /nada foi enviado/.test(R("simulado").erro ?? ""));
  ok("cobrança: quem pediu para sair bloqueia, e a proposta diz por quê", R("bloqueado", "pediu para não receber WhatsApp").estado === "falhou" && /pediu para não receber/.test(R("bloqueado", "pediu para não receber WhatsApp").erro ?? ""));
  ok("cobrança: já saiu por outra porta conta como feita", R("ja_registrado").estado === "executada");
  ok("cobrança: sem resposta do envio é falha", R(undefined as never).estado === "falhou" && C.resultadoDoEnvio(undefined).estado === "falhou");

  /* ── o caminho real contra um banco em memória ── */
  type Linha = Record<string, unknown>;
  const db: Record<string, Linha[]> = { agente_propostas: [] };
  let seq = 0;
  const TERMINAIS = ["recusada", "executada", "falhou", "expirada"];
  const PERMITIDA: Record<string, string[]> = { pendente: ["aprovada", "recusada", "expirada", "executada", "falhou"], aprovada: ["executada", "falhou"] };
  const fake = {
    rpc: async () => ({ data: [], error: null }),
    from(t: string) {
      const filtros: ((l: Linha) => boolean)[] = [];
      let op: { tipo: "select" } | { tipo: "update"; patch: Linha } | { tipo: "upsert"; row: Linha } = { tipo: "select" };
      const linhas = () => (db[t] ??= []);
      const run = () => {
        if (op.tipo === "upsert") {
          const r = op.row;
          if (linhas().some((l) => l.org_id === r.org_id && l.agente === r.agente && l.chave === r.chave)) return { data: [], error: null };
          const nova = { id: `p${++seq}`, estado: "pendente", decidida_por: null, erro: null, criada_em: new Date().toISOString(), ...r };
          linhas().push(nova);
          return { data: [nova], error: null };
        }
        const alvo = linhas().filter((l) => filtros.every((f) => f(l)));
        if (op.tipo === "update") {
          for (const l of alvo) {
            const novo = op.patch.estado as string | undefined;
            if (novo && novo !== l.estado) {
              if (TERMINAIS.includes(l.estado as string) || !(PERMITIDA[l.estado as string] ?? []).includes(novo)) {
                return { data: null, error: { message: `transição recusada: ${l.estado} → ${novo}` } };
              }
            }
            Object.assign(l, op.patch);
          }
        }
        return { data: alvo, error: null };
      };
      const b = {
        select() { return b; }, limit() { return b; },
        eq(c: string, v: unknown) { filtros.push((l) => l[c] === v); return b; },
        in(c: string, vs: unknown[]) { filtros.push((l) => vs.includes(l[c])); return b; },
        like(c: string, padrao: string) { const fim = padrao.replace(/^%/, ""); filtros.push((l) => String(l[c]).endsWith(fim)); return b; },
        update(patch: Linha) { op = { tipo: "update", patch }; return b; },
        upsert(row: Linha) { op = { tipo: "upsert", row }; return b; },
        maybeSingle: async () => { const r = run(); return { data: (r.data ?? [])[0] ?? null, error: r.error }; },
        then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run()).then(res, rej); },
      };
      return b;
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;

  const envios: import("@/core/automacoes").LinhaEnvio[] = [];
  let chamadas = 0;
  const deps = { registro: A.registroEmMemoria(envios), provedor: { ativo: () => true, async enviar() { chamadas++; return { ok: true, id: `m${chamadas}` }; } } };
  const n1 = cfgA({ nivel: 1 });
  const r1 = await S.rodarAgenteCobranca(fake, "org-a", n1, ctxDe(HOJE), regua, deps);
  ok("caminho real: nível 1 cria as duas propostas e NÃO envia nada",
    r1.propostas === 2 && r1.paraAprovar === 2 && chamadas === 0 && envios.length === 0
    && db.agente_propostas.every((l) => l.estado === "pendente"), JSON.stringify(r1));
  const r1b = await S.rodarAgenteCobranca(fake, "org-a", n1, ctxDe(HOJE), regua, deps);
  ok("caminho real: rodar de novo no mesmo dia dá zero proposta nova e zero envio",
    r1b.propostas === 0 && db.agente_propostas.length === 2 && chamadas === 0, JSON.stringify(r1b));

  // a pessoa aprova a do Cliente Um (o banco faria isso por agente_decidir)
  const p1 = db.agente_propostas.find((l) => l.chave === "cliente:C1:2026-09-30")!;
  Object.assign(p1, { estado: "aprovada", decidida_por: "u1" });
  // (a porta da tela, `executarAprovada`, relê régua e contexto do banco e
  // depois chama o MESMO `executarUma` que o runner usa aqui.)
  const r2 = await S.rodarAgenteCobranca(fake, "org-a", n1, ctxDe(HOJE), regua, deps);
  ok("caminho real: a aprovada sai UMA vez, pelo despacho da régua, e vira feita",
    r2.executadasAprovadas === 1 && chamadas === 1 && envios.filter((e) => e.chave.startsWith("cliente:")).map((e) => e.chave).join() === "cliente:C1:2026-09-30"
    && envios.filter((e) => e.chave.startsWith("titulo:")).length === 2
    && p1.estado === "executada" && !!p1.executada_em, `${JSON.stringify(r2)} chamadas=${chamadas} estado=${p1.estado}`);
  const r2b = await S.rodarAgenteCobranca(fake, "org-a", n1, ctxDe(HOJE), regua, deps);
  ok("caminho real: depois de feita, rodar de novo não envia outra vez", chamadas === 1 && r2b.executadasAprovadas === 0, JSON.stringify(r2b));

  // o dia seguinte: a pendente de ontem expira; a nova é do dia novo
  const AMANHA = "2026-10-07"; // r-10 vira D+17 (sem etapa); r-3 vira D+10 (etapa)
  const r3 = await S.rodarAgenteCobranca(fake, "org-a", n1, ctxDe(AMANHA), regua, deps);
  const p2 = db.agente_propostas.find((l) => l.chave === "cliente:C2:2026-09-30")!;
  ok("caminho real: a pendente de outro dia expira com o motivo, e a de hoje nasce",
    r3.expiradas === 1 && p2.estado === "expirada" && p2.motivo === C.MOTIVO_EXPIRADA
    && db.agente_propostas.some((l) => l.chave === `cliente:C1:${AMANHA}` && l.estado === "pendente"), JSON.stringify(r3));

  // aprovada ONTEM e executada hoje: não sai (a mensagem de ontem não vale)
  const p3 = db.agente_propostas.find((l) => l.chave === `cliente:C1:${AMANHA}`)!;
  Object.assign(p3, { estado: "aprovada", decidida_por: "u1" });
  const DEPOIS = "2026-10-08";
  const antes = chamadas;
  await S.rodarAgenteCobranca(fake, "org-a", n1, ctxDe(DEPOIS), regua, deps);
  ok("caminho real: aprovada fora do dia da etapa NÃO envia e termina com o motivo",
    chamadas === antes && p3.estado === "falhou" && p3.erro === C.ERRO_FORA_DO_DIA, `${p3.estado} ${p3.erro}`);

  // nível 2: o que cabe no limite sai sozinho, marcado como do limite
  const db2Antes = db.agente_propostas.length;
  const n2 = cfgA({ nivel: 2, limiteValor: 1000, limiteDia: 5 });
  const OUTRO = "2026-10-20"; // r-60 → D+80: nada; título novo D+3 de 700 para C2
  const r4 = await S.rodarAgenteCobranca(fake, "org-a", n2, ctxDe(OUTRO, [], [mv("n-1", 700, "2026-10-17", "C2"), mv("n-2", 1500, "2026-10-17", "C1")]), regua, deps);
  const so = db.agente_propostas.slice(db2Antes);
  ok("caminho real: nível 2 faz sozinho o de R$ 700,00 e deixa o de R$ 1.500,00 para aprovar",
    r4.feitasSozinho === 1 && r4.paraAprovar === 1
    && so.some((l) => l.valor === 700 && l.estado === "executada" && l.decidida_por === null && l.motivo === C.MOTIVO_NO_LIMITE)
    && so.some((l) => l.valor === 1500 && l.estado === "pendente"), JSON.stringify(r4));

  // agente desligado: nada
  const totalAntes = db.agente_propostas.length;
  const r5 = await S.rodarAgenteCobranca(fake, "org-a", cfgA({ ativo: false }), ctxDe(HOJE), regua, deps);
  ok("caminho real: desligado não propõe nem envia", !r5.ativo && db.agente_propostas.length === totalAntes);

  // nível 0: só conta
  const r6 = await S.rodarAgenteCobranca(fake, "org-b", cfgA({ nivel: 0 }), { ...ctxDe(HOJE), orgId: "org-b" }, regua, deps);
  ok("caminho real: nível 0 só conta o que faria", r6.soAviso === 2 && r6.propostas === 0 && db.agente_propostas.every((l) => l.org_id !== "org-b"), JSON.stringify(r6));

  /* ── as portas ── */
  const semComent = (f: string) => ler(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const runner = semComent("src/app/api/financial-os/run/route.ts");
  ok("runner: com o agente ligado (ou sem saber), a régua não envia sozinha",
    /agente \|\| erroAgentes \? todas\.filter\(\(c\) => c\.tipo !== "regua_cobranca"\)/.test(runner));
  ok("runner: o agente só roda atrás do interruptor", /if \(agentesLigados\(process\.env\)\)/.test(runner) && /rodarAgenteCobranca\(/.test(runner));
  const porta = semComent("src/app/api/agentes/executar/route.ts");
  ok("porta da tela: exige sessão, lê pela RLS e só executa a APROVADA",
    /auth\.getUser\(\)/.test(porta) && /supabase\.from\("agente_propostas"\)/.test(porta)
    && /linha\.estado !== "aprovada"/.test(porta) && !/agente_decidir/.test(porta) && /agentesLigados\(process\.env\)/.test(porta));
  const escritores = arquivos(join(raiz, "src")).filter((f) => /from\("agente_propostas"\)[\s\S]{0,80}\.(insert|upsert)\(/.test(readFileSync(f, "utf8")));
  ok("só o servidor dos agentes cria proposta", escritores.length === 1 && escritores[0].endsWith("src/lib/agentes-servidor.ts"), escritores.join(", "));
  ok("catálogo: cobrança e conciliação prontos; os outros, em construção",
    AGENTES.filter((a) => a.pronto).map((a) => a.id).join(",") === "cobranca,conciliacao");
}

/* ── 5. aprovar pelo WhatsApp (Etapa 3) ───────────────────────────────────── */
{
  const W = await import("@/core/agentes/whatsapp");
  const { lerResposta } = await import("@/core/aprovacao-whatsapp");
  const S = await import("@/lib/agentes-servidor");
  const msg = W.mensagemDoPedidoAgente({ agente: "Agente de cobrança", titulo: "Cobrar Cliente Um", porque: "Venceu há 3 dias, 2 títulos.", valorFormatado: "R$ 1.300,50", codigo: "K7P2QX" });
  ok("whatsapp: o pedido diz o quê, quanto e como responder",
    msg.includes("Cobrar Cliente Um, R$ 1.300,50.") && msg.includes("SIM K7P2QX") && msg.includes("NÃO K7P2QX") && msg.includes("24 horas"), msg);
  ok("whatsapp: a resposta é lida pela MESMA regra da aprovação de título",
    JSON.stringify(lerResposta("sim k7p2qx")) === JSON.stringify({ decisao: "sim", codigo: "K7P2QX" }) && lerResposta("SIM") === null);
  ok("whatsapp: aprovada e enviada diz que saiu", W.respostaDaDecisaoAgente({ ok: true, decisao: "sim" }, { estado: "executada" }).includes("a cobrança saiu"));
  const naoSaiu = W.respostaDaDecisaoAgente({ ok: true, decisao: "sim" }, { estado: "falhou", erro: "Sem credencial do provedor neste ambiente: nada foi enviado." });
  ok("whatsapp: aprovada sem envio NÃO diz feita", !/feita|saiu:/.test(naoSaiu) && naoSaiu.includes("nada foi enviado"), naoSaiu);
  ok("whatsapp: recusa e recusa do banco", W.respostaDaDecisaoAgente({ ok: true, decisao: "nao" }).startsWith("Recusa registrada")
    && W.respostaDaDecisaoAgente({ ok: false, motivo: "Seu papel nesta empresa não decide o que os agentes propõem." }).startsWith("A decisão não foi registrada: Seu papel"));

  // o pedido, contra um banco em memória
  const chamadasRpc: string[] = [];
  const fakeW = {
    rpc: async (fn: string, a: { p_proposta: string }) => { chamadasRpc.push(`${fn}:${a.p_proposta}`); return { data: [{ fone: "5511988887777", codigo: "K7P2QX" }, { fone: "5511977776666", codigo: "M3N4PQ" }], error: null }; },
    from() {
      let ids: string[] = [];
      const b = {
        select() { return b; }, limit() { return b; },
        in(_c: string, v: string[]) { ids = v; return b; },
        then(res: (v: unknown) => unknown) { return Promise.resolve({ data: ids.map((id) => ({ id, agente: "cobranca", titulo: `Cobrar ${id}`, porque: "Vence hoje, 1 título.", valor: 700 })), error: null }).then(res); },
      };
      return b;
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
  const enviados: { para: string; texto: string }[] = [];
  const enviar = (async (para: string, texto: string) => { enviados.push({ para, texto }); return { canal: "whatsapp", para, ok: true, detalhe: "ok" }; }) as never;
  const sem = await S.pedirPorWhatsapp(fakeW, ["a"], enviar, false);
  ok("whatsapp: sem provedor nenhum código é gerado nem enviado", sem.pedidos === 0 && chamadasRpc.length === 0 && enviados.length === 0, JSON.stringify(sem));
  const r = await S.pedirPorWhatsapp(fakeW, ["a", "b"], enviar, true);
  ok("whatsapp: cada aprovador confirmado recebe a sua mensagem, com o próprio código",
    r.pedidos === 4 && enviados.filter((e) => e.para === "+5511988887777" && e.texto.includes("SIM K7P2QX")).length === 2
    && enviados.some((e) => e.para === "+5511977776666" && e.texto.includes("SIM M3N4PQ") && e.texto.includes("R$ 700,00")), JSON.stringify(r));
  chamadasRpc.length = 0; enviados.length = 0;
  const muitos = Array.from({ length: 13 }, (_, i) => `p${i}`);
  await S.pedirPorWhatsapp(fakeW, muitos, enviar, true);
  ok("whatsapp: no máximo 10 pedidos por execução; o resto vira UM aviso por pessoa",
    chamadasRpc.length === W.TETO_PEDIDOS_POR_EXECUCAO && enviados.filter((e) => e.texto.includes("há mais 3 propostas")).length === 2,
    `${chamadasRpc.length} ${enviados.length}`);

  const semC = (f: string) => ler(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const ent = semC("src/lib/whatsapp-entrada.ts");
  const iLig = ent.indexOf('process.env.WHATSAPP_APROVACAO === "ligado"');
  const iAg = ent.indexOf('"agente_responder_whatsapp"');
  const iTit = ent.indexOf('"responder_aprovacao_whatsapp"');
  ok("entrada: o código de agente só é lido com a aprovação E os agentes ligados, antes do de título",
    iLig >= 0 && iAg > iLig && iTit > iAg && /if \(agentesLigados\(process\.env\)\)/.test(ent.slice(iLig, iAg)));
  ok("entrada: aprovada pelo WhatsApp envia pelo MESMO executor da tela", /executarAprovada\(admin, r\.org, r\.proposta/.test(ent));
  const run = semC("src/app/api/financial-os/run/route.ts");
  ok("runner: o pedido pelo WhatsApp só sai com a aprovação ligada e fora da prova sem envio",
    /idsParaAprovar\?\.length && !dryRun && process\.env\.WHATSAPP_APROVACAO === "ligado"/.test(run));
  const m3 = ler("supabase/migrations/20261104150000_agentes_whatsapp.sql");
  ok("banco: a tela e o WhatsApp decidem pela MESMA regra",
    /return public\.agente_decidir_na_empresa\(p_id, p_aprovar, p_motivo, public\.auth_org_id\(\)\);/.test(m3)
    && /public\.agente_decidir_na_empresa\(v_p\.proposta_id, v_dec = 'sim', 'Pelo WhatsApp\.', v_p\.org_id\)/.test(m3));
  ok("banco: a regra interna não é chamada por ninguém de fora",
    /revoke all on function public\.agente_decidir_na_empresa\(uuid, boolean, text, uuid\)\s+from public, anon, authenticated, service_role;/.test(m3)
    && !/grant execute on function public\.agente_decidir_na_empresa/.test(m3));
  ok("banco: pedir e responder pelo WhatsApp são só da chave de serviço",
    /grant execute on function public\.agente_pedir_whatsapp\(uuid\) to service_role;/.test(m3)
    && /grant execute on function public\.agente_responder_whatsapp\(text, text, text\) to service_role;/.test(m3)
    && !/grant execute on function public\.agente_(pedir|responder)_whatsapp[^;]*authenticated/.test(m3));
  ok("banco: só número CONFIRMADO de quem aprova recebe o pedido",
    /rp\.acao in \('aprovar', 'administrar'\)/.test(m3) && /n\.confirmado_em is not null/.test(m3));
}

/* ── 6. o agente de conciliação (Etapa 4) ────────────────────────────────── */
{
  const P = await import("@/core/conciliacao/pares");
  const C = await import("@/core/agentes/conciliacao");
  const { configPadrao: cfgP } = await import("@/core/agentes");
  const mov = (id: string, type: "entrada" | "saida", amount: number, d: string, pago: string | null, party: string | null = null, desc = id) =>
    ({ id, type, amount, due_date: d, paid_date: pago, party_id: party, description: desc });
  const pend = [mov("t1", "entrada", 480, "2026-11-04", null, "acme", "NF 1042"), mov("t2", "saida", 99, "2026-11-01", null), mov("t3", "entrada", 1000, "2026-11-04", null)];
  const ext = [mov("e1", "entrada", 480, "2026-11-04", "2026-11-04", "acme", "PIX ACME"), mov("e2", "saida", 99, "2026-11-04", "2026-11-04"), mov("e3", "saida", 1000, "2026-11-04", "2026-11-04")];
  const r = P.casarExtrato(pend, ext);
  const par = (o: string) => r.pares.find((x) => x.ofId === o);
  ok("conciliação: casa por valor, data e contato; entrada não casa com saída",
    par("e1")?.pendId === "t1" && par("e1")?.confianca === 100 && par("e2")?.pendId === "t2" && par("e2")!.confianca < P.CONFIANCA_ALTA && !par("e3"),
    JSON.stringify(r.pares.map((x) => [x.ofId, x.pendId, x.confianca])));
  const props = C.propostasDeConciliacao(r.pares, { previstos: new Set(), extratos: new Set() });
  const pr = props.find((x) => x.dados.extrato === "e1")!;
  ok("conciliação: a proposta diz o par, o porquê e a confiança",
    pr.chave === "par:t1:e1" && pr.titulo === "Conciliar NF 1042" && pr.porque.includes("Mesmo valor, mesma data, mesmo contato") && pr.porque.includes("Confiança 100%") && pr.valor === 480, pr.porque);
  ok("conciliação: título com proposta esperando não é proposto de novo",
    C.propostasDeConciliacao(r.pares, { previstos: new Set(["t1"]), extratos: new Set() }).every((x) => x.dados.previsto !== "t1")
    && C.propostasDeConciliacao(r.pares, { previstos: new Set(), extratos: new Set(["e2"]) }).every((x) => x.dados.extrato !== "e2"));
  const n3 = { ...cfgP("conciliacao"), ativo: true, nivel: 3 as const };
  const plano = new Map(C.planejarConciliacao(props, n3, 0).map((x) => [x.chave, x.destino]));
  ok("conciliação: no nível 3, sozinho só o par de confiança alta; o resto pergunta",
    plano.get("par:t1:e1") === "executar" && plano.get("par:t2:e2") === "aprovar", JSON.stringify(Array.from(plano)));
  const n2 = { ...cfgP("conciliacao"), ativo: true, nivel: 2 as const, limiteValor: 1000, limiteDia: 1 };
  const dois = C.propostasDeConciliacao(P.casarExtrato([pend[0], mov("t4", "entrada", 480, "2026-11-04", null, "acme")],
    [ext[0], mov("e4", "entrada", 480, "2026-11-04", "2026-11-04", "acme")]).pares, { previstos: new Set(), extratos: new Set() });
  ok("conciliação: o limite por dia conta a própria leva",
    C.planejarConciliacao(dois, n2, 0).map((x) => x.destino).join(",") === "executar,aprovar"
    && C.planejarConciliacao(dois, n2, 1).every((x) => x.destino === "aprovar"));
  ok("conciliação: desligado ou nível 0 não propõe",
    C.planejarConciliacao(props, cfgP("conciliacao"), 0).every((x) => x.destino === "avisar")
    && C.planejarConciliacao(props, { ...n3, nivel: 0 }, 0).every((x) => x.destino === "avisar"));

  // o servidor, contra um banco em memória (as mesmas linhas que a tela leria)
  {
    type Linha = Record<string, unknown>;
    const db: Record<string, Linha[]> = {
      movements: [
        { ...pend[0], org_id: "o1", is_sample: false, status: "pendente", reference_code: null, conciliado_com: null },
        { ...pend[1], org_id: "o1", is_sample: false, status: "pendente", reference_code: null, conciliado_com: null },
        { ...ext[0], org_id: "o1", is_sample: false, status: "pago", reference_code: "pluggy:1", conciliado_com: null },
        { ...ext[1], org_id: "o1", is_sample: false, status: "pago", reference_code: "pluggy:2", conciliado_com: null },
        // outra empresa: nunca entra no par
        { ...mov("x1", "entrada", 480, "2026-11-04", null, "acme"), org_id: "o2", is_sample: false, status: "pendente", reference_code: null, conciliado_com: null },
      ],
      agente_propostas: [
        { id: "velha", org_id: "o1", agente: "conciliacao", chave: "par:sumiu:e9", estado: "pendente", decidida_por: null, dados: { previsto: "sumiu", extrato: "e9" } },
        { id: "aprov", org_id: "o1", agente: "conciliacao", chave: "par:ta:ea", estado: "aprovada", decidida_por: "ana", dados: { previsto: "ta", extrato: "ea" } },
      ],
    };
    const rpcs: string[] = [];
    let seq = 0;
    const fake = {
      rpc: async (fn: string, a: { p_proposta: string; p_sozinho: boolean }) => {
        rpcs.push(`${fn}:${a.p_proposta}:${a.p_sozinho}`);
        const l = db.agente_propostas.find((x) => x.id === a.p_proposta)!;
        l.estado = "executada";
        return { data: { ok: true, estado: "executada" }, error: null };
      },
      from(t: string) {
        const filtros: ((l: Linha) => boolean)[] = [];
        let op: "select" | "update" | "upsert" = "select"; let patch: Linha = {}; let head = false;
        const b = {
          select(_c?: string, o?: { head?: boolean }) { head = !!o?.head; return b; },
          eq(c: string, v: unknown) { filtros.push((l) => l[c] === v); return b; },
          in(c: string, v: unknown[]) { filtros.push((l) => v.includes(l[c])); return b; },
          like(c: string, v: string) { const pre = v.replace(/%$/, ""); filtros.push((l) => String(l[c] ?? "").startsWith(pre)); return b; },
          is(c: string, v: unknown) { filtros.push((l) => (l[c] ?? null) === v); return b; },
          gte() { return b; }, limit() { return b; },
          update(pt: Linha) { op = "update"; patch = pt; return b; },
          upsert(row: Linha) {
            op = "upsert";
            const existe = db[t].some((l) => l.org_id === row.org_id && l.agente === row.agente && l.chave === row.chave);
            const nova = { ...row, id: `n${++seq}`, estado: "pendente", decidida_por: null };
            if (!existe) db[t].push(nova);
            patch = existe ? {} : nova; return b;
          },
          then(res: (v: unknown) => unknown) {
            const linhas = db[t].filter((l) => filtros.every((f) => f(l)));
            if (op === "update") { for (const l of linhas) Object.assign(l, patch); return Promise.resolve({ data: null, error: null }).then(res); }
            if (op === "upsert") return Promise.resolve({ data: patch.id ? [patch] : [], error: null }).then(res);
            return Promise.resolve(head ? { count: linhas.length, error: null } : { data: linhas, error: null }).then(res);
          },
        };
        return b;
      },
    } as unknown as import("@supabase/supabase-js").SupabaseClient;
    const S2 = await import("@/lib/agentes-servidor");
    const cfg = { ...cfgP("conciliacao"), ativo: true, nivel: 3 as const };
    const rel = await S2.rodarAgenteConciliacao(fake, "o1", cfg, "2026-11-04");
    const nova = (chave: string) => db.agente_propostas.find((l) => l.chave === chave);
    ok("conciliação (servidor): o par que não existe mais expira com o motivo",
      db.agente_propostas.find((l) => l.id === "velha")?.estado === "expirada" && rel.expiradas === 1);
    ok("conciliação (servidor): a aprovada é conciliada pelo banco, como aprovada",
      rpcs.includes("agente_conciliar:aprov:false") && rel.executadasAprovadas === 1);
    ok("conciliação (servidor): confiança alta sai sozinha; média espera e vai para o WhatsApp",
      nova("par:t1:e1")?.estado === "executada" && rpcs.some((x) => x.endsWith(":true"))
      && nova("par:t2:e2")?.estado === "pendente" && rel.idsParaAprovar?.length === 1 && rel.feitasSozinho === 1,
      JSON.stringify({ rel, rpcs }));
    ok("conciliação (servidor): o título de outra empresa não entra",
      !db.agente_propostas.some((l) => String(l.chave).includes("x1")));
    const antes = db.agente_propostas.length; rpcs.length = 0;
    const de2 = await S2.rodarAgenteConciliacao(fake, "o1", cfg, "2026-11-04");
    ok("conciliação (servidor): reexecutar não propõe nem concilia de novo",
      db.agente_propostas.length === antes && rpcs.length === 0 && de2.propostas === 0, JSON.stringify({ de2, rpcs }));
  }

  const semC2 = (f: string) => ler(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");
  const tela = semC2("src/lib/conciliacao-of.ts");
  ok("conciliação: a tela e o agente casam pela MESMA regra",
    /casarExtrato\(/.test(tela) && !/diasEntre|valorProx|const conf =/.test(tela)
    && /casarExtrato\(/.test(semC2("src/lib/agentes-servidor.ts")));
  ok("conciliação: extrato que já tem par não volta a casar (tela e agente)",
    /\.is\("conciliado_com", null\)/.test(tela) && /\.is\("conciliado_com", null\)/.test(semC2("src/lib/agentes-servidor.ts")));
  const srv = semC2("src/lib/agentes-servidor.ts");
  ok("conciliação: o servidor concilia SÓ pelo banco (nenhum update em movements)",
    /rpc\("agente_conciliar"/.test(srv) && !/from\("movements"\)\.update|from\("movements"\)\s*\.update/.test(srv));
  const m4 = ler("supabase/migrations/20261104160000_agente_conciliacao.sql");
  ok("banco: a tela e o agente conciliam pela MESMA regra",
    /perform public\.conciliar_na_empresa\(p_previsto, p_extrato, public\.auth_org_id\(\), null\)/.test(m4)
    && /perform public\.conciliar_na_empresa\(\(v_p\.dados->>'previsto'\)::uuid/.test(m4));
  ok("banco: a regra interna é de ninguém de fora; a porta do agente só da chave de serviço",
    /revoke all on function public\.conciliar_na_empresa\(uuid, uuid, uuid, text\)\s+from public, anon, authenticated, service_role;/.test(m4)
    && !/grant execute on function public\.conciliar_na_empresa/.test(m4)
    && /grant execute on function public\.agente_conciliar\(uuid, boolean\) to service_role;/.test(m4)
    && !/grant execute on function public\.agente_conciliar[^;]*authenticated/.test(m4));
  ok("banco: sozinho exige nível 2+ e confiança 85+",
    /v_cfg\.nivel < 2/.test(m4) && /\(v_p\.dados->>'confianca'\)::numeric, 0\) < 85/.test(m4) && P.CONFIANCA_ALTA === 85);
  ok("banco: a linha do extrato é conferida antes de cancelar o previsto",
    /A linha do extrato não foi encontrada nesta empresa/.test(m4) && m4.indexOf("Esta linha do extrato já está conciliada") < m4.indexOf("set situacao = 'cancelado'"));
  ok("banco: o agente concilia em nome de quem aprovou ou de quem deixou fazer sozinho, nunca de ninguém",
    /v_quem := v_cfg\.atualizado_por;/.test(m4) && /v_quem := v_p\.decidida_por;/.test(m4) && /if v_quem is null then\s+raise exception/.test(m4)
    && m4.indexOf("perform set_config('request.jwt.claim.sub', v_quem::text, true);") < m4.indexOf("perform public.conciliar_na_empresa((v_p.dados")
    && /create trigger agentes_quem_mudou before update on public\.agentes/.test(m4));
  ok("tela: aprovar a conciliação concilia na hora", /p\.agente === "conciliacao"\)\s*\? `\$\{p\.titulo\}\. \$\{await executarAprovada\(p\.id, p\.agente\)\}`/.test(ler("src/components/ia/ChatAgente.tsx")));
  const Wc = await import("@/core/agentes/whatsapp");
  ok("whatsapp: a conciliação feita diz que conciliou",
    Wc.respostaDaDecisaoAgente({ ok: true, decisao: "sim" }, { estado: "executada", agente: "conciliacao" }).includes("conciliado com o extrato"));
}

/* ── 7. a tela da Quattro AI: cada agente é um chat, configurado conversando ── */
{
  const C = await import("@/core/agentes/conversa");
  const { configPadrao: cp, IDS_AGENTE: ids } = await import("@/core/agentes");
  const salvo = cp("cobranca");
  const a = C.abrirConversaAgente(salvo, "João");
  const texto = a.falas.map((f) => `${f.texto} ${(f.itens ?? []).join(" ")}`).join(" ");
  ok("conversa: o agente se apresenta, diz o que faz e até onde vai",
    texto.includes("Oi, João! Sou o agente de cobrança.") && a.falas.some((f) => f.texto === "O que eu faço:" && (f.itens?.length ?? 0) > 0)
    && a.falas.some((f) => f.texto === "Até onde eu vou:" && (f.itens?.length ?? 0) > 0), texto);
  const perg = a.falas.find((f) => f.pergunta)!.pergunta!;
  ok("conversa: desligado, pergunta o que pode fazer sozinho, com os 4 níveis e deixar desligado",
    perg.opcoes.map((o) => o.id).join(",") === "nivel:0,nivel:1,nivel:2,nivel:3,desligar");
  const n1 = C.responderConversaAgente(a.estado, salvo, { opcao: "nivel:1" });
  ok("conversa: escolher o nível 1 liga e grava, e diz o que muda ao ligar",
    n1.salvar?.ativo === true && n1.salvar.nivel === 1 && n1.estado.etapa === "pronto"
    && n1.falas[0].texto.includes("Pronto, estou ligado.") && n1.falas[0].texto.includes("a régua de cobrança não envia sozinha"), JSON.stringify(n1.falas));
  const n2 = C.responderConversaAgente(a.estado, salvo, { texto: "c" });
  ok("conversa: a letra da opção vale; o nível 2 pergunta o limite antes de gravar",
    !n2.salvar && n2.estado.etapa === "limite_valor" && n2.estado.rascunho.nivel === 2);
  const v = C.responderConversaAgente(n2.estado, salvo, { texto: "R$ 1.500" });
  const d = C.responderConversaAgente(v.estado, salvo, { opcao: "dia:20" });
  ok("conversa: limite por ação escrito e por dia clicado vão para a configuração",
    v.estado.rascunho.limiteValor === 1500 && d.salvar?.limiteValor === 1500 && d.salvar.limiteDia === 20 && d.salvar.nivel === 2,
    JSON.stringify(d.salvar));
  ok("conversa: valor que não é valor pergunta de novo, sem gravar",
    C.responderConversaAgente(n2.estado, salvo, { texto: "muito" }).estado.etapa === "limite_valor"
    && !C.responderConversaAgente(n2.estado, salvo, { texto: "muito" }).salvar);
  ok("conversa: lê '2 mil' e '2.000,50'", C.lerValor("2 mil") === 2000 && C.lerValor("2.000,50") === 2000.5 && C.lerValor("abc") === null);
  const ligado = { ...salvo, ativo: true, nivel: 1 as const };
  const al = C.abrirConversaAgente(ligado);
  const pl = al.falas.find((f) => f.pergunta)!.pergunta!;
  ok("conversa: ligado, oferece deixar como está e desligar",
    pl.opcoes.some((o) => o.id === "manter") && pl.opcoes.some((o) => o.id === "desligar"));
  const des = C.responderConversaAgente(al.estado, ligado, { texto: "desligar" });
  ok("conversa: desligar grava desligado", des.salvar?.ativo === false);
  const mant = C.responderConversaAgente(al.estado, ligado, { opcao: "manter" });
  ok("conversa: deixar como está não grava nada", !mant.salvar && mant.estado.etapa === "pronto");
  const cp2 = cp("contas_pagar");
  ok("conversa: contas a pagar, caixa e fechamento nunca oferecem passar do nível 1 (espelho do banco)",
    (["contas_pagar", "caixa", "fechamento"] as const).every((id) => {
      const o = C.abrirConversaAgente({ ...cp(id) }).falas.find((f) => f.pergunta)?.pergunta?.opcoes ?? [];
      return o.every((x) => !/^nivel:[23]$/.test(x.id));
    }) && !C.responderConversaAgente({ etapa: "nivel", rascunho: cp2 }, cp2, { opcao: "nivel:3" }).salvar);
  ok("conversa: cada agente tem ícone e cor do DS",
    ids.every((id) => /^var\(--color-agente-[a-z-]+\)$/.test(C.PERFIS[id].cor) && ler("src/app/globals.css").includes(`${C.PERFIS[id].cor.slice(4, -1)}:`)));

  const nav = ler("src/components/dashboard/nav-data.ts");
  ok("menu: Quattro AI é item do menu principal e leva à tela dos agentes",
    /\{ id: "quattro-ai", label: "Quattro AI", icon: "sparkles", href: "\/quattro-ai"/.test(nav) && !/label: "Quattro AI",[^}]*event: "a4p:open-ia"/.test(nav));
  ok("automações: os agentes saíram dela (uma morada só, na tela da Quattro AI)",
    !/Agentes|AgentesView/.test(ler("src/app/automacoes/page.tsx").replace(/\/\*[\s\S]*?\*\//g, "")) && !existsSync(join(raiz, "src/components/agentes/AgentesView.tsx")));
  const chat = ler("src/components/ia/ChatAgente.tsx");
  ok("chat do agente: grava pelo escritor de sempre e decide pela função do banco",
    /await salvarAgente\(passo\.salvar\)/.test(chat) && /decidirProposta\(p\.id, aprovar\)/.test(chat) && !/from\("agentes"\)/.test(chat));
  // Pedido do dono (04/11/2026): no computador a lista mora no menu, na seção
  // Conversas; a tela só a mostra no telefone. Os dois leem a mesma fonte.
  const menu = ler("src/components/dashboard/Sidebar.tsx");
  const hub = ler("src/components/ia/QuattroAIHub.tsx");
  ok("menu: a Quattro AI e os agentes ficam na seção Conversas, antes das conversas",
    /<AgentesDoMenu entra=\{entra\} \/>\s*<label[^>]*>\s*<span className="sr-only">Buscar conversa/.test(menu) && /useAgentesDoHub\(\)/.test(menu));
  ok("tela: no computador a lista sai da tela (fica no menu) e a fonte é uma só",
    /className=\{`md:hidden [^`]*`\}>\{lista\}/.test(hub) && /useAgentesDoHub\(\)/.test(hub) && !/useQuery\(/.test(hub));
}

if (falhas.length) { console.log(`\nagentes: ${falhas.length} falha(s)`); process.exit(1); }
console.log("\nagentes: tudo verde");
