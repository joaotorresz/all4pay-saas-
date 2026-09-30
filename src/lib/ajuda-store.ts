"use client";

/**
 * Catálogo de tours + estado da Central de Ajuda.
 *
 * ⚠️ **Chamados e a conversa de ajuda passam pelo `store-org`.** Os dois estão
 * classificados como dado de NEGÓCIO (`CHAVES_ORG.chamados` e
 * `CHAVES_ORG.ajudaConversa`) — e este arquivo os gravava direto no
 * `localStorage`, por fora do `store-org`. Em produção isso é pior que "fica só
 * no navegador": a `SincronizacaoOrg` sobe a chave UMA vez (na primeira
 * sessão) e depois HIDRATA do servidor a cada tela montada, e o servidor vence.
 * O chamado aberto depois da primeira sessão nunca subia, e na próxima
 * navegação a cópia velha do servidor o apagava do navegador. O mesmo com a
 * conversa. Em demonstração nada muda: sem servidor, o `store-org` é o próprio
 * `localStorage`.
 *
 * O resto (progresso de tour, disparo automático, anúncios lidos) é preferência
 * do dispositivo e fica no `localStorage` de propósito (`PREFERENCIAS_LOCAIS`).
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
import { ler as lerOrg, gravar as gravarOrg, inscrever, CHAVES_ORG } from "@/lib/store-org";
import { usuarioDasConversas } from "@/lib/ia-conversas";

const K_PROGRESSO = "a4p_tours_progresso";
const K_CHAMADOS = CHAVES_ORG.chamados;
const K_CONVERSA = CHAVES_ORG.ajudaConversa;
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

/**
 * Os chamados são da EMPRESA (qualquer membro vê os chamados abertos nela), e
 * por isso moram numa lista só, no estado da organização.
 */
export const listarChamados = (): Chamado[] => {
  const v = lerOrg<unknown>(K_CHAMADOS, []);
  return Array.isArray(v) ? (v as Chamado[]) : [];
};

export function salvarChamado(c: Chamado): Chamado[] {
  const out = [c, ...listarChamados().filter((x) => x.id !== c.id)];
  gravarOrg(K_CHAMADOS, out);
  return out;
}

export function removerChamado(id: string): Chamado[] {
  const out = listarChamados().filter((c) => c.id !== id);
  gravarOrg(K_CHAMADOS, out);
  return out;
}

/**
 * Avisa quando chamados ou conversa mudam por FORA da tela — a hidratação do
 * servidor chega depois de a Central montar, e sem isto a lista mostraria o
 * cache velho até a próxima visita.
 */
export function inscreverAjuda(ouvinte: () => void): () => void {
  const a = inscrever(K_CHAMADOS, ouvinte);
  const b = inscrever(K_CONVERSA, ouvinte);
  return () => { a(); b(); };
}

/* --------------------------------- chat --------------------------------- */

/**
 * A conversa de ajuda é da PESSOA — um mapa `usuário → mensagens` dentro do
 * estado da empresa, como o histórico da Quattro AI. Numa lista só, o "Nova
 * conversa" de um colega apagaria a sua.
 *
 * ⚠️ O formato antigo (um array solto, do tempo em que ela morava só no
 * navegador) é lido como a conversa de quem está neste navegador — senão a
 * conversa em andamento sumiria na atualização.
 */
type ConversaPorUsuario = Record<string, MensagemChat[]>;
function mapaDaConversa(): ConversaPorUsuario {
  const v = lerOrg<unknown>(K_CONVERSA, {});
  if (Array.isArray(v)) return { [usuarioDasConversas()]: v as MensagemChat[] };
  return v && typeof v === "object" ? (v as ConversaPorUsuario) : {};
}

export const lerConversa = (): MensagemChat[] => {
  const arr = mapaDaConversa()[usuarioDasConversas()];
  return Array.isArray(arr) ? arr : [];
};

export function salvarConversa(m: MensagemChat[]): MensagemChat[] {
  // Teto de 60 turnos: a conversa de ajuda é episódica, não um histórico.
  const out = m.slice(-60);
  gravarOrg(K_CONVERSA, { ...mapaDaConversa(), [usuarioDasConversas()]: out });
  return out;
}

export const limparConversa = (): MensagemChat[] => salvarConversa([]);

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
    corpo: "Senha, chave de API, token, cartão, CPF/CNPJ e linha digitável são detectados na sua mensagem e removidos antes de ela ser gravada — inclusive o CPF digitado sem pontuação e o cartão colado junto com a validade. A dúvida fica registrada; o segredo não.",
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
