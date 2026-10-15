/**
 * A CONFERÊNCIA EXTRATO × SISTEMA da Pinbank — a guarda de COMPORTAMENTO
 * (`npm run pinbank-conferencia`).
 *
 * Dirige o motor puro (`src/core/pinbank/conferencia.ts`) sobre fixtures
 * escritas À MÃO: a amostra real do dev (F0), uma loja inteira com cada
 * situação que o motor distingue (F1), a numeração não confirmada (F2), o
 * extrato vazio (F3) ou só de outro estabelecimento (F3b), o período incerto
 * (F4), a empresa com duas maquininhas (F5), o vazio dos dois lados (F6), os
 * títulos lidos duas vezes (F7), a venda cancelada no extrato sem título e a
 * cancelada no sistema pela metade (F8), a linha ilegível da mesma venda (F9),
 * o estorno parcial com data de cancelamento (F10), a maquininha trocada
 * (F11), o estorno CANCELADO (F12), a TAXA (MDR) contra a contratada (FT), a
 * venda cancelada no extrato numa parcela só (F13), o título de taxa repetido
 * (F14), a venda desfeita no sistema e viva no extrato (F15), a linha ilegível
 * sem número (FG), a taxa da venda cancelada (FT2), o parcelado em 1x (FT3), a
 * taxa cobrada sem o título dela no sistema (FB) e o aviso que ATESTA a venda
 * em comum (o título forjado não atesta). E, da terceira revisão: a venda
 * dividida em números de parcelas diferentes nos dois lados (FV, FL e a 1022),
 * a parcela que falta com o MESMO número de parcelas, afirmada na borda
 * (FBORDA), a tolerância ESTRITA contra a taxa contratada exata (FTOL), o
 * estorno parcial com taxa cadastrada (FT4), a taxa que a regra do sistema
 * nem lançaria (FBZ), o lado do sistema só com as parcelas válidas (FVIVOS), o
 * aviso que só atesta NO DIA DA VENDA e a maquininha trocada (FP). E, da
 * quarta revisão: o TOTAL da venda diferente com números de parcelas
 * diferentes — o título da última parcela que some, o total lançado
 * diferente, a venda redividida com o mesmo total e a lacuna na numeração do
 * sistema (FTOT) — e as linhas do extrato que discordam no número de parcelas
 * (FDISC).
 *
 * E os PORTÕES DA ROTA (`core/pinbank/conferencia-portoes`) e a LEITURA do banco
 * (`lib/pinbank/conferencia-leitura`, sobre um Supabase de mentira): o teto que
 * não acusa o lote cheio, o servidor que corta abaixo do teto, a leitura da
 * espera por empresa que o BANCO decide (falha fechada), só as contagens de cada lado sem venda em comum ATESTADA (o EC pode
 * ser de outra loja, e um título forjado não a atesta) — contagens que não
 * mudam com o que a empresa grava — e a empresa do vínculo em toda leitura. E a
 * COMPOSIÇÃO da rota (janela → NSUs → leitura → motor → portão — as mesmas
 * chamadas, na mesma ordem, que o `engine-audit` fixa no texto da rota; a
 * leitura das maquininhas fica de fora, com uma só) sobre o servidor de
 * mentira com o `max_rows` PADRÃO (1.000) e sem ele: a resposta (inclusive o
 * 422) não muda com o NSU do título forjado dentro ou fora do extrato alheio.
 *
 * ⚠️ Os valores esperados são ÂNCORAS LITERAIS, nunca gerados pelo motor: um
 * teste que compara o motor com o próprio motor concorda por construção.
 *
 * ⚠️ TODA guarda só conta depois de reprovar: no fim, DEFEITOS PLANTADOS numa
 * cópia do motor, e cada um tem de derrubar o caso que o nomeia. Planta que não
 * acha mais o texto a substituir "envelheceu" — e isso também reprova.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ModEngine = typeof import("../src/core/pinbank/conferencia.ts");
type LinhaExtratoPos = import("../src/core/pinbank/extrato-pos.ts").LinhaExtratoPos;
type Mov = import("../src/core/pinbank/conferencia.ts").LinhaMovimentoPinbank;
type Ev = import("../src/core/pinbank/conferencia.ts").EventoPinbankSistema;
type Tr = import("../src/core/pinbank/conferencia.ts").TransacaoPinbankSistema;
type Entrada = import("../src/core/pinbank/conferencia.ts").EntradaConferencia;
type Relatorio = import("../src/core/pinbank/conferencia.ts").RelatorioConferencia;
type Status = import("../src/core/pinbank/conferencia.ts").StatusConferencia;

const ARQ_ENGINE = path.resolve("src/core/pinbank/conferencia.ts");
const ARQ_PORTOES = path.resolve("src/core/pinbank/conferencia-portoes.ts");
const ARQ_LEITURA = path.resolve("src/lib/pinbank/conferencia-leitura.ts");
type ModPortoes = typeof import("../src/core/pinbank/conferencia-portoes.ts");
type ModLeitura = typeof import("../src/lib/pinbank/conferencia-leitura.ts");
const imp = async <T,>(arq: string) => (await import(pathToFileURL(arq).href)) as T;
const CAL = await imp<typeof import("../src/core/folha/calendario.ts")>(path.resolve("src/core/folha/calendario.ts"));
const EXT = await imp<typeof import("../src/core/pinbank/extrato-pos.ts")>(path.resolve("src/core/pinbank/extrato-pos.ts"));
const API = await imp<typeof import("../src/lib/pinbank/api.ts")>(path.resolve("src/lib/pinbank/api.ts"));

/* ─────────────────────────────── construtores ─────────────────────────────── */

const EC = 3510;
/** Uma parcela do extrato (já pela lista de permitidos). */
const L = (o: Partial<LinhaExtratoPos> & { nsu: number | null; venda: string; repasse: string | null; bruto: number | null }): LinhaExtratoPos => {
  const { venda, repasse, bruto, ...resto } = o;
  return {
    codigoCliente: EC, terminal: null, bandeira: "MASTERCARD", tipoCompra: "A VISTA", parcela: 1, totalParcelas: 1,
    dataTransacao: `${venda}T10:00:00`, dataFuturaPagamento: repasse ? `${repasse}T10:00:00` : null, dataCancelamento: null,
    brutoCentavos: bruto, brutoParcelaCentavos: null, liquidoRepasseCentavos: null, splitCentavos: null,
    mdrBp: 265, taxaMesBp: 0, status: "Aprovada", statusPagamento: "Pendente",
    codAutorizacao: null, nsuLoja: null,
    ...resto,
  };
};
/** O título da receita da parcela (`pinbank:<nsu>:<k>:r`), em REAIS como o PostgREST devolve. */
const R = (nsu: number, k: number, amount: number | string, due: string, comp: string, situacao = "previsto"): Mov => ({
  id: `r-${nsu}-${k}`, chave: `pinbank:${nsu}:${k}:r`, nsu: String(nsu), type: "entrada", amount, due_date: due, competence_date: comp, situacao,
});
const T = (nsu: number, k: number, amount: number, due: string, comp: string, situacao = "previsto"): Mov => ({
  id: `t-${nsu}-${k}`, chave: `pinbank:${nsu}:${k}:t`, nsu: String(nsu), type: "saida", amount, due_date: due, competence_date: comp, situacao,
});
const EST = (nsu: number, alvo: string, amount: number, data: string): Mov => ({
  id: `e-${nsu}-${alvo}`, chave: `pinbank:${nsu}:estorno:${alvo}`, nsu: String(nsu), type: "saida", amount, due_date: data, competence_date: data, situacao: "previsto",
});
const EV = (nsu: number, o: Partial<Ev> = {}): Ev => ({
  nsu, vinculo_id: "v1", situacao: "processado", event_type: "Compra.TransacaoRealizada", ocorrido_em: "2025-07-01T10:00:00Z", autorizacao: null, ...o,
});
const TR = (nsu: number, status: string, valor: number, original: number): Tr => ({ nsu, status, valor, valor_original: original });

const base = (o: Partial<Entrada>): Entrada => ({
  de: "2025-07-01", ate: "2025-07-31", hoje: "2025-10-13",
  vinculo: { id: "v1", codigoCliente: EC, taxas: null }, vinculosDoEstabelecimento: ["v1"], vinculosDaEmpresa: ["v1"],
  extrato: [], titulos: [], eventos: [], transacoes: [], ...o,
});

/* ─────────────────────────────── as fixtures ─────────────────────────────── */

/** F0 — a amostra do dev (canal 47, EC 3510, 30–31/07/2025), a linha VERBATIM. */
const LINHA_DEV: LinhaExtratoPos = {
  nsu: 136576350, codigoCliente: 3510, terminal: null, bandeira: "MASTERCARD", tipoCompra: "A VISTA", parcela: 1, totalParcelas: 1,
  dataTransacao: "2025-07-31T17:05:53.402", dataFuturaPagamento: "2025-09-01T17:05:53.402", dataCancelamento: null,
  brutoCentavos: 900, brutoParcelaCentavos: 675, liquidoRepasseCentavos: 329, splitCentavos: 675, mdrBp: 265, taxaMesBp: 0,
  status: "TRANS. LOJA TESTE", statusPagamento: "Pendente", codAutorizacao: null, nsuLoja: null,
};
const TITULOS_F0 = [R(136576350, 1, 9, "2025-08-30", "2025-07-31"), T(136576350, 1, 0.27, "2025-08-30", "2025-07-31")];
const F0 = () => base({ de: "2025-07-30", ate: "2025-07-31", extrato: [LINHA_DEV], titulos: TITULOS_F0 });
const F7 = () => base({ de: "2025-07-30", ate: "2025-07-31", extrato: [LINHA_DEV], titulos: [...TITULOS_F0, ...TITULOS_F0] });
/**
 * F0 SEM o líquido da linha. ⚠️ O líquido da amostra do dev é de TESTE (3,29 de
 * uma parcela de 9,00): verbatim, o eixo do líquido acusa a venda (o caso
 * F0_LIQUIDO prova isso) — e os casos da TAXA, sobre ela, mediriam dois eixos
 * misturados. Sem o líquido, a venda não é comparada por ele e a vista de
 * divergências volta a depender só da taxa.
 */
const F0_SEM_LIQUIDO = () => base({ de: "2025-07-30", ate: "2025-07-31", extrato: [{ ...LINHA_DEV, liquidoRepasseCentavos: null }], titulos: TITULOS_F0 });
/** F0 (sem o líquido) com a taxa de crédito à vista CADASTRADA: igual (2,65%) e diferente (1,99%). */
const F0_TAXA = (credito_vista: number) => ({ ...F0_SEM_LIQUIDO(), vinculo: { id: "v1", codigoCliente: EC, taxas: { credito_vista } } });

/** F1 — uma loja inteira, julho de 2025. */
const F1 = (): Entrada => base({
  extrato: [
    L({ nsu: 1001, venda: "2025-07-08", repasse: "2025-07-09", bruto: 5000, tipoCompra: "DEBITO" }),
    L({ nsu: 1002, venda: "2025-07-10", repasse: "2025-08-11", bruto: 9000 }),
    // 1003: as parcelas chegam em ordem INVERSA
    L({ nsu: 1003, venda: "2025-07-14", repasse: "2025-10-13", bruto: 20000, parcela: 3, totalParcelas: 3, tipoCompra: "PARCELADO" }),
    L({ nsu: 1003, venda: "2025-07-14", repasse: "2025-09-15", bruto: 20000, parcela: 2, totalParcelas: 3, tipoCompra: "PARCELADO" }),
    L({ nsu: 1003, venda: "2025-07-14", repasse: "2025-08-13", bruto: 20000, parcela: 1, totalParcelas: 3, tipoCompra: "PARCELADO" }),
    L({ nsu: 1004, venda: "2025-07-15", repasse: "2025-07-18", bruto: 12000, tipoCompra: "DEBITO" }),
    L({ nsu: 1005, venda: "2025-07-16", repasse: "2025-08-15", bruto: 8500 }),
    L({ nsu: 1006, venda: "2025-07-23", repasse: "2025-08-22", bruto: 29104, parcela: 1, totalParcelas: 2, tipoCompra: "PARCELADO" }),
    L({ nsu: 1006, venda: "2025-07-23", repasse: "2025-09-22", bruto: 29104, parcela: 2, totalParcelas: 2, tipoCompra: "PARCELADO" }),
    L({ nsu: 1007, venda: "2025-07-09", repasse: "2025-07-10", bruto: 3000 }),
    L({ nsu: 1008, venda: "2025-07-11", repasse: "2025-07-14", bruto: 4000 }),
    L({ nsu: 1010, venda: "2025-07-17", repasse: "2025-07-18", bruto: 7000, dataCancelamento: "2025-07-18T12:00:00" }),
    L({ nsu: 1011, venda: "2025-07-17", repasse: "2025-07-18", bruto: 2500, dataCancelamento: "2025-07-17T15:00:00" }),
    L({ nsu: 1012, venda: "2025-07-17", repasse: "2025-07-18", bruto: 4500 }),
    L({ nsu: 1013, venda: "2025-07-21", repasse: "2025-08-20", bruto: 7000 }),
    L({ nsu: 1015, venda: "2025-07-21", repasse: "2025-08-20", bruto: 99900, codigoCliente: 9999 }),
    L({ nsu: 1016, venda: "2025-07-24", repasse: "2025-07-25", bruto: 1000 }),
    L({ nsu: 1016, venda: "2025-07-24", repasse: "2025-07-25", bruto: 1000 }),
    L({ nsu: 1017, venda: "2025-07-24", repasse: "2025-07-25", bruto: 1234, parcela: null }),
    { ...L({ nsu: 1020, venda: "2025-07-06", repasse: "2025-07-08", bruto: 3500 }), dataTransacao: "2025-07-06T23:55:00" },
    L({ nsu: 1021, venda: "2025-07-02", repasse: "2025-08-01", bruto: 15000, dataCancelamento: "2025-08-05T09:00:00" }),
    L({ nsu: 1022, venda: "2025-07-31", repasse: "2025-09-01", bruto: 30000, parcela: 1, totalParcelas: 2, tipoCompra: "PARCELADO" }),
    L({ nsu: 1022, venda: "2025-07-31", repasse: "2025-09-30", bruto: 30000, parcela: 2, totalParcelas: 2, tipoCompra: "PARCELADO" }),
  ],
  titulos: [
    R(1001, 1, 50, "2025-07-09", "2025-07-08"),
    R(1002, 1, 90, "2025-08-09", "2025-07-10"),
    R(1003, 1, 66.67, "2025-08-13", "2025-07-14"), R(1003, 2, "66.67", "2025-09-13", "2025-07-14"), R(1003, 3, 66.66, "2025-10-13", "2025-07-14"),
    R(1004, 1, 120, "2025-07-16", "2025-07-15"),
    R(1005, 1, 80, "2025-08-15", "2025-07-16"),
    R(1006, 1, 145.52, "2025-08-22", "2025-07-23"), R(1006, 2, "145.52", "2025-09-22", "2025-07-23"),
    R(1009, 1, 60, "2025-07-23", "2025-07-22"),
    R(1010, 1, 70, "2025-07-18", "2025-07-17"),
    R(1011, 1, 25, "2025-07-18", "2025-07-17", "cancelado"),
    R(1012, 1, 45, "2025-07-18", "2025-07-17", "cancelado"),
    R(1013, 1, 100, "2025-08-20", "2025-07-21"), EST(1013, "3000", 30, "2025-07-25"),
    R(1014, 1, 15, "2025-08-01", "2025-07-31"),
    R(1016, 1, 10, "2025-07-25", "2025-07-24"),
    R(1018, 1, 55, "2025-07-20", "2025-07-20"),
    R(1019, 1, 77, "2025-07-01", "2025-06-30"),
    R(1020, 1, 35, "2025-07-08", "2025-07-07"),
    R(1021, 1, 150, "2025-08-01", "2025-07-02", "baixado"), EST(1021, "total", 145.5, "2025-08-05"),
    R(1022, 1, 100, "2025-08-30", "2025-07-31"), R(1022, 2, 100, "2025-09-30", "2025-07-31"), R(1022, 3, 100, "2025-10-30", "2025-07-31"),
  ],
  eventos: [
    // O aviso da 1001, NO DIA DA VENDA, ATESTA uma venda em comum (o título a empresa também grava; o aviso, só a plataforma).
    EV(1001, { ocorrido_em: "2025-07-08T13:00:00Z" }),
    EV(1008, { situacao: "aguardando_ativacao", event_type: "Compra.TransacaoRealizada" }),
    EV(1018, { event_type: "Compra.PixTransferenciaRealizada" }),
  ],
  transacoes: [
    TR(1010, "Aprovada", 70, 70),
    TR(1011, "Desfeita", 25, 25),
    TR(1012, "Cancelada", 45, 45),
    TR(1013, "Reembolsada", 70, 100),
    TR(1021, "Cancelada", 150, 150),
  ],
});

/** F2 — nenhum NSU em comum: a numeração não está confirmada. */
const F2 = (): Entrada => base({
  de: "2025-07-30", ate: "2025-07-31",
  extrato: [
    L({ nsu: 136576350, venda: "2025-07-31", repasse: "2025-09-01", bruto: 900, codAutorizacao: "A1B2C3" }),
    L({ nsu: 136576351, venda: "2025-07-30", repasse: "2025-08-29", bruto: 2000, nsuLoja: "2121979" }),
    L({ nsu: 136576352, venda: "2025-07-30", repasse: "2025-08-29", bruto: 3000, codAutorizacao: "ZZZ999" }),
  ],
  titulos: [
    R(2121978, 1, 9, "2025-08-30", "2025-07-31"),
    R(2121979, 1, 20, "2025-08-29", "2025-07-30"),
    R(2121980, 1, 40, "2025-08-29", "2025-07-30"),
  ],
  eventos: [
    EV(2121978, { autorizacao: " a1b2c3 " }),
    EV(2121980, { autorizacao: "QQQ111" }),
  ],
});

/** F3 — a Pinbank devolveu a lista VAZIA; o sistema tem a venda 1009. */
const F3 = (): Entrada => base({ titulos: [R(1009, 1, 60, "2025-07-23", "2025-07-22")] });
/** F3c — o extrato só trouxe uma linha SEM parcela (ilegível) deste EC; o sistema tem a 1009. */
const F3c = (): Entrada => base({
  extrato: [L({ nsu: 3001, venda: "2025-07-21", repasse: "2025-08-20", bruto: 5000, parcela: null })],
  titulos: [R(1009, 1, 60, "2025-07-23", "2025-07-22")],
});
/** F3b — o extrato só trouxe parcela de OUTRO estabelecimento; o sistema tem a 1009. */
const F3b = (): Entrada => base({
  extrato: [L({ nsu: 1015, venda: "2025-07-21", repasse: "2025-08-20", bruto: 99900, codigoCliente: 9999 })],
  titulos: [R(1009, 1, 60, "2025-07-23", "2025-07-22")],
});

/** F4 — o extrato trouxe venda de FORA do período pedido. */
const F4 = (): Entrada => base({
  extrato: [
    L({ nsu: 4000, venda: "2025-07-10", repasse: "2025-07-11", bruto: 1000 }),
    L({ nsu: 4001, venda: "2025-08-03", repasse: "2025-08-04", bruto: 2000 }),
  ],
  titulos: [R(4000, 1, 10, "2025-07-11", "2025-07-10"), R(4002, 1, 30, "2025-07-16", "2025-07-15")],
});

/** F5 — a empresa tem DUAS maquininhas; esta é a v1. */
const F5 = (): Entrada => base({
  vinculosDaEmpresa: ["v1", "v2"],
  extrato: [L({ nsu: 5000, venda: "2025-07-05", repasse: "2025-07-07", bruto: 1000 })],
  titulos: [
    R(5000, 1, 10, "2025-07-07", "2025-07-05"),
    R(5001, 1, 11, "2025-07-11", "2025-07-10"),
    R(5002, 1, 12, "2025-07-12", "2025-07-11"),
    R(5003, 1, 13, "2025-07-14", "2025-07-12"),
  ],
  eventos: [EV(5001, { vinculo_id: "v1" }), EV(5002, { vinculo_id: "v2" })],
});

/** F6 — nada dos dois lados. */
const F6 = (): Entrada => base({});

/**
 * F8 — cancelada no EXTRATO e sem título no sistema (a venda desfeita na
 * maquininha), e a venda de 3x cancelada no sistema que o extrato lista pela
 * metade. 8000 é o par que confirma a numeração.
 */
const F8 = (): Entrada => base({
  extrato: [
    L({ nsu: 8000, venda: "2025-07-08", repasse: "2025-07-09", bruto: 1000, tipoCompra: "DEBITO" }),
    // 8001: desfeita na maquininha — a transação diz Desfeita e nenhum título nasceu
    L({ nsu: 8001, venda: "2025-07-10", repasse: "2025-08-11", bruto: 5000, dataCancelamento: "2025-07-10T10:05:00" }),
    // 8002: cancelada no extrato e o sistema não sabe de nada (nem aviso, nem transação)
    L({ nsu: 8002, venda: "2025-07-11", repasse: "2025-08-11", bruto: 6000, dataCancelamento: "2025-07-11T10:05:00" }),
    // 8003: 3x cancelada nos dois, e o extrato só traz a 1ª parcela
    L({ nsu: 8003, venda: "2025-07-14", repasse: "2025-08-13", bruto: 30000, parcela: 1, totalParcelas: 3, tipoCompra: "PARCELADO", dataCancelamento: "2025-07-15T09:00:00" }),
  ],
  titulos: [
    R(8000, 1, 10, "2025-07-09", "2025-07-08"),
    R(8003, 1, 100, "2025-08-13", "2025-07-14", "cancelado"),
    R(8003, 2, 100, "2025-09-13", "2025-07-14", "cancelado"),
    R(8003, 3, 100, "2025-10-13", "2025-07-14", "cancelado"),
  ],
  eventos: [EV(8001, { situacao: "processado", event_type: "Compra.TransacaoDesfeita" })],
  transacoes: [TR(8001, "Desfeita", 50, 50), TR(8003, "Cancelada", 300, 300)],
});

/**
 * F8b — a venda de 3x CANCELADA no sistema e o extrato só com a 1ª, VIVA (sem
 * data de cancelamento): p1 cancelada só no sistema; p2 e p3, que o extrato não
 * traz, sem conclusão (venda cancelada pode sair do extrato pela metade).
 */
const F8b = (): Entrada => base({
  extrato: [
    L({ nsu: 8000, venda: "2025-07-08", repasse: "2025-07-09", bruto: 1000, tipoCompra: "DEBITO" }),
    L({ nsu: 8004, venda: "2025-07-14", repasse: "2025-08-13", bruto: 30000, parcela: 1, totalParcelas: 3, tipoCompra: "PARCELADO" }),
  ],
  titulos: [
    R(8000, 1, 10, "2025-07-09", "2025-07-08"),
    R(8004, 1, 100, "2025-08-13", "2025-07-14", "cancelado"),
    R(8004, 2, 100, "2025-09-13", "2025-07-14", "cancelado"),
    R(8004, 3, 100, "2025-10-13", "2025-07-14", "cancelado"),
  ],
  transacoes: [TR(8004, "Cancelada", 300, 300)],
});

/** F9 — a 2ª parcela da venda 9001 veio numa linha SEM parcela (ilegível). */
const F9 = (): Entrada => base({
  extrato: [
    L({ nsu: 9001, venda: "2025-07-14", repasse: "2025-08-13", bruto: 20000, parcela: 1, totalParcelas: 2, tipoCompra: "PARCELADO" }),
    L({ nsu: 9001, venda: "2025-07-14", repasse: "2025-09-15", bruto: 20000, parcela: null, totalParcelas: 2, tipoCompra: "PARCELADO" }),
  ],
  titulos: [R(9001, 1, 100, "2025-08-13", "2025-07-14"), R(9001, 2, 100, "2025-09-13", "2025-07-14")],
});

/** F10 — estorno PARCIAL lançado no sistema, e a linha do extrato com data de cancelamento. */
const F10 = (): Entrada => base({
  extrato: [L({ nsu: 1100, venda: "2025-07-21", repasse: "2025-08-20", bruto: 7000, dataCancelamento: "2025-07-25T10:00:00" })],
  titulos: [R(1100, 1, 100, "2025-08-20", "2025-07-21"), EST(1100, "3000", 30, "2025-07-25")],
  transacoes: [TR(1100, "Reembolsada", 70, 100)],
});

/**
 * F11 — a empresa TROCOU de maquininha: o vínculo antigo foi excluído (a
 * leitura não o vê), e só o novo, de outro EC, está vivo.
 */
const F11 = (): Entrada => base({
  vinculo: { id: "vNovo", codigoCliente: EC, taxas: null }, vinculosDoEstabelecimento: ["vNovo"], vinculosDaEmpresa: ["vNovo"],
  extrato: [L({ nsu: 6000, venda: "2025-07-05", repasse: "2025-07-07", bruto: 1000 })],
  titulos: [
    R(6000, 1, 10, "2025-07-07", "2025-07-05"),
    R(6001, 1, 11, "2025-07-11", "2025-07-10"),
    R(6002, 1, 12, "2025-07-12", "2025-07-11"),
    R(6003, 1, 13, "2025-07-14", "2025-07-12"),
  ],
  eventos: [EV(6000, { vinculo_id: "vNovo" }), EV(6001, { vinculo_id: "vAntigo" }), EV(6002, { vinculo_id: "vNovo" })],
});

/** F12 — o estorno da venda foi CANCELADO: a venda volta a valer inteira. */
const F12 = (): Entrada => base({
  extrato: [
    L({ nsu: 1201, venda: "2025-07-02", repasse: "2025-08-01", bruto: 15000 }),
    L({ nsu: 1202, venda: "2025-07-02", repasse: "2025-08-01", bruto: 10000 }),
  ],
  titulos: [
    R(1201, 1, 150, "2025-08-01", "2025-07-02", "baixado"), { ...EST(1201, "total", 145.5, "2025-08-05"), situacao: "cancelado" },
    R(1202, 1, 100, "2025-08-01", "2025-07-02"), { ...EST(1202, "3000", 30, "2025-07-25"), situacao: "cancelado" },
  ],
  transacoes: [TR(1201, "Aprovada", 150, 150), TR(1202, "Aprovada", 100, 100)],
});

/**
 * FT — a TAXA (MDR) de cada parcela do extrato contra a cadastrada no vínculo
 * (débito 1,63% · crédito à vista 2,99% · parcelado não cadastrado). 0,0163 ×
 * 10000 dá 162,99999999999997 no ponto flutuante: é a armadilha do arredondamento.
 */
const TAXAS_FT = { debito: 0.0163, credito_vista: 0.0299, parcelado: null };
const FT = (): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: TAXAS_FT },
  extrato: [
    L({ nsu: 7001, venda: "2025-07-08", repasse: "2025-07-09", bruto: 1000, tipoCompra: "DEBITO", mdrBp: 163 }),
    L({ nsu: 7002, venda: "2025-07-08", repasse: "2025-07-09", bruto: 2000, tipoCompra: "Débito", mdrBp: 164 }),
    L({ nsu: 7003, venda: "2025-07-10", repasse: "2025-08-11", bruto: 3000, tipoCompra: "A VISTA", mdrBp: 265 }),
    L({ nsu: 7004, venda: "2025-07-14", repasse: "2025-08-13", bruto: 4000, tipoCompra: "Crédito parcelado", parcela: 1, totalParcelas: 2, mdrBp: 310 }),
    L({ nsu: 7004, venda: "2025-07-14", repasse: "2025-09-15", bruto: 4000, tipoCompra: "Crédito parcelado", parcela: 2, totalParcelas: 2, mdrBp: 310 }),
    L({ nsu: 7005, venda: "2025-07-15", repasse: "2025-08-14", bruto: 5000, tipoCompra: "VOUCHER", mdrBp: 265 }),
    L({ nsu: 7006, venda: "2025-07-16", repasse: "2025-08-15", bruto: 6000, tipoCompra: "A VISTA", mdrBp: null }),
    L({ nsu: 7007, venda: "2025-07-15", repasse: "2025-07-18", bruto: 7000, tipoCompra: "DEBITO", mdrBp: 350 }),
    L({ nsu: 7008, venda: "2025-07-17", repasse: "2025-08-18", bruto: 8000, tipoCompra: "A VISTA", mdrBp: 265 }),
  ],
  titulos: [
    // As parcelas com taxa cadastrada têm o título de taxa (o sistema lançou pelo contrato).
    R(7001, 1, 10, "2025-07-09", "2025-07-08"), T(7001, 1, 0.16, "2025-07-09", "2025-07-08"),
    R(7002, 1, 20, "2025-07-09", "2025-07-08"), T(7002, 1, 0.33, "2025-07-09", "2025-07-08"),
    R(7003, 1, 30, "2025-08-11", "2025-07-10"), T(7003, 1, 0.9, "2025-08-11", "2025-07-10"),
    R(7004, 1, 20, "2025-08-13", "2025-07-14"), R(7004, 2, 20, "2025-09-15", "2025-07-14"),
    R(7005, 1, 50, "2025-08-14", "2025-07-15"),
    R(7006, 1, 60, "2025-08-15", "2025-07-16"),
    R(7007, 1, 70, "2025-07-16", "2025-07-15"), T(7007, 1, 1.14, "2025-07-16", "2025-07-15"),
  ],
});

/**
 * F13 — a Pinbank CANCELOU a venda 20001 (3x) e o extrato só traz a 1ª parcela,
 * com a data de cancelamento; no sistema as três seguem vivas e a transação diz
 * Aprovada. A divergência é afirmada na parcela que o extrato traz; as outras
 * duas são da mesma venda cancelada — nunca "só no sistema".
 */
const F13 = (): Entrada => base({
  extrato: [
    L({ nsu: 20001, venda: "2025-07-14", repasse: "2025-08-13", bruto: 30000, parcela: 1, totalParcelas: 3, tipoCompra: "PARCELADO", dataCancelamento: "2025-07-15T09:00:00" }),
    L({ nsu: 20002, venda: "2025-07-09", repasse: "2025-07-10", bruto: 5000, tipoCompra: "DEBITO" }),
  ],
  titulos: [
    R(20001, 1, 100, "2025-08-13", "2025-07-14"), R(20001, 2, 100, "2025-09-13", "2025-07-14"), R(20001, 3, 100, "2025-10-13", "2025-07-14"),
    R(20002, 1, 50, "2025-07-10", "2025-07-09"),
  ],
  transacoes: [TR(20001, "Aprovada", 300, 300)],
});

/**
 * F14 — dois títulos de receita para a MESMA parcela (a chave repetida) e UM
 * título de taxa de R$ 2,65: a taxa lançada pelo sistema é R$ 2,65, um título.
 */
const F14 = (): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: { credito_vista: 0.0265 } },
  extrato: [L({ nsu: 7001, venda: "2025-07-08", repasse: "2025-08-07", bruto: 10000, mdrBp: 265 })],
  titulos: [
    R(7001, 1, 100, "2025-08-07", "2025-07-08"), { ...R(7001, 1, 100, "2025-08-07", "2025-07-08"), id: "r-7001-1-b" },
    T(7001, 1, 2.65, "2025-08-07", "2025-07-08"),
  ],
});

/**
 * F15 — a venda 3001 foi DESFEITA no sistema (o aviso chegou e foi processado,
 * a transação diz Desfeita, nenhum título nasceu) e o extrato a mostra VIVA:
 * cancelada só no sistema — nunca "só no extrato · o aviso chegou sem lançar".
 */
const F15 = (): Entrada => base({
  extrato: [
    L({ nsu: 3001, venda: "2025-07-08", repasse: "2025-07-09", bruto: 5000, tipoCompra: "DEBITO" }),
    L({ nsu: 3002, venda: "2025-07-09", repasse: "2025-07-10", bruto: 5000, tipoCompra: "DEBITO" }),
  ],
  titulos: [R(3002, 1, 50, "2025-07-10", "2025-07-09")],
  eventos: [EV(3001, { event_type: "Compra.TransacaoDesfeita" }), EV(3002)],
  transacoes: [TR(3001, "Desfeita", 50, 50)],
});

/**
 * FG — uma linha do extrato SEM o número da venda em 10/07: pode ser qualquer
 * venda daquele dia. A 26001 (só no sistema, 10/07) e a 2ª parcela da 26004
 * (vendida em 10/07, só a 1ª no extrato) ficam sem conclusão; a 26005, de
 * 15/07, segue afirmada como ausente — a regra é o DIA, não o período.
 */
const FG = (): Entrada => base({
  extrato: [
    L({ nsu: null, venda: "2025-07-10", repasse: "2025-08-11", bruto: 1000 }),
    L({ nsu: 26002, venda: "2025-07-11", repasse: "2025-08-11", bruto: 1000 }),
    L({ nsu: 26004, venda: "2025-07-10", repasse: "2025-08-11", bruto: 2000, parcela: 1, totalParcelas: 2, tipoCompra: "PARCELADO" }),
  ],
  titulos: [
    R(26001, 1, 10, "2025-08-11", "2025-07-10"),
    R(26002, 1, 10, "2025-08-11", "2025-07-11"),
    R(26004, 1, 10, "2025-08-11", "2025-07-10"), R(26004, 2, 10, "2025-09-10", "2025-07-10"),
    R(26005, 1, 10, "2025-08-14", "2025-07-15"),
  ],
});

/**
 * FT2 — a TAXA da venda cancelada não é comparada: o extrato zera o MDR da
 * linha cancelada (convenção plausível da adquirente) e o débito cadastrado é
 * 1,63%. 1001 cancelada nos dois; 2001 desfeita antes de virar título; 1002
 * viva e igual, com o título de taxa.
 */
const FT2 = (): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: { debito: 0.0163 } },
  extrato: [
    L({ nsu: 1001, venda: "2025-07-08", repasse: "2025-07-09", bruto: 5000, tipoCompra: "DEBITO", dataCancelamento: "2025-07-08T12:00:00", mdrBp: 0 }),
    L({ nsu: 2001, venda: "2025-07-08", repasse: "2025-07-09", bruto: 5000, tipoCompra: "DEBITO", dataCancelamento: "2025-07-08T12:00:00", mdrBp: 0 }),
    L({ nsu: 1002, venda: "2025-07-09", repasse: "2025-07-10", bruto: 5000, tipoCompra: "DEBITO", mdrBp: 163 }),
  ],
  titulos: [
    R(1001, 1, 50, "2025-07-09", "2025-07-08", "cancelado"),
    R(1002, 1, 50, "2025-07-10", "2025-07-09"), T(1002, 1, 0.82, "2025-07-10", "2025-07-09"),
  ],
  eventos: [EV(2001, { event_type: "Compra.TransacaoDesfeita" })],
  transacoes: [TR(1001, "Cancelada", 50, 50), TR(2001, "Desfeita", 50, 50)],
});

/**
 * FT3 — "PARCELADO" em 1x é CRÉDITO À VISTA (a mesma escolha do planejador ao
 * lançar a taxa): 2,65% cadastrado à vista é IGUAL, mesmo com 3,10% para
 * parcelado. A 4002, em 2x, é parcelado de verdade.
 */
const FT3 = (): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: { credito_vista: 0.0265, parcelado: 0.031 } },
  extrato: [
    L({ nsu: 4001, venda: "2025-07-08", repasse: "2025-08-07", bruto: 10000, tipoCompra: "PARCELADO LOJA", parcela: 1, totalParcelas: 1, mdrBp: 265 }),
    L({ nsu: 4002, venda: "2025-07-09", repasse: "2025-08-08", bruto: 10000, tipoCompra: "PARCELADO", parcela: 1, totalParcelas: 2, mdrBp: 310 }),
    L({ nsu: 4002, venda: "2025-07-09", repasse: "2025-09-08", bruto: 10000, tipoCompra: "PARCELADO", parcela: 2, totalParcelas: 2, mdrBp: 310 }),
  ],
  titulos: [
    R(4001, 1, 100, "2025-08-07", "2025-07-08"), T(4001, 1, 2.65, "2025-08-07", "2025-07-08"),
    R(4002, 1, 50, "2025-08-08", "2025-07-09"), T(4002, 1, 1.55, "2025-08-08", "2025-07-09"),
    R(4002, 2, 50, "2025-09-08", "2025-07-09"), T(4002, 2, 1.55, "2025-09-08", "2025-07-09"),
  ],
});

/**
 * FB — o extrato cobrou 2,65% (igual ao cadastrado) e o sistema NÃO lançou o
 * título de taxa da 21001 (a taxa estava em branco quando a venda entrou): o
 * MDR falta no resultado. A 21002 tem o título; a 21003 é débito, que não tem
 * taxa cadastrada — "taxa não cadastrada" já diz por que não há título.
 */
const FB = (): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: { credito_vista: 0.0265 } },
  extrato: [
    L({ nsu: 21001, venda: "2025-07-10", repasse: "2025-08-11", bruto: 10000, mdrBp: 265 }),
    L({ nsu: 21002, venda: "2025-07-10", repasse: "2025-08-11", bruto: 10000, mdrBp: 265 }),
    L({ nsu: 21003, venda: "2025-07-10", repasse: "2025-07-11", bruto: 10000, tipoCompra: "DEBITO", mdrBp: 149 }),
  ],
  titulos: [
    R(21001, 1, 100, "2025-08-11", "2025-07-10"),
    R(21002, 1, 100, "2025-08-11", "2025-07-10"), T(21002, 1, 2.65, "2025-08-11", "2025-07-10"),
    R(21003, 1, 100, "2025-07-11", "2025-07-10"),
  ],
});

/** Uma linha do extrato de um EC DIGITADO ERRADO: a loja é de outro lojista, o número é o deste vínculo. */
const LINHA_EC_ERRADO = (nsu: number, venda: string, repasse: string, bruto: number, tipoCompra: string): LinhaExtratoPos =>
  ({ ...L({ nsu, venda, repasse, bruto, tipoCompra }), bandeira: "ELO" });
const FX_EC_ERRADO = (): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: { debito: 0.0199 } },
  extrato: [LINHA_EC_ERRADO(987650001, "2025-07-12", "2025-07-14", 73519, "DEBITO"), LINHA_EC_ERRADO(987650002, "2025-07-19", "2025-08-18", 41287, "A VISTA")],
});

/** Uma data AAAA-MM-DD com k meses a mais (fatiada, sem `Date`). */
const somaMesStr = (d: string, k: number) => {
  const [a, m, dd] = d.split("-").map(Number);
  const t = a * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
};

/**
 * FV — a MESMA venda dividida em números de parcelas DIFERENTES: a 22001 é 1x
 * de R$ 300 no extrato e 3x de R$ 100 no sistema (o total confere); a 22002 é
 * 1x de R$ 310 no extrato e 3x de R$ 100 no sistema (o total não confere). A p1
 * tem par (valor diferente, com o sinal); a p2 e a p3 ficam SEM CONCLUSÃO —
 * nunca "só no sistema": o valor delas pode estar na parcela única do extrato.
 */
const FV = (): Entrada => base({
  extrato: [
    L({ nsu: 22001, venda: "2025-07-10", repasse: "2025-08-11", bruto: 30000 }),
    L({ nsu: 22002, venda: "2025-07-10", repasse: "2025-08-11", bruto: 31000 }),
  ],
  titulos: [
    R(22001, 1, 100, "2025-08-11", "2025-07-10"), R(22001, 2, 100, "2025-09-10", "2025-07-10"), R(22001, 3, 100, "2025-10-10", "2025-07-10"),
    R(22002, 1, 100, "2025-08-11", "2025-07-10"), R(22002, 2, 100, "2025-09-10", "2025-07-10"), R(22002, 3, 100, "2025-10-10", "2025-07-10"),
  ],
});

/**
 * FL — o espelho: a venda 23001 é 12x no extrato e 10x no sistema (R$ 1.000
 * dos dois lados). p1..p10 têm par (valor diferente); a p11 e a p12 do extrato
 * ficam SEM CONCLUSÃO — nunca "só no extrato": o sistema tem os R$ 1.000.
 */
const FL = (): Entrada => base({
  extrato: Array.from({ length: 12 }, (_, i) =>
    L({ nsu: 23001, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", i), bruto: 100000, parcela: i + 1, totalParcelas: 12, tipoCompra: "PARCELADO" })),
  titulos: Array.from({ length: 10 }, (_, i) => R(23001, i + 1, 100, somaMesStr("2025-08-11", i), "2025-07-10")),
});

/**
 * FBORDA — com o MESMO número de parcelas nos dois lados (3x), a parcela que o
 * extrato não traz é afirmada "só no sistema" MESMO no último dia do período:
 * a venda está no extrato, só falta a parcela.
 */
const FBORDA = (): Entrada => base({
  extrato: [
    L({ nsu: 24501, venda: "2025-07-31", repasse: "2025-09-01", bruto: 30000, parcela: 1, totalParcelas: 3, tipoCompra: "PARCELADO" }),
    L({ nsu: 24501, venda: "2025-07-31", repasse: "2025-09-30", bruto: 30000, parcela: 2, totalParcelas: 3, tipoCompra: "PARCELADO" }),
  ],
  titulos: [R(24501, 1, 100, "2025-09-01", "2025-07-31"), R(24501, 2, 100, "2025-09-30", "2025-07-31"), R(24501, 3, 100, "2025-10-30", "2025-07-31")],
});

/**
 * FTOL — a tolerância é ESTRITA e contra a taxa contratada EXATA: débito 1,63%
 * (0,0163 × 10000 = 162,99999999999997 no ponto flutuante) e o extrato 1,62%:
 * diferente; crédito à vista 1,99% e o extrato 2,00% (0,01 ponto percentual a
 * mais num contrato de duas casas): diferente; parcelado 1,995% (mais casas
 * que o extrato) e o extrato 1,99% ou 2,00%: igual.
 */
const FTOL = (): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: { debito: 0.0163, credito_vista: 0.0199, parcelado: 0.01995 } },
  extrato: [
    L({ nsu: 9101, venda: "2025-07-08", repasse: "2025-07-09", bruto: 1000, tipoCompra: "DEBITO", mdrBp: 162 }),
    L({ nsu: 9102, venda: "2025-07-10", repasse: "2025-08-11", bruto: 1000, tipoCompra: "A VISTA", mdrBp: 200 }),
    L({ nsu: 9103, venda: "2025-07-14", repasse: "2025-08-13", bruto: 2000, tipoCompra: "PARCELADO", parcela: 1, totalParcelas: 2, mdrBp: 199 }),
    L({ nsu: 9103, venda: "2025-07-14", repasse: "2025-09-15", bruto: 2000, tipoCompra: "PARCELADO", parcela: 2, totalParcelas: 2, mdrBp: 199 }),
    L({ nsu: 9104, venda: "2025-07-14", repasse: "2025-08-13", bruto: 2000, tipoCompra: "PARCELADO", parcela: 1, totalParcelas: 2, mdrBp: 200 }),
    L({ nsu: 9104, venda: "2025-07-14", repasse: "2025-09-15", bruto: 2000, tipoCompra: "PARCELADO", parcela: 2, totalParcelas: 2, mdrBp: 200 }),
  ],
  titulos: [
    R(9101, 1, 10, "2025-07-09", "2025-07-08"), T(9101, 1, 0.16, "2025-07-09", "2025-07-08"),
    R(9102, 1, 10, "2025-08-11", "2025-07-10"), T(9102, 1, 0.2, "2025-08-11", "2025-07-10"),
    R(9103, 1, 10, "2025-08-13", "2025-07-14"), T(9103, 1, 0.2, "2025-08-13", "2025-07-14"),
    R(9103, 2, 10, "2025-09-15", "2025-07-14"), T(9103, 2, 0.2, "2025-09-15", "2025-07-14"),
    R(9104, 1, 10, "2025-08-13", "2025-07-14"), T(9104, 1, 0.2, "2025-08-13", "2025-07-14"),
    R(9104, 2, 10, "2025-09-15", "2025-07-14"), T(9104, 2, 0.2, "2025-09-15", "2025-07-14"),
  ],
});

/** FT4 — o estorno PARCIAL com a linha cancelada (F10) e a taxa de crédito à vista CADASTRADA (1,99% × 2,65% no extrato). */
const FT4 = (): Entrada => ({ ...F10(), vinculo: { id: "v1", codigoCliente: EC, taxas: { credito_vista: 0.0199 } } });

/**
 * FBZ — a regra do sistema: débito de R$ 0,30 a 1,63% (a taxa arredonda para
 * zero, NÃO há título a lançar) e R$ 10 em 12x a 3,10% — R$ 0,31 repartidos SEM
 * parte negativa (`dividirCusto`: 11 × R$ 0,02 + R$ 0,09; a divisão de antes
 * dava 11 × R$ 0,03 e uma 12ª de −R$ 0,02, que o planejador descartava, e a
 * taxa lançada passava da contratada). Nenhuma parcela é acusada de "taxa sem
 * título".
 */
const FBZ = (): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: { debito: 0.0163, parcelado: 0.031 } },
  extrato: [
    L({ nsu: 25001, venda: "2025-07-08", repasse: "2025-07-09", bruto: 30, tipoCompra: "DEBITO", mdrBp: 163 }),
    ...Array.from({ length: 12 }, (_, i) =>
      L({ nsu: 25002, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", i), bruto: 1000, parcela: i + 1, totalParcelas: 12, tipoCompra: "PARCELADO", mdrBp: 310 })),
  ],
  titulos: [
    R(25001, 1, 0.3, "2025-07-09", "2025-07-08"),
    ...Array.from({ length: 12 }, (_, i) => R(25002, i + 1, i === 11 ? 0.87 : 0.83, somaMesStr("2025-08-11", i), "2025-07-10")),
    ...Array.from({ length: 12 }, (_, i) => T(25002, i + 1, i === 11 ? 0.09 : 0.02, somaMesStr("2025-08-11", i), "2025-07-10")),
  ],
});

/**
 * FBZ2 — a MESMA venda com o título de taxa da 12ª parcela PERDIDO: a regra do
 * sistema lançaria R$ 0,09 nela, e o MDR falta no resultado. É a 12ª que se
 * acusa — e só ela. Com o estimador na divisão de antes (a 12ª parte negativa),
 * o título perdido passaria calado.
 */
const FBZ2 = (): Entrada => ({ ...FBZ(), titulos: FBZ().titulos.filter((t) => t.chave !== "pinbank:25002:12:t") });

/**
 * LIQ12 — o líquido de um 12x com a folga de 1 centavo POR PARCELA: R$ 10 a
 * 3,10% (o sistema lança 1000 − 31 = 969 centavos). Se a Pinbank arredondar
 * parcela a parcela, cada uma pode desviar meio centavo: 12 centavos ainda é a
 * folga do 12x; 13 já é diferente.
 */
const LIQ12 = (desvio: number): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: { parcelado: 0.031 } },
  extrato: Array.from({ length: 12 }, (_, i) =>
    L({ nsu: 42001, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", i), bruto: 1000, parcela: i + 1, totalParcelas: 12,
        tipoCompra: "PARCELADO", mdrBp: 310, liquidoRepasseCentavos: i < 11 ? 80 : 969 - 880 - desvio })),
  titulos: [
    ...Array.from({ length: 12 }, (_, i) => R(42001, i + 1, i === 11 ? 0.87 : 0.83, somaMesStr("2025-08-11", i), "2025-07-10")),
    ...Array.from({ length: 12 }, (_, i) => T(42001, i + 1, i === 11 ? 0.09 : 0.02, somaMesStr("2025-08-11", i), "2025-07-10")),
  ],
});

/**
 * FVIVOS — o lado do sistema conta só as parcelas VÁLIDAS: a 30001 (título
 * cancelado), a 30002 (estorno total vivo e a transação Cancelada) e a 1ª
 * parcela da 30004 (cancelada sozinha) ficam fora; a 30003 (R$ 50) e a 2ª
 * parcela da 30004 (R$ 40) contam.
 */
const FVIVOS = (): Entrada => base({
  extrato: [L({ nsu: 30003, venda: "2025-07-12", repasse: "2025-07-14", bruto: 5000, tipoCompra: "DEBITO" })],
  titulos: [
    R(30001, 1, 100, "2025-08-11", "2025-07-10", "cancelado"),
    R(30002, 1, 200, "2025-08-11", "2025-07-10"), EST(30002, "total", 200, "2025-07-11"),
    R(30003, 1, 50, "2025-07-14", "2025-07-12"),
    R(30004, 1, 40, "2025-08-15", "2025-07-15", "cancelado"), R(30004, 2, 40, "2025-09-15", "2025-07-15"),
  ],
  transacoes: [TR(30002, "Cancelada", 200, 200)],
});

/**
 * FP — a maquininha foi TROCADA e o período é anterior à troca: os avisos das
 * vendas 24001 e 24002 vieram, no dia delas, da maquininha antiga (`v0`, que
 * não está mais viva); o vínculo conferido é o novo (`v1`), com o mesmo EC. Os
 * títulos casam, mas nenhum aviso deste estabelecimento atesta.
 */
const FP = (avisosDe = "v0", dia1 = "2025-07-08T13:00:00Z", dia2 = "2025-07-09T13:00:00Z", comTitulos = true): Entrada => base({
  extrato: [
    L({ nsu: 24001, venda: "2025-07-08", repasse: "2025-07-09", bruto: 5000, tipoCompra: "DEBITO" }),
    L({ nsu: 24002, venda: "2025-07-09", repasse: "2025-07-10", bruto: 6000, tipoCompra: "DEBITO" }),
  ],
  titulos: comTitulos ? [R(24001, 1, 50, "2025-07-09", "2025-07-08"), R(24002, 1, 60, "2025-07-10", "2025-07-09")] : [],
  eventos: [EV(24001, { vinculo_id: avisosDe, ocorrido_em: dia1 }), EV(24002, { vinculo_id: avisosDe, ocorrido_em: dia2 })],
});

/**
 * FTOT — o TOTAL da venda diferente com números de parcelas diferentes (a
 * quarta revisão). (a) 31001: 3x de R$ 300 no extrato e só a p1 e a p2 de
 * R$ 100 no sistema — o título da ÚLTIMA parcela sumiu, e a venda parece
 * "dividida em 2" no sistema; as duas com par batem uma a uma. (b) 31002: 2x
 * de R$ 200 no extrato e 3x de R$ 100 no sistema — o sistema lançou R$ 100 que
 * a Pinbank não vai pagar; as duas com par batem. (c) 31003: a venda
 * REDIVIDIDA de verdade, com o MESMO total (2x de R$ 300 no extrato, 3x de
 * R$ 100 no sistema) — divergente só nas parcelas com par, pelo valor, nunca
 * pelo total. (d) 31004: só a p2 de R$ 100 no sistema de uma venda de 3x de
 * R$ 300 (a p1 e a p3 sumiram) — a lacuna na numeração do próprio sistema não
 * esconde o total.
 */
const FTOT = (): Entrada => base({
  extrato: [
    ...[1, 2, 3].map((k) => L({ nsu: 31001, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", k - 1), bruto: 30000, parcela: k, totalParcelas: 3, tipoCompra: "PARCELADO" })),
    ...[1, 2].map((k) => L({ nsu: 31002, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", k - 1), bruto: 20000, parcela: k, totalParcelas: 2, tipoCompra: "PARCELADO" })),
    ...[1, 2].map((k) => L({ nsu: 31003, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", k - 1), bruto: 30000, parcela: k, totalParcelas: 2, tipoCompra: "PARCELADO" })),
    ...[1, 2, 3].map((k) => L({ nsu: 31004, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", k - 1), bruto: 30000, parcela: k, totalParcelas: 3, tipoCompra: "PARCELADO" })),
  ],
  titulos: [
    ...[1, 2].map((k) => R(31001, k, 100, somaMesStr("2025-08-11", k - 1), "2025-07-10")),
    ...[1, 2, 3].map((k) => R(31002, k, 100, somaMesStr("2025-08-11", k - 1), "2025-07-10")),
    ...[1, 2, 3].map((k) => R(31003, k, 100, somaMesStr("2025-08-11", k - 1), "2025-07-10")),
    R(31004, 2, 100, "2025-09-11", "2025-07-10"),
  ],
});

/**
 * FDISC — as linhas do extrato DISCORDAM no número de parcelas (a p1 diz 2x, a
 * p2 diz 3x) e o sistema tem a p1 e a p3 (3x): a linha p2 sem par e o título
 * p3 sem par dizem que as linhas não concordam — nunca "o extrato divide em 3
 * e o sistema em 3" (o `n` de uma linha não é o da venda).
 */
const FDISC = (): Entrada => base({
  extrato: [
    L({ nsu: 6201, venda: "2025-07-10", repasse: "2025-08-11", bruto: 30000, parcela: 1, totalParcelas: 2, tipoCompra: "PARCELADO" }),
    L({ nsu: 6201, venda: "2025-07-10", repasse: "2025-09-11", bruto: 30000, parcela: 2, totalParcelas: 3, tipoCompra: "PARCELADO" }),
  ],
  titulos: [R(6201, 1, 100, "2025-08-11", "2025-07-10"), R(6201, 3, 100, "2025-10-11", "2025-07-10")],
});

/**
 * FSEMEC — a linha SEM o código do estabelecimento (a quinta revisão, a varredura
 * aleatória). Ela nunca entra num item (pode ser de outra loja), mas o dinheiro
 * pode estar nela: (a) 5001, a venda inteira só numa linha sem código; (b) 5002,
 * a p1 de 2x numa linha sem código e a p2 normal; (c) 5003, o controle — sem
 * linha nenhuma, a venda segue "só no sistema" (a linha sem código COM número
 * não protege outra venda). A 9001 é a venda em comum.
 */
const FSEMEC = (): Entrada => base({
  extrato: [
    L({ nsu: 9001, venda: "2025-07-10", repasse: "2025-07-11", bruto: 10000 }),
    L({ nsu: 5001, venda: "2025-07-10", repasse: "2025-08-11", bruto: 20000, codigoCliente: null }),
    L({ nsu: 5002, venda: "2025-07-10", repasse: "2025-08-11", bruto: 40000, parcela: 1, totalParcelas: 2, tipoCompra: "PARCELADO", codigoCliente: null }),
    L({ nsu: 5002, venda: "2025-07-10", repasse: "2025-09-11", bruto: 40000, parcela: 2, totalParcelas: 2, tipoCompra: "PARCELADO" }),
  ],
  titulos: [
    R(9001, 1, 100, "2025-07-11", "2025-07-10"),
    R(5001, 1, 200, "2025-08-11", "2025-07-10"),
    R(5002, 1, 200, "2025-08-11", "2025-07-10"), R(5002, 2, 200, "2025-09-11", "2025-07-10"),
    R(5003, 1, 300, "2025-08-14", "2025-07-14"),
  ],
});

/**
 * FVIZ — a linha ilegível SEM número no dia VIZINHO (a venda perto da meia-noite):
 * a 7001 (competência 10/07, a linha de 11/07) não é dada como ausente; a 7002
 * (14/07, três dias depois) é o controle e segue "só no sistema".
 */
const FVIZ = (): Entrada => base({
  extrato: [
    L({ nsu: 9001, venda: "2025-07-10", repasse: "2025-07-11", bruto: 10000 }),
    L({ nsu: null, venda: "2025-07-11", repasse: "2025-08-11", bruto: 20000 }),
  ],
  titulos: [
    R(9001, 1, 100, "2025-07-11", "2025-07-10"),
    R(7001, 1, 200, "2025-08-11", "2025-07-10"),
    R(7002, 1, 300, "2025-08-14", "2025-07-14"),
  ],
});

/**
 * FLAC — o MESMO número de parcelas e uma parcela que falta NOS DOIS lados.
 * (a) 32001: 3x de R$ 300, a p1 sem linha e sem título — a p2 e a p3 conferem,
 * e o total diferente as leva à vista de divergências. (b) 32002: o controle
 * inteiro — nenhum sinal de total. (c) 32003: a p1 só no sistema — ela já é a
 * divergência, e as que conferem NÃO ganham o sinal do total. (d) 32004: a p3
 * com valor diferente — a divergência é dela; a p1 e a p2 NÃO ganham o sinal do
 * total (o total diferente ali é a própria p3, já afirmada).
 */
const FLAC = (): Entrada => base({
  extrato: [
    ...[2, 3].map((k) => L({ nsu: 32001, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", k - 1), bruto: 30000, parcela: k, totalParcelas: 3, tipoCompra: "PARCELADO" })),
    ...[1, 2, 3].map((k) => L({ nsu: 32002, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", k - 1), bruto: 30000, parcela: k, totalParcelas: 3, tipoCompra: "PARCELADO" })),
    ...[2, 3].map((k) => L({ nsu: 32003, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", k - 1), bruto: 30000, parcela: k, totalParcelas: 3, tipoCompra: "PARCELADO" })),
    ...[1, 2, 3].map((k) => L({ nsu: 32004, venda: "2025-07-10", repasse: somaMesStr("2025-08-11", k - 1), bruto: 30000, parcela: k, totalParcelas: 3, tipoCompra: "PARCELADO" })),
  ],
  titulos: [
    ...[2, 3].map((k) => R(32001, k, 100, somaMesStr("2025-08-11", k - 1), "2025-07-10")),
    ...[1, 2, 3].map((k) => R(32002, k, 100, somaMesStr("2025-08-11", k - 1), "2025-07-10")),
    ...[1, 2, 3].map((k) => R(32003, k, 100, somaMesStr("2025-08-11", k - 1), "2025-07-10")),
    ...[1, 2, 3].map((k) => R(32004, k, k === 3 ? 150 : 100, somaMesStr("2025-08-11", k - 1), "2025-07-10")),
  ],
});

/**
 * FIRMA — o estabelecimento com OUTRA maquininha viva da empresa (`v1b`), cada
 * uma com as suas taxas. Conferindo a `v1` (crédito à vista 2,99%): a 33001
 * (aviso da `v1b`, cobrada a 2,50%) e a 33003 (sem aviso) não são comparadas;
 * a 33002 (aviso da `v1`, 2,99%) é. O controle sem a irmã acusa a 33001.
 */
const FIRMA = (irma = true): Entrada => base({
  vinculo: { id: "v1", codigoCliente: EC, taxas: { credito_vista: 0.0299 } },
  vinculosDoEstabelecimento: irma ? ["v1", "v1b"] : ["v1"], vinculosDaEmpresa: irma ? ["v1", "v1b"] : ["v1"],
  extrato: [
    L({ nsu: 33001, venda: "2025-07-10", repasse: "2025-08-11", bruto: 10000, mdrBp: 250 }),
    L({ nsu: 33002, venda: "2025-07-10", repasse: "2025-08-11", bruto: 10000, mdrBp: 299 }),
    L({ nsu: 33003, venda: "2025-07-10", repasse: "2025-08-11", bruto: 10000, mdrBp: 250 }),
  ],
  titulos: [33001, 33002, 33003].map((n) => R(n, 1, 100, "2025-08-11", "2025-07-10")),
  eventos: irma ? [EV(33001, { vinculo_id: "v1b" }), EV(33002, { vinculo_id: "v1" })] : [EV(33001), EV(33002)],
});

/**
 * FREAL — o extrato de PRODUÇÃO de 14/10/2026: três vendas de R$ 9,99 numa
 * maquininha com o repasse ANTECIPADO (débito, crédito à vista e 2x). O
 * estabelecimento e as vendas estão RENUMERADOS (o repositório é público); os
 * valores, as taxas, os tipos e as datas são os do extrato, verbatim — o bruto
 * e o split da parcela já sem a tarifa (899; 449 + 450), o líquido (891, 869,
 * 428 + 428), o MDR (0,88%, 1,81%, 2,46%) e a antecipação ao mês (zero no
 * débito, 1,55% no crédito). Os títulos do sistema são os que o planejador
 * lança com esse contrato (tarifa de R$ 1,00 e antecipação de 1,55% ao mês),
 * escritos À MÃO — nunca gerados por função nenhuma.
 */
const LINHA_REAL = (nsu: number, tipoCompra: string, k: number, n: number, brutoParcela: number, liquido: number | null, mdrBp: number, taxaMesBp: number): LinhaExtratoPos => ({
  nsu, codigoCliente: EC, terminal: null, bandeira: "MASTERCARD", tipoCompra, parcela: k, totalParcelas: n,
  dataTransacao: "2026-10-14T17:49:48.332", dataFuturaPagamento: "2026-10-15T17:49:48.332", dataCancelamento: null,
  brutoCentavos: 999, brutoParcelaCentavos: brutoParcela, liquidoRepasseCentavos: liquido, splitCentavos: brutoParcela,
  mdrBp, taxaMesBp, status: "TRANS. APROVADO", statusPagamento: "Pendente", codAutorizacao: null, nsuLoja: null,
});
const EXTRATO_REAL = (): LinhaExtratoPos[] => [
  LINHA_REAL(41001, "DEBITO", 1, 1, 899, 891, 88, 0),
  LINHA_REAL(41002, "A VISTA", 1, 1, 899, 869, 181, 155),
  LINHA_REAL(41003, "PARCELADO SEM JUROS", 2, 2, 450, 428, 246, 155),
  LINHA_REAL(41003, "PARCELADO SEM JUROS", 1, 2, 449, 428, 246, 155),
];
const VENC_REAL = "2026-10-15";
const COMP_REAL = "2026-10-14";
/** A tarifa fixa (`:f`) e a antecipação (`:a`) da parcela, como o planejador as lança. */
const TF = (nsu: number, k: number, amount: number, situacao = "previsto"): Mov => ({
  id: `f-${nsu}-${k}`, chave: `pinbank:${nsu}:${k}:f`, nsu: String(nsu), type: "saida", amount, due_date: VENC_REAL, competence_date: COMP_REAL, situacao,
});
const TA = (nsu: number, k: number, amount: number, situacao = "previsto"): Mov => ({
  id: `a-${nsu}-${k}`, chave: `pinbank:${nsu}:${k}:a`, nsu: String(nsu), type: "saida", amount, due_date: VENC_REAL, competence_date: COMP_REAL, situacao,
});
const TITULOS_REAIS = (): Mov[] => [
  R(41001, 1, 9.99, VENC_REAL, COMP_REAL), T(41001, 1, 0.08, VENC_REAL, COMP_REAL), TF(41001, 1, 1),
  R(41002, 1, 9.99, VENC_REAL, COMP_REAL), T(41002, 1, 0.16, VENC_REAL, COMP_REAL), TF(41002, 1, 1), TA(41002, 1, 0.14),
  R(41003, 1, 5, VENC_REAL, COMP_REAL), T(41003, 1, 0.11, VENC_REAL, COMP_REAL), TF(41003, 1, 0.5), TA(41003, 1, 0.11),
  R(41003, 2, 4.99, VENC_REAL, COMP_REAL), T(41003, 2, 0.11, VENC_REAL, COMP_REAL), TF(41003, 2, 0.5), TA(41003, 2, 0.1),
];
/** Os títulos como o sistema os lançava ANTES da tarifa e da antecipação: só receita e taxa, a taxa sobre o total. */
const TITULOS_ANTIGOS = (): Mov[] => [
  R(41001, 1, 9.99, VENC_REAL, COMP_REAL), T(41001, 1, 0.09, VENC_REAL, COMP_REAL),
  R(41002, 1, 9.99, VENC_REAL, COMP_REAL), T(41002, 1, 0.18, VENC_REAL, COMP_REAL),
  R(41003, 1, 5, VENC_REAL, COMP_REAL), T(41003, 1, 0.13, VENC_REAL, COMP_REAL),
  R(41003, 2, 4.99, VENC_REAL, COMP_REAL), T(41003, 2, 0.12, VENC_REAL, COMP_REAL),
];
const CONTRATO_REAL = { debito: 0.0088, credito_vista: 0.0181, parcelado: 0.0246, tarifa_fixa: 1, antecipacao_mes: 0.0155 };
const FREAL = (o: Partial<Entrada> = {}): Entrada => base({
  de: "2026-10-01", ate: "2026-10-14", hoje: "2026-10-15",
  vinculo: { id: "v1", codigoCliente: EC, taxas: CONTRATO_REAL, antecipado: true },
  extrato: EXTRATO_REAL(), titulos: TITULOS_REAIS(),
  eventos: [41001, 41002, 41003].map((n) => EV(n, { ocorrido_em: "2026-10-14T17:00:00Z" })),
  ...o,
});
/** A linha `nsu`/`k` do extrato real trocada. */
const comLinha = (nsu: number, k: number, troca: Partial<LinhaExtratoPos>) =>
  EXTRATO_REAL().map((l) => (l.nsu === nsu && l.parcela === k ? { ...l, ...troca } : l));

/* ─────────────────────────────── os casos ─────────────────────────────── */

const C = {
  F0: "(F0) amostra do dev: conferida no dia útil seguinte (+2 dias), 900 = 900 centavos",
  F0_TAXA: "(F0) sem taxa cadastrada, o MDR do extrato (2,65%) fica SEM CONTRATO — nunca divergente — e o título de taxa do sistema é contado",
  F0_LIQUIDO: "(F0) a amostra do dev VERBATIM tem líquido de teste (3,29 de uma parcela de 9,00): o líquido da venda é DIFERENTE (329 × 873 = 900 − 27), com os dois valores na frase e na vista de divergências — o status segue conferido no dia útil seguinte, e a antecipação não é comparada (o vínculo não antecipa)",
  F0_TAXA_IGUAL: "(F0) com 2,65% cadastrado para crédito à vista, a taxa é IGUAL (265 = 265 pontos-base), sem diferença exibida, e nada diverge",
  F0_TAXA_DIF: "(F0) com 1,99% cadastrado, a taxa é DIFERENTE (+66 pontos-base): entra na vista de divergências e na frase, e o status SEGUE conferido no dia útil seguinte",
  F7: "(F7) os títulos lidos duas vezes (janela + NSU) dão as MESMAS contagens",
  N1001: "(F1·1001) débito no mesmo dia e mesmo valor: conferida",
  N1002: "(F1·1002) repasse estimado num sábado, pago na segunda: conferida no dia útil seguinte (+2)",
  N1003: "(F1·1003) 3 parcelas em ordem INVERSA: cada uma casa com a SUA (p1 e p3 conferidas, p2 no dia útil seguinte)",
  N1004: "(F1·1004) repasse em outro dia: data diferente (+2)",
  N1005: "(F1·1005) valor bruto diferente: +500 centavos",
  N1006: "(F1·1006) 291,04 em 2x: 145,52 = 14552 centavos INTEIROS nos dois lados (a armadilha do ponto flutuante)",
  N1007: "(F1·1007) só no extrato e nenhum aviso chegou: o lado do sistema é nulo",
  N1008: "(F1·1008) só no extrato com o aviso esperando a ativação",
  N1009: "(F1·1009) só no sistema, no meio do período: ausente do extrato",
  N1010: "(F1·1010) cancelada no extrato, título ainda valendo: cancelada só no extrato",
  N1011: "(F1·1011) cancelada nos dois lados (título cancelado, transação desfeita)",
  N1012: "(F1·1012) cancelada só no sistema",
  N1013: "(F1·1013) estorno parcial: o valor NÃO é comparado (sem conclusão)",
  N1014: "(F1·1014) só no sistema no último dia do período: sem conclusão (borda)",
  N1015: "(F1·1015) linha de OUTRO estabelecimento: fora da conferência, e nem o NSU nem o valor aparecem",
  N1016: "(F1·1016) parcela repetida no extrato: as duas cópias marcadas, o título sem conclusão",
  N1017: "(F1·1017) linha sem parcela: ilegível",
  N1018: "(F1·1018) venda por Pix só no sistema: sem conclusão (o extrato pode não trazer Pix)",
  N1019: "(F1·1019) título de 30/06 (lido pela margem) não vira item nem conta",
  N1020: "(F1·1020) venda às 23:55 do dia anterior: conferida, com o sinal de dia da venda diferente",
  N1021: "(F1·1021) recebida, estornada e cancelada no extrato: cancelada nos dois, com o sinal de recebido",
  N1022: "(F1·1022) 3x no sistema × 2x no extrato: p1 e p2 com valor diferente (e o sinal das parcelas, com o total da venda que confere); p3 SEM CONCLUSÃO pelas parcelas diferentes — o valor dela pode estar nas parcelas do extrato, e nenhum centavo dela em \"Só no sistema\"",
  F1_RESUMO: "(F1) resumo por situação: as âncoras literais (quantidade, extrato, sistema)",
  F1_GRUPOS: "(F1) grupos e estado: 10 conferidas, 9 divergências, 8 sem conclusão, 27 itens, conferido",
  NULO: "(F1) só no extrato: o lado do sistema é AUSENTE (null), nunca R$ 0,00",
  INVARIANTE: "(todas) cartão × tabela: o resumo particiona a lista (quantidade e as duas somas, null sem o lado; a taxa e a antecipação por resultado; o líquido uma vez por venda), e a vista de divergências é a da lista literal (status, taxa ou antecipação diferente, taxa sem título, total ou líquido da venda diferente)",
  F2: "(F2) sem NSU em comum: chave não confirmada, 2 pares prováveis, 2 sem conclusão e NENHUMA divergência",
  F2_SEM_AUT: "(F2) o código de autorização nunca sai no relatório",
  F2_TAXA: "(F2) sem NSU em comum, a taxa também fica SEM CONCLUSÃO (2,65% × 1,99% cadastrado não é afirmado: o extrato pode nem ser desta maquininha)",
  F3: "(F3) extrato VAZIO e a venda no sistema: estado extrato_vazio, sem conclusão (NUNCA só no sistema), nenhuma divergência + o aviso",
  F3B: "(F3b) extrato só com parcela de OUTRO estabelecimento: o mesmo que vazio — sem conclusão, nenhuma divergência",
  F3C: "(F3c) extrato só com linha ilegível deste EC: o mesmo que vazio — a linha fica ilegível e a venda do sistema sem conclusão",
  F4: "(F4) venda de fora do período no extrato: o aviso, e o título sem par fica sem conclusão",
  F5: "(F5) duas maquininhas: a do aviso desta é afirmada, a da outra fica fora, a sem aviso fica sem conclusão",
  F6: "(F6) nada dos dois lados: vazio, tudo zero, nenhum aviso",
  F8_DESFEITA: "(F8·8001) cancelada no extrato, sem título, transação desfeita: cancelada nos dois (nunca só no extrato)",
  F8_SEM_REGISTRO: "(F8·8002) cancelada no extrato, sem título e sem registro no sistema: sem conclusão (nunca só no extrato)",
  F8_METADE: "(F8·8003) 3x cancelada no sistema, o extrato só com a 1ª (cancelada): a venda está cancelada nos DOIS lados — p1, p2 e p3 canceladas nos dois (nunca só no sistema)",
  F8B: "(F8b·8004) 3x cancelada no sistema, o extrato só com a 1ª e VIVA: p1 cancelada só no sistema, p2 e p3 sem conclusão (venda cancelada pode sair do extrato pela metade — nunca só no sistema)",
  F9: "(F9) a 2ª parcela numa linha ilegível da MESMA venda: o título fica sem conclusão (nunca só no sistema)",
  F10: "(F10) estorno parcial lançado e a linha com data de cancelamento: sem conclusão por estorno parcial (nunca cancelada só no extrato)",
  F11: "(F11) maquininha trocada: a venda do vínculo EXCLUÍDO fica sem conclusão com o motivo PRÓPRIO (o aviso diz de onde veio — nunca \"mais de uma maquininha\"); a do vínculo vivo e a sem aviso são afirmadas",
  F13: "(F13·20001) a Pinbank cancelou a venda de 3x e o extrato só traz a 1ª: p1 cancelada só no extrato; p2 e p3 sem conclusão pela venda cancelada no extrato — nunca só no sistema, e nenhum centavo em \"Só no sistema\"",
  F14: "(F14·7001) dois títulos de receita da mesma parcela e UM título de taxa de R$ 2,65: a taxa lançada pelo sistema é 265 centavos, um título (nunca somada por item)",
  F15: "(F15·3001) desfeita no sistema antes de virar título e VIVA no extrato: cancelada só no sistema, com a frase própria — nunca só no extrato \"o aviso chegou sem lançar a venda\"",
  FG: "(FG) linha do extrato sem número da venda em 10/07: a venda de 10/07 só no sistema e a parcela ausente da venda de 10/07 ficam sem conclusão; a de 15/07 segue ausente",
  ATESTADO: "(atestado) a venda em comum só é ATESTADA pelo aviso de uma maquininha deste estabelecimento, no dia da venda: o título forjado (sem aviso, ou com o aviso de uma maquininha excluída) entra em comum e não atesta",
  ATESTADO_DIA: "(atestado) o aviso só atesta NO DIA DA VENDA da linha (a até 1 dia): o de 2023 (negado, com erro) e o de 3 dias depois, com a NSU de uma linha alheia, não abrem nada; o do dia, e o do dia seguinte em UTC (venda das 22h30), atestam",
  TROCADA: "(F·P) a maquininha TROCADA: avisos da antiga (fora dos vínculos vivos) no dia da venda não atestam, e são contados à parte (2) — de um dia que não é o da venda, não; os da maquininha deste estabelecimento atestam (2) e não são contados como da trocada",
  LADOS: "(F1) as contagens de cada lado, sem cruzar: 22 linhas e 16 vendas no extrato; 19 parcelas VÁLIDAS, 14 vendas e 147604 centavos no sistema (o título de 30/06 fora, e as vendas canceladas 1011, 1012 e 1021 também)",
  LADOS_VIVOS: "(FVIVOS) o lado do sistema conta só as parcelas VÁLIDAS: nem o título cancelado, nem a venda com estorno total e a transação cancelada, nem a parcela cancelada sozinha — 2 parcelas, 2 vendas, 9000 centavos",
  PARCELAS_V: "(FV) 1x no extrato × 3x no sistema: a p1 com par fica valor diferente (+20000, com o sinal das parcelas e o total que confere); a p2 e a p3 SEM CONCLUSÃO pelas parcelas diferentes, com a frase dos dois números — nunca só no sistema; e o total que NÃO confere (22002) é dito também e leva as três parcelas dela à vista de divergências (4 itens nela; a p2 e a p3 da 22001, de total igual, ficam fora)",
  PARCELAS_L: "(FL) o espelho, 12x no extrato × 10x no sistema: p1..p10 com par (valor diferente, total que confere); a p11 e a p12 do extrato SEM CONCLUSÃO — nenhum centavo em \"Só no extrato\" (os R$ 166,70 estão no sistema)",
  BORDA_MESMAS: "(FBORDA) com o MESMO número de parcelas (3x nos dois lados), a parcela que o extrato não traz é afirmada só no sistema MESMO no último dia",
  TOTAL_ULTIMA: "(FTOT·31001) o título da ÚLTIMA parcela some do sistema (3x de R$ 300 no extrato, só a p1 e a p2 de R$ 100 no sistema): as duas com par seguem conferidas, mas a frase diz o total diferente e as TRÊS vão à vista de divergências; a p3 fica sem conclusão — nunca só no extrato",
  TOTAL_LANCADO: "(FTOT·31002) o total LANÇADO diferente (2x de R$ 200 no extrato, 3x de R$ 100 no sistema): a p1 e a p2 conferidas com a frase das parcelas e do total diferente, a p3 do sistema sem conclusão — nunca só no sistema — e as três na vista de divergências",
  TOTAL_IGUAL: "(FTOT·31003) a venda REDIVIDIDA com o MESMO total (2x de R$ 300 no extrato, 3x de R$ 100 no sistema): só as duas com par e valor diferente vão à vista de divergências; a p3 sem par, com o total igual, NÃO",
  TOTAL_LACUNA: "(FTOT·31004) o sistema só com a p2 de uma venda de 3x (a p1 e a p3 sumiram): a lacuna na numeração do sistema não anula a comparação do total — ele é diferente, e as três vão à vista de divergências",
  SEM_EC: "(FSEMEC) a linha SEM o código do estabelecimento protege o título da venda dela (inteira ou a parcela) — sem conclusão, com o motivo próprio, e nenhum valor dela num item; a venda sem linha nenhuma segue só no sistema",
  ILEGIVEL_VIZINHO: "(FVIZ) a linha ilegível sem número no dia VIZINHO protege o título (o dia da venda pode diferir em 1); três dias depois, não",
  LACUNA_NOS_DOIS: "(FLAC) a parcela que falta NOS DOIS lados com o mesmo número de parcelas: as que conferem levam o sinal e a frase do total diferente e vão à vista de divergências; o controle inteiro, a parcela só no sistema e a parcela de valor diferente NÃO dão o sinal às outras",
  IRMA: "(FIRMA) com outra maquininha viva no mesmo estabelecimento, só a venda cujo aviso veio DESTA é comparada com as taxas desta — a da irmã e a sem aviso ficam \"outra maquininha\", fora da vista de divergências; sem a irmã, a 2,50% é diferente",
  TOTAL_RESUMO: "(FTOT) o resumo: 12 itens, 5 conferidas, 2 divergências, 5 sem conclusão, 11 na vista de divergências e NENHUM centavo em só no extrato ou só no sistema",
  FRASE_DISCORDAM: "(FDISC·6201) as linhas do extrato discordam no número de parcelas (2x e 3x) e o sistema tem a p1 e a p3: a linha p2 e o título p3 sem par dizem que as linhas não concordam — nunca \"o extrato divide em 3 e o sistema em 3\"",
  F12_TOTAL: "(F12·1201) estorno total CANCELADO: a venda recebida segue valendo — conferida, não cancelada só no sistema",
  F12_PARCIAL: "(F12·1202) estorno parcial CANCELADO: o valor volta a ser comparado — conferida, não sem conclusão",
  FT_TIPOS: "(FT) a taxa por tipo: débito igual (163 = 163, sem a dízima de 0,0163 × 10000), débito 1 ponto-base acima do contrato de duas casas (164 × 163) já é DIFERENTE, voucher sem tipo, sem MDR no extrato, parcelado sem contrato",
  FT_TOLERANCIA: "(FTOL) a tolerância é ESTRITA e contra a taxa contratada EXATA: 1,62% × 1,63% (a dízima de 0,0163) e 2,00% × 1,99% são DIFERENTES; 1,99% e 2,00% × 1,995% (contrato com mais casas) são IGUAIS — e a igual não exibe diferença (\"−0,01 ponto percentual\" ao lado de \"taxa igual\" se contradiria)",
  FT4: "(FT4) o estorno PARCIAL com a linha cancelada e a taxa cadastrada: a taxa é \"estorno parcial: não comparada\" — nunca \"venda cancelada\" ao lado de \"estorno parcial\" — fora da vista de divergências e sem a frase da taxa",
  FBZ: "(FBZ) a regra do sistema nem lançaria a taxa do débito (R$ 0,30 a 1,63% arredonda para zero) e reparte R$ 0,31 em 12x SEM parte negativa (11 × 0,02 + 0,09): nenhuma parcela é acusada de taxa sem título",
  FBZ2: "(FBZ2) o título de taxa da 12ª parcela PERDIDO (a regra lançaria R$ 0,09 nela): a 12ª — e só ela — é acusada de taxa sem título, sem mudar o status",
  FT_DIF: "(FT·7003) crédito à vista 2,65% × 2,99% cadastrado: diferente (−34), na frase, e o status SEGUE conferido",
  FT_DUAS: "(FT·7007) data diferente E taxa diferente: uma leitura não esconde a outra",
  FT_RESUMO: "(FT) o resumo da taxa: 1 igual, 4 diferentes, 2 sem contrato, 1 sem MDR, 1 tipo desconhecido; 4 itens na vista de divergências (2 pelo status + 2 só pela taxa)",
  FT_SEM_REAIS: "(FT) nenhum valor em reais é derivado do percentual: o bloco da taxa só tem resultado, tipo e pontos-base",
  FT2: "(FT2) a taxa da venda CANCELADA não é comparada (MDR 0 no extrato × 1,63% cadastrado): \"venda cancelada\", fora da vista de divergências e sem a frase da taxa",
  FT3: "(FT3) PARCELADO em 1x é crédito à vista (como o planejador lança): 2,65% × 2,65% cadastrado à vista é IGUAL, mesmo com 3,10% para parcelado; em 2x é parcelado; sem o número de parcelas, tipo desconhecido",
  FB: "(FB·21001) o extrato cobrou 2,65% (igual ao cadastrado) e o sistema não lançou o título de taxa: o sinal, a frase e a vista de divergências — o status segue conferido; com o título (21002) ou sem taxa cadastrada (21003), nada",
  CHAVE: "(puro) chaveDoTitulo lê r/t/f/a/estorno e recusa o que não é chave da Pinbank",
  REAL: "(FREAL) o extrato de PRODUÇÃO de 14/10/2026 contra os títulos do contrato medido: as quatro parcelas conferidas, a taxa e a antecipação IGUAIS (o débito com antecipação zero), o líquido das três vendas igual (891 + 869 + 856 = 2616 nos dois lados), a taxa, a tarifa e a antecipação de cada parcela nos campos DELAS — nada diverge",
  REAL_ANTIGO: "(FREAL) o MESMO extrato contra os títulos que o sistema lançava antes da tarifa e da antecipação (a taxa sobre o total): as parcelas seguem conferidas e a taxa igual, mas o líquido das três vendas é DIFERENTE (990 × 891 no débito; 2945 × 2616 no total), com os dois valores na frase e as 4 parcelas na vista de divergências",
  ANT_DIF: "(FREAL) com 1,99% ao mês cadastrado, a antecipação do crédito (1,55%) é DIFERENTE (−44 pontos-base): na frase e na vista de divergências (3 parcelas), sem mudar o status; o débito (zero × zero) segue igual",
  ANT_NAO: "(FREAL) o vínculo SEM repasse antecipado: a antecipação não é comparada em parcela nenhuma (\"repasse não antecipado\"), sem esperada e fora da vista de divergências",
  ANT_SEM: "(FREAL) antecipado SEM a antecipação cadastrada: o crédito fica \"não cadastrada\" — nunca divergente — e o débito, cuja esperada é zero de qualquer jeito, segue igual",
  ANT_DEB: "(FREAL) o extrato com 1,55% ao mês num DÉBITO: a antecipação é diferente (esperada zero, +155), com a frase própria do débito",
  ANT_CANC: "(FREAL) a venda que a Pinbank CANCELOU (antecipação zerada na linha) e o sistema não: cancelada só no extrato, a antecipação \"venda cancelada\" — nunca \"diferente\" — e o líquido não comparado; e o 2x com SÓ a 2ª parcela cancelada no extrato: a 1ª conferida, sem o líquido da venda comparado",
  LIQ_PARCELA: "(FREAL) o 2x com o título da 2ª parcela CANCELADO no sistema e as duas vivas no extrato: a 2ª cancelada só no sistema, a 1ª conferida — e a venda sem o líquido comparado (a parcela que falta não vira divergência do líquido)",
  ANT_SEM_CONCLUSAO: "(F2) sem NSU em comum, a antecipação também fica SEM CONCLUSÃO (o extrato pode nem ser desta maquininha), fora da vista de divergências",
  ANT_IRMA: "(FREAL) com OUTRA maquininha viva no mesmo estabelecimento e o aviso da venda vindo dela, a antecipação dessa venda não é comparada com a desta (\"outra maquininha\")",
  LIQ_TOLERANCIA: "(FREAL) a folga do líquido é de 1 centavo POR PARCELA — na venda de uma parcela, 890 × 891 é igual (os arredondamentos separados), 889 × 891 já é diferente",
  LIQ_12X: "(LIQ12) no 12x a folga é de 12 centavos: 957 × 969 é igual (a Pinbank pode arredondar cada parcela), 956 × 969 já é diferente",
  ANT_ANTES: "(FREAL) a venda de ANTES de a empresa ligar o repasse antecipado (crédito, sem título de antecipação no sistema, zero no extrato): \"venda não antecipada\" nos dois lados — nunca \"diferente\" da antecipação cadastrada hoje — e o líquido igual (883 × 883)",
  ANT_SO_NO_SISTEMA: "(FREAL) o sistema lançou a antecipação e a Pinbank NÃO a cobrou (zero no extrato): a antecipação é DIFERENTE (−155 pontos-base), na vista de divergências",
  ANT_ESPERADA: "(motor) a base da antecipação esperada diz o motivo de não haver número: tipo de venda não identificado (com a antecipação cadastrada), repasse não antecipado, não cadastrada; o débito espera zero e o crédito, o contrato",
  LIQ_METADE: "(FREAL) a meia venda não tem o líquido comparado: o 2x com só a 1ª parcela no extrato e o débito sem o líquido na linha ficam sem o sinal — e o resumo só conta a venda inteira (1)",
  LIQ_ESTORNO: "(FREAL) a venda com estorno PARCIAL no sistema e a desfeita no sistema (a transação cancelada) não têm o líquido comparado — só a do 2x, inteira e viva",
  POSTERGAR: "(puro) postergarParaDiaUtil: sábado → segunda, Sexta-feira Santa → segunda, 20/11 → 21/11, 31/12 útil fica",
  CENTAVOS: "(puro) centavosDeReais: 145.52 → 14552, \"10.30\" → 1030, 0.29 → 29, \"x\" → null",
  DIAS: "(puro) diasEntreDatas(30/08, 01/09) = 2",
  AVISO_DO_DIA: "(puro) nsusDoExtratoComAviso: a NSU do extrato entra com o aviso do dia da venda (e do dia seguinte em UTC, a venda das 22h) — com o aviso de outro dia, sem aviso, ou com o aviso de OUTRA NSU, não",
  PERIODO: "(puro) a regra dos 31 dias é UMA: 31 passa, 32 e invertido recusam, e o filtro do extrato diz o MESMO texto",
  PORTAO: "(portão) conferenciaPinbankLiberada: desligada → sem configuração → ambiente de teste → liberada, sem nunca devolver valor",
  SEM_CORPO: "(tela) a falha sem a frase da rota: 504/500 e o tempo esgotado viram \"demorou demais ou falhou\" (período menor), 404 a frase genérica — o número do status fica só no código, nunca na frase",
} as const;

type Mods = { eng: ModEngine };

function casos(m: Mods, rotulo: string): Map<string, boolean> {
  const r = new Map<string, boolean>();
  const caso = (nome: string, ok: () => boolean, detalhe: () => string = () => "") => {
    let v = false;
    let d = "";
    try { v = ok(); } catch (e) { d = `lançou: ${(e as Error).message}`; }
    if (!v && !d) { try { d = detalhe(); } catch { d = ""; } }
    r.set(nome, v);
    if (rotulo === "real") console.log(`${v ? "PASSOU" : "FALHOU"}  ${nome}${!v && d ? ` — ${d}` : ""}`);
  };
  const rodar = (e: Entrada): Relatorio => m.eng.conferirExtratoPinbank(e);
  const seguro = (e: Entrada): Relatorio | null => { try { return rodar(e); } catch { return null; } };
  const item = (rel: Relatorio | null, nsu: string, parcela = 1) => rel?.itens.find((i) => i.nsu === nsu && i.parcela === parcela);
  const itensDe = (rel: Relatorio | null, nsu: string) => rel?.itens.filter((i) => i.nsu === nsu) ?? [];
  const resumo = (i: unknown) => JSON.stringify(i);

  /* F0 */
  const f0 = seguro(F0());
  caso(C.F0, () => {
    const i = f0!.itens;
    return i.length === 1 && i[0].status === "casada_dia_util" && i[0].diferencaDias === 2 && i[0].sinais.includes("dia_util")
      && i[0].extrato!.brutoParcelaEstimadoCentavos === 900 && i[0].sistema!.valorCentavos === 900
      && i[0].extrato!.taxa.extratoBp === 265 && i[0].extrato!.aguardandoDefinicao.brutoParcelaCentavos === 675
      && f0!.estado === "conferido";
  }, () => resumo(f0?.itens[0]));
  const f0s = seguro(F0_SEM_LIQUIDO());
  caso(C.F0_TAXA, () => {
    const t = f0s!.resumo.taxa;
    return f0s!.resumo.porStatus.valor_diferente.quantidade === 0 && f0s!.resumo.porStatus.data_e_valor_diferentes.quantidade === 0
      && f0s!.itens[0].status === "casada_dia_util" && f0s!.itens[0].sistema!.taxaCentavos === 27
      && resumo(f0s!.itens[0].extrato!.taxa) === resumo({ resultado: "sem_contrato", tipo: "credito_vista", extratoBp: 265, contratoBp: null, diferencaBp: null })
      && resumo(t.porResultado) === resumo({ diferente: 0, igual: 0, sem_contrato: 1, sem_extrato: 0, tipo_desconhecido: 0, sem_conclusao: 0, outra_maquininha: 0, venda_cancelada: 0, estorno_parcial: 0 })
      && f0s!.resumo.itensComDivergencia === 0
      && t.parcelasComTaxaInformada === 1 && t.titulosDeTaxaNoSistema === 1 && t.centavosTaxaNoSistema === 27;
  }, () => resumo({ s: f0s?.itens[0]?.status, x: f0s?.itens[0]?.extrato?.taxa, t: f0s?.resumo.taxa, d: f0s?.resumo.itensComDivergencia }));
  caso(C.F0_LIQUIDO, () => {
    const i = f0!.itens[0];
    return i.status === "casada_dia_util" && i.sinais.includes("liquido_da_venda_diferente") && !i.sinais.includes("liquido_da_venda_igual")
      && resumo(i.liquidoDaVenda) === resumo({ extratoCentavos: 329, sistemaCentavos: 873, parcelas: 1 })
      && i.extrato!.liquidoCentavos === 329
      && resumo(f0!.resumo.liquido) === resumo({ vendasComparadas: 1, vendasIguais: 0, vendasDiferentes: 1, centavosExtrato: 329, centavosSistema: 873 })
      && f0!.resumo.itensComDivergencia === 1 && f0!.resumo.grupos.divergencias === 0
      && /R\$3,29/.test(i.frase) && /R\$8,73/.test(i.frase)
      && i.extrato!.antecipacao.resultado === "nao_antecipado";
  }, () => resumo({ s: f0?.itens[0]?.sinais, l: f0?.itens[0]?.liquidoDaVenda, r: f0?.resumo.liquido, f: f0?.itens[0]?.frase, a: f0?.itens[0]?.extrato?.antecipacao }));
  const f0i = seguro(F0_TAXA(0.0265));
  caso(C.F0_TAXA_IGUAL, () => f0i!.itens[0].status === "casada_dia_util"
    && resumo(f0i!.itens[0].extrato!.taxa) === resumo({ resultado: "igual", tipo: "credito_vista", extratoBp: 265, contratoBp: 265, diferencaBp: null })
    && f0i!.resumo.taxa.porResultado.igual === 1 && f0i!.resumo.itensComDivergencia === 0 && !/Taxa:/.test(f0i!.itens[0].frase),
  () => resumo({ s: f0i?.itens[0]?.status, x: f0i?.itens[0]?.extrato?.taxa, d: f0i?.resumo.itensComDivergencia }));
  const f0d = seguro(F0_TAXA(0.0199));
  caso(C.F0_TAXA_DIF, () => f0d!.itens[0].status === "casada_dia_util" && f0d!.resumo.grupos.divergencias === 0
    && resumo(f0d!.itens[0].extrato!.taxa) === resumo({ resultado: "diferente", tipo: "credito_vista", extratoBp: 265, contratoBp: 199, diferencaBp: 66 })
    && f0d!.resumo.taxa.porResultado.diferente === 1 && f0d!.resumo.itensComDivergencia === 1
    && /2,65%/.test(f0d!.itens[0].frase) && /1,99%/.test(f0d!.itens[0].frase) && /dia útil seguinte/.test(f0d!.itens[0].frase),
  () => resumo({ s: f0d?.itens[0]?.status, x: f0d?.itens[0]?.extrato?.taxa, f: f0d?.itens[0]?.frase, d: f0d?.resumo.itensComDivergencia }));

  /* F7 */
  const f7 = seguro(F7());
  caso(C.F7, () => resumo(f7!.resumo.porStatus) === resumo(f0!.resumo.porStatus) && f7!.itens.length === f0!.itens.length,
    () => resumo(f7?.itens.map((i) => i.status)));

  /* F1 */
  const f1 = seguro(F1());
  const st = (nsu: string, k = 1) => item(f1, nsu, k)?.status;
  const mo = (nsu: string, k = 1) => item(f1, nsu, k)?.motivo;
  caso(C.N1001, () => st("1001") === "casada" && item(f1, "1001")!.diferencaDias === 0, () => resumo(item(f1, "1001")));
  caso(C.N1002, () => st("1002") === "casada_dia_util" && item(f1, "1002")!.diferencaDias === 2, () => resumo(item(f1, "1002")));
  caso(C.N1003, () => st("1003", 1) === "casada" && st("1003", 2) === "casada_dia_util" && st("1003", 3) === "casada"
    && item(f1, "1003", 1)!.extrato!.brutoParcelaEstimadoCentavos === 6667 && item(f1, "1003", 3)!.extrato!.brutoParcelaEstimadoCentavos === 6666,
  () => resumo(itensDe(f1, "1003").map((i) => [i.parcela, i.status, i.diferencaDias])));
  caso(C.N1004, () => st("1004") === "data_diferente" && item(f1, "1004")!.diferencaDias === 2 && /\+2 dias/.test(item(f1, "1004")!.frase),
    () => resumo(item(f1, "1004")));
  caso(C.N1005, () => st("1005") === "valor_diferente" && item(f1, "1005")!.diferencaCentavos === 500, () => resumo(item(f1, "1005")));
  caso(C.N1006, () => st("1006", 1) === "casada" && st("1006", 2) === "casada"
    && itensDe(f1, "1006").every((i) => i.sistema!.valorCentavos === 14552 && i.extrato!.brutoParcelaEstimadoCentavos === 14552),
  () => resumo(itensDe(f1, "1006").map((i) => [i.status, i.sistema?.valorCentavos, i.extrato?.brutoParcelaEstimadoCentavos])));
  caso(C.N1007, () => st("1007") === "so_no_extrato" && mo("1007") === "nenhum_evento" && item(f1, "1007")!.sistema === null,
    () => resumo(item(f1, "1007")));
  caso(C.N1008, () => st("1008") === "so_no_extrato" && mo("1008") === "evento_aguardando_ativacao", () => resumo(item(f1, "1008")));
  caso(C.N1009, () => st("1009") === "so_no_sistema" && mo("1009") === "venda_ausente_do_extrato" && item(f1, "1009")!.extrato === null
    && f1!.resumo.porStatus.so_no_sistema.quantidade === 1, () => resumo(item(f1, "1009")));
  caso(C.N1010, () => st("1010") === "cancelada_no_extrato", () => resumo(item(f1, "1010")));
  caso(C.N1011, () => st("1011") === "cancelada_nos_dois", () => resumo(item(f1, "1011")));
  caso(C.N1012, () => st("1012") === "cancelada_so_no_sistema", () => resumo(item(f1, "1012")));
  caso(C.N1013, () => st("1013") === "inconclusivo" && mo("1013") === "reembolso_parcial"
    && item(f1, "1013")!.sinais.includes("valor_nao_comparado") && item(f1, "1013")!.diferencaCentavos === null,
  () => resumo(item(f1, "1013")));
  caso(C.N1014, () => st("1014") === "inconclusivo" && mo("1014") === "borda_do_periodo", () => resumo(item(f1, "1014")));
  caso(C.N1015, () => {
    const j = JSON.stringify(f1);
    return itensDe(f1, "1015").length === 0 && f1!.resumo.foraDaConferencia.outroEstabelecimento === 1
      && !j.includes("1015") && !j.includes("99900") && f1!.avisos.some((a) => a.codigo === "linhas_de_outro_estabelecimento");
  }, () => resumo({ fora: f1?.resumo.foraDaConferencia, itens: itensDe(f1, "1015").length }));
  caso(C.N1016, () => {
    const i = itensDe(f1, "1016");
    return i.filter((x) => x.status === "duplicada_no_extrato").length === 2
      && i.filter((x) => x.status === "inconclusivo" && x.motivo === "linha_duplicada_no_extrato" && x.sistema?.valorCentavos === 1000).length === 1
      && i.length === 3;
  }, () => resumo(itensDe(f1, "1016").map((x) => [x.status, x.motivo])));
  caso(C.N1017, () => f1!.itens.filter((i) => i.status === "linha_ilegivel").length === 1
    && f1!.itens.find((i) => i.status === "linha_ilegivel")!.extrato!.brutoParcelaEstimadoCentavos === null,
  () => resumo(f1?.itens.filter((i) => i.status === "linha_ilegivel")));
  caso(C.N1018, () => st("1018") === "inconclusivo" && mo("1018") === "pix_sem_extrato", () => resumo(item(f1, "1018")));
  caso(C.N1019, () => itensDe(f1, "1019").length === 0, () => resumo(itensDe(f1, "1019")));
  caso(C.N1020, () => st("1020") === "casada" && item(f1, "1020")!.sinais.includes("dia_da_venda_diferente"), () => resumo(item(f1, "1020")));
  caso(C.N1021, () => st("1021") === "cancelada_nos_dois" && item(f1, "1021")!.sinais.includes("recebido_no_sistema")
    && item(f1, "1021")!.sistema!.estornoDaVendaCentavos === 14550, () => resumo(item(f1, "1021")));
  caso(C.N1022, () => {
    const p1 = item(f1, "1022", 1)!;
    const p2 = item(f1, "1022", 2)!;
    const p3 = item(f1, "1022", 3)!;
    return p1.status === "valor_diferente" && p1.sinais.includes("dia_util") && p1.sinais.includes("parcelas_diferentes") && p1.diferencaCentavos === 5000
      && p1.sinais.includes("total_da_venda_igual")
      && p2.status === "valor_diferente" && p2.sinais.includes("parcelas_diferentes")
      && p3.status === "inconclusivo" && p3.motivo === "parcelas_diferentes_no_extrato" && p3.extrato === null
      && p3.totalParcelasExtrato === 2 && p3.totalParcelasSistema === 3 && p3.sinais.includes("total_da_venda_igual")
      && p3.frase === "O extrato divide esta venda em 2 parcelas e o sistema em 3 parcelas; o valor desta parcela pode estar nas parcelas do outro lado — a ausência não é afirmada. O total bruto da venda é o mesmo nos dois lados."
      && f1!.resumo.porStatus.so_no_sistema.centavosSistema === 6000;
  }, () => resumo(itensDe(f1, "1022").map((i) => [i.parcela, i.status, i.motivo, i.sinais, i.diferencaCentavos])));

  // As âncoras do resumo — escritas à mão, conferidas linha a linha contra a tabela da especificação.
  const ANCORAS: Record<Status, [number, number | null, number | null]> = {
    casada: [6, 50937, 50937],
    casada_dia_util: [2, 15667, 15667],
    cancelada_nos_dois: [2, 17500, 17500],
    data_diferente: [1, 12000, 12000],
    valor_diferente: [3, 38500, 28000],
    data_e_valor_diferentes: [0, null, null],
    cancelada_no_extrato: [1, 7000, 7000],
    cancelada_so_no_sistema: [1, 4500, 4500],
    so_no_extrato: [2, 7000, null],
    so_no_sistema: [1, null, 6000],
    par_provavel: [0, null, null],
    inconclusivo: [5, 7000, 28000],
    linha_ilegivel: [1, null, null],
    duplicada_no_extrato: [2, 2000, null],
  };
  const difResumo = (rel: Relatorio | null) => Object.entries(ANCORAS).filter(([s, [q, e, si]]) => {
    const l = rel!.resumo.porStatus[s as Status];
    return l.quantidade !== q || l.centavosExtrato !== e || l.centavosSistema !== si;
  }).map(([s]) => `${s}: ${resumo(rel!.resumo.porStatus[s as Status])}`);
  caso(C.F1_RESUMO, () => difResumo(f1).length === 0, () => difResumo(f1).join(" | "));
  caso(C.F1_GRUPOS, () => f1!.resumo.grupos.conferidas === 10 && f1!.resumo.grupos.divergencias === 9
    && f1!.resumo.grupos.semConclusao === 8 && f1!.itens.length === 27 && f1!.estado === "conferido" && !f1!.vazio
    && resumo(f1!.avisos.map((a) => a.codigo)) === resumo(["linhas_de_outro_estabelecimento"]),
  () => resumo({ g: f1?.resumo.grupos, n: f1?.itens.length, e: f1?.estado, a: f1?.avisos.map((a) => a.codigo) }));
  caso(C.NULO, () => f1!.resumo.porStatus.so_no_extrato.centavosSistema === null && f1!.resumo.porStatus.so_no_sistema.centavosExtrato === null,
    () => resumo({ e: f1?.resumo.porStatus.so_no_extrato, s: f1?.resumo.porStatus.so_no_sistema }));

  /* F2 */
  const f2 = seguro(F2());
  caso(C.F2, () => {
    const p = f2!.resumo.porStatus;
    const pares = f2!.itens.filter((i) => i.status === "par_provavel");
    const vias = pares.map((i) => i.provavel?.via).sort();
    return f2!.estado === "chave_nao_confirmada" && f2!.avisos.some((a) => a.codigo === "chave_nao_confirmada")
      && p.so_no_extrato.quantidade === 0 && p.so_no_sistema.quantidade === 0 && f2!.resumo.grupos.divergencias === 0
      && p.par_provavel.quantidade === 2 && p.inconclusivo.quantidade === 2 && p.casada.quantidade === 0
      && resumo(vias) === resumo(["autorizacao", "nsu_loja"])
      && pares.find((i) => i.provavel?.via === "nsu_loja")?.provavel?.nsuNoSistema === "2121979"
      && pares.find((i) => i.provavel?.via === "autorizacao")?.provavel?.nsuNoSistema === "2121978"
      && f2!.itens.filter((i) => i.status === "inconclusivo").every((i) => i.motivo === "chave_nao_confirmada");
  }, () => resumo({ e: f2?.estado, itens: f2?.itens.map((i) => [i.nsu, i.status, i.motivo, i.provavel]) }));
  caso(C.F2_SEM_AUT, () => !/a1b2c3|zzz999|qqq111/i.test(JSON.stringify(f2)));
  const f2t = seguro({ ...F2(), vinculo: { id: "v1", codigoCliente: EC, taxas: { credito_vista: 0.0199 } } });
  caso(C.F2_TAXA, () => f2t!.estado === "chave_nao_confirmada" && f2t!.resumo.itensComDivergencia === 0
    && f2t!.resumo.taxa.porResultado.diferente === 0 && f2t!.resumo.taxa.porResultado.sem_conclusao === 3
    && f2t!.itens.filter((i) => i.extrato).every((i) => i.extrato!.taxa.resultado === "sem_conclusao" && i.extrato!.taxa.contratoBp === 199)
    && !f2t!.itens.some((i) => /Taxa:/.test(i.frase)),
  () => resumo({ t: f2t?.resumo.taxa, d: f2t?.resumo.itensComDivergencia, i: f2t?.itens.map((i) => i.extrato?.taxa) }));

  /* F3 / F3b */
  const f3 = seguro(F3());
  caso(C.F3, () => f3!.estado === "extrato_vazio" && f3!.resumo.porStatus.so_no_sistema.quantidade === 0
    && f3!.resumo.grupos.divergencias === 0 && f3!.itens.length === 1
    && item(f3, "1009")?.status === "inconclusivo" && item(f3, "1009")?.motivo === "extrato_sem_vendas"
    && f3!.avisos.some((a) => a.codigo === "extrato_sem_vendas") && !f3!.vazio,
  () => resumo({ e: f3?.estado, i: f3?.itens.map((i) => [i.status, i.motivo]), a: f3?.avisos.map((a) => a.codigo) }));
  const f3b = seguro(F3b());
  caso(C.F3B, () => f3b!.estado === "extrato_vazio" && f3b!.resumo.grupos.divergencias === 0 && f3b!.itens.length === 1
    && item(f3b, "1009")?.motivo === "extrato_sem_vendas" && f3b!.resumo.foraDaConferencia.outroEstabelecimento === 1
    && f3b!.avisos.some((a) => a.codigo === "extrato_sem_vendas"),
  () => resumo({ e: f3b?.estado, i: f3b?.itens.map((i) => [i.status, i.motivo]), a: f3b?.avisos.map((a) => a.codigo) }));
  const f3c = seguro(F3c());
  caso(C.F3C, () => f3c!.estado === "extrato_vazio" && f3c!.resumo.grupos.divergencias === 0 && f3c!.itens.length === 2
    && item(f3c, "1009")?.status === "inconclusivo" && item(f3c, "1009")?.motivo === "extrato_sem_vendas"
    && f3c!.resumo.porStatus.linha_ilegivel.quantidade === 1,
  () => resumo({ e: f3c?.estado, i: f3c?.itens.map((i) => [i.nsu, i.status, i.motivo]) }));

  /* F4 */
  const f4 = seguro(F4());
  caso(C.F4, () => f4!.avisos.some((a) => a.codigo === "periodo_do_extrato_incerto")
    && item(f4, "4000")?.status === "casada"
    && item(f4, "4001")?.status === "so_no_extrato"
    && item(f4, "4002")?.status === "inconclusivo" && item(f4, "4002")?.motivo === "periodo_do_extrato_incerto",
  () => resumo(f4?.itens.map((i) => [i.nsu, i.status, i.motivo])));

  /* F5 */
  const f5 = seguro(F5());
  caso(C.F5, () => item(f5, "5000")?.status === "casada"
    && item(f5, "5001")?.status === "so_no_sistema"
    && itensDe(f5, "5002").length === 0 && f5!.resumo.foraDaConferencia.outraMaquininha === 1
    && item(f5, "5003")?.status === "inconclusivo" && item(f5, "5003")?.motivo === "maquininha_desconhecida",
  () => resumo({ i: f5?.itens.map((i) => [i.nsu, i.status, i.motivo]), f: f5?.resumo.foraDaConferencia }));

  /* F6 */
  const f6 = seguro(F6());
  caso(C.F6, () => f6!.vazio && f6!.itens.length === 0 && f6!.avisos.length === 0
    && Object.values(f6!.resumo.porStatus).every((l) => l.quantidade === 0 && l.centavosExtrato === null && l.centavosSistema === null)
    && f6!.resumo.grupos.conferidas + f6!.resumo.grupos.divergencias + f6!.resumo.grupos.semConclusao === 0,
  () => resumo(f6));

  /* F8 */
  const f8 = seguro(F8());
  caso(C.F8_DESFEITA, () => item(f8, "8001")?.status === "cancelada_nos_dois" && item(f8, "8001")?.motivo === "desfeita_sem_titulo"
    && item(f8, "8001")?.sistema === null && f8!.estado === "conferido",
  () => resumo({ e: f8?.estado, i: item(f8, "8001") }));
  caso(C.F8_SEM_REGISTRO, () => item(f8, "8002")?.status === "inconclusivo" && item(f8, "8002")?.motivo === "cancelada_no_extrato_sem_titulo"
    && f8!.resumo.porStatus.so_no_extrato.quantidade === 0,
  () => resumo(item(f8, "8002")));
  caso(C.F8_METADE, () => [1, 2, 3].every((k) => item(f8, "8003", k)?.status === "cancelada_nos_dois")
    && [2, 3].every((k) => item(f8, "8003", k)?.extrato === null && item(f8, "8003", k)?.sistema?.valorCentavos === 10000)
    && f8!.resumo.porStatus.so_no_sistema.quantidade === 0 && f8!.resumo.grupos.divergencias === 0,
  () => resumo(itensDe(f8, "8003").map((i) => [i.parcela, i.status, i.motivo])));
  const f8b = seguro(F8b());
  caso(C.F8B, () => item(f8b, "8004", 1)?.status === "cancelada_so_no_sistema"
    && [2, 3].every((k) => item(f8b, "8004", k)?.status === "inconclusivo" && item(f8b, "8004", k)?.motivo === "cancelada_ausente_do_extrato")
    && f8b!.resumo.porStatus.so_no_sistema.quantidade === 0,
  () => resumo(itensDe(f8b, "8004").map((i) => [i.parcela, i.status, i.motivo])));

  /* F9 */
  const f9 = seguro(F9());
  caso(C.F9, () => item(f9, "9001", 1)?.status === "casada"
    && item(f9, "9001", 2)?.status === "inconclusivo" && item(f9, "9001", 2)?.motivo === "linha_ilegivel_no_extrato"
    && f9!.resumo.porStatus.linha_ilegivel.quantidade === 1 && f9!.resumo.porStatus.so_no_sistema.quantidade === 0,
  () => resumo(f9?.itens.map((i) => [i.nsu, i.parcela, i.status, i.motivo])));

  /* F10 */
  const f10 = seguro(F10());
  caso(C.F10, () => item(f10, "1100")?.status === "inconclusivo" && item(f10, "1100")?.motivo === "reembolso_parcial"
    && item(f10, "1100")!.sinais.includes("reembolso_parcial") && f10!.resumo.porStatus.cancelada_no_extrato.quantidade === 0,
  () => resumo(item(f10, "1100")));

  /* F11 */
  const f11 = seguro(F11());
  caso(C.F11, () => item(f11, "6000")?.status === "casada"
    && item(f11, "6001")?.status === "inconclusivo" && item(f11, "6001")?.motivo === "maquininha_excluida"
    && item(f11, "6001")!.frase === "O aviso desta venda veio de uma maquininha que não está mais vinculada à empresa; ela pode ter tido outro código no extrato."
    && item(f11, "6002")?.status === "so_no_sistema" && item(f11, "6003")?.status === "so_no_sistema"
    && f11!.resumo.foraDaConferencia.outraMaquininha === 0,
  () => resumo({ i: f11?.itens.map((i) => [i.nsu, i.status, i.motivo]), f: f11?.resumo.foraDaConferencia }));

  /* F12 */
  const f12 = seguro(F12());
  caso(C.F12_TOTAL, () => item(f12, "1201")?.status === "casada" && item(f12, "1201")!.sinais.includes("recebido_no_sistema")
    && item(f12, "1201")!.sistema!.estornoDaVendaCentavos === null,
  () => resumo(item(f12, "1201")));
  caso(C.F12_PARCIAL, () => item(f12, "1202")?.status === "casada" && item(f12, "1202")!.diferencaCentavos === 0,
    () => resumo(item(f12, "1202")));

  /* FT — a taxa */
  const ft = seguro(FT());
  const tx = (nsu: string, k = 1) => item(ft, nsu, k)?.extrato?.taxa;
  caso(C.FT_TIPOS, () =>
    resumo(tx("7001")) === resumo({ resultado: "igual", tipo: "debito", extratoBp: 163, contratoBp: 163, diferencaBp: null })
    && resumo(tx("7002")) === resumo({ resultado: "diferente", tipo: "debito", extratoBp: 164, contratoBp: 163, diferencaBp: 1 })
    && resumo(tx("7005")) === resumo({ resultado: "tipo_desconhecido", tipo: null, extratoBp: 265, contratoBp: null, diferencaBp: null })
    && resumo(tx("7006")) === resumo({ resultado: "sem_extrato", tipo: "credito_vista", extratoBp: null, contratoBp: 299, diferencaBp: null })
    && [1, 2].every((k) => resumo(tx("7004", k)) === resumo({ resultado: "sem_contrato", tipo: "parcelado", extratoBp: 310, contratoBp: null, diferencaBp: null }))
    && ["7001", "7002", "7005", "7006"].every((n) => item(ft, n)?.status === "casada")
    && [1, 2].every((k) => item(ft, "7004", k)?.status === "casada"),
  () => resumo(ft?.itens.map((i) => [i.nsu, i.parcela, i.status, i.extrato?.taxa])));
  caso(C.FT_DIF, () => item(ft, "7003")?.status === "casada"
    && resumo(tx("7003")) === resumo({ resultado: "diferente", tipo: "credito_vista", extratoBp: 265, contratoBp: 299, diferencaBp: -34 })
    && /2,65%/.test(item(ft, "7003")!.frase) && /2,99%/.test(item(ft, "7003")!.frase) && /crédito à vista/.test(item(ft, "7003")!.frase),
  () => resumo(item(ft, "7003")));
  caso(C.FT_DUAS, () => item(ft, "7007")?.status === "data_diferente" && item(ft, "7007")?.diferencaDias === 2
    && tx("7007")?.resultado === "diferente" && tx("7007")?.diferencaBp === 187
    && item(ft, "7008")?.status === "so_no_extrato" && tx("7008")?.resultado === "diferente",
  () => resumo([item(ft, "7007"), item(ft, "7008")]));
  caso(C.FT_RESUMO, () => resumo(ft!.resumo.taxa.porResultado) === resumo({ diferente: 4, igual: 1, sem_contrato: 2, sem_extrato: 1, tipo_desconhecido: 1, sem_conclusao: 0, outra_maquininha: 0, venda_cancelada: 0, estorno_parcial: 0 })
    && ft!.resumo.grupos.divergencias === 2 && ft!.resumo.itensComDivergencia === 4 && ft!.resumo.taxa.parcelasComTaxaInformada === 8,
  () => resumo({ t: ft?.resumo.taxa, g: ft?.resumo.grupos, d: ft?.resumo.itensComDivergencia }));
  caso(C.FT_SEM_REAIS, () => (ft?.itens ?? []).every((i) => !i.extrato
    || (resumo(Object.keys(i.extrato.taxa).sort()) === resumo(["contratoBp", "diferencaBp", "extratoBp", "resultado", "tipo"])
      && !Object.keys(i.extrato).some((k) => /taxa.*(centavos|reais)/i.test(k))
      && !Object.keys(i.extrato.aguardandoDefinicao).some((k) => /taxa.*(centavos|reais)/i.test(k))))
    && (ft?.itens.length ?? 0) > 0,
  () => resumo(ft?.itens[0]?.extrato));

  /* F13 — a venda cancelada no extrato numa parcela só */
  const f13 = seguro(F13());
  caso(C.F13, () => item(f13, "20001", 1)?.status === "cancelada_no_extrato"
    && [2, 3].every((k) => item(f13, "20001", k)?.status === "inconclusivo" && item(f13, "20001", k)?.motivo === "venda_cancelada_no_extrato"
      && item(f13, "20001", k)!.frase === "A Pinbank cancelou esta venda (em outra parcela do extrato); esta parcela não aparece — confira o cancelamento no sistema.")
    && f13!.resumo.porStatus.so_no_sistema.quantidade === 0 && f13!.resumo.porStatus.so_no_sistema.centavosSistema === null
    && f13!.resumo.grupos.divergencias === 1 && item(f13, "20002")?.status === "casada",
  () => resumo(f13?.itens.map((i) => [i.nsu, i.parcela, i.status, i.motivo])));

  /* F14 — o título de taxa repetido conta UMA vez */
  const f14 = seguro(F14());
  caso(C.F14, () => f14!.itens.length === 2 && f14!.itens.every((i) => i.status === "inconclusivo" && i.motivo === "chave_repetida_no_sistema")
    && f14!.resumo.taxa.centavosTaxaNoSistema === 265 && f14!.resumo.taxa.titulosDeTaxaNoSistema === 1
    && f14!.itens.every((i) => i.sistema!.taxaCentavos === 265),
  () => resumo({ t: f14?.resumo.taxa, i: f14?.itens.map((i) => [i.status, i.motivo, i.sistema?.taxaCentavos]) }));

  /* F15 — desfeita no sistema, viva no extrato */
  const f15 = seguro(F15());
  caso(C.F15, () => item(f15, "3001")?.status === "cancelada_so_no_sistema" && item(f15, "3001")?.motivo === "desfeita_sem_titulo"
    && item(f15, "3001")!.sistema === null
    && item(f15, "3001")!.frase === "Desfeita no sistema antes de virar título; no extrato da Pinbank a venda continua valendo."
    && f15!.resumo.porStatus.so_no_extrato.quantidade === 0 && item(f15, "3002")?.status === "casada",
  () => resumo(f15?.itens.map((i) => [i.nsu, i.status, i.motivo, i.frase])));

  /* FG — a linha ilegível sem número */
  const fg = seguro(FG());
  caso(C.FG, () => item(fg, "26001")?.status === "inconclusivo" && item(fg, "26001")?.motivo === "linha_ilegivel_no_extrato"
    && item(fg, "26004", 1)?.status === "casada"
    && item(fg, "26004", 2)?.status === "inconclusivo" && item(fg, "26004", 2)?.motivo === "linha_ilegivel_no_extrato"
    && item(fg, "26005")?.status === "so_no_sistema" && item(fg, "26005")?.motivo === "venda_ausente_do_extrato"
    && fg!.resumo.porStatus.so_no_sistema.quantidade === 1 && fg!.resumo.porStatus.linha_ilegivel.quantidade === 1,
  () => resumo(fg?.itens.map((i) => [i.nsu, i.parcela, i.status, i.motivo])));

  /* o aviso que ATESTA a venda em comum */
  const forjado = (ev: Ev[]) => seguro({ ...FX_EC_ERRADO(), titulos: [R(987650002, 1, 412.87, "2025-08-18", "2025-07-19")], eventos: ev });
  const fxSemAviso = forjado([]);
  // Os avisos no DIA DA VENDA da linha (19/07): o que decide aqui é a maquininha de onde vieram.
  const fxAvisoExcluido = forjado([EV(987650002, { vinculo_id: "vAntigo", ocorrido_em: "2025-07-19T14:00:00Z" })]);
  const fxAvisoDaMaquininha = forjado([EV(987650002, { ocorrido_em: "2025-07-19T14:00:00Z" })]);
  caso(C.ATESTADO, () => f1!.resumo.nsusEmComum === 14 && f1!.resumo.nsusEmComumAtestados === 1
    && fxSemAviso!.resumo.nsusEmComum === 1 && fxSemAviso!.resumo.nsusEmComumAtestados === 0
    && fxAvisoExcluido!.resumo.nsusEmComum === 1 && fxAvisoExcluido!.resumo.nsusEmComumAtestados === 0
    && fxAvisoDaMaquininha!.resumo.nsusEmComumAtestados === 1,
  () => resumo([f1?.resumo.nsusEmComum, f1?.resumo.nsusEmComumAtestados, fxSemAviso?.resumo.nsusEmComumAtestados, fxAvisoExcluido?.resumo.nsusEmComumAtestados, fxAvisoDaMaquininha?.resumo.nsusEmComumAtestados]));

  /* o aviso só atesta no DIA DA VENDA */
  const comAviso = (ev: Partial<Ev>) => seguro({
    ...FX_EC_ERRADO(),
    // O título forjado, de FORA da janela (cancelado em 2023): entra em comum para o motor.
    titulos: [R(987650002, 1, 412.87, "2023-03-01", "2023-01-30", "cancelado")],
    eventos: [EV(987650002, ev)],
  });
  const fx2023 = comAviso({ situacao: "erro", event_type: "Compra.TransacaoNegada", ocorrido_em: "2023-01-30T12:00:00Z" });
  const fx3dias = comAviso({ ocorrido_em: "2025-07-22T12:00:00Z" });
  const fxNoDia = comAviso({ ocorrido_em: "2025-07-19T14:00:00Z" });
  const fxDiaSeguinteUtc = comAviso({ ocorrido_em: "2025-07-20T01:30:00Z" });
  caso(C.ATESTADO_DIA, () => [fx2023, fx3dias, fxNoDia, fxDiaSeguinteUtc].every((x) => x!.resumo.nsusEmComum === 1)
    && fx2023!.resumo.nsusEmComumAtestados === 0 && fx3dias!.resumo.nsusEmComumAtestados === 0
    && fxNoDia!.resumo.nsusEmComumAtestados === 1 && fxDiaSeguinteUtc!.resumo.nsusEmComumAtestados === 1
    && m.eng.avisoNoDiaDaVenda("2025-07-20T01:30:00+00:00", "2025-07-19T22:30:00") && !m.eng.avisoNoDiaDaVenda("2025-07-21T00:00:00+00:00", "2025-07-19")
    && !m.eng.avisoNoDiaDaVenda(null, "2025-07-19") && !m.eng.avisoNoDiaDaVenda("2025-07-19T10:00:00Z", null),
  () => resumo([fx2023, fx3dias, fxNoDia, fxDiaSeguinteUtc].map((x) => [x?.resumo.nsusEmComum, x?.resumo.nsusEmComumAtestados])));

  /* a maquininha trocada: o sinal de um lado só */
  const fpAntiga = seguro(FP());
  const fpOutroDia = seguro(FP("v0", "2025-07-01T13:00:00Z", "2025-07-01T13:00:00Z"));
  const fpNova = seguro(FP("v1"));
  caso(C.TROCADA, () => fpAntiga!.resumo.nsusEmComum === 2 && fpAntiga!.resumo.nsusEmComumAtestados === 0
    && fpAntiga!.resumo.nsusDoExtratoDeMaquininhaExcluida === 2 && fpAntiga!.itens.every((i) => i.status === "casada")
    && fpOutroDia!.resumo.nsusDoExtratoDeMaquininhaExcluida === 0
    && fpNova!.resumo.nsusEmComumAtestados === 2 && fpNova!.resumo.nsusDoExtratoDeMaquininhaExcluida === 0,
  () => resumo([fpAntiga, fpOutroDia, fpNova].map((x) => [x?.resumo.nsusEmComum, x?.resumo.nsusEmComumAtestados, x?.resumo.nsusDoExtratoDeMaquininhaExcluida])));

  /* os dois lados, sem cruzar */
  caso(C.LADOS, () => resumo(f1!.resumo.lados) === resumo({ extrato: { linhas: 22, vendas: 16 }, sistema: { parcelas: 19, vendas: 14, centavos: 147604 } }),
    () => resumo(f1?.resumo.lados));
  const fvivos = seguro(FVIVOS());
  caso(C.LADOS_VIVOS, () => resumo(fvivos!.resumo.lados) === resumo({ extrato: { linhas: 1, vendas: 1 }, sistema: { parcelas: 2, vendas: 2, centavos: 9000 } }),
    () => resumo(fvivos?.resumo.lados));

  /* a venda dividida em números de parcelas diferentes */
  const fv = seguro(FV());
  caso(C.PARCELAS_V, () => {
    const [a1, a2, a3] = [1, 2, 3].map((k) => item(fv, "22001", k)!);
    const [b1, b2, b3] = [1, 2, 3].map((k) => item(fv, "22002", k)!);
    return a1.status === "valor_diferente" && a1.diferencaCentavos === 20000 && a1.sinais.includes("parcelas_diferentes") && a1.sinais.includes("total_da_venda_igual")
      && [a2, a3].every((i) => i.status === "inconclusivo" && i.motivo === "parcelas_diferentes_no_extrato" && i.extrato === null
        && i.sinais.includes("parcelas_diferentes") && i.sinais.includes("total_da_venda_igual") && i.totalParcelasExtrato === 1 && i.totalParcelasSistema === 3)
      && a2.frase === "O extrato divide esta venda em 1 parcela e o sistema em 3 parcelas; o valor desta parcela pode estar nas parcelas do outro lado — a ausência não é afirmada. O total bruto da venda é o mesmo nos dois lados."
      && b1.status === "valor_diferente" && b1.sinais.includes("total_da_venda_diferente") && !b1.sinais.includes("total_da_venda_igual")
      && [b2, b3].every((i) => i.status === "inconclusivo" && i.sinais.includes("total_da_venda_diferente"))
      && / O total bruto da venda também é diferente nos dois lados\.$/.test(b2.frase)
      && fv!.resumo.porStatus.so_no_sistema.quantidade === 0 && fv!.resumo.porStatus.so_no_sistema.centavosSistema === null
      && fv!.resumo.porStatus.inconclusivo.centavosSistema === 40000
      // A vista: a p1 da 22001 (valor diferente) e as TRÊS da 22002 (o total diferente); a p2 e a p3 da 22001, com o total igual, não.
      && [a1, b1, b2, b3].every((i) => m.eng.itemComDivergencia(i)) && [a2, a3].every((i) => !m.eng.itemComDivergencia(i))
      && fv!.resumo.itensComDivergencia === 4;
  }, () => resumo(fv?.itens.map((i) => [i.nsu, i.parcela, i.status, i.motivo, i.sinais, i.frase])));
  const fl = seguro(FL());
  caso(C.PARCELAS_L, () => {
    const pares = Array.from({ length: 10 }, (_, k) => item(fl, "23001", k + 1));
    const sobras = [11, 12].map((k) => item(fl, "23001", k));
    return pares.every((i) => i?.status === "valor_diferente" && i.sinais.includes("parcelas_diferentes") && i.sinais.includes("total_da_venda_igual"))
      && sobras.every((i) => i?.status === "inconclusivo" && i.motivo === "parcelas_diferentes_no_extrato" && i.sistema === null
        && i.totalParcelasExtrato === 12 && i.totalParcelasSistema === 10 && i.sinais.includes("total_da_venda_igual"))
      && fl!.resumo.porStatus.so_no_extrato.quantidade === 0 && fl!.resumo.porStatus.so_no_extrato.centavosExtrato === null
      && fl!.resumo.porStatus.inconclusivo.centavosExtrato === 16670;
  }, () => resumo(fl?.itens.map((i) => [i.parcela, i.status, i.motivo, i.sinais])));
  const fborda = seguro(FBORDA());
  caso(C.BORDA_MESMAS, () => item(fborda, "24501", 3)?.status === "so_no_sistema" && item(fborda, "24501", 3)?.motivo === "parcela_ausente_no_extrato"
    && [1, 2].every((k) => item(fborda, "24501", k)?.status === "casada" && !item(fborda, "24501", k)!.sinais.includes("parcelas_diferentes")),
  () => resumo(fborda?.itens.map((i) => [i.parcela, i.status, i.motivo])));

  /* FTOT — o total da venda diferente com números de parcelas diferentes */
  const ftot = seguro(FTOT());
  const naVista = (i: Relatorio["itens"][number] | undefined) => !!i && m.eng.itemComDivergencia(i);
  const PARCELAS_E_TOTAL_DIF = " O extrato e o sistema dividem a venda em números de parcelas diferentes. O total bruto da venda também é diferente nos dois lados.";
  const semPar = (nE: number, nS: number, total: string) =>
    `O extrato divide esta venda em ${nE} parcelas e o sistema em ${nS} ${nS === 1 ? "parcela" : "parcelas"}; o valor desta parcela pode estar nas parcelas do outro lado — a ausência não é afirmada.${total}`;
  const TOTAL_DIF = " O total bruto da venda também é diferente nos dois lados.";
  caso(C.TOTAL_ULTIMA, () => {
    const [p1, p2, p3] = [1, 2, 3].map((k) => item(ftot, "31001", k)!);
    return [p1, p2].every((i) => i.status === "casada" && i.sinais.includes("parcelas_diferentes") && i.sinais.includes("total_da_venda_diferente")
        && i.diferencaCentavos === 0 && naVista(i))
      && p1.frase === `Mesma data de repasse (11/08/2025) e mesmo valor bruto nos dois lados.${PARCELAS_E_TOTAL_DIF}`
      && p3.status === "inconclusivo" && p3.motivo === "parcelas_diferentes_no_extrato" && p3.sistema === null && naVista(p3)
      && p3.frase === semPar(3, 2, TOTAL_DIF)
      && itensDe(ftot, "31001").every((i) => i.status !== "so_no_extrato" && i.status !== "so_no_sistema");
  }, () => resumo(itensDe(ftot, "31001").map((i) => [i.parcela, i.status, i.motivo, i.sinais, i.frase])));
  caso(C.TOTAL_LANCADO, () => {
    const [p1, p2, p3] = [1, 2, 3].map((k) => item(ftot, "31002", k)!);
    return [p1, p2].every((i) => i.status === "casada" && i.sinais.includes("total_da_venda_diferente") && naVista(i))
      && p2.frase === `Mesma data de repasse (11/09/2025) e mesmo valor bruto nos dois lados.${PARCELAS_E_TOTAL_DIF}`
      && p3.status === "inconclusivo" && p3.motivo === "parcelas_diferentes_no_extrato" && p3.extrato === null && naVista(p3)
      && p3.sistema!.valorCentavos === 10000 && p3.frase === semPar(2, 3, TOTAL_DIF)
      && itensDe(ftot, "31002").every((i) => i.status !== "so_no_extrato" && i.status !== "so_no_sistema");
  }, () => resumo(itensDe(ftot, "31002").map((i) => [i.parcela, i.status, i.motivo, i.sinais, i.frase])));
  caso(C.TOTAL_IGUAL, () => {
    const [p1, p2, p3] = [1, 2, 3].map((k) => item(ftot, "31003", k)!);
    return [p1, p2].every((i) => i.status === "valor_diferente" && i.diferencaCentavos === 5000 && i.sinais.includes("total_da_venda_igual") && naVista(i))
      && p3.status === "inconclusivo" && p3.motivo === "parcelas_diferentes_no_extrato" && p3.sinais.includes("total_da_venda_igual")
      && !naVista(p3) && / O total bruto da venda é o mesmo nos dois lados\.$/.test(p3.frase)
      && itensDe(ftot, "31003").every((i) => !i.sinais.includes("total_da_venda_diferente"))
      && itensDe(ftot, "31003").filter(naVista).length === 2;
  }, () => resumo(itensDe(ftot, "31003").map((i) => [i.parcela, i.status, i.motivo, i.sinais, naVista(i)])));
  caso(C.TOTAL_LACUNA, () => {
    const [p1, p2, p3] = [1, 2, 3].map((k) => item(ftot, "31004", k)!);
    return p2.status === "casada" && p2.sinais.includes("total_da_venda_diferente") && naVista(p2)
      && [p1, p3].every((i) => i.status === "inconclusivo" && i.motivo === "parcelas_diferentes_no_extrato" && i.sistema === null
        && i.sinais.includes("total_da_venda_diferente") && naVista(i) && i.frase.endsWith(TOTAL_DIF));
  }, () => resumo(itensDe(ftot, "31004").map((i) => [i.parcela, i.status, i.motivo, i.sinais])));
  caso(C.TOTAL_RESUMO, () => ftot!.itens.length === 12 && ftot!.resumo.itensComDivergencia === 11
    && resumo(ftot!.resumo.grupos) === resumo({ conferidas: 5, divergencias: 2, semConclusao: 5 })
    && ["so_no_extrato", "so_no_sistema"].every((st) => resumo(ftot!.resumo.porStatus[st as Status]) === resumo({ quantidade: 0, centavosExtrato: null, centavosSistema: null })),
  () => resumo({ n: ftot?.itens.length, d: ftot?.resumo.itensComDivergencia, g: ftot?.resumo.grupos, s: ftot?.resumo.porStatus.so_no_sistema, e: ftot?.resumo.porStatus.so_no_extrato }));

  /* FDISC — as linhas do extrato discordam no número de parcelas */
  const fdisc = seguro(FDISC());
  const DISCORDAM = "As linhas do extrato desta venda não concordam no número de parcelas; a ausência desta parcela não é afirmada.";
  caso(C.FRASE_DISCORDAM, () => {
    const p2 = item(fdisc, "6201", 2)!;
    const p3 = item(fdisc, "6201", 3)!;
    return p2.status === "inconclusivo" && p2.motivo === "parcelas_diferentes_no_extrato" && p2.sistema === null && p2.frase === DISCORDAM
      && p2.totalParcelasExtrato === 3
      && p3.status === "inconclusivo" && p3.motivo === "parcelas_diferentes_no_extrato" && p3.extrato === null && p3.frase === DISCORDAM
      && !fdisc!.itens.some((i) => /divide esta venda em 3 parcelas e o sistema em 3/.test(i.frase))
      && fdisc!.resumo.porStatus.so_no_extrato.quantidade === 0 && fdisc!.resumo.porStatus.so_no_sistema.quantidade === 0;
  }, () => resumo(fdisc?.itens.map((i) => [i.parcela, i.status, i.motivo, i.frase])));

  /* FSEMEC — a linha sem o código do estabelecimento */
  const fsemec = seguro(FSEMEC());
  caso(C.SEM_EC, () => {
    const a = item(fsemec, "5001")!, b1 = item(fsemec, "5002", 1)!, b2 = item(fsemec, "5002", 2)!, c = item(fsemec, "5003")!;
    const FRASE = "O extrato traz uma linha sem o código do estabelecimento que pode ser esta venda; a ausência não é afirmada.";
    return [a, b1].every((i) => i.status === "inconclusivo" && i.motivo === "linha_sem_estabelecimento" && i.extrato === null && i.frase === FRASE && !naVista(i))
      && b2.status === "casada"
      && c.status === "so_no_sistema" && c.motivo === "venda_ausente_do_extrato"
      && !fsemec!.itens.some((i) => i.extrato?.brutoVendaCentavos === 20000)
      && fsemec!.resumo.porStatus.so_no_sistema.quantidade === 1;
  }, () => resumo(fsemec?.itens.map((i) => [i.nsu, i.parcela, i.status, i.motivo])));

  /* FVIZ — a linha ilegível no dia vizinho */
  const fviz = seguro(FVIZ());
  caso(C.ILEGIVEL_VIZINHO, () => item(fviz, "7001")?.status === "inconclusivo" && item(fviz, "7001")?.motivo === "linha_ilegivel_no_extrato"
    && item(fviz, "7002")?.status === "so_no_sistema" && item(fviz, "7002")?.motivo === "venda_ausente_do_extrato",
  () => resumo(fviz?.itens.map((i) => [i.nsu, i.status, i.motivo])));

  /* FLAC — a parcela que falta nos dois lados */
  const flac = seguro(FLAC());
  caso(C.LACUNA_NOS_DOIS, () => {
    const a = itensDe(flac, "32001");
    const p3d = item(flac, "32004", 3)!;
    const LACUNA = "Mesma data de repasse (11/09/2025) e mesmo valor bruto nos dois lados. Uma parcela desta venda não está nem no extrato nem no sistema, e o total bruto da venda é diferente nos dois lados.";
    return a.length === 2 && a.every((i) => i.status === "casada" && i.sinais.includes("total_da_venda_diferente") && naVista(i))
      && item(flac, "32001", 2)?.frase === LACUNA
      && itensDe(flac, "32002").every((i) => i.status === "casada" && !i.sinais.includes("total_da_venda_diferente") && !naVista(i))
      && item(flac, "32003", 1)?.status === "so_no_sistema"
      && [2, 3].every((k) => { const i = item(flac, "32003", k)!; return i.status === "casada" && !i.sinais.includes("total_da_venda_diferente") && !naVista(i); })
      && p3d.status === "valor_diferente"
      && [1, 2].every((k) => { const i = item(flac, "32004", k)!; return i.status === "casada" && !i.sinais.includes("total_da_venda_diferente") && !naVista(i); });
  }, () => resumo(flac?.itens.map((i) => [i.nsu, i.parcela, i.status, i.sinais])));

  /* FIRMA — a taxa com outra maquininha no mesmo estabelecimento */
  const firma = seguro(FIRMA()), sozinha = seguro(FIRMA(false));
  caso(C.IRMA, () => [33001, 33003].every((n) => { const i = item(firma, String(n))!; return i.extrato!.taxa.resultado === "outra_maquininha" && i.extrato!.taxa.diferencaBp === null && !naVista(i); })
    && item(firma, "33002")?.extrato?.taxa.resultado === "igual"
    && item(sozinha, "33001")?.extrato?.taxa.resultado === "diferente" && naVista(item(sozinha, "33001"))
    && firma!.resumo.taxa.porResultado.outra_maquininha === 2,
  () => resumo({ irma: firma?.itens.map((i) => [i.nsu, i.extrato?.taxa.resultado]), so: sozinha?.itens.map((i) => [i.nsu, i.extrato?.taxa.resultado]), pr: firma?.resumo.taxa.porResultado }));

  /* FT2 — a taxa da venda cancelada */
  const ft2 = seguro(FT2());
  caso(C.FT2, () => item(ft2, "1001")?.status === "cancelada_nos_dois" && item(ft2, "2001")?.status === "cancelada_nos_dois"
    && ["1001", "2001"].every((n) => resumo(item(ft2, n)!.extrato!.taxa) === resumo({ resultado: "venda_cancelada", tipo: "debito", extratoBp: 0, contratoBp: 163, diferencaBp: null })
      && !/Taxa:/.test(item(ft2, n)!.frase))
    && item(ft2, "1002")?.status === "casada" && item(ft2, "1002")!.extrato!.taxa.resultado === "igual"
    && ft2!.resumo.itensComDivergencia === 0 && ft2!.resumo.taxa.porResultado.venda_cancelada === 2 && ft2!.resumo.taxa.porResultado.diferente === 0,
  () => resumo({ d: ft2?.resumo.itensComDivergencia, t: ft2?.resumo.taxa.porResultado, i: ft2?.itens.map((i) => [i.nsu, i.status, i.extrato?.taxa, i.frase]) }));

  /* FT3 — o parcelado em 1x */
  const ft3 = seguro(FT3());
  caso(C.FT3, () => resumo(item(ft3, "4001")?.extrato?.taxa) === resumo({ resultado: "igual", tipo: "credito_vista", extratoBp: 265, contratoBp: 265, diferencaBp: null })
    && [1, 2].every((k) => resumo(item(ft3, "4002", k)?.extrato?.taxa) === resumo({ resultado: "igual", tipo: "parcelado", extratoBp: 310, contratoBp: 310, diferencaBp: null }))
    && ft3!.resumo.itensComDivergencia === 0
    && m.eng.tipoDaCompraNoExtrato("PARCELADO", null) === null && m.eng.tipoDaCompraNoExtrato("Crédito parcelado", 12) === "parcelado"
    && m.eng.tipoDaCompraNoExtrato("PARCELADO EMISSOR", 1) === "credito_vista",
  () => resumo({ d: ft3?.resumo.itensComDivergencia, i: ft3?.itens.map((i) => [i.nsu, i.parcela, i.extrato?.taxa]) }));

  /* FB — a taxa cobrada sem o título dela no sistema */
  const fb = seguro(FB());
  caso(C.FB, () => item(fb, "21001")?.status === "casada" && item(fb, "21001")!.sinais.includes("taxa_sem_titulo_no_sistema")
    && item(fb, "21001")!.extrato!.taxa.resultado === "igual"
    && item(fb, "21001")!.frase.endsWith(" O sistema não lançou a taxa desta parcela.")
    && !item(fb, "21002")!.sinais.includes("taxa_sem_titulo_no_sistema") && item(fb, "21002")!.sistema!.taxaCentavos === 265
    && item(fb, "21003")!.extrato!.taxa.resultado === "sem_contrato" && !item(fb, "21003")!.sinais.includes("taxa_sem_titulo_no_sistema")
    && fb!.resumo.itensComDivergencia === 1 && fb!.resumo.grupos.divergencias === 0,
  () => resumo({ d: fb?.resumo.itensComDivergencia, i: fb?.itens.map((i) => [i.nsu, i.status, i.sinais, i.extrato?.taxa.resultado, i.frase]) }));

  /* FTOL — a tolerância estrita, contra o contrato exato */
  const ftol = seguro(FTOL());
  const tt = (nsu: string, k = 1) => item(ftol, nsu, k)?.extrato?.taxa;
  caso(C.FT_TOLERANCIA, () =>
    resumo(tt("9101")) === resumo({ resultado: "diferente", tipo: "debito", extratoBp: 162, contratoBp: 163, diferencaBp: -1 })
    && resumo(tt("9102")) === resumo({ resultado: "diferente", tipo: "credito_vista", extratoBp: 200, contratoBp: 199, diferencaBp: 1 })
    && [1, 2].every((k) => resumo(tt("9103", k)) === resumo({ resultado: "igual", tipo: "parcelado", extratoBp: 199, contratoBp: 200, diferencaBp: null }))
    && [1, 2].every((k) => resumo(tt("9104", k)) === resumo({ resultado: "igual", tipo: "parcelado", extratoBp: 200, contratoBp: 200, diferencaBp: null }))
    && (ftol?.itens ?? []).every((i) => i.status === "casada") && ftol!.itens.length === 6 && ftol!.resumo.itensComDivergencia === 2
    && m.eng.pontosBaseExatosDaFracao(0.0163) === 163 && m.eng.pontosBaseExatosDaFracao(0.01995) === 199.5,
  () => resumo(ftol?.itens.map((i) => [i.nsu, i.parcela, i.status, i.extrato?.taxa])));

  /* FT4 — o estorno parcial com taxa cadastrada */
  const ft4 = seguro(FT4());
  caso(C.FT4, () => item(ft4, "1100")?.status === "inconclusivo" && item(ft4, "1100")?.motivo === "reembolso_parcial"
    && resumo(item(ft4, "1100")!.extrato!.taxa) === resumo({ resultado: "estorno_parcial", tipo: "credito_vista", extratoBp: 265, contratoBp: 199, diferencaBp: null })
    && m.eng.ROTULO_RESULTADO_TAXA.estorno_parcial === "Venda com estorno parcial: taxa não comparada"
    && !/Taxa:/.test(item(ft4, "1100")!.frase) && ft4!.resumo.itensComDivergencia === 0
    && ft4!.resumo.taxa.porResultado.estorno_parcial === 1 && ft4!.resumo.taxa.porResultado.venda_cancelada === 0,
  () => resumo({ i: item(ft4, "1100"), t: ft4?.resumo.taxa.porResultado }));

  /* FBZ — a taxa que a regra do sistema nem lançaria, e a de 12x sem parte negativa */
  const fbz = seguro(FBZ());
  caso(C.FBZ, () => (fbz?.itens ?? []).length === 13
    && fbz!.itens.every((i) => i.status === "casada" && !i.sinais.includes("taxa_sem_titulo_no_sistema") && i.extrato!.taxa.resultado === "igual")
    && item(fbz, "25002", 12)!.sistema!.taxaCentavos === 9 && item(fbz, "25002", 1)!.sistema!.taxaCentavos === 2
    && item(fbz, "25001")!.sistema!.taxaCentavos === null
    && fbz!.resumo.itensComDivergencia === 0,
  () => resumo(fbz?.itens.map((i) => [i.nsu, i.parcela, i.status, i.sinais, i.extrato?.taxa.resultado, i.sistema?.taxaCentavos])));
  const fbz2 = seguro(FBZ2());
  caso(C.FBZ2, () => (fbz2?.itens ?? []).length === 13
    && item(fbz2, "25002", 12)!.sinais.includes("taxa_sem_titulo_no_sistema") && item(fbz2, "25002", 12)!.status === "casada"
    && fbz2!.itens.filter((i) => i.sinais.includes("taxa_sem_titulo_no_sistema")).length === 1
    && fbz2!.resumo.itensComDivergencia === 1,
  () => resumo(fbz2?.itens.map((i) => [i.nsu, i.parcela, i.status, i.sinais])));

  /* LIQ12 — a folga do líquido cresce com as parcelas */
  const liq12a = seguro(LIQ12(12));
  const liq12b = seguro(LIQ12(13));
  caso(C.LIQ_12X, () => {
    const a = item(liq12a, "42001", 1)!;
    const b = item(liq12b, "42001", 1)!;
    return resumo(a.liquidoDaVenda) === resumo({ extratoCentavos: 957, sistemaCentavos: 969, parcelas: 12 })
      && itensDe(liq12a, "42001").every((i) => i.sinais.includes("liquido_da_venda_igual")) && liq12a!.resumo.itensComDivergencia === 0
      && resumo(b.liquidoDaVenda) === resumo({ extratoCentavos: 956, sistemaCentavos: 969, parcelas: 12 })
      && itensDe(liq12b, "42001").every((i) => i.sinais.includes("liquido_da_venda_diferente")) && liq12b!.resumo.itensComDivergencia === 12
      && liq12b!.resumo.liquido.vendasDiferentes === 1;
  }, () => resumo({ a: item(liq12a, "42001", 1)?.liquidoDaVenda, sa: item(liq12a, "42001", 1)?.sinais, b: item(liq12b, "42001", 1)?.liquidoDaVenda, sb: item(liq12b, "42001", 1)?.sinais }));

  /* o invariante do cartão × tabela, em todas */
  const invariante = (rel: Relatorio | null): string[] => {
    if (!rel) return ["sem relatório"];
    const erros: string[] = [];
    const total = Object.values(rel.resumo.porStatus).map((l) => l.quantidade).reduce((a, b) => a + b, 0);
    if (total !== rel.itens.length) erros.push(`Σ quantidade ${total} ≠ ${rel.itens.length} itens`);
    // A vista de divergências: status do grupo de divergências OU taxa diferente OU a taxa sem título OU o
    // total da venda diferente (lista LITERAL, não a do motor).
    const DIVERGENTES = ["data_diferente", "valor_diferente", "data_e_valor_diferentes", "cancelada_no_extrato", "cancelada_so_no_sistema", "so_no_extrato", "so_no_sistema"];
    const naVista = rel.itens.filter((i) => DIVERGENTES.includes(i.status) || i.extrato?.taxa.resultado === "diferente"
      || i.extrato?.antecipacao.resultado === "diferente"
      || i.sinais.includes("taxa_sem_titulo_no_sistema") || i.sinais.includes("total_da_venda_diferente")
      || i.sinais.includes("liquido_da_venda_diferente")).length;
    if (naVista !== rel.resumo.itensComDivergencia) erros.push(`itensComDivergencia ${rel.resumo.itensComDivergencia} ≠ ${naVista}`);
    const comExtrato = rel.itens.filter((i) => i.extrato).length;
    const somaTaxa = Object.values(rel.resumo.taxa.porResultado).reduce((a, b) => a + b, 0);
    if (somaTaxa !== comExtrato) erros.push(`Σ porResultado ${somaTaxa} ≠ ${comExtrato} itens com extrato`);
    for (const [r, n] of Object.entries(rel.resumo.taxa.porResultado)) {
      const m = rel.itens.filter((i) => i.extrato?.taxa.resultado === r).length;
      if (m !== n) erros.push(`taxa ${r}: ${n} ≠ ${m}`);
    }
    const somaAnt = Object.values(rel.resumo.antecipacao.porResultado).reduce((a, b) => a + b, 0);
    if (somaAnt !== comExtrato) erros.push(`Σ antecipação ${somaAnt} ≠ ${comExtrato} itens com extrato`);
    for (const [r, n] of Object.entries(rel.resumo.antecipacao.porResultado)) {
      const m = rel.itens.filter((i) => i.extrato?.antecipacao.resultado === r).length;
      if (m !== n) erros.push(`antecipação ${r}: ${n} ≠ ${m}`);
    }
    // O líquido: uma vez por VENDA, e o sinal em TODA parcela dela concorda com os valores (folga de 1 centavo).
    const vendasLiq = new Map<string, { extratoCentavos: number; sistemaCentavos: number }>();
    for (const i of rel.itens) if (i.liquidoDaVenda && i.nsu) vendasLiq.set(i.nsu, i.liquidoDaVenda);
    const vs = Array.from(vendasLiq.values());
    const dif = vs.filter((x) => Math.abs(x.extratoCentavos - x.sistemaCentavos) > 1).length;
    const esperado = {
      vendasComparadas: vs.length, vendasIguais: vs.length - dif, vendasDiferentes: dif,
      centavosExtrato: vs.length ? vs.map((x) => x.extratoCentavos).reduce((a, b) => a + b, 0) : null,
      centavosSistema: vs.length ? vs.map((x) => x.sistemaCentavos).reduce((a, b) => a + b, 0) : null,
    };
    if (resumo(rel.resumo.liquido) !== resumo(esperado)) erros.push(`líquido ${resumo(rel.resumo.liquido)} ≠ ${resumo(esperado)}`);
    for (const i of rel.itens) {
      const temIgual = i.sinais.includes("liquido_da_venda_igual");
      const temDif = i.sinais.includes("liquido_da_venda_diferente");
      if (!!i.liquidoDaVenda !== (temIgual || temDif) || (temIgual && temDif)) erros.push(`${i.id}: o sinal do líquido não acompanha os valores`);
      if (i.liquidoDaVenda && temDif !== (Math.abs(i.liquidoDaVenda.extratoCentavos - i.liquidoDaVenda.sistemaCentavos) > 1)) erros.push(`${i.id}: o sinal do líquido contradiz os valores`);
    }
    for (const [s, l] of Object.entries(rel.resumo.porStatus)) {
      const is = rel.itens.filter((i) => i.status === s);
      const ext = is.map((i) => i.extrato?.brutoParcelaEstimadoCentavos).filter((c): c is number => c != null);
      const sis = is.map((i) => i.sistema?.valorCentavos).filter((c): c is number => c != null);
      const somaE = ext.length ? ext.reduce((a, b) => a + b, 0) : null;
      const somaS = sis.length ? sis.reduce((a, b) => a + b, 0) : null;
      if (l.quantidade !== is.length || l.centavosExtrato !== somaE || l.centavosSistema !== somaS) erros.push(`${s}: ${resumo(l)} × ${is.length}/${somaE}/${somaS}`);
    }
    return erros;
  };
  /* FREAL — o extrato de produção */
  const freal = seguro(FREAL());
  const itemReal = (rel: Relatorio | null, nsu: number, k = 1) => item(rel, String(nsu), k);
  caso(C.REAL, () => {
    const r = freal!;
    const d = itemReal(r, 41001)!, v = itemReal(r, 41002)!, p1 = itemReal(r, 41003, 1)!, p2 = itemReal(r, 41003, 2)!;
    return r.itens.length === 4 && r.itens.every((i) => i.status === "casada" && i.extrato!.taxa.resultado === "igual" && i.extrato!.antecipacao.resultado === "igual"
        && i.sinais.includes("liquido_da_venda_igual") && !i.sinais.includes("liquido_da_venda_diferente"))
      && resumo(d.extrato!.antecipacao) === resumo({ resultado: "igual", tipo: "debito", esperada: "zero_no_debito", extratoBp: 0, contratoBp: 0, diferencaBp: null })
      && resumo(v.extrato!.antecipacao) === resumo({ resultado: "igual", tipo: "credito_vista", esperada: "contrato", extratoBp: 155, contratoBp: 155, diferencaBp: null })
      && resumo(p1.extrato!.antecipacao) === resumo({ resultado: "igual", tipo: "parcelado", esperada: "contrato", extratoBp: 155, contratoBp: 155, diferencaBp: null })
      && resumo([d.sistema!.taxaCentavos, d.sistema!.tarifaCentavos, d.sistema!.antecipacaoCentavos]) === resumo([8, 100, null])
      && resumo([v.sistema!.taxaCentavos, v.sistema!.tarifaCentavos, v.sistema!.antecipacaoCentavos]) === resumo([16, 100, 14])
      && resumo([p1.sistema!.taxaCentavos, p1.sistema!.tarifaCentavos, p1.sistema!.antecipacaoCentavos]) === resumo([11, 50, 11])
      && resumo([p2.sistema!.taxaCentavos, p2.sistema!.tarifaCentavos, p2.sistema!.antecipacaoCentavos]) === resumo([11, 50, 10])
      && resumo(d.liquidoDaVenda) === resumo({ extratoCentavos: 891, sistemaCentavos: 891, parcelas: 1 })
      && resumo(v.liquidoDaVenda) === resumo({ extratoCentavos: 869, sistemaCentavos: 869, parcelas: 1 })
      && resumo(p1.liquidoDaVenda) === resumo({ extratoCentavos: 856, sistemaCentavos: 856, parcelas: 2 }) && resumo(p2.liquidoDaVenda) === resumo(p1.liquidoDaVenda)
      && d.extrato!.liquidoCentavos === 891 && p2.extrato!.liquidoCentavos === 428
      && resumo(r.resumo.liquido) === resumo({ vendasComparadas: 3, vendasIguais: 3, vendasDiferentes: 0, centavosExtrato: 2616, centavosSistema: 2616 })
      && r.resumo.antecipacao.porResultado.igual === 4 && r.resumo.antecipacao.parcelasComAntecipacaoInformada === 4
      && r.resumo.antecipacao.titulosDeAntecipacaoNoSistema === 3 && r.resumo.antecipacao.centavosAntecipacaoNoSistema === 35
      && r.resumo.taxa.titulosDeTaxaNoSistema === 4 && r.resumo.taxa.centavosTaxaNoSistema === 46
      && r.resumo.itensComDivergencia === 0 && r.resumo.grupos.conferidas === 4;
  }, () => resumo({ itens: freal?.itens.map((i) => [i.nsu, i.parcela, i.status, i.sinais, i.extrato?.antecipacao, i.sistema && [i.sistema.taxaCentavos, i.sistema.tarifaCentavos, i.sistema.antecipacaoCentavos], i.liquidoDaVenda]), l: freal?.resumo.liquido, a: freal?.resumo.antecipacao }));

  const fantigo = seguro(FREAL({ titulos: TITULOS_ANTIGOS() }));
  caso(C.REAL_ANTIGO, () => {
    const r = fantigo!;
    const d = itemReal(r, 41001)!;
    return r.itens.length === 4 && r.itens.every((i) => i.status === "casada" && i.extrato!.taxa.resultado === "igual" && i.sinais.includes("liquido_da_venda_diferente"))
      && resumo(d.liquidoDaVenda) === resumo({ extratoCentavos: 891, sistemaCentavos: 990, parcelas: 1 })
      && resumo(itemReal(r, 41002)!.liquidoDaVenda) === resumo({ extratoCentavos: 869, sistemaCentavos: 981, parcelas: 1 })
      && resumo(itemReal(r, 41003, 2)!.liquidoDaVenda) === resumo({ extratoCentavos: 856, sistemaCentavos: 974, parcelas: 2 })
      && /R\$8,91/.test(d.frase) && /R\$9,90/.test(d.frase) && /tarifa fixa/.test(d.frase)
      && resumo(r.resumo.liquido) === resumo({ vendasComparadas: 3, vendasIguais: 0, vendasDiferentes: 3, centavosExtrato: 2616, centavosSistema: 2945 })
      && r.resumo.itensComDivergencia === 4 && r.resumo.grupos.divergencias === 0
      && d.sistema!.tarifaCentavos === null && d.sistema!.antecipacaoCentavos === null;
  }, () => resumo({ itens: fantigo?.itens.map((i) => [i.nsu, i.parcela, i.status, i.sinais, i.liquidoDaVenda, i.frase]), l: fantigo?.resumo.liquido, d: fantigo?.resumo.itensComDivergencia }));

  const fantDif = seguro(FREAL({ vinculo: { id: "v1", codigoCliente: EC, taxas: { ...CONTRATO_REAL, antecipacao_mes: 0.0199 }, antecipado: true } }));
  caso(C.ANT_DIF, () => {
    const r = fantDif!;
    const v = itemReal(r, 41002)!;
    return resumo(v.extrato!.antecipacao) === resumo({ resultado: "diferente", tipo: "credito_vista", esperada: "contrato", extratoBp: 155, contratoBp: 199, diferencaBp: -44 })
      && itemReal(r, 41003, 1)!.extrato!.antecipacao.resultado === "diferente" && itemReal(r, 41003, 2)!.extrato!.antecipacao.resultado === "diferente"
      && itemReal(r, 41001)!.extrato!.antecipacao.resultado === "igual"
      && r.itens.every((i) => i.status === "casada" && i.sinais.includes("liquido_da_venda_igual"))
      && /Antecipação: o extrato informa 1,55% ao mês e a cadastrada na maquininha é 1,99%\./.test(v.frase)
      && r.resumo.antecipacao.porResultado.diferente === 3 && r.resumo.antecipacao.porResultado.igual === 1
      && r.resumo.itensComDivergencia === 3 && r.resumo.grupos.divergencias === 0;
  }, () => resumo({ itens: fantDif?.itens.map((i) => [i.nsu, i.parcela, i.status, i.extrato?.antecipacao, i.frase]), d: fantDif?.resumo.itensComDivergencia }));

  const fantNao = seguro(FREAL({ vinculo: { id: "v1", codigoCliente: EC, taxas: CONTRATO_REAL, antecipado: false } }));
  caso(C.ANT_NAO, () => fantNao!.itens.length === 4
    && fantNao!.itens.every((i) => i.extrato!.antecipacao.resultado === "nao_antecipado" && i.extrato!.antecipacao.contratoBp === null && i.extrato!.antecipacao.diferencaBp === null)
    && fantNao!.resumo.antecipacao.porResultado.nao_antecipado === 4 && fantNao!.resumo.itensComDivergencia === 0,
  () => resumo({ a: fantNao?.itens.map((i) => i.extrato?.antecipacao), d: fantNao?.resumo.itensComDivergencia }));

  const { antecipacao_mes: _semAnt, ...semAntecipacao } = CONTRATO_REAL;
  void _semAnt;
  const fantSem = seguro(FREAL({ vinculo: { id: "v1", codigoCliente: EC, taxas: semAntecipacao, antecipado: true } }));
  caso(C.ANT_SEM, () => itemReal(fantSem, 41001)!.extrato!.antecipacao.resultado === "igual"
    && [itemReal(fantSem, 41002)!, itemReal(fantSem, 41003, 1)!, itemReal(fantSem, 41003, 2)!].every((i) =>
      resumo(i.extrato!.antecipacao) === resumo({ resultado: "sem_contrato", tipo: i.extrato!.antecipacao.tipo, esperada: "nao_cadastrada", extratoBp: 155, contratoBp: null, diferencaBp: null }))
    && fantSem!.resumo.antecipacao.porResultado.sem_contrato === 3 && fantSem!.resumo.itensComDivergencia === 0,
  () => resumo({ a: fantSem?.itens.map((i) => i.extrato?.antecipacao), d: fantSem?.resumo.itensComDivergencia }));

  // A venda de ANTES de ligar o repasse antecipado: crédito sem `:a` no sistema e zero no extrato.
  const fantAntes = seguro(FREAL({
    extrato: comLinha(41002, 1, { taxaMesBp: 0, liquidoRepasseCentavos: 883 }),
    titulos: TITULOS_REAIS().filter((t) => t.chave !== "pinbank:41002:1:a"),
  }));
  caso(C.ANT_ANTES, () => {
    const v = itemReal(fantAntes, 41002)!;
    return v.status === "casada"
      && resumo(v.extrato!.antecipacao) === resumo({ resultado: "venda_nao_antecipada", tipo: "credito_vista", esperada: "contrato", extratoBp: 0, contratoBp: 155, diferencaBp: null })
      && resumo(v.liquidoDaVenda) === resumo({ extratoCentavos: 883, sistemaCentavos: 883, parcelas: 1 }) && v.sinais.includes("liquido_da_venda_igual")
      && !/Antecipação:/.test(v.frase)
      && fantAntes!.resumo.antecipacao.porResultado.venda_nao_antecipada === 1 && fantAntes!.resumo.itensComDivergencia === 0;
  }, () => resumo({ a: itemReal(fantAntes, 41002)?.extrato?.antecipacao, l: itemReal(fantAntes, 41002)?.liquidoDaVenda, d: fantAntes?.resumo.itensComDivergencia }));
  // O contrário: o sistema lançou a antecipação e a Pinbank não a cobrou — isso É divergência.
  const fantSoSis = seguro(FREAL({ extrato: comLinha(41002, 1, { taxaMesBp: 0 }) }));
  caso(C.ANT_SO_NO_SISTEMA, () => {
    const v = itemReal(fantSoSis, 41002)!;
    return resumo(v.extrato!.antecipacao) === resumo({ resultado: "diferente", tipo: "credito_vista", esperada: "contrato", extratoBp: 0, contratoBp: 155, diferencaBp: -155 })
      && /Antecipação: o extrato informa 0,00% ao mês e a cadastrada na maquininha é 1,55%\./.test(v.frase)
      && fantSoSis!.resumo.itensComDivergencia === 1 && fantSoSis!.resumo.antecipacao.porResultado.diferente === 1;
  }, () => resumo({ a: itemReal(fantSoSis, 41002)?.extrato?.antecipacao, f: itemReal(fantSoSis, 41002)?.frase, d: fantSoSis?.resumo.itensComDivergencia }));
  caso(C.ANT_ESPERADA, () => {
    const linha = (tipoCompra: string, taxaMesBp: number | null = 0) => ({ tipoCompra, taxaMesBp, totalParcelas: 1 });
    const { antecipacao_mes: _a, ...semAnt } = CONTRATO_REAL;
    void _a;
    const voucher = m.eng.compararAntecipacao(linha("VOUCHER"), CONTRATO_REAL, true);
    return voucher.esperada === "tipo_desconhecido" && voucher.resultado === "tipo_desconhecido"
      && m.eng.compararAntecipacao(linha("A VISTA"), CONTRATO_REAL, false).esperada === "repasse_nao_antecipado"
      && m.eng.compararAntecipacao(linha("A VISTA", 155), semAnt, true).esperada === "nao_cadastrada"
      && m.eng.compararAntecipacao(linha("DEBITO"), CONTRATO_REAL, true).esperada === "zero_no_debito"
      && m.eng.compararAntecipacao(linha("A VISTA", 155), CONTRATO_REAL, true).esperada === "contrato";
  }, () => resumo([
    m.eng.compararAntecipacao({ tipoCompra: "VOUCHER", taxaMesBp: 0, totalParcelas: 1 }, CONTRATO_REAL, true),
    m.eng.compararAntecipacao({ tipoCompra: "A VISTA", taxaMesBp: 0, totalParcelas: 1 }, CONTRATO_REAL, false),
  ]));

  const fantDeb = seguro(FREAL({ extrato: comLinha(41001, 1, { taxaMesBp: 155 }) }));
  caso(C.ANT_DEB, () => {
    const d = itemReal(fantDeb, 41001)!;
    return resumo(d.extrato!.antecipacao) === resumo({ resultado: "diferente", tipo: "debito", esperada: "zero_no_debito", extratoBp: 155, contratoBp: 0, diferencaBp: 155 })
      && /Antecipação: o extrato informa 1,55% ao mês numa venda no débito, que não tem antecipação\./.test(d.frase)
      && fantDeb!.resumo.itensComDivergencia === 1;
  }, () => resumo({ a: itemReal(fantDeb, 41001)?.extrato?.antecipacao, f: itemReal(fantDeb, 41001)?.frase }));

  const fantCanc = seguro(FREAL({ extrato: EXTRATO_REAL().map((l) =>
    l.nsu === 41002 ? { ...l, taxaMesBp: 0, mdrBp: 0, dataCancelamento: "2026-10-14T18:00:00" }
    : l.nsu === 41003 && l.parcela === 2 ? { ...l, dataCancelamento: "2026-10-14T18:00:00" }
    : l) }));
  caso(C.ANT_CANC, () => {
    const v = itemReal(fantCanc, 41002)!;
    const p1 = itemReal(fantCanc, 41003, 1)!;
    return v.status === "cancelada_no_extrato" && v.extrato!.antecipacao.resultado === "venda_cancelada" && v.extrato!.antecipacao.diferencaBp === null
      && !v.sinais.some((x) => x.startsWith("liquido_da_venda")) && v.liquidoDaVenda === undefined
      && itemReal(fantCanc, 41003, 2)!.status === "cancelada_no_extrato"
      && p1.status === "casada" && !p1.sinais.some((x) => x.startsWith("liquido_da_venda")) && p1.liquidoDaVenda === undefined
      && fantCanc!.resumo.antecipacao.porResultado.diferente === 0 && fantCanc!.resumo.liquido.vendasComparadas === 1;
  }, () => resumo({ v: itemReal(fantCanc, 41002), p1: itemReal(fantCanc, 41003, 1)?.sinais, l: fantCanc?.resumo.liquido }));

  const fliqParcela = seguro(FREAL({ titulos: TITULOS_REAIS().map((t) => (t.id === "r-41003-2" ? { ...t, situacao: "cancelado" } : t)) }));
  caso(C.LIQ_PARCELA, () => {
    const p1 = itemReal(fliqParcela, 41003, 1)!;
    return itemReal(fliqParcela, 41003, 2)!.status === "cancelada_so_no_sistema"
      && p1.status === "casada" && !p1.sinais.some((x) => x.startsWith("liquido_da_venda")) && p1.liquidoDaVenda === undefined
      && fliqParcela!.resumo.liquido.vendasComparadas === 2;
  }, () => resumo({ itens: fliqParcela?.itens.map((i) => [i.nsu, i.parcela, i.status, i.sinais]), l: fliqParcela?.resumo.liquido }));

  const fantF2 = seguro({ ...F2(), vinculo: { id: "v1", codigoCliente: EC, taxas: { credito_vista: 0.0265, antecipacao_mes: 0.0155 }, antecipado: true } });
  caso(C.ANT_SEM_CONCLUSAO, () => fantF2!.estado === "chave_nao_confirmada"
    && fantF2!.itens.filter((i) => i.extrato).length > 0
    && fantF2!.itens.filter((i) => i.extrato).every((i) => i.extrato!.antecipacao.resultado === "sem_conclusao" && i.extrato!.antecipacao.diferencaBp === null)
    && fantF2!.resumo.antecipacao.porResultado.diferente === 0,
  () => resumo(fantF2?.itens.map((i) => i.extrato?.antecipacao)));

  const fantIrma = seguro(FREAL({
    vinculo: { id: "v1", codigoCliente: EC, taxas: { ...CONTRATO_REAL, antecipacao_mes: 0.0199 }, antecipado: true },
    vinculosDoEstabelecimento: ["v1", "v2"], vinculosDaEmpresa: ["v1", "v2"],
    eventos: [EV(41001, { ocorrido_em: "2026-10-14T17:00:00Z" }), EV(41002, { vinculo_id: "v2", ocorrido_em: "2026-10-14T17:00:00Z" }), EV(41003, { ocorrido_em: "2026-10-14T17:00:00Z" })],
  }));
  caso(C.ANT_IRMA, () => itemReal(fantIrma, 41002)!.extrato!.antecipacao.resultado === "outra_maquininha"
    && itemReal(fantIrma, 41002)!.extrato!.antecipacao.diferencaBp === null
    && itemReal(fantIrma, 41003, 1)!.extrato!.antecipacao.resultado === "diferente",
  () => resumo(fantIrma?.itens.map((i) => [i.nsu, i.extrato?.antecipacao])));

  const fliq890 = seguro(FREAL({ extrato: comLinha(41001, 1, { liquidoRepasseCentavos: 890 }) }));
  const fliq889 = seguro(FREAL({ extrato: comLinha(41001, 1, { liquidoRepasseCentavos: 889 }) }));
  caso(C.LIQ_TOLERANCIA, () => {
    const a = itemReal(fliq890, 41001)!, b = itemReal(fliq889, 41001)!;
    return a.sinais.includes("liquido_da_venda_igual") && resumo(a.liquidoDaVenda) === resumo({ extratoCentavos: 890, sistemaCentavos: 891, parcelas: 1 })
      && fliq890!.resumo.itensComDivergencia === 0 && fliq890!.resumo.liquido.vendasIguais === 3
      && b.sinais.includes("liquido_da_venda_diferente") && resumo(b.liquidoDaVenda) === resumo({ extratoCentavos: 889, sistemaCentavos: 891, parcelas: 1 })
      && fliq889!.resumo.itensComDivergencia === 1 && fliq889!.resumo.liquido.vendasDiferentes === 1;
  }, () => resumo({ a: itemReal(fliq890, 41001)?.sinais, b: itemReal(fliq889, 41001)?.sinais }));

  const fliqMetade = seguro(FREAL({ extrato: EXTRATO_REAL().filter((l) => !(l.nsu === 41003 && l.parcela === 2)).map((l) => (l.nsu === 41001 ? { ...l, liquidoRepasseCentavos: null } : l)) }));
  caso(C.LIQ_METADE, () => {
    const r = fliqMetade!;
    const semSinal = (i: { sinais: string[]; liquidoDaVenda?: unknown } | undefined) => !!i && !i.sinais.some((x) => x.startsWith("liquido_da_venda")) && i.liquidoDaVenda === undefined;
    return semSinal(itemReal(r, 41003, 1)) && semSinal(itemReal(r, 41003, 2)) && semSinal(itemReal(r, 41001))
      && itemReal(r, 41002)!.sinais.includes("liquido_da_venda_igual")
      && resumo(r.resumo.liquido) === resumo({ vendasComparadas: 1, vendasIguais: 1, vendasDiferentes: 0, centavosExtrato: 869, centavosSistema: 869 });
  }, () => resumo({ itens: fliqMetade?.itens.map((i) => [i.nsu, i.parcela, i.status, i.sinais]), l: fliqMetade?.resumo.liquido }));

  const fliqEst = seguro(FREAL({
    titulos: [...TITULOS_REAIS(), EST(41002, "499", 5, "2026-10-14")],
    transacoes: [TR(41002, "Reembolsada", 4.99, 9.99), TR(41001, "Cancelada", 9.99, 9.99)],
  }));
  caso(C.LIQ_ESTORNO, () => {
    const r = fliqEst!;
    const semSinal = (i: { sinais: string[]; liquidoDaVenda?: unknown } | undefined) => !!i && !i.sinais.some((x) => x.startsWith("liquido_da_venda")) && i.liquidoDaVenda === undefined;
    return semSinal(itemReal(r, 41002)) && semSinal(itemReal(r, 41001))
      && itemReal(r, 41002)!.status === "inconclusivo" && itemReal(r, 41001)!.status === "cancelada_so_no_sistema"
      && itemReal(r, 41003, 1)!.sinais.includes("liquido_da_venda_igual")
      && r.resumo.liquido.vendasComparadas === 1;
  }, () => resumo({ itens: fliqEst?.itens.map((i) => [i.nsu, i.parcela, i.status, i.sinais]), l: fliqEst?.resumo.liquido }));

  const todos = [f0, f0s, f0i, f0d, freal, fantigo, fantDif, fantNao, fantSem, fantDeb, fantCanc, fantF2, fantIrma, fliq890, fliq889, fliqMetade, fliqEst, fliqParcela, f1, f2, f2t, f3, f3b, f3c, f4, f5, f6, f7, f8, f8b, f9, f10, f11, f12, ft, f13, f14, f15, fg, ft2, ft3, fb, fxSemAviso,
    fx2023, fxNoDia, fpAntiga, fvivos, fv, fl, fborda, ftol, ft4, fbz, ftot, fdisc];
  caso(C.INVARIANTE, () => todos.every((x) => invariante(x).length === 0), () => todos.flatMap(invariante).slice(0, 4).join(" | "));

  /* puros */
  caso(C.CHAVE, () => {
    const a = m.eng.chaveDoTitulo("pinbank:00136576350:2:r");
    const b = m.eng.chaveDoTitulo("pinbank:1013:estorno:3000");
    const c = m.eng.chaveDoTitulo("pinbank:1021:estorno:total");
    const d = m.eng.chaveDoTitulo("pinbank:9:1:t");
    return resumo(a) === resumo({ nsu: "136576350", tipo: "parcela", parcela: 2, papel: "r" })
      && resumo(b) === resumo({ nsu: "1013", tipo: "estorno", alvo: 3000 })
      && resumo(c) === resumo({ nsu: "1021", tipo: "estorno", alvo: "total" })
      && resumo(d) === resumo({ nsu: "9", tipo: "parcela", parcela: 1, papel: "t" })
      && resumo(m.eng.chaveDoTitulo("pinbank:9:2:f")) === resumo({ nsu: "9", tipo: "parcela", parcela: 2, papel: "f" })
      && resumo(m.eng.chaveDoTitulo("pinbank:9:2:a")) === resumo({ nsu: "9", tipo: "parcela", parcela: 2, papel: "a" })
      && m.eng.chaveDoTitulo("pinbank:9:2:x") === null
      && m.eng.chaveDoTitulo("pinbank:abc:1:r") === null && m.eng.chaveDoTitulo("pinbankx:1:1:r") === null
      && m.eng.chaveDoTitulo(null) === null && m.eng.chaveDoTitulo("rec:abc:2025-07-01") === null;
  });
  caso(C.POSTERGAR, () => CAL.postergarParaDiaUtil("2025-08-30") === "2025-09-01" && CAL.postergarParaDiaUtil("2026-04-03") === "2026-04-06"
    && CAL.postergarParaDiaUtil("2025-11-20") === "2025-11-21" && CAL.postergarParaDiaUtil("2025-12-27") === "2025-12-29"
    && CAL.postergarParaDiaUtil("2025-12-31") === "2025-12-31",
  () => ["2025-08-30", "2026-04-03", "2025-11-20", "2025-12-27", "2025-12-31"].map(CAL.postergarParaDiaUtil).join(","));
  caso(C.CENTAVOS, () => m.eng.centavosDeReais(145.52) === 14552 && m.eng.centavosDeReais("10.30") === 1030
    && m.eng.centavosDeReais(0.29) === 29 && m.eng.centavosDeReais("x") === null && m.eng.centavosDeReais(null) === null
    && m.eng.centavosDeReais("") === null);
  caso(C.DIAS, () => m.eng.diasEntreDatas("2025-08-30", "2025-09-01") === 2 && m.eng.diasEntreDatas("2025-09-01", "2025-08-30") === -2);
  caso(C.AVISO_DO_DIA, () => {
    const extrato = [{ nsu: "700050", dias: ["2025-06-28"] }, { nsu: "700051", dias: ["2025-06-28"] }, { nsu: "700052", dias: ["2025-07-19"] }];
    const f = m.eng.nsusDoExtratoComAviso;
    const doDia = f(extrato, [{ nsu: 700050, ocorrido_em: "2025-06-28T15:00:00+00:00" }]);
    const diaSeguinteUtc = f(extrato, [{ nsu: "700052", ocorrido_em: "2025-07-20T01:30:00Z" }]);
    const outroDia = f(extrato, [{ nsu: 700050, ocorrido_em: "2025-07-05T15:00:00+00:00" }, { nsu: 700051, ocorrido_em: "2023-01-30T12:00:00Z" }]);
    const outraNsu = f(extrato, [{ nsu: 700099, ocorrido_em: "2025-06-28T15:00:00+00:00" }]);
    const semData = f(extrato, [{ nsu: 700050, ocorrido_em: null }]);
    return resumo(doDia) === resumo(["700050"]) && resumo(diaSeguinteUtc) === resumo(["700052"])
      && outroDia.length === 0 && outraNsu.length === 0 && semData.length === 0 && f(extrato, []).length === 0;
  });
  caso(C.PERIODO, () => {
    const ok31 = EXT.problemasDoPeriodoExtratoPos("2025-07-01", "2025-07-31");
    const p32 = EXT.problemasDoPeriodoExtratoPos("2025-07-01", "2025-08-01");
    const inv = EXT.problemasDoPeriodoExtratoPos("2025-07-31", "2025-07-01");
    const filtro = EXT.problemasDoFiltroExtratoPos({ codigoCanal: 47, codigoCliente: EC, de: "2025-07-01", ate: "2025-08-01", status: "Todos", meio: "Todos" });
    return ok31.length === 0 && p32.length === 1 && inv.length === 1 && resumo(filtro) === resumo(p32)
      && resumo(EXT.problemasDoFiltroExtratoPos({ codigoCanal: 47, codigoCliente: EC, de: "2025-07-31", ate: "2025-07-01", status: "Todos", meio: "Todos" })) === resumo(inv);
  });
  caso(C.PORTAO, () => {
    const SEGREDO = "SEGREDO-FALSO-0123456789";
    const cheio = { PINBANK_API_AMBIENTE: "producao", PINBANK_API_USUARIO: "usuario-falso", PINBANK_API_CHAVE: SEGREDO, PINBANK_CODIGO_CANAL: "1919" };
    const rs = [
      API.conferenciaPinbankLiberada({}),
      API.conferenciaPinbankLiberada({ ...cheio }),
      API.conferenciaPinbankLiberada({ ...cheio, PINBANK_CONFERENCIA: "Ligado" }),
      API.conferenciaPinbankLiberada({ PINBANK_CONFERENCIA: "ligado", PINBANK_API_AMBIENTE: "producao" }),
      API.conferenciaPinbankLiberada({ ...cheio, PINBANK_CONFERENCIA: "ligado", PINBANK_API_AMBIENTE: "dev" }),
      API.conferenciaPinbankLiberada({ ...cheio, PINBANK_CONFERENCIA: "ligado" }),
    ];
    const cod = rs.map((x) => (x.liberada ? "liberada" : x.codigo));
    return resumo(cod) === resumo(["desligada", "desligada", "desligada", "sem_configuracao", "ambiente_teste", "liberada"])
      && !JSON.stringify(rs).includes(SEGREDO) && !JSON.stringify(rs).includes("usuario-falso");
  });
  caso(C.SEM_CORPO, () => {
    // Âncoras LITERAIS: a frase não é lida do motor que ela confere.
    const DEMOROU = "A conferência demorou demais ou falhou. Nada foi alterado. Tente de novo em alguns minutos, ou com um período menor.";
    const GENERICA = "A conferência não respondeu como esperado. Nada foi alterado. Tente de novo; se continuar, fale com o suporte da Quattro.";
    const f = m.eng.falhaDaConferenciaSemCorpo;
    const todos = [f(504), f(500), f(502), f(null), f(404), f(200)];
    return resumo(f(504)) === resumo({ codigo: "http_504", motivo: DEMOROU })
      && resumo(f(500)) === resumo({ codigo: "http_500", motivo: DEMOROU })
      && resumo(f(502)) === resumo({ codigo: "http_502", motivo: DEMOROU })
      && resumo(f(null)) === resumo({ codigo: "tempo_esgotado", motivo: DEMOROU })
      && resumo(f(404)) === resumo({ codigo: "http_404", motivo: GENERICA })
      && resumo(f(200)) === resumo({ codigo: "http_200", motivo: GENERICA })
      && todos.every((x) => !/\d{3}/.test(x.motivo));
  }, () => resumo([m.eng.falhaDaConferenciaSemCorpo(504), m.eng.falhaDaConferenciaSemCorpo(404)]));

  return r;
}

/* ─────────────────────────── real + defeitos plantados ─────────────────────────── */

const reais: Mods = { eng: await imp<ModEngine>(ARQ_ENGINE) };
const real = casos(reais, "real");
let falhas = [...real.values()].filter((v) => !v).length;

type Planta = { nome: string; caso: string; de: string; para: string };
const PLANTAS: Planta[] = [
  { nome: "P1 casa só pelo NSU, sem a parcela", caso: C.N1003,
    de: "const rs = v?.r.get(x.k) ?? [];", para: "const rs = v ? Array.from(v.r.values())[0] ?? [] : [];" },
  { nome: "P2 a data comparada com a hora (sem cortar no dia)", caso: C.F0,
    de: "const dE = l.dataFuturaPagamento?.slice(0, 10) ?? null;", para: "const dE = l.dataFuturaPagamento ?? null;" },
  { nome: "P2b a data comparada com a hora derruba também o débito do mesmo dia", caso: C.N1001,
    de: "const dE = l.dataFuturaPagamento?.slice(0, 10) ?? null;", para: "const dE = l.dataFuturaPagamento ?? null;" },
  { nome: "P3 a taxa entra na conta do valor", caso: C.F0_TAXA,
    de: "const valorOk = naoComparado == null && sisCent === est;",
    para: "const valorOk = naoComparado == null && sisCent === est && taxaDe(v, x.k) === l.mdrBp;" },
  { nome: "P4 os títulos sem par são descartados", caso: C.N1009,
    de: "for (const { r, v, k } of titulosSobra) {", para: "for (const { r, v, k } of [] as typeof titulosSobra) {" },
  { nome: "P5 centavos sem arredondar (compara reais em ponto flutuante)", caso: C.N1006,
    de: "return Number.isFinite(n) ? Math.round(n * 100) : null;", para: "return Number.isFinite(n) ? n * 100 : null;" },
  { nome: "P6 sem o dia útil seguinte", caso: C.F0,
    de: "else if (!ehDiaUtil(dS) && dE === postergarParaDiaUtil(dS)) data = \"dia_util\";", para: "else if (false) data = \"dia_util\";" },
  { nome: "P7 sem a confirmação da chave (nenhum NSU em comum)", caso: C.F2,
    de: "const chaveNaoConfirmada = nsusExtrato.size > 0", para: "const chaveNaoConfirmada = false && nsusExtrato.size > 0" },
  { nome: "P8 a borda do período é afirmada", caso: C.N1014,
    de: "else if (comp === de || comp === ate) motivo = \"borda_do_periodo\";", para: "else if (false) motivo = \"borda_do_periodo\";" },
  { nome: "P9 as linhas de outro estabelecimento ficam", caso: C.N1015,
    de: "if (l.codigoCliente !== ec) { fora.outroEstabelecimento++; continue; }", para: "if (l.codigoCliente !== ec) { fora.outroEstabelecimento++; }" },
  { nome: "P10 o cancelamento do sistema ignora a situação e a transação", caso: C.N1011,
    de: "const canceladaSistema = tituloCancelado(r, v);", para: "const canceladaSistema = v.estornos.some((x) => x.alvo === \"total\");" },
  { nome: "P11 o lado ausente vira zero", caso: C.NULO,
    de: "const sis = it.sistema?.valorCentavos ?? null;", para: "const sis = it.sistema?.valorCentavos ?? 0;" },
  { nome: "P12 o estorno parcial é comparado", caso: C.N1013,
    de: "if (reembolsoParcial(v)) {", para: "if (false) {" },
  { nome: "P13 sem a regra do Pix", caso: C.N1018,
    de: "else if (ehPix(v.nsu)) motivo = \"pix_sem_extrato\";", para: "else if (false) motivo = \"pix_sem_extrato\";" },
  { nome: "P14 a parcela repetida é pareada com a primeira cópia", caso: C.N1016,
    de: "if (linhas.length > 1) {", para: "if (linhas.length > 99) {" },
  { nome: "P15 o par provável sai como conferido", caso: C.F2,
    de: "status: \"par_provavel\" as const,", para: "status: \"casada\" as const," },
  { nome: "P16 o resumo conta só os pares", caso: C.INVARIANTE,
    de: "for (const it of itens) {", para: "for (const it of itens.filter((x) => x.extrato && x.sistema)) {" },
  { nome: "P17 sem tirar o título repetido pelo id", caso: C.F7,
    de: "if (vistos.has(t.id)) continue;", para: "void 0;" },
  { nome: "P18 o NSU presente no extrato não vence a regra da borda", caso: C.N1022,
    de: "    if (nsusExtrato.has(v.nsu)) {", para: "    if (nsusExtrato.has(v.nsu) && comp !== de && comp !== ate) {" },
  { nome: "P18b o NSU presente no extrato não vence a regra da borda (com o MESMO número de parcelas)", caso: C.BORDA_MESMAS,
    de: "    if (nsusExtrato.has(v.nsu)) {", para: "    if (nsusExtrato.has(v.nsu) && comp !== de && comp !== ate) {" },
  { nome: "P19 o aviso de período incerto é ignorado", caso: C.F4,
    de: "else if (periodoIncerto) motivo = \"periodo_do_extrato_incerto\";", para: "else if (false) motivo = \"periodo_do_extrato_incerto\";" },
  { nome: "P20 a venda de outra maquininha vira só no sistema", caso: C.F5,
    de: "{ sistema.delete(nsu); fora.outraMaquininha++; continue; }", para: "{ fora.outraMaquininha++; continue; }" },
  // ── os achados da revisão de dinheiro (13/10/2026): cada um volta ao comportamento ANTIGO ──
  { nome: "P21 a linha cancelada sem título vira só no extrato", caso: C.F8_SEM_REGISTRO,
    de: "    else if (x.l.dataCancelamento != null) {", para: "    else if (false) {" },
  { nome: "P22 a venda desfeita no sistema é ignorada na linha cancelada sem título", caso: C.F8_DESFEITA,
    de: "      if (vendaDesfeitaNoSistema(x.nsu)) {", para: "      if (false) {" },
  { nome: "P23 o extrato vazio deixa as vendas do sistema virarem só no sistema", caso: C.F3,
    de: "const extratoVazio = legiveis.length === 0 && nsusSistemaNoPeriodo.size > 0;", para: "const extratoVazio = false;" },
  { nome: "P24 o extrato só de outro estabelecimento não conta como vazio", caso: C.F3B,
    de: "const extratoVazio = legiveis.length === 0 && nsusSistemaNoPeriodo.size > 0;", para: "const extratoVazio = e.extrato.length === 0 && nsusSistemaNoPeriodo.size > 0;" },
  { nome: "P24b só linhas ilegíveis deste EC não contam como extrato vazio", caso: C.F3C,
    de: "const extratoVazio = legiveis.length === 0 && nsusSistemaNoPeriodo.size > 0;", para: "const extratoVazio = mantidas.length === 0 && nsusSistemaNoPeriodo.size > 0;" },
  { nome: "P25 a parcela ausente ignora a linha ilegível da mesma venda", caso: C.F9,
    de: "      if (linhaIlegivelPode(v.nsu, comp)) { itens.push(itemDeTitulo(r, v, k, \"inconclusivo\", \"linha_ilegivel_no_extrato\")); continue; }",
    para: "      if (false) { itens.push(itemDeTitulo(r, v, k, \"inconclusivo\", \"linha_ilegivel_no_extrato\")); continue; }" },
  { nome: "P26 a parcela ausente ignora a venda cancelada no sistema", caso: C.F8B,
    de: "const motivo: MotivoConferencia = tituloCancelado(r, v) ? \"cancelada_ausente_do_extrato\" : \"parcela_ausente_no_extrato\";",
    para: "const motivo: MotivoConferencia = false ? \"cancelada_ausente_do_extrato\" : \"parcela_ausente_no_extrato\";" },
  { nome: "P27 o estorno parcial com data de cancelamento vira cancelada só no extrato", caso: C.F10,
    de: "if (canceladaExtrato && !canceladaSistema && reembolsoParcial(v)) {", para: "if (false) {" },
  { nome: "P28 o escopo por vínculo só vale com várias maquininhas vivas (a trocada vira só no sistema)", caso: C.F11,
    de: "  for (const nsu of Array.from(sistema.keys())) {\n    const evs = eventosPorNsu.get(nsu) ?? [];",
    para: "  for (const nsu of Array.from(sistema.keys())) {\n    if (!variasMaquininhas) continue;\n    const evs = eventosPorNsu.get(nsu) ?? [];" },
  { nome: "P29 o estorno total CANCELADO ainda cancela a venda", caso: C.F12_TOTAL,
    de: "|| v.estornos.some((x) => x.alvo === \"total\" && vivo(x.linha.situacao))", para: "|| v.estornos.some((x) => x.alvo === \"total\")" },
  { nome: "P30 o estorno parcial CANCELADO ainda tira o valor da comparação", caso: C.F12_PARCIAL,
    de: "return v.estornos.some((x) => x.alvo !== \"total\" && vivo(x.linha.situacao))", para: "return v.estornos.some((x) => x.alvo !== \"total\")" },
  // ── a segunda revisão (13/10/2026): cada um volta ao comportamento ANTIGO ──
  { nome: "P31 a venda cancelada no extrato (noutra parcela) volta a deixar as parcelas que ele não traz \"só no sistema\"", caso: C.F13,
    de: "      if (canceladaNoExtrato(v.nsu)) {", para: "      if (false) {" },
  { nome: "P32 cancelada nos dois lados volta a ficar sem conclusão nas parcelas que o extrato não traz", caso: C.F8_METADE,
    de: "          ? itemDeTitulo(r, v, k, \"cancelada_nos_dois\", null)", para: "          ? itemDeTitulo(r, v, k, \"inconclusivo\", \"cancelada_ausente_do_extrato\")" },
  { nome: "P33 a venda desfeita no sistema e viva no extrato volta a ser \"só no extrato\"", caso: C.F15,
    de: "    else if (vendaDesfeitaNoSistema(x.nsu)) {", para: "    else if (false) {" },
  { nome: "P34 a maquininha excluída e a desconhecida com o MESMO motivo (a frase falsa de \"mais de uma maquininha\")", caso: C.F11,
    de: "    if (evs.some((ev) => ev.vinculo_id != null)) maquininhaExcluida.add(nsu);", para: "    if (evs.some((ev) => ev.vinculo_id != null)) maquininhaDesconhecida.add(nsu);" },
  { nome: "P35 a linha ilegível SEM número não protege a venda do mesmo dia", caso: C.FG,
    de: "      nsus.has(nsu) || (comp != null && [somaDias(comp, -1), comp, somaDias(comp, 1)].some((d) => dias.has(d)));", para: "      nsus.has(nsu);" },
  { nome: "P36 o aviso de QUALQUER maquininha (a excluída) atesta a venda em comum", caso: C.ATESTADO,
    de: "const atestado = (nsu: string) => (eventosPorNsu.get(nsu) ?? []).some((ev) => ev.vinculo_id != null && doEstabelecimento.has(ev.vinculo_id) && avisoDoDiaDaVenda(nsu, ev));",
    para: "const atestado = (nsu: string) => (eventosPorNsu.get(nsu) ?? []).some((ev) => ev.vinculo_id != null && avisoDoDiaDaVenda(nsu, ev));" },
  { nome: "P37 a venda em comum conta como atestada sem o aviso (o título forjado basta)", caso: C.ATESTADO,
    de: "nsusEmComumAtestados: emComumAtestado.length,", para: "nsusEmComumAtestados: emComum.length," },
  { nome: "P38 o lado do sistema conta os títulos de fora do período", caso: C.LADOS,
    de: "    .filter((x) => noPeriodo(dia(x.t.competence_date)));", para: "    .filter(() => true);" },
  // ── a terceira revisão (13/10/2026): cada um volta ao comportamento ANTIGO ──
  { nome: "P39 o lado do sistema volta a contar a parcela CANCELADA", caso: C.LADOS_VIVOS,
    de: "    .filter((x) => vivo(x.t.situacao))\n", para: "" },
  { nome: "P39b o lado do sistema volta a contar a venda DESFEITA (estorno total, transação cancelada)", caso: C.LADOS_VIVOS,
    de: "    .filter((v) => !vendaDesfeitaNoSistema(v.nsu))\n", para: "" },
  { nome: "P40 o aviso de QUALQUER dia (o de 2023, negado) atesta a venda em comum", caso: C.ATESTADO_DIA,
    de: "doEstabelecimento.has(ev.vinculo_id) && avisoDoDiaDaVenda(nsu, ev));", para: "doEstabelecimento.has(ev.vinculo_id));" },
  { nome: "P41 a parcela sem par no SISTEMA volta a ser \"só no sistema\" com números de parcelas diferentes", caso: C.PARCELAS_V,
    de: "if (motivo === \"parcela_ausente_no_extrato\" && nExt !== maiorParcela(v.r)) {", para: "if (false) {" },
  { nome: "P41b a 1022 (3x × 2x) volta a deixar a p3 \"só no sistema\"", caso: C.N1022,
    de: "if (motivo === \"parcela_ausente_no_extrato\" && nExt !== maiorParcela(v.r)) {", para: "if (false) {" },
  { nome: "P42 a parcela sem par no EXTRATO volta a ser \"só no extrato\" com números de parcelas diferentes", caso: C.PARCELAS_L,
    de: "      if (nSis !== parcelasNoExtrato(x.nsu)) {", para: "      if (false) {" },
  { nome: "P43 o total da venda dado como igual sem comparar", caso: C.PARCELAS_V,
    de: "return ext === v.vendaCentavos ? \"igual\" : \"diferente\";", para: "return \"igual\";" },
  { nome: "P44 a maquininha trocada nunca é contada (o sinal some)", caso: C.TROCADA,
    de: "nsusDoExtratoDeMaquininhaExcluida: nsusDeMaquininhaExcluida.length,", para: "nsusDoExtratoDeMaquininhaExcluida: 0," },
  { nome: "P44b o aviso da maquininha trocada de QUALQUER dia é contado", caso: C.TROCADA,
    de: ".some((ev) => ev.vinculo_id != null && !vivos.has(ev.vinculo_id) && avisoDoDiaDaVenda(nsu, ev)));",
    para: ".some((ev) => ev.vinculo_id != null && !vivos.has(ev.vinculo_id)));" },
  // ── a taxa (MDR) ──
  // ── a falha sem a frase da rota (revisão de repositório, 13/10/2026) ──
  { nome: "PS1 o número do status volta à frase (\"A conferência respondeu 504\")", caso: C.SEM_CORPO,
    de: "return { codigo: `http_${status}`, motivo: status >= 500 ? FRASE_CONFERENCIA_DEMOROU : FRASE_CONFERENCIA_SEM_RESPOSTA };",
    para: "return { codigo: `http_${status}`, motivo: `A conferência respondeu ${status}. Nada foi alterado.` };" },
  { nome: "PS2 o 5xx (a função que passou do tempo) recebe a frase genérica, sem o conselho do período menor", caso: C.SEM_CORPO,
    de: "motivo: status >= 500 ? FRASE_CONFERENCIA_DEMOROU", para: "motivo: status >= 600 ? FRASE_CONFERENCIA_DEMOROU" },
  { nome: "PS3 o tempo esgotado na tela vira a frase genérica", caso: C.SEM_CORPO,
    de: "if (status == null) return { codigo: \"tempo_esgotado\", motivo: FRASE_CONFERENCIA_DEMOROU };",
    para: "if (status == null) return { codigo: \"tempo_esgotado\", motivo: FRASE_CONFERENCIA_SEM_RESPOSTA };" },
  { nome: "PT1 a taxa não é comparada (sai sempre igual)", caso: C.FT_DIF,
    de: ": Math.abs(extratoBp - contratoExato) < TOLERANCIA_TAXA_BP ? \"igual\"", para: ": true ? \"igual\"" },
  { nome: "PT2 a taxa diferente troca o status da parcela (uma leitura esconde a outra)", caso: C.FT_DIF,
    de: "const valorOk = naoComparado == null && sisCent === est;",
    para: "const valorOk = naoComparado == null && sisCent === est && base.extrato.taxa.resultado !== \"diferente\";" },
  { nome: "PT3 sem a tolerância de 1 ponto-base", caso: C.FT_TIPOS,
    de: "export const TOLERANCIA_TAXA_BP = 1;", para: "export const TOLERANCIA_TAXA_BP = 0;" },
  { nome: "PT4 a fração contratada sem o corte da dízima (0,0163 × 10000 = 162,99999999999997 passa por \"menos de 1 ponto-base\" de 162)", caso: C.FT_TOLERANCIA,
    de: "return Number((f * 10_000).toFixed(6));", para: "return f * 10_000;" },
  { nome: "PT5 o tipo desconhecido é adivinhado como crédito à vista", caso: C.FT_TIPOS,
    de: "\"parcelado\" : \"credito_vista\";\n  return null;", para: "\"parcelado\" : \"credito_vista\";\n  return \"credito_vista\";" },
  { nome: "PT6 a taxa sem contrato (ou sem MDR) vira divergência", caso: C.FT_RESUMO,
    de: "=== \"divergencias\" || i.extrato?.taxa.resultado === \"diferente\"", para: "=== \"divergencias\" || (i.extrato != null && i.extrato.taxa.resultado !== \"igual\")" },
  { nome: "PT7 a vista de divergências ignora a taxa diferente", caso: C.FT_RESUMO,
    de: " || i.extrato?.taxa.resultado === \"diferente\"\n    || i.extrato?.antecipacao", para: "\n    || i.extrato?.antecipacao" },
  { nome: "PT8 um valor em reais derivado do percentual", caso: C.FT_SEM_REAIS,
    de: "    taxa: taxaDaLinha(x.l),",
    para: "    taxa: taxaDaLinha(x.l),\n    taxaCentavos: est != null && x.l.mdrBp != null ? Math.round((est * x.l.mdrBp) / 10_000) : null," },
  { nome: "PT9 sem a frase da taxa diferente", caso: C.F0_TAXA_DIF,
    de: "+ fraseDaTaxa(p.extrato?.taxa, p.sinais) + fraseDaAntecipacao", para: "+ fraseDaAntecipacao" },
  { nome: "PT10 a taxa é afirmada sem NSU em comum (o extrato pode ser de outra maquininha)", caso: C.F2_TAXA,
    de: "    if (chaveNaoConfirmada) return { ...t, resultado: \"sem_conclusao\" };\n", para: "" },
  { nome: "PT11 a taxa da venda cancelada é comparada (o MDR zerado vira \"taxa diferente\")", caso: C.FT2,
    de: "    if (l.dataCancelamento != null) return { ...t, resultado: \"venda_cancelada\", diferencaBp: null };\n", para: "" },
  { nome: "PT12 PARCELADO em 1x comparado com a taxa de parcelado (sem o número de parcelas)", caso: C.FT3,
    de: "return totalParcelas == null ? null : totalParcelas > 1 ? \"parcelado\" : \"credito_vista\";", para: "return \"parcelado\";" },
  { nome: "PT13 a taxa cobrada sem o título dela no sistema passa calada", caso: C.FB,
    de: "    if (faltaTituloDeTaxa(l, base.extrato.taxa, v, x.k)) sinais.push(\"taxa_sem_titulo_no_sistema\");\n", para: "" },
  { nome: "PT14 a vista de divergências ignora a taxa sem título", caso: C.FB,
    de: "\n    || i.sinais.includes(\"taxa_sem_titulo_no_sistema\")\n", para: "\n" },
  // Sem a comparação conclusiva, o par provável (numeração não confirmada) acusaria a taxa sem título — e a
  // venda sem taxa cadastrada já fica de fora pela taxa que a regra lançaria (zero: ver PT18).
  { nome: "PT15 a taxa sem título acusada sem a comparação conclusiva (o par provável da numeração não confirmada vira divergência)", caso: C.F2_TAXA,
    de: "    && (taxa.resultado === \"igual\" || taxa.resultado === \"diferente\")\n", para: "" },
  { nome: "PT16 a taxa lançada pelo sistema somada por item (o título de taxa da chave repetida conta duas vezes)", caso: C.F14,
    de: "it.sistema.taxaTituloIds.some((id) => !taxasContadas.has(id))", para: "true" },
  { nome: "PT17 o contrato arredondado com a tolerância ATÉ 1 ponto-base (esconde 0,01 ponto percentual cobrado a mais)", caso: C.FT_TOLERANCIA,
    de: ": Math.abs(extratoBp - contratoExato) < TOLERANCIA_TAXA_BP ? \"igual\"", para: ": Math.abs(extratoBp - Math.round(contratoExato)) <= TOLERANCIA_TAXA_BP ? \"igual\"" },
  { nome: "PT18 a taxa sem título acusada onde a regra do sistema nem lançaria taxa", caso: C.FBZ,
    de: "    && taxa.tipo != null && taxaPeloContrato(v, k, taxa.tipo) > 0\n", para: "" },
  { nome: "PT19 a taxa do estorno parcial volta a ser \"venda cancelada\"", caso: C.FT4,
    de: "resultado: \"estorno_parcial\", diferencaBp: null };", para: "resultado: base.extrato.taxa.resultado, diferencaBp: null };" },
  // ── a quarta revisão (13/10/2026): cada um volta ao comportamento ANTIGO, ou ao atalho tentador ──
  { nome: "PT20 a diferença da taxa sai também na IGUAL (\"−0,01 ponto percentual\" ao lado de \"taxa igual\")", caso: C.FT_TOLERANCIA,
    de: "diferencaBp: resultado === \"diferente\" && extratoBp != null", para: "diferencaBp: extratoBp != null" },
  { nome: "PT20b a diferença da taxa sai também na IGUAL (F0 com a taxa cadastrada igual)", caso: C.F0_TAXA_IGUAL,
    de: "diferencaBp: resultado === \"diferente\" && extratoBp != null", para: "diferencaBp: extratoBp != null" },
  { nome: "PT20c a diferença da taxa sai também na IGUAL (o débito igual)", caso: C.FT_TIPOS,
    de: "diferencaBp: resultado === \"diferente\" && extratoBp != null", para: "diferencaBp: extratoBp != null" },
  { nome: "PT20d a diferença da taxa sai também na IGUAL (o parcelado em 1x)", caso: C.FT3,
    de: "diferencaBp: resultado === \"diferente\" && extratoBp != null", para: "diferencaBp: extratoBp != null" },
  { nome: "PV1 a vista de divergências ignora o total diferente (o título da última parcela some sem divergência nenhuma)", caso: C.TOTAL_ULTIMA,
    de: "\n    || i.sinais.includes(\"total_da_venda_diferente\")\n", para: "\n" },
  { nome: "PV1b a vista de divergências ignora o total diferente (o resumo da FTOT)", caso: C.TOTAL_RESUMO,
    de: "\n    || i.sinais.includes(\"total_da_venda_diferente\")\n", para: "\n" },
  { nome: "PV1c a vista de divergências ignora o total diferente (a lista literal do invariante discorda)", caso: C.INVARIANTE,
    de: "\n    || i.sinais.includes(\"total_da_venda_diferente\")\n", para: "\n" },
  { nome: "PV1d a vista de divergências ignora o total diferente (a 22002 de 1x × 3x)", caso: C.PARCELAS_V,
    de: "\n    || i.sinais.includes(\"total_da_venda_diferente\")\n", para: "\n" },
  { nome: "PV2 a frase das parcelas e do total volta a sair só nas situações divergentes (a conferida diz que está tudo certo)", caso: C.TOTAL_LANCADO,
    de: "  return fraseDaSituacao(status, motivo, sinais, dS, dE, datas) + parcelas;",
    para: "  return fraseDaSituacao(status, motivo, sinais, dS, dE, datas) + (GRUPO_DO_STATUS[status] === \"divergencias\" ? parcelas : \"\");" },
  { nome: "PV2b a frase das parcelas e do total volta a sair só nas situações divergentes (o título da última parcela)", caso: C.TOTAL_ULTIMA,
    de: "  return fraseDaSituacao(status, motivo, sinais, dS, dE, datas) + parcelas;",
    para: "  return fraseDaSituacao(status, motivo, sinais, dS, dE, datas) + (GRUPO_DO_STATUS[status] === \"divergencias\" ? parcelas : \"\");" },
  { nome: "PV3 a vista leva TODA venda de números de parcelas diferentes (a redividida com o mesmo total vira divergência sem par)", caso: C.TOTAL_IGUAL,
    de: "\n    || i.sinais.includes(\"total_da_venda_diferente\")\n", para: "\n    || i.sinais.includes(\"parcelas_diferentes\")\n" },
  { nome: "PV4 a parcela que falta no sistema anula a comparação do total (a lacuna esconde o título perdido)", caso: C.TOTAL_LACUNA,
    de: "    for (const rs of Array.from(v.r.values())) {\n      if (rs.length !== 1",
    para: "    for (let k = 1; k <= (maiorParcela(v.r) ?? 0); k++) {\n      const rs = v.r.get(k) ?? [];\n      if (rs.length !== 1" },
  { nome: "PV5 o atalho: com o total diferente, a parcela sem par do SISTEMA volta a ser \"só no sistema\" (o número de parcelas diferente nunca afirma a sem par)", caso: C.TOTAL_LANCADO,
    de: "if (motivo === \"parcela_ausente_no_extrato\" && nExt !== maiorParcela(v.r)) {",
    para: "if (motivo === \"parcela_ausente_no_extrato\" && nExt !== maiorParcela(v.r) && !sinaisDeParcelas(v.nsu, v).includes(\"total_da_venda_diferente\")) {" },
  { nome: "PV6 o atalho: com o total diferente, a parcela sem par do EXTRATO volta a ser \"só no extrato\"", caso: C.TOTAL_ULTIMA,
    de: "      if (nSis !== parcelasNoExtrato(x.nsu)) {",
    para: "      if (nSis !== parcelasNoExtrato(x.nsu) && !sinaisDeParcelas(x.nsu, vs).includes(\"total_da_venda_diferente\")) {" },
  { nome: "PV7 a frase da linha sem par volta a usar o n DELA (\"divide em 3 e o sistema em 3\" com as linhas discordando)", caso: C.FRASE_DISCORDAM,
    de: "motivo === \"parcelas_diferentes_no_extrato\" ? parcelasNoExtrato(x.nsu) : x.n);", para: "x.n);" },
  { nome: "PV8 o aviso de QUALQUER dia põe a NSU do extrato na leitura dos títulos", caso: C.AVISO_DO_DIA,
    de: ".filter((x) => (avisos.get(x.nsu) ?? []).some((oc) => x.dias.some((d) => avisoNoDiaDaVenda(oc, d))))",
    para: ".filter((x) => (avisos.get(x.nsu) ?? []).length > 0)" },
  { nome: "PS1 a linha sem o código do estabelecimento deixa de proteger a parcela da venda que o extrato traz", caso: C.SEM_EC,
    de: "      if (linhaSemEstabelecimentoPode(v.nsu, comp)) { itens.push(itemDeTitulo(r, v, k, \"inconclusivo\", \"linha_sem_estabelecimento\")); continue; }", para: "" },
  { nome: "PS2 a linha sem o código do estabelecimento deixa de proteger a venda inteira", caso: C.SEM_EC,
    de: "    else if (linhaSemEstabelecimentoPode(v.nsu, comp)) motivo = \"linha_sem_estabelecimento\";", para: "" },
  { nome: "PS3 a linha sem código protege TODA venda (a venda sem linha nenhuma deixa de ser só no sistema)", caso: C.SEM_EC,
    de: "const linhaSemEstabelecimentoPode = podeSerDe(e.extrato.filter((l) => l.codigoCliente == null));",
    para: "const linhaSemEstabelecimentoPode = (_n: string, _c: string | null) => e.extrato.some((l) => l.codigoCliente == null);" },
  { nome: "PS4 a linha ilegível sem número protege só o MESMO dia", caso: C.ILEGIVEL_VIZINHO,
    de: "[somaDias(comp, -1), comp, somaDias(comp, 1)].some((d) => dias.has(d))", para: "dias.has(comp)" },
  { nome: "PS5 o total da venda só comparado com números de parcelas diferentes (a parcela que falta nos dois lados some)", caso: C.LACUNA_NOS_DOIS,
    de: "    else if (lacunaNosDois(x.nsu, v) && totalDaVenda(x.nsu, v) === \"diferente\") sinais.push(\"total_da_venda_diferente\");", para: "" },
  { nome: "PS6 o total diferente sem a lacuna nos dois lados (a parcela de valor diferente leva o sinal às outras)", caso: C.LACUNA_NOS_DOIS,
    de: "    else if (lacunaNosDois(x.nsu, v) && totalDaVenda(x.nsu, v) === \"diferente\")", para: "    else if (totalDaVenda(x.nsu, v) === \"diferente\")" },
  { nome: "PS7 a venda da maquininha irmã comparada com as taxas desta", caso: C.IRMA,
    de: "    if (temIrma && !avisoDesta(l)) return { ...t, resultado: \"outra_maquininha\", diferencaBp: null };", para: "" },
  { nome: "PF1 a 1022 (3x × 2x) volta a deixar a p3 \"só no sistema\" — as âncoras do resumo da loja inteira", caso: C.F1_RESUMO,
    de: "if (motivo === \"parcela_ausente_no_extrato\" && nExt !== maiorParcela(v.r)) {", para: "if (false) {" },
  { nome: "PF2 a 1022 (3x × 2x) volta a deixar a p3 \"só no sistema\" — os grupos da loja inteira", caso: C.F1_GRUPOS,
    de: "if (motivo === \"parcela_ausente_no_extrato\" && nExt !== maiorParcela(v.r)) {", para: "if (false) {" },
  // ── a antecipação e o líquido (14/10/2026): cada um, o atalho tentador ──
  { nome: "PA1 a antecipação sem comparar (sempre igual)", caso: C.ANT_DIF,
    de: "Math.abs(extratoBp - esperadaExata) < TOLERANCIA_TAXA_BP", para: "true" },
  { nome: "PA2 o débito espera a antecipação do crédito", caso: C.REAL,
    de: ": tipo === \"debito\" ? 0", para: ": tipo === \"debito\" ? pontosBaseExatosDaFracao(antecipacaoDoContrato(taxas ?? {}))" },
  { nome: "PA3 sem o portão do repasse antecipado (o vínculo que não antecipa é comparado)", caso: C.ANT_NAO,
    de: "): AntecipacaoDoItem {\n  const tipo = tipoDaCompraNoExtrato(l.tipoCompra, l.totalParcelas);\n  const extratoBp = l.taxaMesBp;",
    para: "): AntecipacaoDoItem {\n  antecipado = true;\n  const tipo = tipoDaCompraNoExtrato(l.tipoCompra, l.totalParcelas);\n  const extratoBp = l.taxaMesBp;" },
  { nome: "PA4 a antecipação diferente fora da vista de divergências", caso: C.ANT_DIF,
    de: "\n    || i.extrato?.antecipacao.resultado === \"diferente\"", para: "" },
  { nome: "PA5 a antecipação da venda cancelada comparada (a linha zerada vira \"diferente\")", caso: C.ANT_CANC,
    de: "    if (l.dataCancelamento != null) return { ...a, resultado: \"venda_cancelada\", diferencaBp: null };\n", para: "" },
  { nome: "PA6 sem a frase da antecipação diferente", caso: C.ANT_DIF,
    de: "+ fraseDaAntecipacao(p.extrato?.antecipacao)", para: "" },
  { nome: "PA7 a antecipação afirmada sem NSU em comum", caso: C.ANT_SEM_CONCLUSAO,
    de: "    if (chaveNaoConfirmada) return { ...a, resultado: \"sem_conclusao\", diferencaBp: null };\n", para: "" },
  { nome: "PA8 a antecipação da venda da maquininha irmã comparada com a desta", caso: C.ANT_IRMA,
    de: "    if (temIrma && !avisoDesta(l)) return { ...a, resultado: \"outra_maquininha\", diferencaBp: null };\n", para: "" },
  { nome: "PA9 a antecipação sem contrato vira \"igual a zero\"", caso: C.ANT_SEM,
    de: "    : pontosBaseExatosDaFracao(antecipacaoDoContrato(taxas ?? {}));", para: "    : (pontosBaseExatosDaFracao(antecipacaoDoContrato(taxas ?? {})) ?? 0);" },
  { nome: "PL1 o líquido sem a folga de 1 centavo (o arredondamento vira divergência)", caso: C.LIQ_TOLERANCIA,
    de: "return TOLERANCIA_LIQUIDO_CENTAVOS_POR_PARCELA * Math.max(1, Math.floor(parcelas || 1));", para: "return 0;" },
  { nome: "PL2 o líquido com folga de 2 centavos por parcela (dinheiro passa por arredondamento)", caso: C.LIQ_TOLERANCIA,
    de: "return TOLERANCIA_LIQUIDO_CENTAVOS_POR_PARCELA * Math.max(1, Math.floor(parcelas || 1));", para: "return 2 * Math.max(1, Math.floor(parcelas || 1));" },
  { nome: "PL17 a folga fixa por VENDA (não cresce com as parcelas: o 12x acusa arredondamento)", caso: C.LIQ_12X,
    de: "return TOLERANCIA_LIQUIDO_CENTAVOS_POR_PARCELA * Math.max(1, Math.floor(parcelas || 1));", para: "return TOLERANCIA_LIQUIDO_CENTAVOS_POR_PARCELA;" },
  { nome: "PA10 a venda não antecipada nos dois lados vira \"diferente\" da antecipação cadastrada hoje", caso: C.ANT_ANTES,
    de: "    : esperadaExata > 0 && extratoBp === 0 && sistemaAntecipou === false ? \"venda_nao_antecipada\"\n", para: "" },
  { nome: "PA11 o sistema dado como não antecipado sempre (a antecipação que só o sistema lançou some)", caso: C.ANT_SO_NO_SISTEMA,
    de: "v ? v.a.size > 0 : null", para: "v ? false : null" },
  { nome: "PA12 o tipo de venda desconhecido com a antecipação cadastrada dito \"não cadastrada\"", caso: C.ANT_ESPERADA,
    de: "    tipo == null ? \"tipo_desconhecido\"\n    : antecipado !== true ? \"repasse_nao_antecipado\"", para: "    tipo == null ? \"nao_cadastrada\"\n    : antecipado !== true ? \"repasse_nao_antecipado\"" },
  { nome: "PT21 o estimador da taxa volta à divisão de antes (a 12ª parte negativa esconde o título perdido)", caso: C.FBZ2,
    de: "return dividirCusto(r2(baseDosCustos(", para: "return dividir(r2(baseDosCustos(" },
  { nome: "PL3 a meia venda comparada (só as parcelas que o extrato traz)", caso: C.LIQ_METADE,
    de: "if (ls.length !== 1 || ls[0].l.liquidoRepasseCentavos == null || ls[0].l.dataCancelamento != null) return null;",
    para: "if (ls.length !== 1) continue;\n        if (ls[0].l.liquidoRepasseCentavos == null || ls[0].l.dataCancelamento != null) return null;" },
  { nome: "PL4 o líquido do sistema sem a antecipação", caso: C.REAL,
    de: "[v.t, v.f, v.a]", para: "[v.t, v.f]" },
  { nome: "PL5 o líquido do sistema sem a tarifa fixa", caso: C.REAL,
    de: "[v.t, v.f, v.a]", para: "[v.t, v.a]" },
  { nome: "PL6 o líquido diferente fora da vista de divergências", caso: C.REAL_ANTIGO,
    de: "\n    || i.sinais.includes(\"liquido_da_venda_diferente\")", para: "" },
  { nome: "PL7 a chave sem a tarifa e a antecipação (os títulos delas somem do sistema)", caso: C.REAL,
    de: "(r|t|f|a)$/;", para: "(r|t)$/;" },
  { nome: "PL8 a tarifa e a antecipação somadas à taxa (MDR) da parcela", caso: C.REAL,
    de: "      const m = v[c.papel];", para: "      const m = c.papel === \"r\" ? v.r : v.t;" },
  { nome: "PL9 o estorno não impede a comparação do líquido", caso: C.LIQ_ESTORNO,
    de: "      if (v.estornos.length > 0 || reembolsoParcial(v)) return null;\n", para: "" },
  { nome: "PL10 o resumo do líquido conta PARCELA, não venda (o 2x conta duas vezes)", caso: C.REAL,
    de: "liquidoPorNsu.set(it.nsu, it.liquidoDaVenda);", para: "liquidoPorNsu.set(it.id, it.liquidoDaVenda);" },
  { nome: "PL11 a linha cancelada no extrato entra no líquido", caso: C.ANT_CANC,
    de: "ls[0].l.dataCancelamento != null) return null;", para: "false) return null;" },
  { nome: "PL12 a parcela cancelada no sistema entra no líquido", caso: C.LIQ_PARCELA,
    de: "rs.length === 1 && vivo(rs[0].situacao) ? centavosDeReais", para: "rs.length === 1 ? centavosDeReais" },
  { nome: "PL13 sem a frase do líquido diferente", caso: C.REAL_ANTIGO,
    de: "\n      + fraseDoLiquido(p.sinais, p.liquidoDaVenda),", para: "," },
];

/* ─────────────────── os portões da rota e a leitura do banco ─────────────────── */

const CR = {
  TETO: "(portão) o teto das leituras: pede UMA linha a mais e só acusa volume quando ela veio — 100 de 100 não é estouro; 101, ou o servidor contando mais do que entregou, é",
  RESERVA: "(portão) a espera por empresa é a do BANCO (D4): só ok === true libera a Pinbank; a recusa é \"aguarde\" com o tempo que o banco disse, entre 1 ms e 60 s (ilegível, os 60 s inteiros); e a frase diz quantos segundos faltam",
  FALHA_FECHADA: "(portão) sem a resposta do banco a rota FALHA FECHADA: erro (a função ausente antes da migration, a recusa por papel, a rede), nada, lista, ok que não é o booleano ou resposta desconhecida — tudo é limite_indisponivel, nunca a Pinbank",
  BOTAO: "(portão) o botão espera o que o BANCO disse no 429 (entre 1 ms e 60 s) e os 60 s inteiros em todo o resto — nunca \"Espere 23 segundos\" ao lado de \"Conferir de novo em 60 s\"",
  CONTAGENS_EC: "(portão) sem venda em comum e sem venda no sistema (o EC errado), a resposta leva só as contagens de cada lado: nenhuma linha, situação, soma do extrato, data, valor, bandeira, tipo ou NSU dele",
  CONTAGENS_CHAVE: "(portão) com venda no sistema e nenhum NSU em comum, também só as contagens — e o que é do próprio sistema (quantas vendas e a soma dos títulos) fica",
  CONTAGENS_COMUM: "(portão) com ao menos uma venda em comum ATESTADA pelo aviso o relatório sai inteiro, igual ao do motor; o vazio dos dois lados também",
  CONTAGENS_FORJADO: "(portão) o título FORJADO com o NSU de uma linha do extrato errado (sem o aviso da Pinbank) não abre os detalhes: em comum para o motor, não atestado, só as contagens",
  SEM_CRUZAR: "(portão) as contagens não mudam com o que a empresa grava: o NSU do título forjado dentro ou fora do extrato, o valor dele (fora a soma do próprio sistema) e a taxa cadastrada dão a MESMA resposta — o motor, não",
  TROCADA: "(portão) a maquininha TROCADA: sem venda atestada e com os avisos da antiga no dia da venda, só as contagens com o código e a frase PRÓPRIOS (nunca \"confira o EC\"); sem os títulos, a MESMA resposta (o sinal é de um lado só); com o aviso da maquininha deste estabelecimento, o relatório inteiro; sem aviso nenhum, a frase das duas causas",
} as const;
const CL = {
  LOTE_CHEIO: "(leitura) 100 NSUs, todos com a transação: o lote CHEIO não é volume alto",
  TETOS: "(leitura) os tetos acusam só o estouro de verdade — no servidor de mentira com o max_rows PADRÃO (1.000): 1.000 títulos na janela passam e 1.001 são volume alto, e 50 maquininhas passam e 51 não; num cliente SEM max_rows (dito no nome, para provar a lógica do teto): 5.000 títulos passam e 5.001 não, 2.000 avisos no lote passam e 2.001 não; o servidor que corta (conta mais do que entrega) é volume alto; mais de 2.000 NSUs de UM lado (janela ou extrato) nem são lidos — 2.000 de cada lado, sim",
  EMPRESA: "(leitura) toda leitura fixa a empresa do vínculo: nenhum título, aviso, transação ou maquininha de OUTRA empresa volta (a aba trocada no meio da conferência)",
  CORTE: "(leitura) o servidor que entrega MENOS do que contou (o max_rows de 1.000) é volume alto também pelo NSU: 2.400 títulos (100 vendas em 12x) e 1.500 avisos cortados em 1.000 nunca viram uma conferência sobre o pedaço; sem o corte, passam inteiros",
  ORACULO: "(rota) a composição da rota — janela → NSUs → leitura → motor → portão, as mesmas chamadas que o engine-audit fixa na rota — sobre o max_rows PADRÃO (1.000) e sobre 5.001 dá a MESMA resposta (inclusive o 422) com o NSU dos títulos forjados DENTRO ou FORA do extrato alheio: 1.001 (e 5.002) forjados de fora da janela, e 1.999 forjados na janela com um NSU alheio ou nenhum",
  EXTRATO_COM_AVISO: "(leitura) o título de fora da janela de uma NSU do extrato é lido quando a empresa tem o aviso dela no dia da venda — e só então (sem o aviso, ou com o aviso de outro dia, não)",
} as const;


function casosPortoes(p: ModPortoes, eng: ModEngine, rotulo: string): Map<string, boolean> {
  const r = new Map<string, boolean>();
  const caso = (nome: string, ok: () => boolean) => {
    let v = false;
    try { v = ok(); } catch { v = false; }
    r.set(nome, v);
    if (rotulo === "real") console.log(`${v ? "PASSOU" : "FALHOU"}  ${nome}`);
  };
  const js = (x: unknown) => JSON.stringify(x);

  caso(CR.TETO, () => p.pedirAte(100) === 101 && p.pedirAte(5000) === 5001
    && !p.passouDoTeto(100, 100) && p.passouDoTeto(101, 100)
    && !p.passouDoTeto(5000, 5000, 5000) && p.passouDoTeto(1000, 5000, 3000)
    && !p.passouDoTeto(0, 50, null) && !p.passouDoTeto(50, 50));

  // A espera por empresa mora no BANCO (`pinbank_conferencia_reservar`, provada em `scripts/pinbank-limite-ec.sql`):
  // aqui, a LEITURA do que ele respondeu — o que a rota faz com cada resposta.
  caso(CR.RESERVA, () => {
    const ler = p.lerReservaConferencia;
    const ok = ler({ ok: true }, null);
    const r30 = ler({ ok: false, restante_ms: 30_000 }, null);
    const r1 = ler({ ok: false, restante_ms: 0.2 }, null);
    const rZero = ler({ ok: false, restante_ms: 0 }, null);
    const rNeg = ler({ ok: false, restante_ms: -500 }, null);
    const rTorto = ler({ ok: false, restante_ms: 999_999 }, null);
    const rIlegivel = ler({ ok: false, restante_ms: "trinta" }, null);
    const rSem = ler({ ok: false }, null);
    const espera = (x: ReturnType<typeof ler>) => (!x.ok && x.codigo === "aguarde" ? x.restanteMs : -1);
    return p.ESPERA_CONFERENCIA_MS === 60_000 && p.RPC_RESERVA_CONFERENCIA === "pinbank_conferencia_reservar"
      && js(ok) === js({ ok: true })
      && espera(r30) === 30_000 && espera(r1) === 1 && espera(rZero) === 1 && espera(rNeg) === 1
      && espera(rTorto) === 60_000 && espera(rIlegivel) === 60_000 && espera(rSem) === 60_000
      && p.fraseDeEspera(30_000) === "Esta empresa acabou de conferir com o extrato da Pinbank. Nada foi alterado. Espere 30 segundos para conferir de novo."
      && p.fraseDeEspera(400).includes("Espere 1 segundo para");
  });

  // A espera do BOTÃO: no 429 (aguarde), o número que o banco mandou; em todo o resto, a regra inteira.
  caso(CR.BOTAO, () => {
    const b = p.esperaDoBotao;
    const aguarde = (ms: unknown) => b({ ok: false, codigo: "aguarde", restanteMs: ms });
    return b({ ok: true }) === 60_000
      && aguarde(23_000) === 23_000 && aguarde(0.4) === 1 && aguarde(0) === 1 && aguarde(-50) === 1
      && aguarde(999_999) === 60_000 && aguarde("23") === 60_000 && aguarde(undefined) === 60_000 && aguarde(Number.NaN) === 60_000
      // Só o "aguarde" usa o número: outra recusa que trouxesse um número espera a regra inteira.
      && b({ ok: false, codigo: "pinbank_falhou", restanteMs: 5 }) === 60_000
      && b({ ok: false, codigo: "limite_indisponivel", restanteMs: 5 }) === 60_000;
  });

  caso(CR.FALHA_FECHADA, () => {
    const ler = p.lerReservaConferencia;
    const indisponivel = (x: ReturnType<typeof ler>) => !x.ok && x.codigo === "limite_indisponivel";
    // O erro do PostgREST quando a função não existe (o código no ar antes da migration).
    const ausente = { code: "PGRST202", message: "Could not find the function public.pinbank_conferencia_reservar(p_vinculo) in the schema cache" };
    const papel = { code: "42501", message: "A4P-PINBANK-LIMITE: só quem administra a empresa desta maquininha confere com o extrato da Pinbank." };
    return [
      ler(null, ausente), ler({ ok: true }, ausente), ler({ ok: true }, papel), ler(null, null), ler(undefined, null),
      ler([{ ok: true }], null), ler("ok", null), ler(true, null), ler({}, null),
      ler({ ok: "true" }, null), ler({ ok: 1 }, null), ler({ ok: "false" }, null), ler({ liberado: true }, null),
    ].every(indisponivel)
      && /a Pinbank não foi consultada/.test(p.FRASE_LIMITE_INDISPONIVEL) && /Nada foi alterado/.test(p.FRASE_LIMITE_INDISPONIVEL)
      && /fale com o suporte da Quattro/.test(p.FRASE_LIMITE_INDISPONIVEL);
  });

  // A resposta só com contagens NÃO TEM o cruzamento: nem `estado`, nem `resumo`, nem `itens`.
  const semCruzamento = (x: unknown) => ["estado", "resumo", "itens"].every((k) => !Object.prototype.hasOwnProperty.call(x, k));
  const FRASE_OCULTOS = "Nenhuma venda do extrato tem o mesmo número (NSU), no mesmo dia, de uma venda que chegou a esta maquininha pelo aviso da Pinbank. Se o código do estabelecimento (EC) estiver certo, os detalhes aparecem quando houver no período uma venda que chegou pelo aviso da Pinbank; se não estiver, fale com o suporte da Quattro.";
  const FRASE_TROCADA = "Vendas deste extrato chegaram, no dia delas, pelo aviso de uma maquininha que não está mais vinculada à empresa: o período é provavelmente anterior à troca de maquininha. A conferência mostra só as quantidades até a Quattro confirmar o código do estabelecimento (EC) da maquininha antiga; fale com o suporte da Quattro.";
  const proibidos = ["987650001", "987650002", "73519", "41287", "114806", "ELO", "DEBITO", "A VISTA", "2025-07-12", "2025-07-14", "2025-07-19", "2025-08-18"];

  caso(CR.CONTAGENS_EC, () => {
    const raw = eng.conferirExtratoPinbank(FX_EC_ERRADO());
    const x = p.relatorioParaEmpresa(raw);
    // A fixture prova que o motor DEVOLVE o extrato errado inteiro — senão o caso passaria sobre o vazio.
    return raw.estado === "conferido" && raw.itens.length === 2 && proibidos.every((t) => js(raw).includes(t))
      && p.soContagens(x) && semCruzamento(x)
      && js(x.detalhes) === js({ visiveis: false, codigo: "sem_venda_em_comum", frase: FRASE_OCULTOS })
      && p.soContagens(x) && js(x.contagens) === js({
        extrato: { linhas: 2, vendas: 2 },
        sistema: { parcelas: 0, vendas: 0, centavos: null },
        foraDaConferencia: { outroEstabelecimento: 0, semEstabelecimento: 0, outraMaquininha: 0 },
      })
      && proibidos.every((t) => !js(x).includes(t));
  });

  caso(CR.CONTAGENS_CHAVE, () => {
    const raw = eng.conferirExtratoPinbank(F2());
    const x = p.relatorioParaEmpresa(raw);
    return raw.resumo.nsusEmComum === 0 && raw.itens.length > 0 && raw.avisos.some((a) => a.codigo === "chave_nao_confirmada")
      && p.soContagens(x) && semCruzamento(x)
      && js(x.contagens) === js({
        extrato: { linhas: 3, vendas: 3 },
        sistema: { parcelas: 3, vendas: 3, centavos: 6900 },
        foraDaConferencia: { outroEstabelecimento: 0, semEstabelecimento: 0, outraMaquininha: 0 },
      })
      && x.avisos.length === 0 && !/a1b2c3|zzz999|qqq111|136576350|2121979/i.test(js(x));
  });

  caso(CR.CONTAGENS_COMUM, () => {
    const raw = eng.conferirExtratoPinbank(F1());
    const x = p.relatorioParaEmpresa(raw);
    const vazio = p.relatorioParaEmpresa(eng.conferirExtratoPinbank(F6()));
    if (p.soContagens(x)) return false;
    const { detalhes, ...resto } = x;
    return raw.resumo.nsusEmComumAtestados > 0 && raw.itens.length > 0 && detalhes.visiveis === true && js(resto) === js(raw)
      && vazio.vazio === true && vazio.detalhes.visiveis === true;
  });

  /** O extrato do EC errado com UM título forjado pela empresa (sem o aviso da Pinbank). */
  const comForjado = (nsu: number, valor: number, taxas: Entrada["vinculo"]["taxas"] = { debito: 0.0199 }) => ({
    ...FX_EC_ERRADO(),
    vinculo: { id: "v1", codigoCliente: EC, taxas },
    titulos: [R(nsu, 1, valor, "2025-08-18", "2025-07-19")],
  });

  caso(CR.CONTAGENS_FORJADO, () => {
    const raw = eng.conferirExtratoPinbank(comForjado(987650002, 412.87));
    const x = p.relatorioParaEmpresa(raw);
    // O motor CASOU o forjado com a linha alheia (a fixture prova o perigo) — e não o atestou.
    return raw.resumo.nsusEmComum === 1 && raw.resumo.nsusEmComumAtestados === 0
      && raw.itens.some((i) => i.nsu === "987650002" && i.status === "casada")
      && p.soContagens(x) && semCruzamento(x)
      && proibidos.filter((t) => t !== "41287").every((t) => !js(x).includes(t));
  });

  caso(CR.SEM_CRUZAR, () => {
    const par = (a: Entrada, b: Entrada) => {
      const ra = eng.conferirExtratoPinbank(a);
      const rb = eng.conferirExtratoPinbank(b);
      return { ra, rb, xa: p.relatorioParaEmpresa(ra), xb: p.relatorioParaEmpresa(rb) };
    };
    // (i) o NSU do título forjado DENTRO × FORA do extrato (mesmo valor e mesma data).
    const i = par(comForjado(987650002, 412.87), comForjado(987650099, 412.87));
    // (ii) o valor do forjado: igual ao bruto da linha alheia × um centavo a mais.
    const ii = par(comForjado(987650002, 412.87), comForjado(987650002, 412.88));
    // (iii) a taxa de débito cadastrada: igual ao MDR da linha alheia (2,65%) × outra.
    const iii = par({ ...FX_EC_ERRADO(), vinculo: { id: "v1", codigoCliente: EC, taxas: { debito: 0.0265 } } },
      { ...FX_EC_ERRADO(), vinculo: { id: "v1", codigoCliente: EC, taxas: { debito: 0.0199 } } });
    const semSomaDoSistema = (x: unknown) => js(x).replace(/"centavos":\d+/, '"centavos":0');
    // O MOTOR responde diferente em cada par (a fixture prova o oráculo) — a EMPRESA recebe o mesmo.
    return js(i.ra.resumo.porStatus) !== js(i.rb.resumo.porStatus) && js(i.xa) === js(i.xb)
      && js(ii.ra.resumo.porStatus) !== js(ii.rb.resumo.porStatus) && semSomaDoSistema(ii.xa) === semSomaDoSistema(ii.xb)
      && js(iii.ra.resumo.taxa.porResultado) !== js(iii.rb.resumo.taxa.porResultado) && js(iii.xa) === js(iii.xb)
      && [i.xa, i.xb, ii.xa, ii.xb, iii.xa, iii.xb].every((x) => p.soContagens(x) && semCruzamento(x));
  });

  caso(CR.TROCADA, () => {
    const antiga = p.relatorioParaEmpresa(eng.conferirExtratoPinbank(FP()));
    const semTitulos = p.relatorioParaEmpresa(eng.conferirExtratoPinbank(FP("v0", "2025-07-08T13:00:00Z", "2025-07-09T13:00:00Z", false)));
    const nova = p.relatorioParaEmpresa(eng.conferirExtratoPinbank(FP("v1")));
    const semAviso = p.relatorioParaEmpresa(eng.conferirExtratoPinbank(FX_EC_ERRADO()));
    return p.soContagens(antiga) && semCruzamento(antiga)
      && js(antiga.detalhes) === js({ visiveis: false, codigo: "maquininha_excluida", frase: FRASE_TROCADA })
      && p.soContagens(semTitulos) && js(semTitulos.detalhes) === js(antiga.detalhes)
      && !p.soContagens(nova) && nova.detalhes.visiveis === true
      && p.soContagens(semAviso) && js(semAviso.detalhes) === js({ visiveis: false, codigo: "sem_venda_em_comum", frase: FRASE_OCULTOS });
  });
  return r;
}

/**
 * Um Supabase de MENTIRA: só o que a leitura usa, filtrando de verdade e
 * respeitando o `.limit` e o `max_rows` — que, como no Supabase, é 1.000 por
 * PADRÃO. Um teste que quer provar a lógica do teto acima disso pede o cliente
 * SEM `max_rows` pelo nome (`semMaxRows`), e o rótulo do caso diz isso.
 */
type LinhaFalsa = Record<string, unknown>;
const MAX_ROWS_PADRAO = 1000;
const supabaseFalso = (tabelas: Record<string, LinhaFalsa[]>, maxRows = MAX_ROWS_PADRAO) => ({
  from(t: string) {
    let linhas = [...(tabelas[t] ?? [])];
    let limite = Infinity;
    let contar = false;
    const q = {
      select(_c: string, o?: { count?: string }) { contar = o?.count === "exact"; return q; },
      eq(c: string, v: unknown) { linhas = linhas.filter((l) => l[c] === v); return q; },
      like(c: string, padrao: string) { const pre = padrao.replace(/%$/, ""); linhas = linhas.filter((l) => String(l[c] ?? "").startsWith(pre)); return q; },
      is(c: string, v: null) { linhas = linhas.filter((l) => (l[c] ?? null) === v); return q; },
      in(c: string, vs: string[]) { const k = new Set(vs.map(String)); linhas = linhas.filter((l) => k.has(String(l[c]))); return q; },
      gte(c: string, v: string) { linhas = linhas.filter((l) => String(l[c]) >= v); return q; },
      lte(c: string, v: string) { linhas = linhas.filter((l) => String(l[c]) <= v); return q; },
      order() { return q; },
      limit(n: number) { limite = n; return q; },
      then(ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) {
        return Promise.resolve({ data: linhas.slice(0, Math.min(limite, maxRows)), error: null, count: contar ? linhas.length : null }).then(ok, erro);
      },
    };
    return q;
  },
});

const ORG_A = "org-a";
const ORG_B = "org-b";
const NSUS_100 = Array.from({ length: 100 }, (_, i) => String(700001 + i));
const tituloFalso = (org: string, nsu: string, k: number, comp: string) => ({
  id: `${org}-r-${nsu}-${k}`, chave: `pinbank:${nsu}:${k}:r`, nsu, type: "entrada", amount: 10, due_date: comp, competence_date: comp,
  situacao: "previsto", org_id: org, is_sample: false, excluido_em: null,
});
const eventoFalso = (org: string, nsu: string, vinculo: string) => ({
  nsu: Number(nsu), vinculo_id: vinculo, situacao: "processado", event_type: "Compra.TransacaoRealizada", ocorrido_em: "2025-07-10T10:00:00Z", autorizacao: null, org_id: org,
});
const transacaoFalsa = (org: string, nsu: string) => ({ nsu: Number(nsu), status: "Aprovada", valor: 10, valor_original: 10, org_id: org });
/** Duas empresas com os MESMOS NSUs e o mesmo EC — o pior caso para quem esquece de fixar a empresa. */
const DUAS_EMPRESAS = () => ({
  movements: [...NSUS_100.map((n) => tituloFalso(ORG_A, n, 1, "2025-07-10")), ...NSUS_100.map((n) => tituloFalso(ORG_B, n, 1, "2025-07-10"))],
  pinbank_eventos: [...NSUS_100.map((n) => eventoFalso(ORG_A, n, "v1")), ...NSUS_100.map((n) => eventoFalso(ORG_B, n, "v9"))],
  pinbank_transacoes: [...NSUS_100.map((n) => transacaoFalsa(ORG_A, n)), ...NSUS_100.map((n) => transacaoFalsa(ORG_B, n))],
  pinbank_vinculos: [{ id: "v1", codigo_cliente: EC, org_id: ORG_A }, { id: "v9", codigo_cliente: EC, org_id: ORG_B }],
});

async function casosLeitura(le: ModLeitura, eng: ModEngine, p: ModPortoes, rotulo: string): Promise<Map<string, boolean>> {
  const r = new Map<string, boolean>();
  const caso = async (nome: string, ok: () => Promise<boolean>) => {
    let v = false;
    try { v = await ok(); } catch { v = false; }
    r.set(nome, v);
    if (rotulo === "real") console.log(`${v ? "PASSOU" : "FALHOU"}  ${nome}`);
  };
  type Cliente = Parameters<ModLeitura["lerTitulosDaJanela"]>[0];
  /** O cliente com o `max_rows` PADRÃO (1.000), ou outro dito na chamada. */
  const cli = (t: Record<string, LinhaFalsa[]>, maxRows?: number) => supabaseFalso(t, maxRows) as unknown as Cliente;
  /** O cliente SEM `max_rows` — só para provar a lógica do teto acima de 1.000; o nome diz isso. */
  const semMaxRows = (t: Record<string, LinhaFalsa[]>) => supabaseFalso(t, Infinity) as unknown as Cliente;
  const daEmpresa = (xs: unknown[], org: string) => xs.every((x) => (x as LinhaFalsa).org_id === org);
  const JANELA = { de: "2025-07-01", ate: "2025-07-31" };
  /** Só a janela: o pedido pelo NSU de quem não tem extrato. */
  const soJanela = (nsus: string[]) => ({ janela: nsus, extrato: [] as { nsu: string; dias: string[] }[] });
  const alto = (x: { ok: boolean; codigo?: string }) => !x.ok && x.codigo === "volume_alto";

  await caso(CL.LOTE_CHEIO, async () => {
    const t = DUAS_EMPRESAS();
    const d = await le.lerDetalhesPorNsu(cli({ ...t, pinbank_transacoes: t.pinbank_transacoes.filter((x) => x.org_id === ORG_A) }), ORG_A, soJanela(NSUS_100));
    return d.ok && d.dados.transacoes.length === 100 && d.dados.titulos.length === 100 && d.dados.eventos.length === 100;
  });

  await caso(CL.TETOS, async () => {
    const titulos = (n: number) => ({ movements: Array.from({ length: n }, (_, i) => tituloFalso(ORG_A, String(800000 + i), 1, "2025-07-15")) });
    // Com o max_rows PADRÃO (1.000): é ESTE o limite de produção até D2 (d) ser decidido.
    const j1000 = await le.lerTitulosDaJanela(cli(titulos(1000)), ORG_A, JANELA);
    const j1001 = await le.lerTitulosDaJanela(cli(titulos(1001)), ORG_A, JANELA);
    // Sem max_rows (dito no nome): a lógica do teto, 5.000 × 5.001.
    const j5000 = await le.lerTitulosDaJanela(semMaxRows(titulos(5000)), ORG_A, JANELA);
    const j5001 = await le.lerTitulosDaJanela(semMaxRows(titulos(5001)), ORG_A, JANELA);
    const jCortada = await le.lerTitulosDaJanela(cli(titulos(3000), 1000), ORG_A, JANELA);
    const eventos = (n: number) => ({ pinbank_eventos: Array.from({ length: n }, () => eventoFalso(ORG_A, "700001", "v1")) });
    const e2000 = await le.lerDetalhesPorNsu(semMaxRows(eventos(2000)), ORG_A, soJanela(["700001"]));
    const e2001 = await le.lerDetalhesPorNsu(semMaxRows(eventos(2001)), ORG_A, soJanela(["700001"]));
    const vinculos = (n: number) => ({ pinbank_vinculos: Array.from({ length: n }, (_, i) => ({ id: `v${i}`, codigo_cliente: EC, org_id: ORG_A })) });
    const v50 = await le.lerVinculosDaEmpresa(cli(vinculos(50)), ORG_A);
    const v51 = await le.lerVinculosDaEmpresa(cli(vinculos(51)), ORG_A);
    const nsus = (n: number, desde: number) => Array.from({ length: n }, (_, i) => String(desde + i));
    const doExtrato = (xs: string[]) => xs.map((nsu) => ({ nsu, dias: ["2025-07-10"] }));
    const janela2001 = await le.lerDetalhesPorNsu(cli({}), ORG_A, soJanela(nsus(2001, 900000)));
    const extrato2001 = await le.lerDetalhesPorNsu(cli({}), ORG_A, { janela: [], extrato: doExtrato(nsus(2001, 900000)) });
    const cadaLado2000 = await le.lerDetalhesPorNsu(cli({}), ORG_A, { janela: nsus(2000, 900000), extrato: doExtrato(nsus(2000, 950000)) });
    return j1000.ok && j1000.dados.length === 1000 && alto(j1001)
      && j5000.ok && j5000.dados.length === 5000 && alto(j5001) && alto(jCortada)
      && e2000.ok && e2000.dados.eventos.length === 2000 && alto(e2001)
      && v50.ok && v50.dados.length === 50 && alto(v51)
      && alto(janela2001) && alto(extrato2001) && cadaLado2000.ok;
  });

  await caso(CL.CORTE, async () => {
    const titulos = NSUS_100.flatMap((n) => Array.from({ length: 12 }, (_, i) => [
      { ...tituloFalso(ORG_A, n, i + 1, "2025-07-10"), id: `${ORG_A}-r-${n}-${i + 1}` },
      { ...tituloFalso(ORG_A, n, i + 1, "2025-07-10"), id: `${ORG_A}-t-${n}-${i + 1}`, chave: `pinbank:${n}:${i + 1}:t`, type: "saida" },
    ]).flat());
    const avisos = Array.from({ length: 1500 }, () => eventoFalso(ORG_A, "700001", "v1"));
    const cortado = await le.lerDetalhesPorNsu(cli({ movements: titulos }, 1000), ORG_A, soJanela(NSUS_100));
    const inteiro = await le.lerDetalhesPorNsu(semMaxRows({ movements: titulos }), ORG_A, soJanela(NSUS_100));
    const avisosCortados = await le.lerDetalhesPorNsu(cli({ pinbank_eventos: avisos }, 1000), ORG_A, soJanela(["700001"]));
    const avisosInteiros = await le.lerDetalhesPorNsu(semMaxRows({ pinbank_eventos: avisos }), ORG_A, soJanela(["700001"]));
    return titulos.length === 2400 && alto(cortado) && inteiro.ok && inteiro.dados.titulos.length === 2400
      && alto(avisosCortados) && avisosInteiros.ok && avisosInteiros.dados.eventos.length === 1500;
  });

  await caso(CL.EMPRESA, async () => {
    const c = cli(DUAS_EMPRESAS());
    const j = await le.lerTitulosDaJanela(c, ORG_A, JANELA);
    const d = await le.lerDetalhesPorNsu(c, ORG_A, soJanela(NSUS_100));
    const v = await le.lerVinculosDaEmpresa(c, ORG_A);
    return j.ok && j.dados.length === 100 && daEmpresa(j.dados, ORG_A)
      && d.ok && d.dados.titulos.length === 100 && daEmpresa(d.dados.titulos, ORG_A)
      && d.dados.eventos.length === 100 && daEmpresa(d.dados.eventos, ORG_A)
      && d.dados.transacoes.length === 100 && daEmpresa(d.dados.transacoes, ORG_A)
      && v.ok && js1(v.dados.map((x) => x.id)) === js1(["v1"]);
  });

  /**
   * A COMPOSIÇÃO da rota (`src/app/api/pinbank/conferencia/route.ts`) — não a
   * rota importada: a janela, as NSUs separadas por lado, a leitura pelo NSU,
   * o motor (com os títulos da janela ∪ os lidos pelo NSU) e o portão das
   * contagens, na mesma ordem e com as mesmas funções. O `engine-audit` fixa,
   * no texto da rota, exatamente estas chamadas — `lerDetalhesPorNsu(s,
   * v.org_id, nsusParaDetalhar(janela.dados, extrato.resposta.linhas, ec))` e
   * `titulos: [...janela.dados, ...detalhes.dados.titulos]` —, com o `org_id`
   * do vínculo: é o que impede a rota de se afastar deste espelho calada. A
   * leitura das maquininhas (`lerVinculosDaEmpresa`) fica de fora: o espelho
   * usa a maquininha da fixture.
   */
  const rodarRota = async (c: Cliente, extrato: LinhaExtratoPos[]) => {
    const janela = await le.lerTitulosDaJanela(c, ORG_A, JANELA);
    if (!janela.ok) return { codigo: janela.codigo };
    const det = await le.lerDetalhesPorNsu(c, ORG_A, eng.nsusParaDetalhar(janela.dados, extrato, EC));
    if (!det.ok) return { codigo: det.codigo };
    const relatorio = p.relatorioParaEmpresa(eng.conferirExtratoPinbank(base({
      extrato, titulos: [...janela.dados, ...det.dados.titulos], eventos: det.dados.eventos, transacoes: det.dados.transacoes,
    })));
    return { codigo: "ok", relatorio };
  };

  await caso(CL.ORACULO, async () => {
    const extrato = FX_EC_ERRADO().extrato; // duas linhas de OUTRA loja: 987650001 (12/07) e 987650002 (19/07)
    // (i) títulos FORJADOS de FORA da janela (2001), com chave qualquer e o NSU X.
    const foraDaJanela = (nsu: string, n: number) => ({
      movements: Array.from({ length: n }, (_, i) => ({ ...tituloFalso(ORG_A, nsu, 1, "2001-01-01"), id: `f-${i}`, chave: `pinbank:x${i}` })),
    });
    // (ii) 1.999 títulos forjados NA janela: um deles com o NSU de uma linha alheia, ou nenhum.
    const naJanela = (comNsuAlheio: boolean) => ({
      movements: Array.from({ length: 1999 }, (_, i) => tituloFalso(ORG_A, i === 0 && comNsuAlheio ? "987650002" : String(600000 + i), 1, "2025-07-15")),
    });
    const casos: [string, string, string][] = [];
    for (const maxRows of [MAX_ROWS_PADRAO, 5001]) {
      const n = maxRows === MAX_ROWS_PADRAO ? 1001 : 5002;
      const dentro = await rodarRota(cli(foraDaJanela("987650002", n), maxRows), extrato);
      const fora = await rodarRota(cli(foraDaJanela("987650099", n), maxRows), extrato);
      const comAlheio = await rodarRota(cli(naJanela(true), maxRows), extrato);
      const semAlheio = await rodarRota(cli(naJanela(false), maxRows), extrato);
      casos.push([js1(dentro), js1(fora), dentro.codigo], [js1(comAlheio), js1(semAlheio), comAlheio.codigo]);
    }
    // O mesmo resultado nos dois braços de cada par — e o resultado esperado de cada um.
    return casos.every(([a, b]) => a === b)
      && js1(casos.map((c) => c[2])) === js1(["ok", "volume_alto", "ok", "ok"]);
  });

  await caso(CL.EXTRATO_COM_AVISO, async () => {
    // A venda 700050, de 28/06 (fora da janela), está no extrato; o título dela também é de 28/06.
    const linha = { nsu: "700050", dias: ["2025-06-28"] };
    const titulo = tituloFalso(ORG_A, "700050", 1, "2025-06-28");
    const comAviso = (ocorrido: string | null) => ({
      movements: [titulo],
      pinbank_eventos: ocorrido == null ? [] : [{ ...eventoFalso(ORG_A, "700050", "v1"), ocorrido_em: ocorrido }],
    });
    const comDoDia = await le.lerDetalhesPorNsu(cli(comAviso("2025-06-28T15:00:00+00:00")), ORG_A, { janela: [], extrato: [linha] });
    const semAviso = await le.lerDetalhesPorNsu(cli(comAviso(null)), ORG_A, { janela: [], extrato: [linha] });
    const deOutroDia = await le.lerDetalhesPorNsu(cli(comAviso("2025-07-05T15:00:00+00:00")), ORG_A, { janela: [], extrato: [linha] });
    return comDoDia.ok && comDoDia.dados.titulos.length === 1 && comDoDia.dados.eventos.length === 1
      && semAviso.ok && semAviso.dados.titulos.length === 0
      && deOutroDia.ok && deOutroDia.dados.titulos.length === 0 && deOutroDia.dados.eventos.length === 1;
  });
  return r;
}
const js1 = (x: unknown) => JSON.stringify(x);

const portoesReais = await imp<ModPortoes>(ARQ_PORTOES);
const realPortoes = casosPortoes(portoesReais, reais.eng, "real");
const realLeitura = await casosLeitura(await imp<ModLeitura>(ARQ_LEITURA), reais.eng, portoesReais, "real");
falhas += [...realPortoes.values(), ...realLeitura.values()].filter((v) => !v).length;

type PlantaRota = { nome: string; arquivo: "portoes" | "leitura"; caso: string; de: string; para: string };
const PLANTAS_ROTA: PlantaRota[] = [
  // ── o teto que acusava o lote CHEIO (revisões de dinheiro e de repositório, 13/10/2026) ──
  { nome: "PR1 o teto volta a acusar o lote cheio (>=)", arquivo: "portoes", caso: CR.TETO,
    de: "return recebidas > teto || (total != null && total > recebidas);", para: "return recebidas >= teto || (total != null && total > recebidas);" },
  { nome: "PR2 a leitura pede só o teto (sem a linha a mais, o estouro não aparece)", arquivo: "portoes", caso: CR.TETO,
    de: "  return teto + 1;", para: "  return teto;" },
  { nome: "PL1 a transação volta a acusar o lote cheio: 100 vendas no período viram \"vendas demais\"", arquivo: "leitura", caso: CL.LOTE_CHEIO,
    de: "passouDoTeto(lx.length, lote.length)", para: "lx.length >= lote.length" },
  { nome: "PL2 a janela volta a acusar 5.000 títulos exatos como estouro", arquivo: "leitura", caso: CL.TETOS,
    de: "if (passouDoTeto(linhas.length, TETO_LINHAS, count)) return volumeAlto;", para: "if (linhas.length >= TETO_LINHAS || (count != null && count > linhas.length)) return volumeAlto;" },
  { nome: "PL3 o servidor que corta passa calado (a janela sem olhar a contagem)", arquivo: "leitura", caso: CL.TETOS,
    de: "if (passouDoTeto(linhas.length, TETO_LINHAS, count)) return volumeAlto;", para: "if (passouDoTeto(linhas.length, TETO_LINHAS)) return volumeAlto;" },
  // ── a espera por empresa, DURÁVEL no banco (D4, 14/10/2026) ──
  // (a recusa que carimba, a espera que nunca recusa e a reserva sem o portão de papel são
  // plantadas na FUNÇÃO do banco, em `scripts/pinbank-limite-ec.sql`; aqui, a leitura da rota)
  { nome: "PR3 o erro da reserva ignorado (a função ausente, ou a recusa por papel, deixa a Pinbank ser chamada)", arquivo: "portoes", caso: CR.FALHA_FECHADA,
    de: "  if (erro != null) return LIMITE_INDISPONIVEL;\n", para: "" },
  { nome: "PR4 qualquer ok que \"pareça\" verdadeiro libera (\"true\", 1, \"false\")", arquivo: "portoes", caso: CR.FALHA_FECHADA,
    de: "if (d.ok === true) return { ok: true };", para: "if (d.ok) return { ok: true };" },
  { nome: "PR5 a resposta que não se entende segue para a Pinbank", arquivo: "portoes", caso: CR.FALHA_FECHADA,
    de: "  return LIMITE_INDISPONIVEL;\n}\n", para: "  return { ok: true };\n}\n" },
  { nome: "PR6 a recusa sem teto (o relógio torto do banco vira espera maior que a regra)", arquivo: "portoes", caso: CR.RESERVA,
    de: "Math.min(ESPERA_CONFERENCIA_MS, Math.max(1, Math.ceil(r)))", para: "Math.max(1, Math.ceil(r))" },
  { nome: "PR6b a recusa de 0 ms (o botão libera na hora e o banco recusa de novo)", arquivo: "portoes", caso: CR.RESERVA,
    de: "Math.min(ESPERA_CONFERENCIA_MS, Math.max(1, Math.ceil(r)))", para: "Math.min(ESPERA_CONFERENCIA_MS, Math.ceil(r))" },
  { nome: "PR6c a recusa ilegível vira espera ZERO (a pessoa clica de novo e cai na mesma recusa)", arquivo: "portoes", caso: CR.RESERVA,
    de: "      : ESPERA_CONFERENCIA_MS;", para: "      : 0;" },
  { nome: "PR6d o 429 ignora o restante (o botão espera 60 s ao lado da frase \"Espere 23 segundos\")", arquivo: "portoes", caso: CR.BOTAO,
    de: "  if (!r.ok && r.codigo === \"aguarde\" && typeof r.restanteMs === \"number\" && Number.isFinite(r.restanteMs)) {",
    para: "  if (false) {" },
  { nome: "PR6e o restante do 429 sem teto (um carimbo torto desliga o botão por mais que a regra)", arquivo: "portoes", caso: CR.BOTAO,
    de: "    return Math.min(ESPERA_CONFERENCIA_MS, Math.max(1, Math.ceil(r.restanteMs)));", para: "    return Math.max(1, Math.ceil(r.restanteMs));" },
  { nome: "PR6f qualquer recusa com número usa o número (o 502 com um número qualquer libera o botão na hora)", arquivo: "portoes", caso: CR.BOTAO,
    de: "  if (!r.ok && r.codigo === \"aguarde\" && typeof r.restanteMs", para: "  if (!r.ok && typeof r.restanteMs" },
  // ── só as contagens sem venda em comum ATESTADA (revisões de autorização, D10) ──
  { nome: "PR7 sem venda em comum, o relatório do motor (lista, situações, soma do extrato) vai junto", arquivo: "portoes", caso: CR.CONTAGENS_EC,
    de: "    versao: r.versao,\n    vazio: false,", para: "    ...r,\n    versao: r.versao,\n    vazio: false," },
  { nome: "PR8 as situações (que cruzam os lados) voltam às contagens", arquivo: "portoes", caso: CR.SEM_CRUZAR,
    de: "      foraDaConferencia: { ...r.resumo.foraDaConferencia },\n    },", para: "      foraDaConferencia: { ...r.resumo.foraDaConferencia },\n      porStatus: r.resumo.porStatus,\n    }," },
  { nome: "PR8b a comparação da taxa (contra a taxa que a empresa cadastra) volta às contagens", arquivo: "portoes", caso: CR.SEM_CRUZAR,
    de: "      foraDaConferencia: { ...r.resumo.foraDaConferencia },\n    },", para: "      foraDaConferencia: { ...r.resumo.foraDaConferencia },\n      taxa: r.resumo.taxa.porResultado,\n    }," },
  { nome: "PR8c o aviso de numeração não confirmada (que some com o título forjado) vai junto", arquivo: "portoes", caso: CR.SEM_CRUZAR,
    de: "    avisos: r.avisos.filter((a) => AVISOS_SEM_CRUZAMENTO.has(a.codigo)),", para: "    avisos: r.avisos," },
  { nome: "PR9 o portão olha a venda em comum SEM o aviso (o título forjado abre o extrato alheio)", arquivo: "portoes", caso: CR.CONTAGENS_FORJADO,
    de: "if (r.vazio || r.resumo.nsusEmComumAtestados > 0) return", para: "if (r.vazio || r.resumo.nsusEmComum > 0) return" },
  { nome: "PR9b a restrição só olha a chave não confirmada (o EC errado sem venda no sistema passa inteiro)", arquivo: "portoes", caso: CR.CONTAGENS_EC,
    de: "if (r.vazio || r.resumo.nsusEmComumAtestados > 0) return", para: "if (r.vazio || r.estado !== \"chave_nao_confirmada\") return" },
  { nome: "PR10 a restrição apaga também o lado do sistema", arquivo: "portoes", caso: CR.CONTAGENS_CHAVE,
    de: "      sistema: { ...r.resumo.lados.sistema },", para: "      sistema: { parcelas: 0, vendas: 0, centavos: null }," },
  { nome: "PR11 o relatório sai sempre só com contagens (a conferência que confirma também perde os detalhes)", arquivo: "portoes", caso: CR.CONTAGENS_COMUM,
    de: "if (r.vazio || r.resumo.nsusEmComumAtestados > 0) return", para: "if (false) return" },
  { nome: "PR12 a maquininha trocada volta à frase de \"confira o EC\" (o sinal ignorado)", arquivo: "portoes", caso: CR.TROCADA,
    de: "const excluida = r.resumo.nsusDoExtratoDeMaquininhaExcluida > 0;", para: "const excluida = false;" },
  // ── a empresa do vínculo em toda leitura (revisão de autorização) ──
  { nome: "PL4 a janela lida sem fixar a empresa", arquivo: "leitura", caso: CL.EMPRESA,
    de: '.select(COLS, { count: "exact" })).eq("org_id", orgId).like("chave", "pinbank:%").is("excluido_em", null).gte(',
    para: '.select(COLS, { count: "exact" })).like("chave", "pinbank:%").is("excluido_em", null).gte(' },
  { nome: "PL5 os títulos pelo NSU lidos sem fixar a empresa", arquivo: "leitura", caso: CL.EMPRESA,
    de: '.select(COLS, { count: "exact" })).eq("org_id", orgId).like("chave", "pinbank:%").is("excluido_em", null).in(',
    para: '.select(COLS, { count: "exact" })).like("chave", "pinbank:%").is("excluido_em", null).in(' },
  { nome: "PL6 os avisos lidos sem fixar a empresa", arquivo: "leitura", caso: CL.EMPRESA,
    de: 'autorizacao:payload->>codAutorizAdquirente", { count: "exact" }).eq("org_id", orgId)', para: 'autorizacao:payload->>codAutorizAdquirente", { count: "exact" })' },
  { nome: "PL7 as transações lidas sem fixar a empresa", arquivo: "leitura", caso: CL.EMPRESA,
    de: '.select("nsu, status, valor, valor_original").eq("org_id", orgId)', para: '.select("nsu, status, valor, valor_original")' },
  { nome: "PL8 as maquininhas lidas sem fixar a empresa", arquivo: "leitura", caso: CL.EMPRESA,
    de: '.select("id, codigo_cliente").eq("org_id", orgId)', para: '.select("id, codigo_cliente")' },
  // ── o servidor que corta abaixo do teto (o max_rows do PostgREST, segunda revisão) ──
  { nome: "PL9 os títulos pelo NSU lidos sem a contagem (o corte do servidor passa calado)", arquivo: "leitura", caso: CL.CORTE,
    de: 'semAmostra(s.from("movements").select(COLS, { count: "exact" })).eq("org_id", orgId).like("chave", "pinbank:%").is("excluido_em", null).in(',
    para: 'semAmostra(s.from("movements").select(COLS)).eq("org_id", orgId).like("chave", "pinbank:%").is("excluido_em", null).in(' },
  { nome: "PL10 a contagem dos títulos pelo NSU lida e ignorada", arquivo: "leitura", caso: CL.CORTE,
    de: "passouDoTeto(lt.length, TETO_LINHAS, t.count)", para: "passouDoTeto(lt.length, TETO_LINHAS)" },
  { nome: "PL11 os avisos lidos sem a contagem (o corte do servidor passa calado)", arquivo: "leitura", caso: CL.CORTE,
    de: 'autorizacao:payload->>codAutorizAdquirente", { count: "exact" })', para: 'autorizacao:payload->>codAutorizAdquirente")' },
  { nome: "PL12 a contagem dos avisos lida e ignorada", arquivo: "leitura", caso: CL.CORTE,
    de: "passouDoTeto(le.length, TETO_EVENTOS_LOTE, e.count)", para: "passouDoTeto(le.length, TETO_EVENTOS_LOTE)" },
  // ── o oráculo antes do portão (terceira revisão, 13/10/2026) ──
  { nome: "PL13 o teto volta a ser o da UNIÃO das NSUs (encolhe quando os títulos forjados coincidem com o extrato alheio)", arquivo: "leitura", caso: CL.ORACULO,
    de: "if (pedido.janela.length > TETO_NSUS || pedido.extrato.length > TETO_NSUS) return volumeAlto;", para: "if (todas.length > TETO_NSUS) return volumeAlto;" },
  { nome: "PL14 os títulos voltam a ser lidos por TODA NSU do extrato (o forjado de fora da janela entra na leitura)", arquivo: "leitura", caso: CL.ORACULO,
    de: "const paraTitulos = Array.from(new Set([...pedido.janela, ...nsusDoExtratoComAviso(pedido.extrato, eventos)]));", para: "const paraTitulos = todas;" },
  { nome: "PL15 o título da NSU do extrato com aviso no dia da venda nunca é lido", arquivo: "leitura", caso: CL.EXTRATO_COM_AVISO,
    de: "...nsusDoExtratoComAviso(pedido.extrato, eventos)]", para: "]" },
  { nome: "PL16 o teto por lado some (mais de 2.000 NSUs são lidas)", arquivo: "leitura", caso: CL.TETOS,
    de: "if (pedido.janela.length > TETO_NSUS || pedido.extrato.length > TETO_NSUS) return volumeAlto;", para: "" },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pinbank-conferencia-"));
const original = fs.readFileSync(ARQ_ENGINE, "utf8");
for (const [i, p] of PLANTAS.entries()) {
  if (!original.includes(p.de)) {
    console.log(`FALHOU  (defeito plantado) "${p.nome}": a substituição não aconteceu — a planta envelheceu`);
    falhas++;
    continue;
  }
  const arq = path.join(tmp, `conferencia-plantada-${i}.ts`);
  fs.writeFileSync(arq, original.replace(p.de, p.para));
  const r = casos({ eng: await imp<ModEngine>(arq) }, "planta");
  const pego = r.get(p.caso) === false;
  console.log(`${pego ? "PASSOU" : "FALHOU"}  (defeito plantado) "${p.nome}" derruba: ${p.caso}`);
  if (!pego) falhas++;
}
const originaisRota = { portoes: fs.readFileSync(ARQ_PORTOES, "utf8"), leitura: fs.readFileSync(ARQ_LEITURA, "utf8") };
for (const [i, p] of PLANTAS_ROTA.entries()) {
  const original = originaisRota[p.arquivo];
  if (!original.includes(p.de)) {
    console.log(`FALHOU  (defeito plantado) "${p.nome}": a substituição não aconteceu — a planta envelheceu`);
    falhas++;
    continue;
  }
  const arq = path.join(tmp, `${p.arquivo}-plantada-${i}.ts`);
  fs.writeFileSync(arq, original.replace(p.de, p.para));
  const r = p.arquivo === "portoes"
    ? casosPortoes(await imp<ModPortoes>(arq), reais.eng, "planta")
    : await casosLeitura(await imp<ModLeitura>(arq), reais.eng, portoesReais, "planta");
  const pego = r.get(p.caso) === false;
  console.log(`${pego ? "PASSOU" : "FALHOU"}  (defeito plantado) "${p.nome}" derruba: ${p.caso}`);
  if (!pego) falhas++;
}
fs.rmSync(tmp, { recursive: true, force: true });

const nCasos = real.size + realPortoes.size + realLeitura.size;
const nPlantas = PLANTAS.length + PLANTAS_ROTA.length;
console.log(`\n${falhas === 0 ? "OK" : "FALHOU"}: conferência extrato × sistema — ${nCasos} casos, ${nPlantas} defeitos plantados, ${falhas} falha(s).`);
process.exit(falhas > 0 ? 1 : 0);
