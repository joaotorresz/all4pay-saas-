#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PORTA FECHADA — as Edge Functions recusam chamada sem credencial (A4P-077)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O que esta guarda prova, e o que ela NÃO prova.**
 *
 * Ela prova, pelo COMPORTAMENTO, que `own-webhook` e `own-sync` recusam uma
 * chamada sem credencial — respondem 401. Isso foi medido em 17/08: base das
 * 11 tabelas `own_*` zerada antes, sondagem sem token, base zerada depois.
 *
 * Ela NÃO prova que a verificação é forte. O 401 mostra que existe fechadura;
 * não mostra que não é um segredo estático já vazado, nem que resiste a replay.
 * O mecanismo é DESCONHECIDO porque o fonte das funções não está no
 * repositório. Enquanto não estiver, a fechadura é suposição — e por isso este
 * arquivo não escreve "seguro" em lugar nenhum.
 *
 * ⚠️ **Roda no SCHEDULE, não no `npm test`.** Depende de rede, e guarda que
 * depende de rede vira intermitente; guarda intermitente é desligada. E o que
 * ela mede é ESTADO CONTÍNUO de produção — a mesma classe da guarda de `no-ar`.
 * O intervalo de 15 min detecta DERIVA (uma função que amanhã passe a aceitar
 * sem credencial), não porta recém-aberta no minuto seguinte ao deploy — por
 * isso ela também roda logo após cada deploy no `main`.
 *
 * ⚠️ **O CASO POSITIVO junto do negativo**, pela regra: uma chamada que DEVE
 * passar (o gateway responde, a função executa) e a que NÃO DEVE (recusada).
 * Sem o positivo, "tudo dá 401" poderia ser a função fora do ar — e fora do ar
 * não é fechada, é ausente.
 */

const BASE = process.env.A4P_FUNCTIONS_BASE
  ?? "https://dzszmbowhzopocqydnxu.supabase.co/functions/v1";

const casos = [
  // NEGATIVO: sem credencial, tem de recusar.
  { fn: "own-webhook", metodo: "POST", corpo: "{}", espera: 401, tipo: "recusa sem credencial" },
  { fn: "own-sync",    metodo: "POST", corpo: "{}", espera: 401, tipo: "recusa sem credencial" },
  // POSITIVO: a função ESTÁ no ar e executa (não é 5xx nem timeout). O 405 do
  // GET no webhook prova que o handler rodou e aplicou a própria regra de
  // método — ou seja, a porta existe e responde, não está ausente.
  { fn: "own-webhook", metodo: "GET", corpo: null, espera: 405, tipo: "no ar e aplica a própria regra" },
];

async function bate({ fn, metodo, corpo }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const r = await fetch(`${BASE}/${fn}`, {
      method: metodo,
      headers: corpo != null ? { "content-type": "application/json" } : {},
      body: corpo ?? undefined,
      signal: ctrl.signal,
    });
    return r.status;
  } finally { clearTimeout(t); }
}

let falhas = 0;
for (const c of casos) {
  let status;
  try { status = await bate(c); }
  catch (e) {
    console.error(`✗ ${c.fn} ${c.metodo} — ${e.name === "AbortError" ? "timeout" : e.message}`);
    falhas++; continue;
  }
  const ok = status === c.espera;
  console.log(`${ok ? "✓" : "✗"} ${c.fn} ${c.metodo} → ${status} (esperado ${c.espera}) · ${c.tipo}`);
  if (!ok) falhas++;
}

if (falhas > 0) {
  console.error(`\n✗ ${falhas} porta(s) fora do esperado. Uma função que passou a aceitar sem`);
  console.error("credencial é P0; uma que sumiu (5xx/timeout) não está fechada, está ausente.");
  process.exit(1);
}
console.log("\n✓ TODAS — os endpoints recusam sem credencial e estão no ar (mecanismo não verificado)");
