/**
 * ia-origem — a guarda da Rodada 9: TODO número que a IA cita leva à origem.
 *
 *   npm run ia-origem
 *
 * Sobre o corpus inteiro (as 247 perguntas da guarda de roteamento), rodado
 * em DOIS conjuntos de dados — o do corpus e um com títulos vencidos,
 * transferência, cancelado e lançamento de hoje —, ela cobra:
 *
 *  1. TETO ZERO de número sem destino: cada número tem `origem` (tela, e os
 *     lançamentos quando é soma) ou é `simulacao` (nasceu da pergunta).
 *  2. A GAVETA FECHA COM O NÚMERO: quando a origem diz `soma`, os lançamentos
 *     somam exatamente o valor exibido (um centavo de tolerância); numa
 *     contagem, são exatamente tantos quantos o número diz.
 *  3. Toda tela de origem existe no inventário e não é alias.
 *  4. Calculadora não ganha link: parcela, markup e DAS são simulação.
 *  5. O número que vem DE FORA (Claude) perde qualquer origem que o modelo
 *     escrevesse — a origem é dita por quem calculou.
 *  6. O histórico guardado não leva a lista de lançamentos (amanhã ela não
 *     fecharia com o número de hoje).
 *  7. A IA SUGERE, NÃO EXECUTA: o chat não tem caminho de escrita; a única
 *     execução da aba Sugestões é a seção Executar, que confirma quem recebe
 *     a cobrança antes de enviar.
 *
 * E o teste NEGATIVO mora aqui dentro: um número com a lista errada, um com a
 * soma errada e um sem origem são montados à mão e o conferente TEM de
 * reprová-los, nomeando o defeito. Sem isso a guarda poderia passar por não
 * conferir nada.
 */
import { readFileSync } from "node:fs";
import { responderLocal } from "@/core/assistant/engine";
import { TELAS, valorDoTexto, numerosDeFora, type NumeroResposta } from "@/core/assistant/numero";
import { INVENTARIO } from "@/core/rotas/inventario";
import { destinoDe } from "@/core/rotas/aliases";
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { CORPUS, input, ctx } from "./fixtures/corpus-ia.mts";

let falhas = 0;
const ok = (nome: string, cond: boolean, detalhe = "") => {
  if (cond) console.log(`✓ ${nome}`);
  else { falhas++; console.log(`✗ ${nome}${detalhe ? `\n    ${detalhe}` : ""}`); }
};

/* ── o segundo conjunto: o que o primeiro não exercita ── */
const HOJE = input.hoje;
let seq = 0;
const mk = (o: Partial<RiskMovement>): RiskMovement =>
  ({ id: `x${seq++}`, type: "entrada", amount: 1000, due_date: HOJE, paid_date: HOJE, status: "pago", category: "Vendas", party_id: null, ...o }) as RiskMovement;
const input2: RiskInput = {
  ...input,
  movements: [
    ...input.movements,
    mk({ type: "entrada", amount: 2500, status: "pendente", paid_date: null, due_date: "2026-07-02", party_id: "C" }),
    mk({ type: "entrada", amount: 1300.55, status: "pendente", paid_date: null, due_date: "2026-06-20", party_id: "A" }),
    mk({ type: "saida", amount: 870.1, status: "pendente", paid_date: null, due_date: "2026-07-05", party_id: "F1", category: "Fornecedores" }),
    mk({ type: "saida", amount: 4000, status: "pago", category: "Transferência entre contas" }),
    mk({ type: "entrada", amount: 4000, status: "pago", category: "Transferência entre contas" }),
    mk({ type: "entrada", amount: 9999, status: "cancelado", party_id: "A" }),
    mk({ type: "saida", amount: 333.33, status: "pago", party_id: "F2", category: "Marketing" }),
    mk({ type: "entrada", amount: 777.77, status: "pendente", paid_date: null, due_date: HOJE, party_id: "B", category: "Servicos" }),
  ],
} as RiskInput;

/** O conferente — devolve o defeito por extenso, ou `null`. */
function conferir(n: NumeroResposta, porId: Map<string, RiskMovement>): string | null {
  if (n.simulacao) return n.origem ? "simulação com origem — ou nasceu da pergunta, ou da base" : null;
  if (!n.origem) return "número sem origem e sem marca de simulação";
  const o = n.origem;
  if (!o.rota || !o.tela) return "origem sem tela";
  if (!o.movimentos) return o.soma ? "origem diz soma mas não traz lançamentos" : null;
  const ms = o.movimentos.map((id) => porId.get(id));
  if (ms.some((m) => !m)) return "a lista aponta lançamento que não existe";
  if (new Set(o.movimentos).size !== o.movimentos.length) return "a lista repete lançamento";
  if (!o.soma) return null;
  const lista = ms as RiskMovement[];
  const v = valorDoTexto(n.valor);
  if (v === null) {
    return /^\d+$/.test(n.valor) && Number(n.valor) === lista.length ? null
      : `a gaveta tem ${lista.length} lançamento(s) e o número diz "${n.valor}"`;
  }
  const abs = lista.reduce((s, m) => s + Math.abs(m.amount), 0);
  const sig = lista.reduce((s, m) => s + (m.type === "entrada" ? 1 : -1) * Math.abs(m.amount), 0);
  const fecha = Math.abs(Math.abs(v) - abs) <= 0.01 || Math.abs(v - sig) <= 0.01;
  return fecha ? null : `a gaveta soma ${abs.toFixed(2)} (assinado ${sig.toFixed(2)}) e o número diz ${n.valor}`;
}

/* ── 0. o conferente reprova o defeito plantado (o teste negativo) ── */
{
  const porId = new Map(input.movements.map((m) => [m.id, m]));
  const [a, b] = input.movements;
  const plantados: [string, NumeroResposta, RegExp][] = [
    ["sem origem", { label: "Gasto", valor: "R$100,00" }, /sem origem/],
    ["lista errada", { label: "Gasto", valor: `R$${Math.abs(a.amount).toFixed(2).replace(".", ",")}`, origem: { ...TELAS.extrato, movimentos: [a.id, b.id], soma: true } }, /a gaveta soma/],
    ["contagem errada", { label: "Títulos", valor: "3", origem: { ...TELAS.receber, movimentos: [a.id], soma: true } }, /lançamento\(s\) e o número diz/],
    ["id inexistente", { label: "Gasto", valor: "R$1,00", origem: { ...TELAS.extrato, movimentos: ["nao-existe"], soma: true } }, /não existe/],
  ];
  for (const [nome, n, re] of plantados) {
    const d = conferir(n, porId);
    ok(`negativo: o conferente reprova "${nome}" nomeando o defeito`, !!d && re.test(d), `veio: ${d}`);
  }
}

/* ── 1 e 2. o corpus inteiro, nos dois conjuntos ── */
for (const [nomeConj, base] of [["corpus", input], ["vencidos+transferência", input2]] as const) {
  const porId = new Map(base.movements.map((m) => [m.id, m]));
  let total = 0, somas = 0, sims = 0;
  const ruins: string[] = [];
  for (const [q] of CORPUS) {
    const r = responderLocal(q, base, ctx);
    if (!r) continue;
    for (const n of r.numeros) {
      total++;
      if (n.simulacao) sims++;
      if (n.origem?.soma) somas++;
      const d = conferir(n, porId);
      if (d) ruins.push(`"${q}" · ${n.label} = ${n.valor}: ${d}`);
    }
  }
  console.log(`  ${nomeConj}: ${total} números · ${somas} somas conferidas · ${sims} simulações`);
  ok(`origem (${nomeConj}): nenhum número sem destino, e toda gaveta fecha com o número`, ruins.length === 0,
    ruins.slice(0, 8).join("\n    "));
  // ⚠️ Verde sobre o vazio é pior que vermelho: exige que o caminho recebeu valor.
  ok(`origem (${nomeConj}): a conferência exercitou somas de verdade (> 200)`, somas > 200, `somas = ${somas}`);
}

/* ── 3. toda tela de origem existe e não é alias ── */
{
  const publicadas = new Set(INVENTARIO.map((r: { rota: string }) => r.rota));
  const rotas = new Set<string>(Object.values(TELAS).map((t) => t.rota));
  for (const [q] of CORPUS) for (const n of responderLocal(q, input2, ctx)?.numeros ?? []) if (n.origem) rotas.add(n.origem.rota);
  const fora = Array.from(rotas).filter((r) => {
    const caminho = r.split("?")[0];
    return !publicadas.has(caminho) || destinoDe(r) !== null || destinoDe(caminho) !== null;
  });
  ok("telas: toda tela de origem existe no inventário e não é alias", fora.length === 0, fora.join(", "));
}

/* ── 4. calculadora não vira link ── */
{
  const calc = [
    "simular financiamento de 100 mil em 24x a 1,5% ao mês",
    "que preço vender um produto de custo 100 com margem de 30%?",
    "quanto pago de Simples no Anexo III com faturamento de 500 mil por ano?",
    "quantas unidades preciso vender pra empatar com custo fixo de 10 mil e margem de 50 por unidade?",
  ];
  const comLink = calc.flatMap((q) => (responderLocal(q, input, ctx)?.numeros ?? []).filter((n) => !n.simulacao).map((n) => `${q} · ${n.label}`));
  const vazias = calc.filter((q) => !(responderLocal(q, input, ctx)?.numeros.length));
  ok("calculadora: todo número é simulação (o 'Custo fixo' da conta de empate não leva às contas recorrentes)",
    comLink.length === 0 && vazias.length === 0, [...comLink, ...vazias.map((q) => `sem números: ${q}`)].join("; "));
}

/* ── 5. o número que vem do Claude perde a origem que o modelo escrevesse ── */
{
  const de = numerosDeFora([
    { label: "Saldo", valor: "R$10,00", origem: { rota: "https://golpe.example", tela: "x", movimentos: ["a"], soma: true } },
    { label: "Qualquer", valor: "1" },
    "lixo",
  ]);
  ok("de fora: a origem do JSON é descartada e o rótulo fixo vale",
    de.length === 2 && de[0].origem?.rota === "/" && !de[0].origem?.movimentos && !de[1].origem);
}

/* ── 6. o histórico guardado não leva a lista ── */
{
  const t = readFileSync("src/lib/ia-conversas.ts", "utf8");
  ok("histórico: a conversa é gravada SEM a lista de lançamentos",
    /turnosVivos\.map\(semListaDeLancamentos\)/.test(t) && /movimentos: _ids/.test(t));
}

/* ── 7. a IA sugere, não executa ── */
{
  const semComentario = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
  const chat = ["src/components/ia/chat-kit.tsx", "src/components/ia/useChatIA.ts", "src/components/ia/IAView.tsx", "src/components/app/AssistantWidget.tsx"];
  const escritas = chat.flatMap((f) => {
    const t = semComentario(f);
    const fetches = Array.from(t.matchAll(/fetch\(\s*["'`]([^"'`]+)/g)).map((m) => m[1]);
    return fetches.filter((u) => u !== "/api/ai/copiloto").map((u) => `${f}: ${u}`);
  });
  ok("executa: o chat só chama a rota de resposta — nenhuma escrita", escritas.length === 0, escritas.join(", "));
  const kit = semComentario("src/components/ia/chat-kit.tsx");
  ok("executa: a sugestão do Claude diz que é sugestão (o rótulo 'Ação:' saiu)",
    !/>Ação:</.test(kit) && /data-ia="sugestao"/.test(kit) && /não executa nada/.test(kit));
  ok("executa: a bolha abre a gaveta dos lançamentos e marca a simulação",
    /<GavetaTransacoes/.test(kit) && /data-ia-numero=\{o\.soma \? "soma" : "base"\}/.test(kit) && /simulação/.test(kit));
  const auto = semComentario("src/components/autonomo/AutonomoView.tsx");
  ok("executa: a aba Sugestões monta a seção Executar e não tem disparo próprio",
    /<AcoesCopiloto \/>/.test(auto) && !/\/api\/cobranca/.test(auto) && !/Disparar no WhatsApp/.test(auto));
  const acoes = semComentario("src/components/copiloto/AcoesCopiloto.tsx");
  ok("executa: a cobrança pede confirmação com os nomes de quem recebe antes de enviar",
    /onClick=\{\(\) => \(cobra \? setConfirmando\(d\.id\) : agir\(d\)\)\}/.test(acoes)
    && /data-confirmar-cobranca/.test(acoes) && /alvos\.map\(\(c\) => c\.cliente\)/.test(acoes));
  ok("executa: o selo sai do STATUS da execução (simulado nunca é 'Enviada')",
    /done\.status === "executada" \? "Enviada" : cobra \? "Não enviada"/.test(acoes) && !/done\.includes\(/.test(acoes));
  const rota = semComentario("src/app/api/cobranca/whatsapp/route.ts");
  ok("executa: a resposta de demonstração tem o mesmo formato da de produção (cliente + situação)",
    /enviados: candidatos\.map\(\(a\) => \(\{\s*cliente: a\.cliente,/.test(rota) && /situacao: "simulado"/.test(rota));
}

/* ── 8. a sugestão tem id ESTÁVEL (o motor roda a cada renderização) ── */
{
  const { operacaoAutonoma } = await import("@/core/autonomous");
  const contas = [{ id: "c1", name: "Conta", bank: "Itaú", balance: 1000, type: "corrente" }] as never;
  // Uma empresa apertada: saldo baixo e títulos vencidos fazem as políticas dispararem.
  const apertada = { ...input2, saldoAtual: 1000 } as RiskInput;
  const a = operacaoAutonoma(apertada, contas).decisoes.map((d) => d.id);
  const b = operacaoAutonoma(apertada, contas).decisoes.map((d) => d.id);
  ok("sugestão: o motor disparou sugestões nesta fixture (senão a asserção abaixo não mede nada)", a.length > 0, `${a.length}`);
  ok("sugestão: rodar o motor duas vezes dá os MESMOS ids (a confirmação e o selo não somem no redesenho)",
    a.length > 0 && a.join("|") === b.join("|"), `${a.join(",")} × ${b.join(",")}`);
  ok("sugestão: os ids são únicos", new Set(a).size === a.length, a.join(","));
}

/* ── 8b. a LEITURA e a ANOMALIA do motor executivo também têm id ESTÁVEL ──
 * Eram `uid()`, um contador de módulo: a mesma leitura nascia com outro id a
 * cada redesenho (medido: `anom_0` e depois `anom_7` sobre a mesma entrada).
 * Era o que tornava inertes o "Marcar revisada" e a narração por IA do antigo
 * `/copiloto`, e é o que a aba Sugestões usa como chave das linhas portadas. */
{
  const { centroInteligencia } = await import("@/core/executive");
  const pg = (id: string, valor: number, d: string, party: string, category: string) =>
    ({ id, type: "saida", status: "pago", amount: valor, due_date: d, paid_date: d, party_id: party, category });
  const fx = { hoje: "2026-09-15", saldoAtual: 20_000, partyNames: {}, horizonDias: 60, movements: [
    ...["05", "06", "07", "08", "09"].map((mm) => ({ id: "r" + mm, type: "entrada", status: "pago", amount: 30_000, due_date: `2026-${mm}-05`, paid_date: `2026-${mm}-05`, party_id: "c1", category: "Vendas" })),
    // Aluguel dispara no mês corrente: anomalia de despesa.
    ...([["05", 5000], ["06", 5100], ["07", 4900], ["08", 5050], ["09", 9000]] as const).map(([mm, v]) => pg("a" + mm, v, `2026-${mm}-10`, "f1", "Aluguel")),
    // DUAS duplicidades de MESMO valor e título, em contrapartes diferentes —
    // a chave não pode colidir entre elas.
    pg("g1", 1234, "2026-09-02", "f2", "Gráfica"), pg("g2", 1234, "2026-09-03", "f2", "Gráfica"),
    pg("h1", 1234, "2026-09-04", "f3", "Frete"), pg("h2", 1234, "2026-09-05", "f3", "Frete"),
  ] } as unknown as RiskInput;
  const a = centroInteligencia(fx);
  const b = centroInteligencia(fx);
  const dup = a.anomalias.filter((x) => x.classe === "duplicidade");
  ok("leitura: a fixture dispara anomalias de duas classes e leituras (senão a asserção abaixo não mede nada)",
    dup.length === 2 && a.anomalias.some((x) => x.classe === "despesa") && a.insights.length >= 3,
    `${a.anomalias.map((x) => x.classe).join(",")} · ${a.insights.length} leituras`);
  const ids = (c: typeof a) => [...c.anomalias.map((x) => x.id), ...c.insights.map((x) => x.id)];
  ok("leitura: rodar o motor executivo duas vezes dá os MESMOS ids (anomalias e leituras)",
    ids(a).join("|") === ids(b).join("|"), `${ids(a).join(",")} × ${ids(b).join(",")}`);
  ok("leitura: os ids são únicos — duas duplicidades de mesmo valor e título não colidem",
    new Set(a.anomalias.map((x) => x.id)).size === a.anomalias.length && new Set(a.insights.map((x) => x.id)).size === a.insights.length,
    ids(a).join(","));
}

/* ── 9. o /copiloto órfão não volta, e o que ele tinha de único continua montado ──
 * `CopilotoView`, `CopilotoChat` e `InteligenciaShell` ficaram sem rota quando
 * o /copiloto foi aposentado. Conferidos bloco a bloco: as Leituras e as
 * Anomalias não existiam em tela nenhuma e foram MOVIDAS para a aba Sugestões;
 * o resto tem equivalente vivo. O `CopilotoChat` era um terceiro chat da IA,
 * com caminho de escrita no razão — o que a Rodada 9 tirou do chat. */
{
  const { existsSync, readdirSync, statSync } = await import("node:fs");
  const apagados = [
    "src/components/copiloto/CopilotoView.tsx",
    "src/components/copiloto/CopilotoChat.tsx",
    "src/components/copiloto/InteligenciaShell.tsx",
    "src/app/api/ai/narrar/route.ts",
  ];
  const voltaram = apagados.filter((f) => existsSync(f));
  ok("copiloto: os órfãos continuam apagados (e a narração que só eles chamavam)", voltaram.length === 0, voltaram.join(", "));
  const arquivos: string[] = [];
  const varrer = (d: string) => {
    for (const n of readdirSync(d)) {
      const f = `${d}/${n}`;
      if (statSync(f).isDirectory()) varrer(f);
      else if (/\.(tsx?|mts)$/.test(n)) arquivos.push(f);
    }
  };
  varrer("src");
  // Comentário fora: um arquivo que EXPLICA por que o órfão saiu não o importa.
  const semNota = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const quemImporta = arquivos.filter((f) => /copiloto\/(CopilotoView|CopilotoChat|InteligenciaShell)\b|\/api\/ai\/narrar/.test(semNota(readFileSync(f, "utf8"))));
  ok("copiloto: teto ZERO — nada em src/ importa os órfãos nem chama a narração", quemImporta.length === 0, quemImporta.join(", "));
  const sem = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");
  const auto = sem("src/components/autonomo/AutonomoView.tsx");
  ok("copiloto: a aba Sugestões monta as Leituras e as Anomalias que vieram de lá",
    /<LeiturasPriorizadas \/>/.test(auto) && /<AnomaliasParaRevisar \/>/.test(auto));
  const leit = sem("src/components/autonomo/LeiturasPriorizadas.tsx");
  const anom = sem("src/components/autonomo/AnomaliasParaRevisar.tsx");
  ok("copiloto: as linhas portadas usam o id ESTÁVEL do motor como chave (nem índice, nem narração por id)",
    /key=\{i\.id\}/.test(leit) && /key=\{a\.id\}/.test(anom) && !/narr/.test(leit + anom));
  ok("copiloto: o 'Marcar revisada' (selo que some ao recarregar) não voltou", !/Marcar revisada|revisadas\[/.test(anom));
  const publicadas = new Map(INVENTARIO.map((r: { rota: string; status: string }) => [r.rota, r.status]));
  const hrefs = Array.from(anom.matchAll(/href: "([^"]+)"/g)).map((m) => m[1]);
  const ruins = hrefs.filter((h) => publicadas.get(h) !== "canonica" || destinoDe(h) !== null);
  ok("copiloto: onde conferir cada anomalia é rota CANÔNICA do inventário, nunca alias",
    hrefs.length === 3 && ruins.length === 0, `${hrefs.length} destino(s) · ${ruins.join(", ")}`);
}

console.log(falhas === 0 ? "\n✓ ia-origem: tudo verde" : `\n✗ ia-origem: ${falhas} falha(s)`);
if (falhas > 0) process.exit(1);
