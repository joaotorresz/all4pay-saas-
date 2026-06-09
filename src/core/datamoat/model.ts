/**
 * Self-Improving Financial AI — modelo proprietário que aprende com a
 * coorte (cross-tenant). Regressão logística treinada por gradiente para
 * prever stress/inadimplência a partir das features. A curva de
 * aprendizado mostra a acurácia crescendo com o nº de empresas — quanto
 * mais dados, mais inteligente (o moat).
 */
import type { EmpresaCoorte, EmpresaFeatures, ModelStats } from "./types";
import { coorte, FEATURE_KEYS } from "./cohort";

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

interface Padronizador {
  media: number[];
  desvio: number[];
}
interface ModeloTreino {
  w: number[];
  b: number;
  pad: Padronizador;
}

function vetor(e: EmpresaFeatures): number[] {
  return FEATURE_KEYS.map((k) => e[k]);
}

function padronizar(X: number[][]): Padronizador {
  const d = X[0].length;
  const media = new Array(d).fill(0);
  const desvio = new Array(d).fill(0);
  for (const row of X) row.forEach((v, j) => (media[j] += v));
  media.forEach((_, j) => (media[j] /= X.length));
  for (const row of X) row.forEach((v, j) => (desvio[j] += (v - media[j]) ** 2));
  desvio.forEach((_, j) => (desvio[j] = Math.sqrt(desvio[j] / X.length) || 1));
  return { media, desvio };
}
const aplicar = (x: number[], p: Padronizador) => x.map((v, j) => (v - p.media[j]) / p.desvio[j]);

function treinar(X: number[][], y: number[], iters = 300, lr = 0.3): ModeloTreino {
  const pad = padronizar(X);
  const Z = X.map((x) => aplicar(x, pad));
  const d = Z[0].length;
  const w = new Array(d).fill(0);
  let b = 0;
  for (let it = 0; it < iters; it++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < Z.length; i++) {
      const p = sigmoid(Z[i].reduce((s, v, j) => s + v * w[j], b));
      const err = p - y[i];
      for (let j = 0; j < d; j++) gw[j] += err * Z[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= (lr * gw[j]) / Z.length + lr * 0.001 * w[j];
    b -= (lr * gb) / Z.length;
  }
  return { w, b, pad };
}

function prob(m: ModeloTreino, x: number[]): number {
  const z = aplicar(x, m.pad);
  return sigmoid(z.reduce((s, v, j) => s + v * m.w[j], m.b));
}

function acuracia(m: ModeloTreino, X: number[][], y: number[]): number {
  let ok = 0;
  for (let i = 0; i < X.length; i++) if ((prob(m, X[i]) >= 0.5 ? 1 : 0) === y[i]) ok++;
  return ok / X.length;
}

function auc(m: ModeloTreino, X: number[][], y: number[]): number {
  const pos: number[] = [];
  const neg: number[] = [];
  X.forEach((x, i) => (y[i] === 1 ? pos : neg).push(prob(m, x)));
  if (!pos.length || !neg.length) return 0.5;
  let c = 0;
  for (const pp of pos) for (const nn of neg) c += pp > nn ? 1 : pp === nn ? 0.5 : 0;
  return c / (pos.length * neg.length);
}

let _modelo: ModeloTreino | null = null;
let _stats: ModelStats | null = null;

function dataset(): { X: number[][]; y: number[]; co: EmpresaCoorte[] } {
  const co = coorte();
  return { X: co.map(vetor), y: co.map((e) => e.stress), co };
}

/** Treina (uma vez) o modelo no conjunto de treino e calcula estatísticas. */
export function modeloDeCredito(): { modelo: ModeloTreino; stats: ModelStats } {
  if (_modelo && _stats) return { modelo: _modelo, stats: _stats };
  const { X, y } = dataset();
  const corte = Math.floor(X.length * 0.8);
  const Xtr = X.slice(0, corte);
  const ytr = y.slice(0, corte);
  const Xte = X.slice(corte);
  const yte = y.slice(corte);

  const modelo = treinar(Xtr, ytr);

  // Curva de aprendizado: acurácia no holdout cresce com o nº de empresas.
  const curva: { n: number; acuracia: number }[] = [];
  for (const n of [20, 40, 80, 120, 180, corte]) {
    const m = treinar(Xtr.slice(0, n), ytr.slice(0, n), 200);
    curva.push({ n, acuracia: Math.round(acuracia(m, Xte, yte) * 1000) / 1000 });
  }

  _modelo = modelo;
  _stats = {
    amostras: Xtr.length,
    acuracia: Math.round(acuracia(modelo, Xte, yte) * 1000) / 1000,
    auc: Math.round(auc(modelo, Xte, yte) * 1000) / 1000,
    curvaAprendizado: curva,
    pesos: FEATURE_KEYS.map((k, j) => ({ feature: String(k), peso: Math.round(modelo.w[j] * 100) / 100 })),
  };
  return { modelo, stats: _stats };
}

/** Probabilidade de stress/inadimplência para uma empresa. */
export function probabilidadeStress(e: EmpresaFeatures): number {
  const { modelo } = modeloDeCredito();
  return prob(modelo, vetor(e));
}
