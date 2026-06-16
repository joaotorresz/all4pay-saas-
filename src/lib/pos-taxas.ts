/**
 * Simulador POS all4pay — espelho fiel da aba "TAXA PADRÃO" da planilha
 * SIMULADOR (visão parceiro · MDR + Antecipação). As demais abas (LISTA,
 * LISTA MCCs, ONLINE) são apenas dados de lógica/lookup e NÃO entram no
 * sistema — aqui ficam só as seções visíveis da aba TAXA PADRÃO:
 *   1) Informações de precificação (inputs)
 *   2) Taxa de custo MDR (modalidade × bandeira)
 *   3) Spread (% editável) — o que aumenta/diminui reflete na taxa final
 *   4) Taxa final para o estabelecimento = Custo MDR + Spread
 * Tudo configurável e salvo globalmente (a4p_pos_taxas).
 */
export type Bandeira = "master" | "visa" | "elo";
export const BANDEIRAS: { id: Bandeira; label: string }[] = [
  { id: "master", label: "01 - Mastercard" },
  { id: "visa", label: "02 - Visa" },
  { id: "elo", label: "03 - Elo" },
];

/** Linhas de modalidade da aba (7 buckets, exatamente como a planilha). */
export interface ModalidadeRow { id: string; label: string; pixUnico?: boolean }
export const MODALIDADES: ModalidadeRow[] = [
  { id: "pix", label: "04 - Pix", pixUnico: true },
  { id: "debito", label: "00 - Débito" },
  { id: "credito_vista", label: "01 - Crédito à Vista" },
  { id: "parc_2_6", label: "02 - Parcelado 2 à 6x" },
  { id: "parc_7_12", label: "03 - Parcelado 7 à 12x" },
  { id: "parc_13_18", label: "04 - Parcelado 13 à 18x" },
  { id: "parc_19_24", label: "05 - Parcelado 19 à 24x" },
];

/** Tabela de taxa: modalidadeId → (bandeira → decimal). Pix tem só 1 valor. */
export type RateTable = Record<string, Partial<Record<Bandeira, number>>>;

/** Custo MDR (J8:M14) — ALL4PAY · 5812 · RANGE 1. */
export const CUSTO_MDR_SEED: RateTable = {
  pix: { master: 0.012 },
  debito: { master: 0.012, visa: 0.012, elo: 0.0197 },
  credito_vista: { master: 0.0225, visa: 0.0224, elo: 0.0247 },
  parc_2_6: { master: 0.0315, visa: 0.0315, elo: 0.0319 },
  parc_7_12: { master: 0.0399, visa: 0.0399, elo: 0.0429 },
  parc_13_18: { master: 0.0446, visa: 0.0446, elo: 0.0459 },
  parc_19_24: { master: 0.0508, visa: 0.0508, elo: 0.0528 },
};

/** Spread (Taxa MDR − Custo MDR) decimal — J30:M36 da aba. */
export const SPREAD_SEED: RateTable = {
  pix: { master: -0.0005 },
  debito: { master: 0.0025, visa: 0.0025, elo: -0.0007 },
  credito_vista: { master: -0.0025, visa: -0.0024, elo: -0.0007 },
  parc_2_6: { master: 0.0045, visa: 0.0045, elo: 0.0051 },
  parc_7_12: { master: -0.0039, visa: -0.0039, elo: -0.0009 },
  parc_13_18: { master: -0.0056, visa: -0.0056, elo: 0.0011 },
  parc_19_24: { master: -0.0078, visa: -0.0078, elo: -0.0008 },
};

/** MCCs conhecidos (descrição ↔ código), só para o select do cadastro. */
export const MCCS = [
  { mcc: "5812", descricao: "RESTAURANTE" },
  { mcc: "5813", descricao: "BARES" },
  { mcc: "5411", descricao: "SUPERMERCADOS" },
  { mcc: "5912", descricao: "DROGARIAS E FARMÁCIAS" },
  { mcc: "5399", descricao: "COMÉRCIO GERAL / VARIEDADES" },
  { mcc: "5200", descricao: "LOJAS DE MATERIAL DE CONSTRUÇÃO E FERRAGENS" },
];
export const RANGES = ["RANGE 1", "RANGE 2", "RANGE 3", "RANGE 4", "RANGE 5"];

export interface PosConfig {
  custo: RateTable;
  spread: RateTable;
  // Informações de precificação
  mccDesc: string; // E10 "RESTAURANTE" (define o código pelo MCCS)
  range: string; // E12 "RANGE 1"
  selic: number; // E13 0.145
  antecipacao: boolean; // E14 TERÁ ANTECIPAÇÃO?
  online: boolean; // E15 ONLINE
}

export const POS_DEFAULT: PosConfig = {
  custo: CUSTO_MDR_SEED,
  spread: SPREAD_SEED,
  mccDesc: "RESTAURANTE",
  range: "RANGE 1",
  selic: 0.145,
  antecipacao: false,
  online: false,
};

/** Código MCC a partir da descrição selecionada (E7 = lookup de E10). */
export function mccCodigo(desc: string): string {
  return MCCS.find((m) => m.descricao === desc)?.mcc ?? "—";
}

/** Taxa final ao estabelecimento = Custo MDR + Spread (decimal). */
export function taxaFinal(custo: RateTable, spread: RateTable, mod: string, b: Bandeira): number | undefined {
  const c = custo[mod]?.[b];
  if (c == null) return undefined;
  return c + (spread[mod]?.[b] ?? 0);
}

const KEY = "a4p_pos_taxas";
export function loadPosConfig(): PosConfig {
  if (typeof window === "undefined") return POS_DEFAULT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return POS_DEFAULT;
    const j = JSON.parse(raw) as Partial<PosConfig>;
    // Sem custo/spread (formato antigo) → reseta para o seed da aba.
    if (!j.custo || !j.spread) return POS_DEFAULT;
    return {
      custo: j.custo,
      spread: j.spread,
      mccDesc: j.mccDesc ?? POS_DEFAULT.mccDesc,
      range: j.range ?? POS_DEFAULT.range,
      selic: j.selic ?? POS_DEFAULT.selic,
      antecipacao: j.antecipacao ?? POS_DEFAULT.antecipacao,
      online: j.online ?? POS_DEFAULT.online,
    };
  } catch { return POS_DEFAULT; }
}
export function savePosConfig(c: PosConfig): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignore */ }
}
