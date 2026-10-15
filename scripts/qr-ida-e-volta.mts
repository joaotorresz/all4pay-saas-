/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QR VOLTA AO TEXTO — gerar, desenhar, LER e comparar (ida e volta)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run qr
 *
 * ⚠️ O defeito que esta guarda existe para pegar (15/10/2026): o QR da tela
 * "Segurança da conta" não era lido por aplicativo nenhum, e a chave copiada
 * funcionava. O link `otpauth://` do Supabase tem ~133 bytes e cai na VERSÃO 8
 * do QR; o gerador (`lib/qrcode`) não gravava a INFORMAÇÃO DE VERSÃO, que a
 * norma exige a partir da 7. O código parecia perfeito e nenhum leitor o lia —
 * medido com OpenCV: nem em preto puro sobre branco. A cor do fundo não era a
 * causa.
 *
 * O que ela faz: para links de TESTE (segredo falso, nunca de ninguém) que
 * caem em cada versão de 1 a 10, gera o QR, desenha o SVG que a tela mostra
 * (o MESMO `qrParaSVG`, com as cores e a margem dele), rasteriza esse SVG, lê
 * com um decodificador de verdade (jsQR) e exige o texto de volta, byte a byte.
 * Também exige módulo ESCURO sobre fundo CLARO e a margem clara de 4 módulos.
 *
 * ⚠️ E planta o defeito DENTRO do arquivo: apaga a informação de versão de um
 * QR versão 8 e exige que a leitura FALHE. Se esse caso passar a ser lido, a
 * guarda não estaria medindo o que diz medir — ela reprova também.
 */
import jsQR from "jsqr";
import { gerarQR, qrParaSVG, type QRCode } from "@/lib/qrcode";

let falhas = 0;
const ok = (cond: boolean, nome: string, detalhe = "") => {
  if (!cond) falhas++;
  console.log(`${cond ? "✓" : "✗"} ${nome}${detalhe ? ` — ${detalhe}` : ""}`);
};

/* ── rasterizar o SVG que a tela mostra ─────────────────────────────────── */
// O `qrParaSVG` emite UM <rect> de fundo e UM <path> com quadrados
// "M x y h1v1h-1z". Ler o próprio SVG (e não a matriz) é o que faz a guarda
// cobrir também cor, margem e coordenadas do desenho.
type Raster = { dados: Uint8ClampedArray; lado: number; fundo: number[]; tinta: number[]; total: number };
const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = ([r, g, b]: number[]) => {
  const c = [r, g, b].map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};

function rasterizar(svg: string, escala = 4): Raster {
  const total = Number(svg.match(/viewBox="0 0 (\d+) \1"/)?.[1]);
  const fundo = hex(svg.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/)?.[1] ?? "#000000");
  const tinta = hex(svg.match(/<path[^>]*fill="(#[0-9A-Fa-f]{6})"/)?.[1] ?? "#000000");
  const d = svg.match(/<path d="([^"]*)"/)?.[1] ?? "";
  const lado = total * escala;
  const dados = new Uint8ClampedArray(lado * lado * 4);
  const pinta = (x0: number, y0: number, cor: number[]) => {
    for (let y = y0 * escala; y < (y0 + 1) * escala; y++) for (let x = x0 * escala; x < (x0 + 1) * escala; x++) {
      const i = (y * lado + x) * 4;
      dados[i] = cor[0]; dados[i + 1] = cor[1]; dados[i + 2] = cor[2]; dados[i + 3] = 255;
    }
  };
  for (let y = 0; y < total; y++) for (let x = 0; x < total; x++) pinta(x, y, fundo);
  for (const m of d.matchAll(/M(\d+) (\d+)h1v1h-1z/g)) pinta(Number(m[1]), Number(m[2]), tinta);
  return { dados, lado, fundo, tinta, total };
}

const ler = (r: Raster) => jsQR(r.dados, r.lado, r.lado, { inversionAttempts: "dontInvert" })?.data ?? null;

/* ── os links de teste, um por versão ───────────────────────────────────── */
// ⚠️ Segredo FALSO (o exemplo clássico de base32, "Hello!" repetido): nenhum
// link aqui abre conta de ninguém.
const SEGREDO = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const otpauth = (conta: string) =>
  `otpauth://totp/Quattro:${conta}?algorithm=SHA1&digits=6&issuer=Quattro&period=30&secret=${SEGREDO}`;

// O formato do link real (o do Supabase), com um e-mail de teste do MESMO
// comprimento do caso que falhou: 133 bytes, versão 8.
const REAL = otpauth("testeqrfalso@mail.com");
ok(new TextEncoder().encode(REAL).length === 133, "o link de teste tem o tamanho do real", "133 bytes");

const casos: string[] = [REAL, "otpauth://Q", "otpauth://totp/Q:a@b.co?secret=JBSWY3DPEHPK3PXP"];
// Um texto por versão de 1 a 10: o tamanho cresce até cada versão aparecer.
for (let n = 4; n <= 210; n += 6) casos.push(`otpauth://totp/${"x".repeat(n)}`);

const versoesVistas = new Set<number>();
for (const texto of casos) {
  let qr: QRCode;
  try { qr = gerarQR(texto); } catch { continue; }
  versoesVistas.add(qr.versao);
  const r = rasterizar(qrParaSVG(qr, (qr.tamanho + 8) * 4));
  const lido = ler(r);
  if (texto === REAL || lido !== texto) {
    ok(lido === texto, `versão ${qr.versao} (${new TextEncoder().encode(texto).length} bytes) volta ao texto`, lido === null ? "o leitor não achou o código" : lido === texto ? "" : `leu "${lido}"`);
  }
  if (lido === texto) versoesVistas.add(qr.versao * 100); // marca "lida"
}
for (let v = 1; v <= 10; v++) {
  ok(versoesVistas.has(v) && versoesVistas.has(v * 100), `versão ${v}: gerada e lida de volta`);
}

/* ── cor e margem ───────────────────────────────────────────────────────── */
{
  const qr = gerarQR(REAL);
  const svg = qrParaSVG(qr, (qr.tamanho + 8) * 4);
  const r = rasterizar(svg);
  const [claro, escuro] = [lum(r.fundo), lum(r.tinta)];
  const contraste = (claro + 0.05) / (escuro + 0.05);
  ok(claro > escuro, "módulo ESCURO sobre fundo CLARO (um QR invertido muitos leitores recusam)");
  ok(contraste >= 7, "contraste entre módulo e fundo de pelo menos 7:1", `${contraste.toFixed(1)}:1`);
  ok(r.total === qr.tamanho + 8, "margem clara de 4 módulos em volta", `${(r.total - qr.tamanho) / 2} de cada lado`);
  const minimo = Math.min(...[...svg.matchAll(/M(\d+) (\d+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]));
  const maximo = Math.max(...[...svg.matchAll(/M(\d+) (\d+)/g)].flatMap((m) => [Number(m[1]), Number(m[2])]));
  ok(minimo >= 4 && maximo <= r.total - 5, "nenhum módulo escuro dentro da margem");
}

/* ── o defeito plantado: sem a informação de versão, NÃO lê ─────────────── */
{
  const qr = gerarQR(REAL);
  const n = qr.tamanho;
  const sem = qr.modulos.map((l) => [...l]);
  for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) { sem[i][n - 11 + j] = false; sem[n - 11 + j][i] = false; }
  const r = rasterizar(qrParaSVG({ ...qr, modulos: sem }, (n + 8) * 4));
  const lido = ler(r);
  ok(lido !== REAL, "DEFEITO PLANTADO: versão 8 sem a informação de versão não é lida",
    lido === REAL ? "a guarda leu o código quebrado — ela não mede o que diz medir" : "o leitor recusou, como recusava na tela");
}

if (falhas) { console.error(`\n✗ ${falhas} falha(s) na ida e volta do QR`); process.exit(1); }
console.log("\n✓ QR: gera, desenha, lê e volta ao mesmo texto nas versões 1 a 10");
