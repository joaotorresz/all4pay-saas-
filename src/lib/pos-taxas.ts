/**
 * Simulador de taxas POS all4pay — modelo importado da planilha SIMULADOR
 * (aba TAXA PADRÃO + LISTA MCCs + ONLINE). Tudo configurável e salvo localmente
 * (a4p_pos_taxas). Cálculo da taxa final ao EC:
 *   final = MDR(bandeira, modalidade) + (antecipação ? antecipEC[parcela] : 0)
 *                                     + (online ? onlineAdd(bandeira, modalidade) : 0)
 *   antecipação SIM **e** online SIM ⇒ "NÃO ANTECIPA" (não combina).
 */
export type Bandeira = "master" | "visa" | "elo";
export const BANDEIRAS: { id: Bandeira; label: string }[] = [
  { id: "master", label: "Mastercard" }, { id: "visa", label: "Visa" }, { id: "elo", label: "Elo" },
];

/** Grupos de modalidade (a planilha agrupa o parcelado em faixas). */
export type Grupo = "pix" | "debito" | "credito_vista" | "parc_2_6" | "parc_7_12" | "parc_13_18" | "parc_19_21";

export interface Modalidade { id: string; label: string; parcela: number; grupo: Grupo }
export const MODALIDADES: Modalidade[] = [
  { id: "pix", label: "Pix", parcela: 0, grupo: "pix" },
  { id: "debito", label: "Débito", parcela: 0, grupo: "debito" },
  { id: "credito", label: "Crédito à Vista", parcela: 1, grupo: "credito_vista" },
  ...Array.from({ length: 20 }, (_, i) => {
    const n = i + 2; // 2x..21x
    const grupo: Grupo = n <= 6 ? "parc_2_6" : n <= 12 ? "parc_7_12" : n <= 18 ? "parc_13_18" : "parc_19_21";
    return { id: `p${n}`, label: `${n}X`, parcela: n, grupo };
  }),
];

export const MCCS = [
  { mcc: "5812", descricao: "RESTAURANTE" },
  { mcc: "5411", descricao: "SUPERMERCADOS" },
  { mcc: "5200", descricao: "LOJAS DE MATERIAL DE CONSTRUÇÃO E FERRAGENS" },
];
export const RANGES = ["RANGE 1", "RANGE 2", "RANGE 3", "RANGE 4", "RANGE 5"];

/** MDR base por bandeira × grupo (decimal). Seed: ALL4PAY · 5812 · RANGE 1. */
export type MdrTable = Record<Bandeira, Record<Grupo, number>>;
export const MDR_SEED: MdrTable = {
  master: { pix: 0.012, debito: 0.012, credito_vista: 0.0225, parc_2_6: 0.0315, parc_7_12: 0.0399, parc_13_18: 0.0446, parc_19_21: 0.0508 },
  visa: { pix: 0.012, debito: 0.012, credito_vista: 0.0224, parc_2_6: 0.0315, parc_7_12: 0.0399, parc_13_18: 0.0446, parc_19_21: 0.0508 },
  elo: { pix: 0.012, debito: 0.0197, credito_vista: 0.0247, parc_2_6: 0.0319, parc_7_12: 0.0429, parc_13_18: 0.0459, parc_19_21: 0.0559 },
};

/** Acréscimo ONLINE por grupo × bandeira (decimal). Seed da aba ONLINE. */
export type OnlineTable = Record<Bandeira, Partial<Record<Grupo, number>>>;
export const ONLINE_SEED: OnlineTable = {
  master: { credito_vista: 0.002, parc_2_6: 0.004, parc_7_12: 0.005, parc_13_18: 0.006, parc_19_21: 0.006 },
  visa: { credito_vista: 0.001, parc_2_6: 0.003, parc_7_12: 0.005, parc_13_18: 0.006, parc_19_21: 0.006 },
  elo: { credito_vista: 0.001, parc_2_6: 0.002, parc_7_12: 0.003, parc_13_18: 0.003, parc_19_21: 0.003 },
};

/** Antecipação ao EC por parcela (decimal) — coluna U da planilha (CDI+). Crédito
 *  à vista = 1; cada parcela soma ~0,9414%. Pix/Débito não antecipam. */
export const ANTECIP_SEED: number[] = [
  0, 0.019, 0.028241489674151188, 0.037655319565534917, 0.047069149456918646, 0.056482979348302376,
  0.065896809239686105, 0.075310639131069834, 0.084724469022453563, 0.094138298913837293,
  0.10355212880522102, 0.11296595869660475, 0.12237978858798848, 0.13179361847937221,
  0.14120744837075594, 0.15062127826213967, 0.1600351081535234, 0.16944893804490713,
  0.17886276793629086, 0.18827659782767459, 0.19769042771905831, 0.20710425761044204,
]; // índice = parcela (0..21); 0 = sem antecipação

/** A chave da tabela de MDR é `${mcc}|${range}` — cada combinação tem o seu. */
export type MdrByKey = Record<string, MdrTable>;
export const mdrKey = (mcc: string, range: string) => `${mcc}|${range}`;
const SEED_KEY = mdrKey("5812", "RANGE 1");

export interface PosConfig {
  mdrByKey: MdrByKey;
  online: OnlineTable;
  antecip: number[]; // por parcela
  selic: number;
}
export const POS_DEFAULT: PosConfig = {
  mdrByKey: { [SEED_KEY]: MDR_SEED },
  online: ONLINE_SEED,
  antecip: ANTECIP_SEED,
  selic: 0.145,
};

/** Tabela de MDR ativa para a combinação MCC × Range (cai no seed se ainda não editada). */
export function mdrTable(cfg: PosConfig, mcc: string, range: string): MdrTable {
  return cfg.mdrByKey[mdrKey(mcc, range)] ?? MDR_SEED;
}

const KEY = "a4p_pos_taxas";
export function loadPosConfig(): PosConfig {
  if (typeof window === "undefined") return POS_DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return POS_DEFAULT;
    const j = JSON.parse(raw) as Partial<PosConfig> & { mdr?: MdrTable };
    // Migração da versão antiga (mdr único) → mdrByKey.
    const mdrByKey = j.mdrByKey ?? (j.mdr ? { [SEED_KEY]: j.mdr } : POS_DEFAULT.mdrByKey);
    return {
      mdrByKey,
      online: j.online ?? POS_DEFAULT.online,
      antecip: j.antecip ?? POS_DEFAULT.antecip,
      selic: j.selic ?? POS_DEFAULT.selic,
    };
  } catch { return POS_DEFAULT; }
}
export function savePosConfig(c: PosConfig): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
}

export interface Cenario { antecipacao: boolean; online: boolean }
export type TaxaCelula = number | "NAO_ANTECIPA";

/** Taxa final ao EC (decimal) para uma modalidade × bandeira, dado o cenário. */
export function taxaFinal(mdrT: MdrTable, cfg: PosConfig, m: Modalidade, b: Bandeira, cen: Cenario): TaxaCelula {
  const mdr = mdrT[b]?.[m.grupo] ?? 0;
  const podeAntecipar = m.grupo !== "pix" && m.grupo !== "debito";
  const antecipar = cen.antecipacao && podeAntecipar;
  const online = cen.online && (cfg.online[b]?.[m.grupo] ?? 0) > 0;
  if (antecipar && online) return "NAO_ANTECIPA";
  let v = mdr;
  if (antecipar) v += cfg.antecip[m.parcela] ?? 0;
  else if (online) v += cfg.online[b]?.[m.grupo] ?? 0;
  return v;
}
