/**
 * Simulador POS all4pay — modelo da aba "TAXA PADRÃO" (visão parceiro · MDR +
 * Antecipação). Os dados de lookup das outras abas (LISTA MCCs, ONLINE, CDI+)
 * ficam embutidos aqui como TABELAS (não como telas) para que os seletores
 * funcionem de verdade:
 *   - MCC × Range  → muda a Taxa de custo MDR (LISTA MCCs).
 *   - Terá antecipação? → soma a antecipação por parcela na taxa final ao EC.
 *   - Online → soma o acréscimo online; antecipação + online juntos ⇒ "Não antecipa".
 *   - SELIC → muda o custo de antecipação do parceiro (CDI+ por range).
 * Cálculo: base = Custo MDR + Spread; final ao EC = base + antecipação OU + online.
 * Cache local (a4p_pos_taxas) para a pintura; em live persiste em `pos_rates`.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { ler, gravar as gravarOrg } from "@/lib/store-org";

export type Bandeira = "master" | "visa" | "elo";
export const BANDEIRAS: { id: Bandeira; label: string }[] = [
  { id: "master", label: "01 - Mastercard" },
  { id: "visa", label: "02 - Visa" },
  { id: "elo", label: "03 - Elo" },
];

export type Grupo = "pix" | "debito" | "credito_vista" | "parc_2_6" | "parc_7_12" | "parc_13_18" | "parc_19_24";

/** Linhas de grupo (Custo MDR / Spread) — 7 buckets como a planilha. */
export interface GrupoRow { id: Grupo; label: string; pixUnico?: boolean }
export const GRUPOS: GrupoRow[] = [
  { id: "pix", label: "04 - Pix", pixUnico: true },
  { id: "debito", label: "00 - Débito" },
  { id: "credito_vista", label: "01 - Crédito à Vista" },
  { id: "parc_2_6", label: "02 - Parcelado 2 à 6x" },
  { id: "parc_7_12", label: "03 - Parcelado 7 à 12x" },
  { id: "parc_13_18", label: "04 - Parcelado 13 à 18x" },
  { id: "parc_19_24", label: "05 - Parcelado 19 à 24x" },
];

/** Linhas por PARCELA da taxa final ao EC (Pix · Débito · Crédito à vista · 2X..21X). */
export interface ParcelaRow { id: string; label: string; parcela: number; grupo: Grupo; semAntecip?: boolean; pixUnico?: boolean }
export const PARCELAS: ParcelaRow[] = [
  { id: "pix", label: "Pix", parcela: 0, grupo: "pix", semAntecip: true, pixUnico: true },
  { id: "debito", label: "Débito", parcela: 0, grupo: "debito", semAntecip: true },
  { id: "cv", label: "Crédito à Vista", parcela: 1, grupo: "credito_vista" },
  ...Array.from({ length: 20 }, (_, i) => {
    const n = i + 2; // 2X..21X
    const grupo: Grupo = n <= 6 ? "parc_2_6" : n <= 12 ? "parc_7_12" : n <= 18 ? "parc_13_18" : "parc_19_24";
    return { id: `p${n}`, label: `${n}X`, parcela: n, grupo };
  }),
];

/** Tabela de taxa: grupo → (bandeira → decimal). Pix tem só 1 valor. */
export type RateTable = Partial<Record<Grupo, Partial<Record<Bandeira, number>>>>;

/** MCCs reais da planilha (descrição ↔ código). */
export const MCCS = [
  { mcc: "5812", descricao: "RESTAURANTE" },
  { mcc: "5813", descricao: "BARES" },
  { mcc: "5411", descricao: "SUPERMERCADOS" },
  { mcc: "5912", descricao: "DROGARIAS E FARMÁCIAS" },
  { mcc: "5331", descricao: "COMÉRCIO GERAL / VARIEDADES" },
  { mcc: "5211", descricao: "LOJAS DE MATERIAL DE CONSTRUÇÃO E FERRAGENS" },
];
export const RANGES = ["RANGE 1", "RANGE 2", "RANGE 3", "RANGE 4", "RANGE 5"];

/** Custo MDR por MCC × Range × grupo × bandeira (LISTA MCCs, SUMIFS). */
export const CUSTO_BY_MCC_RANGE: Record<string, Record<string, RateTable>> = {
  "5812": {
    "RANGE 1": { pix: { master: 0.012 }, debito: { master: 0.012, visa: 0.012, elo: 0.0197 }, credito_vista: { master: 0.0225, visa: 0.0224, elo: 0.0247 }, parc_2_6: { master: 0.0315, visa: 0.0315, elo: 0.0319 }, parc_7_12: { master: 0.0399, visa: 0.0399, elo: 0.0429 }, parc_13_18: { master: 0.0446, visa: 0.0446, elo: 0.0459 }, parc_19_24: { master: 0.0508, visa: 0.0508, elo: 0.0528 } },
    "RANGE 2": { pix: { master: 0.0115 }, debito: { master: 0.0115, visa: 0.0115, elo: 0.0189 }, credito_vista: { master: 0.0223, visa: 0.0222, elo: 0.0242 }, parc_2_6: { master: 0.031, visa: 0.031, elo: 0.0314 }, parc_7_12: { master: 0.039126, visa: 0.03929, elo: 0.042552 }, parc_13_18: { master: 0.043933, visa: 0.044055, elo: 0.045652 }, parc_19_24: { master: 0.050073, visa: 0.050195, elo: 0.052457 } },
    "RANGE 3": { pix: { master: 0.011 }, debito: { master: 0.011, visa: 0.011, elo: 0.018 }, credito_vista: { master: 0.0221, visa: 0.022, elo: 0.0238 }, parc_2_6: { master: 0.0307, visa: 0.0307, elo: 0.031 }, parc_7_12: { master: 0.03839, visa: 0.03871, elo: 0.042222 }, parc_13_18: { master: 0.043299, visa: 0.043537, elo: 0.045417 }, parc_19_24: { master: 0.049733, visa: 0.049911, elo: 0.052132 } },
    "RANGE 4": { pix: { master: 0.0107 }, debito: { master: 0.0107, visa: 0.0107, elo: 0.0172 }, credito_vista: { master: 0.0219, visa: 0.0217, elo: 0.0234 }, parc_2_6: { master: 0.0303, visa: 0.0303, elo: 0.030459 }, parc_7_12: { master: 0.037691, visa: 0.038159, elo: 0.041909 }, parc_13_18: { master: 0.042697, visa: 0.043044, elo: 0.045194 }, parc_19_24: { master: 0.049059, visa: 0.04935, elo: 0.051823 } },
    "RANGE 5": { pix: { master: 0.0105 }, debito: { master: 0.0105, visa: 0.0105, elo: 0.0168 }, credito_vista: { master: 0.0216, visa: 0.0214, elo: 0.023 }, parc_2_6: { master: 0.03, visa: 0.03, elo: 0.0302 }, parc_7_12: { master: 0.037028, visa: 0.037636, elo: 0.041611 }, parc_13_18: { master: 0.042125, visa: 0.042577, elo: 0.044982 }, parc_19_24: { master: 0.048419, visa: 0.048818, elo: 0.051529 } },
  },
  "5813": {
    "RANGE 1": { pix: { master: 0.012 }, debito: { master: 0.012, visa: 0.012, elo: 0.0197 }, credito_vista: { master: 0.0225, visa: 0.0224, elo: 0.0247 }, parc_2_6: { master: 0.0315, visa: 0.0315, elo: 0.0319 }, parc_7_12: { master: 0.0399, visa: 0.0399, elo: 0.0429 }, parc_13_18: { master: 0.0446, visa: 0.0446, elo: 0.0459 }, parc_19_24: { master: 0.0508, visa: 0.0508, elo: 0.0528 } },
    "RANGE 2": { pix: { master: 0.0115 }, debito: { master: 0.0115, visa: 0.0115, elo: 0.0189 }, credito_vista: { master: 0.0223, visa: 0.0222, elo: 0.0242 }, parc_2_6: { master: 0.031, visa: 0.031, elo: 0.0314 }, parc_7_12: { master: 0.039126, visa: 0.03929, elo: 0.042552 }, parc_13_18: { master: 0.043933, visa: 0.044055, elo: 0.045652 }, parc_19_24: { master: 0.050073, visa: 0.050195, elo: 0.052457 } },
    "RANGE 3": { pix: { master: 0.011 }, debito: { master: 0.011, visa: 0.011, elo: 0.018 }, credito_vista: { master: 0.0221, visa: 0.022, elo: 0.0238 }, parc_2_6: { master: 0.0307, visa: 0.0307, elo: 0.031 }, parc_7_12: { master: 0.03839, visa: 0.03871, elo: 0.042222 }, parc_13_18: { master: 0.043299, visa: 0.043537, elo: 0.045417 }, parc_19_24: { master: 0.049733, visa: 0.049911, elo: 0.052132 } },
    "RANGE 4": { pix: { master: 0.0107 }, debito: { master: 0.0107, visa: 0.0107, elo: 0.0172 }, credito_vista: { master: 0.0219, visa: 0.0217, elo: 0.0234 }, parc_2_6: { master: 0.0303, visa: 0.0303, elo: 0.030459 }, parc_7_12: { master: 0.037691, visa: 0.038159, elo: 0.041909 }, parc_13_18: { master: 0.042697, visa: 0.043044, elo: 0.045194 }, parc_19_24: { master: 0.049059, visa: 0.04935, elo: 0.051823 } },
    "RANGE 5": { pix: { master: 0.0105 }, debito: { master: 0.0105, visa: 0.0105, elo: 0.0168 }, credito_vista: { master: 0.0216, visa: 0.0214, elo: 0.023 }, parc_2_6: { master: 0.03, visa: 0.03, elo: 0.0302 }, parc_7_12: { master: 0.037028, visa: 0.037636, elo: 0.041611 }, parc_13_18: { master: 0.042125, visa: 0.042577, elo: 0.044982 }, parc_19_24: { master: 0.048419, visa: 0.048818, elo: 0.051529 } },
  },
  "5411": {
    "RANGE 1": { pix: { master: 0.0099 }, debito: { master: 0.0099, visa: 0.0099, elo: 0.0155 }, credito_vista: { master: 0.02, visa: 0.02, elo: 0.0245 }, parc_2_6: { master: 0.0338, visa: 0.0328, elo: 0.0393 }, parc_7_12: { master: 0.0402, visa: 0.0402, elo: 0.0497 }, parc_13_18: { master: 0.0485, visa: 0.0485, elo: 0.0542 }, parc_19_24: { master: 0.0539, visa: 0.0539, elo: 0.0588 } },
    "RANGE 2": { pix: { master: 0.0095 }, debito: { master: 0.0095, visa: 0.0095, elo: 0.015215 }, credito_vista: { master: 0.0195, visa: 0.0195, elo: 0.024074 }, parc_2_6: { master: 0.033259, visa: 0.032045, elo: 0.038418 }, parc_7_12: { master: 0.039374, visa: 0.03945, elo: 0.048871 }, parc_13_18: { master: 0.047572, visa: 0.047631, elo: 0.053396 }, parc_19_24: { master: 0.052952, visa: 0.053011, elo: 0.058016 } },
    "RANGE 3": { pix: { master: 0.0093 }, debito: { master: 0.0093, visa: 0.0092, elo: 0.014943 }, credito_vista: { master: 0.019, visa: 0.019, elo: 0.02367 }, parc_2_6: { master: 0.032746, visa: 0.031329, elo: 0.037579 }, parc_7_12: { master: 0.038589, visa: 0.038738, elo: 0.048083 }, parc_13_18: { master: 0.046691, visa: 0.046805, elo: 0.052631 }, parc_19_24: { master: 0.052435, visa: 0.052525, elo: 0.05727 } },
    "RANGE 4": { pix: { master: 0.009 }, debito: { master: 0.009, visa: 0.009, elo: 0.014686 }, credito_vista: { master: 0.0186, visa: 0.0186, elo: 0.023285 }, parc_2_6: { master: 0.032258, visa: 0.030648, elo: 0.036783 }, parc_7_12: { master: 0.037844, visa: 0.038061, elo: 0.047334 }, parc_13_18: { master: 0.045854, visa: 0.04602, elo: 0.051905 }, parc_19_24: { master: 0.051561, visa: 0.051705, elo: 0.056563 } },
    "RANGE 5": { pix: { master: 0.0087 }, debito: { master: 0.0087, visa: 0.0087, elo: 0.014441 }, credito_vista: { master: 0.0182, visa: 0.0182, elo: 0.02292 }, parc_2_6: { master: 0.031794, visa: 0.030001, elo: 0.036027 }, parc_7_12: { master: 0.037136, visa: 0.037418, elo: 0.046623 }, parc_13_18: { master: 0.045059, visa: 0.045275, elo: 0.051216 }, parc_19_24: { master: 0.05073, visa: 0.050925, elo: 0.05589 } },
  },
  "5912": {
    "RANGE 1": { pix: { master: 0.0099 }, debito: { master: 0.0099, visa: 0.0099, elo: 0.0155 }, credito_vista: { master: 0.02, visa: 0.02, elo: 0.0245 }, parc_2_6: { master: 0.0338, visa: 0.0328, elo: 0.0393 }, parc_7_12: { master: 0.0402, visa: 0.0402, elo: 0.0497 }, parc_13_18: { master: 0.0485, visa: 0.0485, elo: 0.0542 }, parc_19_24: { master: 0.0539, visa: 0.0539, elo: 0.0588 } },
    "RANGE 2": { pix: { master: 0.0095 }, debito: { master: 0.0095, visa: 0.0095, elo: 0.015215 }, credito_vista: { master: 0.0195, visa: 0.0195, elo: 0.024074 }, parc_2_6: { master: 0.033259, visa: 0.032045, elo: 0.038418 }, parc_7_12: { master: 0.039374, visa: 0.03945, elo: 0.048871 }, parc_13_18: { master: 0.047572, visa: 0.047631, elo: 0.053396 }, parc_19_24: { master: 0.052952, visa: 0.053011, elo: 0.058016 } },
    "RANGE 3": { pix: { master: 0.0093 }, debito: { master: 0.0093, visa: 0.0092, elo: 0.014943 }, credito_vista: { master: 0.019, visa: 0.019, elo: 0.02367 }, parc_2_6: { master: 0.032746, visa: 0.031329, elo: 0.037579 }, parc_7_12: { master: 0.038589, visa: 0.038738, elo: 0.048083 }, parc_13_18: { master: 0.046691, visa: 0.046805, elo: 0.052631 }, parc_19_24: { master: 0.052435, visa: 0.052525, elo: 0.05727 } },
    "RANGE 4": { pix: { master: 0.009 }, debito: { master: 0.009, visa: 0.009, elo: 0.014686 }, credito_vista: { master: 0.0186, visa: 0.0186, elo: 0.023285 }, parc_2_6: { master: 0.032258, visa: 0.030648, elo: 0.036783 }, parc_7_12: { master: 0.037844, visa: 0.038061, elo: 0.047334 }, parc_13_18: { master: 0.045854, visa: 0.04602, elo: 0.051905 }, parc_19_24: { master: 0.051561, visa: 0.051705, elo: 0.056563 } },
    "RANGE 5": { pix: { master: 0.0087 }, debito: { master: 0.0087, visa: 0.0087, elo: 0.014441 }, credito_vista: { master: 0.0182, visa: 0.0182, elo: 0.02292 }, parc_2_6: { master: 0.031794, visa: 0.030001, elo: 0.036027 }, parc_7_12: { master: 0.037136, visa: 0.037418, elo: 0.046623 }, parc_13_18: { master: 0.045059, visa: 0.045275, elo: 0.051216 }, parc_19_24: { master: 0.05073, visa: 0.050925, elo: 0.05589 } },
  },
  "5331": {
    "RANGE 1": { pix: { master: 0.0099 }, debito: { master: 0.0099, visa: 0.0099, elo: 0.0155 }, credito_vista: { master: 0.02, visa: 0.02, elo: 0.0245 }, parc_2_6: { master: 0.0338, visa: 0.0328, elo: 0.0393 }, parc_7_12: { master: 0.0402, visa: 0.0402, elo: 0.0497 }, parc_13_18: { master: 0.0485, visa: 0.0485, elo: 0.0542 }, parc_19_24: { master: 0.0539, visa: 0.0539, elo: 0.0588 } },
    "RANGE 2": { pix: { master: 0.0095 }, debito: { master: 0.0095, visa: 0.0095, elo: 0.015215 }, credito_vista: { master: 0.0195, visa: 0.0195, elo: 0.024074 }, parc_2_6: { master: 0.033259, visa: 0.032045, elo: 0.038418 }, parc_7_12: { master: 0.039374, visa: 0.03945, elo: 0.048871 }, parc_13_18: { master: 0.047572, visa: 0.047631, elo: 0.053396 }, parc_19_24: { master: 0.052952, visa: 0.053011, elo: 0.058016 } },
    "RANGE 3": { pix: { master: 0.0093 }, debito: { master: 0.0093, visa: 0.0092, elo: 0.014943 }, credito_vista: { master: 0.019, visa: 0.019, elo: 0.02367 }, parc_2_6: { master: 0.032746, visa: 0.031329, elo: 0.037579 }, parc_7_12: { master: 0.038589, visa: 0.038738, elo: 0.048083 }, parc_13_18: { master: 0.046691, visa: 0.046805, elo: 0.052631 }, parc_19_24: { master: 0.052435, visa: 0.052525, elo: 0.05727 } },
    "RANGE 4": { pix: { master: 0.009 }, debito: { master: 0.009, visa: 0.009, elo: 0.014686 }, credito_vista: { master: 0.0186, visa: 0.0186, elo: 0.023285 }, parc_2_6: { master: 0.032258, visa: 0.030648, elo: 0.036783 }, parc_7_12: { master: 0.037844, visa: 0.038061, elo: 0.047334 }, parc_13_18: { master: 0.045854, visa: 0.04602, elo: 0.051905 }, parc_19_24: { master: 0.051561, visa: 0.051705, elo: 0.056563 } },
    "RANGE 5": { pix: { master: 0.0087 }, debito: { master: 0.0087, visa: 0.0087, elo: 0.014441 }, credito_vista: { master: 0.0182, visa: 0.0182, elo: 0.02292 }, parc_2_6: { master: 0.031794, visa: 0.030001, elo: 0.036027 }, parc_7_12: { master: 0.037136, visa: 0.037418, elo: 0.046623 }, parc_13_18: { master: 0.045059, visa: 0.045275, elo: 0.051216 }, parc_19_24: { master: 0.05073, visa: 0.050925, elo: 0.05589 } },
  },
  "5211": {
    "RANGE 1": { pix: { master: 0.0094 }, debito: { master: 0.0094, visa: 0.0094, elo: 0.016 }, credito_vista: { master: 0.0185, visa: 0.0185, elo: 0.0209 }, parc_2_6: { master: 0.0241, visa: 0.0241, elo: 0.0249 }, parc_7_12: { master: 0.0271, visa: 0.0271, elo: 0.0307 }, parc_13_18: { master: 0.0321, visa: 0.0321, elo: 0.0366 }, parc_19_24: { master: 0.0381, visa: 0.0381, elo: 0.0416 } },
    "RANGE 2": { pix: { master: 0.0092 }, debito: { master: 0.009212, visa: 0.009212, elo: 0.01568 }, credito_vista: { master: 0.01813, visa: 0.01813, elo: 0.020482 }, parc_2_6: { master: 0.023618, visa: 0.023618, elo: 0.024402 }, parc_7_12: { master: 0.026558, visa: 0.026558, elo: 0.030086 }, parc_13_18: { master: 0.031458, visa: 0.031458, elo: 0.035868 }, parc_19_24: { master: 0.037338, visa: 0.037338, elo: 0.040768 } },
    "RANGE 3": { pix: { master: 0.009 }, debito: { master: 0.009046, visa: 0.009046, elo: 0.015398 }, credito_vista: { master: 0.017804, visa: 0.017804, elo: 0.020113 }, parc_2_6: { master: 0.023193, visa: 0.023193, elo: 0.023963 }, parc_7_12: { master: 0.02608, visa: 0.02608, elo: 0.029544 }, parc_13_18: { master: 0.030892, visa: 0.030892, elo: 0.035222 }, parc_19_24: { master: 0.036666, visa: 0.036666, elo: 0.040034 } },
    "RANGE 4": { pix: { master: 0.0089 }, debito: { master: 0.008865, visa: 0.008865, elo: 0.01509 }, credito_vista: { master: 0.017448, visa: 0.017448, elo: 0.019711 }, parc_2_6: { master: 0.022729, visa: 0.022729, elo: 0.023484 }, parc_7_12: { master: 0.025558, visa: 0.025558, elo: 0.028954 }, parc_13_18: { master: 0.030274, visa: 0.030274, elo: 0.034518 }, parc_19_24: { master: 0.035933, visa: 0.035933, elo: 0.039233 } },
    "RANGE 5": { pix: { master: 0.0087 }, debito: { master: 0.008688, visa: 0.008688, elo: 0.014788 }, credito_vista: { master: 0.017099, visa: 0.017099, elo: 0.019317 }, parc_2_6: { master: 0.022274, visa: 0.022274, elo: 0.023014 }, parc_7_12: { master: 0.025047, visa: 0.025047, elo: 0.028374 }, parc_13_18: { master: 0.029668, visa: 0.029668, elo: 0.033828 }, parc_19_24: { master: 0.035214, visa: 0.035214, elo: 0.038449 } },
  },
};

/** Spread default (Taxa MDR vendida − Custo) — ALL4PAY · 5812 · RANGE 1. */
export const SPREAD_SEED: RateTable = {
  pix: { master: -0.0005 },
  debito: { master: 0.0025, visa: 0.0025, elo: -0.0007 },
  credito_vista: { master: -0.0025, visa: -0.0024, elo: -0.0007 },
  parc_2_6: { master: 0.0045, visa: 0.0045, elo: 0.0051 },
  parc_7_12: { master: -0.0039, visa: -0.0039, elo: -0.0009 },
  parc_13_18: { master: -0.0056, visa: -0.0056, elo: 0.0011 },
  parc_19_24: { master: -0.0078, visa: -0.0078, elo: -0.0008 },
};

/** Acréscimo ONLINE por parcela (1=crédito à vista … 21=21x) × bandeira. */
export const ONLINE_ADD: Record<number, Partial<Record<Bandeira, number>>> = {
  1: { master: 0.002, visa: 0.001, elo: 0.001 },
  2: { master: 0.004, visa: 0.003, elo: 0.002 }, 3: { master: 0.004, visa: 0.003, elo: 0.002 },
  4: { master: 0.004, visa: 0.003, elo: 0.002 }, 5: { master: 0.004, visa: 0.003, elo: 0.002 },
  6: { master: 0.004, visa: 0.003, elo: 0.002 },
  7: { master: 0.005, visa: 0.005, elo: 0.003 }, 8: { master: 0.005, visa: 0.005, elo: 0.003 },
  9: { master: 0.005, visa: 0.005, elo: 0.003 }, 10: { master: 0.005, visa: 0.005, elo: 0.003 },
  11: { master: 0.005, visa: 0.005, elo: 0.003 }, 12: { master: 0.005, visa: 0.005, elo: 0.003 },
  13: { master: 0.006, visa: 0.006, elo: 0.003 }, 14: { master: 0.006, visa: 0.006, elo: 0.003 },
  15: { master: 0.006, visa: 0.006, elo: 0.003 }, 16: { master: 0.006, visa: 0.006, elo: 0.003 },
  17: { master: 0.006, visa: 0.006, elo: 0.003 }, 18: { master: 0.006, visa: 0.006, elo: 0.003 },
  19: { master: 0.006, visa: 0.006, elo: 0.003 }, 20: { master: 0.006, visa: 0.006, elo: 0.003 },
  21: { master: 0.006, visa: 0.006, elo: 0.003 },
};

/** CDI+ por range (LISTA MCCs U:V) — usado no custo de antecipação do parceiro. */
export const CDI_POR_RANGE: Record<string, number> = {
  "RANGE 1": 0.05204, "RANGE 2": 0.0426728, "RANGE 3": 0.034991696,
  "RANGE 4": 0.03114261, "RANGE 5": 0.027697174,
};

/** Dias de antecipação por parcela (crédito à vista = 30, +15 a cada parcela). */
export function diasParcela(p: number): number {
  return p <= 1 ? 30 : 15 * (p + 1);
}

/** Antecipação ao EC por parcela (decimal), dada a taxa mensal. Pix/Débito = 0. */
export function antecipEC(parcela: number, mensal: number): number {
  if (parcela <= 0) return 0;
  if (parcela === 1) return mensal; // crédito à vista
  const diario = Math.pow(1 + mensal, 1 / 30) - 1;
  return diario * diasParcela(parcela);
}

/** Custo de antecipação do PARCEIRO ao mês = ((1+selic)·(1+cdi))^(1/12) − 1. */
export function custoAntecipParceiroMensal(selic: number, range: string): number {
  const cdi = CDI_POR_RANGE[range] ?? 0;
  return Math.pow((1 + selic) * (1 + cdi), 1 / 12) - 1;
}

export interface PosConfig {
  spread: RateTable; // margem do parceiro, por grupo (editável)
  mccDesc: string; // descrição MCC selecionada
  range: string;
  selic: number;
  antecipacao: boolean;
  online: boolean;
  taxaAntecipMensal: number; // taxa de antecipação ao EC (a.m.) — default 1,9%
}

export const POS_DEFAULT: PosConfig = {
  spread: SPREAD_SEED,
  mccDesc: "RESTAURANTE",
  range: "RANGE 1",
  selic: 0.145,
  antecipacao: false,
  online: false,
  taxaAntecipMensal: 0.019,
};

export function mccCodigo(desc: string): string {
  return MCCS.find((m) => m.descricao === desc)?.mcc ?? "—";
}

/** Tabela de custo MDR para a seleção (fallback 5812/RANGE 1). */
export function custoTable(mccDesc: string, range: string): RateTable {
  const mcc = mccCodigo(mccDesc);
  return CUSTO_BY_MCC_RANGE[mcc]?.[range] ?? CUSTO_BY_MCC_RANGE["5812"]["RANGE 1"];
}

/** Taxa MDR base (vendida ao EC) = Custo + Spread, por grupo × bandeira. */
export function baseMDR(custo: RateTable, spread: RateTable, g: Grupo, b: Bandeira): number | undefined {
  const c = custo[g]?.[b];
  if (c == null) return undefined;
  return c + (spread[g]?.[b] ?? 0);
}

export type TaxaCelula = number | "NAO_ANTECIPA";

/** Taxa final ao EC para uma parcela × bandeira no cenário (MDR + antecipação/online). */
export function taxaFinalParcela(cfg: PosConfig, custo: RateTable, row: ParcelaRow, b: Bandeira): TaxaCelula | undefined {
  const base = baseMDR(custo, cfg.spread, row.grupo, b);
  if (base == null) return undefined;
  if (row.semAntecip) return base; // Pix / Débito: não recebem antecipação/online
  if (cfg.antecipacao && cfg.online) return "NAO_ANTECIPA";
  if (cfg.antecipacao) return base + antecipEC(row.parcela, cfg.taxaAntecipMensal);
  if (cfg.online) return base + (ONLINE_ADD[row.parcela]?.[b] ?? 0);
  return base;
}

const KEY = "a4p_pos_taxas";

/** Normaliza um config parcial (de localStorage/DB) sobre os defaults. */
function coerce(j: Partial<PosConfig> | null | undefined): PosConfig {
  if (!j || !j.spread) return POS_DEFAULT;
  return {
    spread: j.spread,
    mccDesc: j.mccDesc ?? POS_DEFAULT.mccDesc,
    range: j.range ?? POS_DEFAULT.range,
    selic: j.selic ?? POS_DEFAULT.selic,
    antecipacao: j.antecipacao ?? POS_DEFAULT.antecipacao,
    online: j.online ?? POS_DEFAULT.online,
    taxaAntecipMensal: j.taxaAntecipMensal ?? POS_DEFAULT.taxaAntecipMensal,
  };
}

/** Leitura SÍNCRONA do cache local — para a pintura inicial. */
export function loadPosConfig(): PosConfig {
  return coerce(ler<Partial<PosConfig> | null>(KEY, null));
}

/** Grava o cache local (síncrono). Em live, prefira `persistPosConfig`. */
export function savePosConfig(c: PosConfig): void {
  if (typeof window === "undefined") return;
  gravarOrg(KEY, c);
}

/** Config efetiva: demo → cache local; live → `pos_rates` da org (RLS), com
 *  fallback no cache/default. Hidrata o cache local para a próxima pintura. */
export async function fetchPosConfig(): Promise<PosConfig> {
  if (isDemo) return loadPosConfig();
  try {
    const { data, error } = await createClient().from("pos_rates").select("config").maybeSingle();
    if (error || !data?.config) return loadPosConfig();
    const cfg = coerce(data.config as Partial<PosConfig>);
    savePosConfig(cfg);
    return cfg;
  } catch { return loadPosConfig(); }
}

/** Persiste o config: cache local + (live) upsert na linha única da org em
 *  `pos_rates`. Update-then-insert casa a linha (org_id default = auth_org_id())
 *  sem precisar enviar o org_id. */
export async function persistPosConfig(c: PosConfig): Promise<void> {
  savePosConfig(c);
  if (isDemo) return;
  const s = createClient();
  const { data, error } = await s
    .from("pos_rates")
    .update({ config: c, updated_at: new Date().toISOString() })
    .select("org_id");
  if (error) throw error;
  if (!data || data.length === 0) {
    const { error: insErr } = await s.from("pos_rates").insert({ config: c });
    if (insErr) throw insErr;
  }
}
