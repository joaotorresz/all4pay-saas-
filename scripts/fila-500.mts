/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MEDIÇÃO DAS 500 LINHAS — quantos gestos, e quanto tempo
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run fila-500
 *
 * ⚠️ **O que é MEDIDO e o que é SIMULADO, dito antes do número.** O tempo do
 * MOTOR é medido de verdade (relógio, sobre 500 linhas). O tempo HUMANO é
 * calculado a partir da contagem de GESTOS — que é medida — vezes um tempo por
 * gesto que é ASSUMIDO e está declarado abaixo. Não há como cronometrar um
 * humano dentro do CI; o que dá para tornar honesto é separar as duas coisas e
 * publicar a suposição, em vez de anunciar um número único com ar de medida.
 */
import {
  montarFila, estadoVazio, loteDe, decidir, aplicarLote, progresso, proximoPendente, paraGravar,
  corrigirIguais,
} from "@/core/ingestao/fila";
import type { PlanoIngestao, MovimentoIngerido } from "@/core/ingestao";

/* ── as suposições, declaradas ──────────────────────────────────────────── */
/** Ler a linha e apertar Enter, quando a sugestão está certa. */
const MS_CONFIRMAR = 1_500;
/** Ler, decidir que está errada, abrir o seletor, escolher e responder a regra. */
const MS_CORRIGIR = 8_000;
/** Conferir o agrupamento e apertar uma vez, valendo por N linhas. */
const MS_LOTE = 3_000;
const TETO_MIN = 10;

/* ── uma fatura de banco de verdade REPETE: poucos fornecedores, muitas linhas ── */
const CONTRAPARTES = [
  "POSTO IPIRANGA", "MERCADO LIVRE", "UBER", "AMAZON", "VIVO", "ENEL",
  "IFOOD", "CORREIOS", "GOOGLE", "AWS", "SICREDI TARIFA", "FOLHA PAGAMENTO",
  "ALUGUEL SALA", "CONTABILIDADE", "SEGURO", "AGUA CEDAE",
];
const CATEGORIA: Record<string, string> = {
  "POSTO IPIRANGA": "Combustível", "MERCADO LIVRE": "Compras", "UBER": "Transporte",
  "AMAZON": "Compras", "VIVO": "Utilidades", "ENEL": "Utilidades", "IFOOD": "Alimentação",
  "CORREIOS": "Logística", "GOOGLE": "Assinaturas", "AWS": "Assinaturas",
  "SICREDI TARIFA": "Tarifas", "FOLHA PAGAMENTO": "Folha", "ALUGUEL SALA": "Aluguel",
  "CONTABILIDADE": "Serviços profissionais", "SEGURO": "Seguros", "AGUA CEDAE": "Utilidades",
};

function planoDe(n: number): PlanoIngestao {
  const linhas: MovimentoIngerido[] = [];
  for (let i = 0; i < n; i++) {
    const cp = CONTRAPARTES[i % CONTRAPARTES.length];
    // ⚠️ 15% de confiança baixa — a proporção que o FDIP produz num extrato
    // real, onde a maioria casa por palavra-chave e a cauda não casa.
    const baixa = i % 7 === 3;
    linhas.push({
      chave: `k${i}`, contaId: null,
      data: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`,
      valor: 100 + (i % 90), tipo: "saida",
      descritivoBruto: `PIX ENV ${cp} ${1000 + i}`,
      descritivoNormalizado: cp.toLowerCase(),
      contraparte: cp, documento: null, origem: "extrato",
      classificacao: {
        categoria: baixa ? "Outras despesas" : CATEGORIA[cp],
        natureza: "despesa", confianca: baixa ? 0.4 : 0.95, motivo: "fixture",
      },
      situacao: baixa ? "revisar" : "nova",
    } as MovimentoIngerido);
  }
  return { versao: "x", linhas, resumo: {} as never, porCategoria: [], contrapartesNovas: [] } as unknown as PlanoIngestao;
}

const N = Number(process.argv[2] ?? 500);
const plano = planoDe(N);

const t0 = performance.now();
const fila = montarFila(plano);
let estado = estadoVazio();
let gestos = { confirmar: 0, corrigir: 0, lote: 0, linhasPorLote: 0 };
let relogio = 0;

// ⚠️ O CAMINHO ÓTIMO que a tela oferece: quando há lote, um gesto resolve N.
let guarda = 0;
for (;;) {
  if (++guarda > N * 4) throw new Error("laço não converge — a fila não fecha");
  const i = proximoPendente(fila, estado, 0);
  if (i === -1) break;
  const item = fila[i];
  const lote = loteDe(fila, item, estado);
  if (lote.chaves.length > 1) {
    relogio += MS_LOTE;
    estado = aplicarLote(estado, lote, relogio);
    gestos.lote++; gestos.linhasPorLote += lote.chaves.length;
  } else if (item.classificacao.confianca < 0.9) {
    // Confiança baixa: a pessoa corrige. Não entra em massa, por regra.
    // A correção alcança as pendentes da MESMA contraparte: elas passam a ter
    // confiança 1 e caem no próximo lote, em vez de pedir o gesto inteiro cada.
    relogio += MS_CORRIGIR;
    estado = corrigirIguais(estado, fila, item, item.classificacao.categoria === "Outras despesas"
      ? "Combustível" : item.classificacao.categoria);
    estado = decidir(estado, item.chave, "confirmada", relogio);
    gestos.corrigir++;
  } else {
    relogio += MS_CONFIRMAR;
    estado = decidir(estado, item.chave, "confirmada", relogio);
    gestos.confirmar++;
  }
}
const motorMs = performance.now() - t0;
const gravadas = paraGravar(fila, estado).length;
const p = progresso(fila, estado);

const totalGestos = gestos.confirmar + gestos.corrigir + gestos.lote;
const humanoMin = relogio / 60_000;

console.log(`\nA FILA UM-A-UM — ${N} linhas\n`);
console.log(`  MEDIDO (relógio):`);
console.log(`    motor .................. ${motorMs.toFixed(1)} ms  (${(motorMs / N).toFixed(2)} ms/linha)`);
console.log(`    gestos necessários ..... ${totalGestos}  (${gestos.confirmar} Enter · ${gestos.corrigir} correções · ${gestos.lote} em massa)`);
console.log(`    linhas resolvidas em massa ${gestos.linhasPorLote} de ${N}`);
console.log(`    linhas confirmadas ..... ${gravadas}   fila fechada: ${p.fracao === 1 ? "sim" : "NÃO"}`);
console.log(`\n  SIMULADO (gestos × tempo assumido, declarado acima):`);
console.log(`    tempo humano ........... ${humanoMin.toFixed(1)} min   (teto: ${TETO_MIN} min)`);

if (p.fracao !== 1 || gravadas !== N) {
  console.log(`\n✗ a fila não fechou sobre ${N} linhas`);
  process.exit(1);
}
if (humanoMin > TETO_MIN) {
  console.log(`\n✗ ACIMA DO TETO — ${humanoMin.toFixed(1)} min > ${TETO_MIN} min`);
  process.exit(1);
}
console.log(`\n✓ ${N} linhas cabem em ${humanoMin.toFixed(1)} min (teto ${TETO_MIN})`);
