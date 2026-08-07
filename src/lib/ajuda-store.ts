"use client";

/**
 * Catálogo de tours + estado da Central de Ajuda (localStorage, demo-safe).
 *
 * ⚠️ O catálogo é DERIVADO de `components/app/guides` — a mesma fonte que o
 * botão "Guia" de cada tela já usa. Um catálogo próprio envelheceria em
 * silêncio: a tela mudaria, o guia acompanharia e o tour continuaria ensinando
 * a versão antiga.
 */
import { GUIDES, tourSteps } from "@/components/app/guides";
import { SECTIONS, CONFIG } from "@/components/dashboard/nav-data";
import { melhorGuia, type CandidatoGuia } from "@/core/ajuda";
import type {
  Tour, ProgressoTour, Chamado, MensagemChat, Anuncio,
} from "@/core/ajuda";

const K_PROGRESSO = "a4p_tours_progresso";
const K_CHAMADOS = "a4p_chamados";
const K_CONVERSA = "a4p_ajuda_conversa";
const K_ANUNCIOS = "a4p_anuncios_lidos";
const K_AUTO = "a4p_tours_auto";
const K_DISPARADOS = "a4p_tours_disparados";

function ler<T>(k: string, padrao: T): T {
  if (typeof window === "undefined") return padrao;
  try {
    const s = localStorage.getItem(k);
    return s ? (JSON.parse(s) as T) : padrao;
  } catch { return padrao; }
}
function gravar(k: string, v: unknown): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* cota cheia */ }
}

export const novoIdAjuda = (p: string): string =>
  `${p}_${Date.now().toString(36)}_${Math.floor(Math.abs(performance.now()) % 1000)}`;

/* ------------------------------- catálogo ------------------------------- */

/** rota → seção do menu, para agrupar os tours como a navegação agrupa. */
function secaoDaRota(rota: string): string {
  const base = rota.split("?")[0];
  for (const s of [...SECTIONS, CONFIG]) {
    for (const i of s.items) {
      if (i.href && (i.href === base || (i.href !== "/" && base.startsWith(i.href)))) return s.label;
    }
  }
  return "Outras telas";
}

let cache: Tour[] | null = null;

export function catalogoTours(): Tour[] {
  if (cache) return cache;
  cache = Object.entries(GUIDES)
    .map(([rota, g]) => ({
      id: rota,
      rota,
      titulo: g.titulo,
      descricao: g.intro,
      passos: tourSteps(g).length,
      secao: rota === "/" ? "Boas-vindas" : secaoDaRota(rota),
    }))
    // Um "tour" de um passo só não é tour — é uma legenda. Ele continua no
    // botão Guia da própria tela, mas não polui o catálogo.
    .filter((t) => t.passos >= 2)
    .sort((a, b) => (a.secao === "Boas-vindas" ? -1 : b.secao === "Boas-vindas" ? 1 : a.secao.localeCompare(b.secao)));
  return cache;
}

/**
 * Os guias como candidatos a responder "como faço X".
 *
 * Mesma fonte dos tours — o `comoUsar` de cada tela É o passo a passo, e ele
 * envelhece junto com a tela em vez de virar um FAQ paralelo.
 */
export function candidatosGuia(): CandidatoGuia[] {
  return Object.entries(GUIDES).map(([rota, g]) => ({
    rota,
    titulo: g.titulo,
    intro: g.intro,
    comoUsar: g.comoUsar,
    termos: g.secoes.flatMap((s) => s.itens.map((i) => `${i.nome} ${i.desc}`)),
  }));
}

export function responderComoFazer(pergunta: string): { texto: string; rota: string } | null {
  const g = melhorGuia(pergunta, candidatosGuia());
  if (!g) return null;
  return { texto: `${g.titulo} — ${g.comoUsar ?? g.intro}`, rota: g.rota };
}

/* ------------------------------- progresso ------------------------------- */

export const lerProgressoTours = (): Record<string, ProgressoTour> =>
  ler<Record<string, ProgressoTour>>(K_PROGRESSO, {});

export function salvarProgressoTour(id: string, p: ProgressoTour): Record<string, ProgressoTour> {
  const todos = { ...lerProgressoTours(), [id]: p };
  gravar(K_PROGRESSO, todos);
  return todos;
}

export function reiniciarTours(): Record<string, ProgressoTour> {
  gravar(K_PROGRESSO, {});
  gravar(K_DISPARADOS, []);
  return {};
}

/* --------------------------- disparo automático --------------------------- */

/**
 * A preferência do usuário sobre o disparo automático.
 *
 * ⚠️ Existe porque o `PageGuide` deste sistema é OPT-IN de propósito — a
 * decisão anterior foi não abrir o guia sozinho para não interceptar cliques na
 * primeira visita. O disparo automático que o produto pede convive com isso na
 * forma de um CONVITE discreto (barra, não modal) e com um interruptor: quem
 * não quer, desliga uma vez e nunca mais vê.
 */
export const autoTourLigado = (): boolean => ler<boolean>(K_AUTO, true);
export const setAutoTour = (v: boolean): void => gravar(K_AUTO, v);

export const toursDisparados = (): string[] => ler<string[]>(K_DISPARADOS, []);

export function marcarDisparado(id: string): string[] {
  const out = Array.from(new Set([...toursDisparados(), id]));
  gravar(K_DISPARADOS, out);
  return out;
}

/* -------------------------------- chamados -------------------------------- */

export const listarChamados = (): Chamado[] => ler<Chamado[]>(K_CHAMADOS, []);

export function salvarChamado(c: Chamado): Chamado[] {
  const out = [c, ...listarChamados().filter((x) => x.id !== c.id)];
  gravar(K_CHAMADOS, out);
  return out;
}

export function removerChamado(id: string): Chamado[] {
  const out = listarChamados().filter((c) => c.id !== id);
  gravar(K_CHAMADOS, out);
  return out;
}

/* --------------------------------- chat --------------------------------- */

export const lerConversa = (): MensagemChat[] => ler<MensagemChat[]>(K_CONVERSA, []);

export function salvarConversa(m: MensagemChat[]): MensagemChat[] {
  // Teto de 60 turnos: a conversa de ajuda é episódica, não um histórico.
  const out = m.slice(-60);
  gravar(K_CONVERSA, out);
  return out;
}

export const limparConversa = (): MensagemChat[] => {
  gravar(K_CONVERSA, []);
  return [];
};

/* -------------------------------- anúncios -------------------------------- */

/**
 * Os anúncios do produto.
 *
 * Ficam no código porque são conteúdo editorial da plataforma, não dado da
 * empresa — o que o localStorage guarda é só QUAIS foram lidos.
 */
const CATALOGO_ANUNCIOS: Omit<Anuncio, "lido">[] = [
  {
    id: "an-compras",
    titulo: "Compras com fluxo de aprovação",
    corpo: "O pedido de compra agora passa por aprovação antes de virar conta a pagar. Aguardando e reprovadas não entram no fluxo de caixa — um pedido negado não pesa mais num caixa que ele nunca tocou.",
    publicadoEm: "2026-08-02",
    categoria: "Novidade",
  },
  {
    id: "an-boleto",
    titulo: "Boleto e nota fiscal se explicam sozinhos",
    corpo: "Cole a linha digitável (47 dígitos) em Boletos recebidos ou a chave de acesso (44) em NFs recebidas: o sistema lê banco, valor, vencimento, CNPJ do emitente e confere os dígitos verificadores — antes de existir integração.",
    publicadoEm: "2026-08-02",
    categoria: "Novidade",
  },
  {
    id: "an-dominio",
    titulo: "TXT do Domínio sai em ANSI",
    corpo: "O arquivo de lançamentos é gerado em Windows-1252, não UTF-8. Um arquivo UTF-8 importa e os valores batem, mas todo acento chega como dois caracteres de lixo no histórico. Confira o layout com o seu escritório antes do primeiro envio.",
    publicadoEm: "2026-08-02",
    categoria: "Contabilidade",
  },
  {
    id: "an-segredos",
    titulo: "O chat avisa antes de você enviar um segredo",
    corpo: "Senha, chave de API, token, cartão, CPF/CNPJ e linha digitável são detectados na sua mensagem antes do envio e removidos do texto que chega ao suporte. A dúvida chega; o segredo não.",
    publicadoEm: "2026-08-02",
    categoria: "Segurança",
  },
];

export function listarAnuncios(): Anuncio[] {
  const lidos = new Set(ler<string[]>(K_ANUNCIOS, []));
  return CATALOGO_ANUNCIOS
    .map((a) => ({ ...a, lido: lidos.has(a.id) }))
    .sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm));
}

export function marcarAnuncioLido(id: string, lido: boolean): Anuncio[] {
  const atuais = new Set(ler<string[]>(K_ANUNCIOS, []));
  if (lido) atuais.add(id); else atuais.delete(id);
  gravar(K_ANUNCIOS, Array.from(atuais));
  return listarAnuncios();
}
