/**
 * Imagens de produto (visual de "cardápio"). Demo-safe e live-safe: a imagem é
 * guardada localmente (localStorage) por NOME normalizado do produto — não exige
 * coluna/Storage no Supabase. Reduzida no upload para caber bem no localStorage.
 */
const KEY = "a4p_produto_imagens";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function load(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}
export function setProdutoImagem(nome: string, dataUrl: string): void {
  if (typeof window === "undefined" || !nome.trim()) return;
  const m = load(); m[norm(nome)] = dataUrl;
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* quota — ignora */ }
}
export function getProdutoImagem(nome: string): string | null {
  return nome ? (load()[norm(nome)] ?? null) : null;
}
export function removeProdutoImagem(nome: string): void {
  if (typeof window === "undefined" || !nome) return;
  const m = load(); delete m[norm(nome)];
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

/** Lê um File de imagem e devolve um dataURL JPEG reduzido (máx ~480px). */
export function fileParaDataUrl(file: File, max = 480): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("read"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("img"));
      img.onload = () => {
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * escala), h = Math.round(img.height * escala);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = fr.result as string;
    };
    fr.readAsDataURL(file);
  });
}
