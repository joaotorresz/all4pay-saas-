/**
 * CENTRAL DE AJUDA — chat, tours guiados e anúncios.
 *
 * Nada aqui inventa conteúdo: os tours saem do catálogo de guias que o sistema
 * já mantém por rota (`components/app/guides`), e o chat responde pela base de
 * conhecimento que a IA já usa. Uma segunda fonte de ajuda envelheceria em
 * silêncio — a tela mudaria e o tour continuaria ensinando a tela antiga.
 *
 * Puro, tipado, demo-safe. Versão ajuda/1.0.0.
 */

export * from "./segredos";

export const AJUDA_VERSION = "ajuda/1.0.0";

const semAcento = (s: string) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/* ================================== tours ================================== */

export type StatusTour = "nao_iniciado" | "em_andamento" | "concluido";

export interface Tour {
  id: string;
  /** Rota que o tour percorre — é ela que abre quando se clica em Iniciar. */
  rota: string;
  titulo: string;
  descricao: string;
  passos: number;
  secao: string;
}

export interface ProgressoTour {
  /** Passo em que parou (0 = não começou). */
  passo: number;
  concluido: boolean;
}

export function statusTour(p: ProgressoTour | undefined): StatusTour {
  if (!p || p.passo === 0) return "nao_iniciado";
  return p.concluido ? "concluido" : "em_andamento";
}

export interface ContagemTours {
  todos: number;
  nao_iniciado: number;
  em_andamento: number;
  concluido: number;
}

export function contarTours(
  tours: Tour[],
  progresso: Record<string, ProgressoTour>,
): ContagemTours {
  const conta = (s: StatusTour) => tours.filter((t) => statusTour(progresso[t.id]) === s).length;
  return {
    todos: tours.length,
    nao_iniciado: conta("nao_iniciado"),
    em_andamento: conta("em_andamento"),
    concluido: conta("concluido"),
  };
}

export function filtrarTours(
  tours: Tour[],
  busca: string,
  status: StatusTour | "todos",
  progresso: Record<string, ProgressoTour>,
): Tour[] {
  const q = semAcento(busca).trim();
  return tours.filter((t) => {
    if (status !== "todos" && statusTour(progresso[t.id]) !== status) return false;
    // A busca varre o título E a descrição: quem procura "Hotmart" não sabe em
    // qual tela ela mora, e é justamente por isso que está procurando.
    if (q && !semAcento(`${t.titulo} ${t.descricao} ${t.secao}`).includes(q)) return false;
    return true;
  });
}

export function agruparTours(tours: Tour[]): { secao: string; tours: Tour[] }[] {
  const mapa = new Map<string, Tour[]>();
  for (const t of tours) {
    const atual = mapa.get(t.secao) ?? [];
    atual.push(t);
    mapa.set(t.secao, atual);
  }
  return Array.from(mapa, ([secao, lista]) => ({ secao, tours: lista }));
}

/**
 * O tour que deve disparar sozinho ao entrar numa tela.
 *
 * ⚠️ Duas travas, e as duas existem porque um tour que reaparece deixa de ser
 * ajuda e vira obstáculo:
 *
 * 1. **Uma vez por tela, para sempre** — a rota já vista nunca dispara de novo,
 *    mesmo que a pessoa não tenha terminado. Quem fechou, fechou.
 * 2. **No máximo um por sessão** — atravessar quatro telas não pode render
 *    quatro tours empilhados; o segundo já seria ignorado, e o quarto,
 *    irritante.
 *
 * Devolve `null` quando não há nada a disparar.
 */
export function tourAutomatico(
  rota: string,
  tours: Tour[],
  rotasVistas: Set<string>,
  disparadosNaSessao: number,
): Tour | null {
  if (disparadosNaSessao >= 1) return null;
  if (rotasVistas.has(rota)) return null;
  return tours.find((t) => t.rota === rota) ?? null;
}

/* ================================== chat ================================== */

export interface SugestaoAjuda {
  categoria: string;
  perguntas: string[];
}

/**
 * As perguntas sugeridas, agrupadas por assunto.
 *
 * São perguntas de USO ("como faço"), não de número ("qual meu runway") — quem
 * responde número é o All 4 Pay AI. Misturar as duas portas faria a pessoa
 * perguntar o saldo aqui e receber um artigo.
 */
export const SUGESTOES: SugestaoAjuda[] = [
  {
    categoria: "Notas fiscais e boletos",
    perguntas: [
      "Como emitir uma nota fiscal de serviço?",
      "Como lançar um boleto que recebi por e-mail?",
      "Como funciona o envio de NFs ao contador?",
      "Como aprovar um pedido de compra?",
    ],
  },
  {
    categoria: "Cadastros e acessos",
    perguntas: [
      "Como convidar um usuário para a minha empresa?",
      "Onde vejo os logs de auditoria?",
      "Onde configuro o plano de contas?",
      "Como conectar uma plataforma de vendas?",
    ],
  },
  {
    categoria: "Relatórios e resultado",
    perguntas: [
      "Qual a diferença entre DRE e DFC?",
      "Como fazer o fechamento mensal?",
      "Como montar o orçamento da empresa?",
      "Onde encontro os relatórios exportados?",
    ],
  },
  {
    categoria: "Caixa e entrada de dados",
    perguntas: [
      "Como gerar o TXT contábil do Domínio?",
      "Como funciona a conciliação bancária?",
      "O que é runway de caixa?",
      "Como funciona o fluxo de caixa?",
    ],
  },
];

/* --------------------------- resposta "como faço" --------------------------- */

export interface CandidatoGuia {
  rota: string;
  titulo: string;
  intro: string;
  comoUsar?: string;
  /** Nomes dos blocos da tela — é onde moram "rateio", "conciliação", "DDA". */
  termos: string[];
}

/** Palavras que não distinguem nada e só inflariam a pontuação de todo guia. */
const VAZIAS = new Set([
  "como", "onde", "qual", "que", "para", "por", "com", "uma", "meu", "minha",
  "meus", "minhas", "dos", "das", "sistema", "faco", "fazer", "criar",
  "diferenca", "entre", "empresa", "seu", "sua", "isso", "aqui", "funciona",
]);

const palavras = (s: string): string[] =>
  semAcento(s).replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 4 && !VAZIAS.has(w));

/**
 * O guia que melhor responde a uma pergunta de USO.
 *
 * ⚠️ A base de conhecimento (`assistant-kb`) responde CONCEITO — "o que é
 * runway". Ela não sabe "como emitir uma nota", e na primeira versão desta tela
 * 14 das 16 perguntas sugeridas caíam em "não encontrei" porque o chat
 * consultava só ela. O "como faço" já existe no sistema: é o `comoUsar` de cada
 * guia de tela. Esta função liga os dois em vez de criar uma terceira base, que
 * envelheceria sozinha enquanto a tela muda.
 *
 * A barra é 3 pontos: uma palavra no título (3) ou três no corpo. Menos que
 * isso faria "como criar" casar com qualquer tela que diga "criar".
 */
export function melhorGuia(pergunta: string, candidatos: CandidatoGuia[]): CandidatoGuia | null {
  const termos = palavras(pergunta);
  if (termos.length === 0) return null;
  let melhor: { c: CandidatoGuia; pontos: number } | null = null;
  for (const c of candidatos) {
    const titulo = semAcento(c.titulo);
    const corpo = semAcento(`${c.intro} ${c.comoUsar ?? ""} ${c.termos.join(" ")}`);
    let pontos = 0;
    for (const t of termos) {
      // O título vale mais: quem pergunta "conciliação" quer a tela de
      // conciliação, não a que a menciona de passagem.
      if (titulo.includes(t)) pontos += 3;
      else if (corpo.includes(t)) pontos += 1;
    }
    if (pontos > (melhor?.pontos ?? 0)) melhor = { c, pontos };
  }
  return melhor && melhor.pontos >= 3 ? melhor.c : null;
}

export type StatusChamado = "aberto" | "em_atendimento" | "resolvido" | "fechado";

export const STATUS_CHAMADO: { id: StatusChamado; label: string }[] = [
  { id: "aberto", label: "Aberto" },
  { id: "em_atendimento", label: "Em atendimento" },
  { id: "resolvido", label: "Resolvido" },
  { id: "fechado", label: "Fechado" },
];

export type TipoChamado = "duvida" | "bug" | "sugestao";

export const TIPOS_CHAMADO: { id: TipoChamado; label: string }[] = [
  { id: "duvida", label: "Dúvida" },
  { id: "bug", label: "Problema / erro" },
  { id: "sugestao", label: "Sugestão" },
];

export interface Chamado {
  id: string;
  assunto: string;
  tipo: TipoChamado;
  /** ⚠️ Sempre o texto REDIGIDO — ver `redigirSegredos`. */
  descricao: string;
  status: StatusChamado;
  abertoEm: string;
  /** Quantos segredos foram removidos antes de gravar — a pessoa merece saber. */
  segredosRemovidos: number;
}

export function validarChamado(c: Partial<Chamado>): Record<string, string> {
  const e: Record<string, string> = {};
  if (!(c.assunto ?? "").trim()) e.assunto = "Informe o assunto.";
  // Um chamado de três palavras volta como "poderia detalhar?" e custa um dia
  // ao usuário. Exigir o mínimo aqui é mais barato que a ida e volta.
  if ((c.descricao ?? "").trim().length < 20) e.descricao = "Descreva o que aconteceu em pelo menos 20 caracteres.";
  return e;
}

export interface MensagemChat {
  id: string;
  autor: "usuario" | "ajuda";
  texto: string;
  quando: string;
  /** Rota sugerida pela resposta, quando houver. */
  rota?: string | null;
  /** Segredos removidos desta mensagem antes de enviar. */
  redigidos?: number;
}

/* ================================ anúncios ================================ */

export type VisualizacaoAnuncio = "todas" | "nao_lidas" | "lidas";

export interface Anuncio {
  id: string;
  titulo: string;
  corpo: string;
  publicadoEm: string;
  lido: boolean;
  /** Novidade, aviso de manutenção, mudança fiscal… */
  categoria: string;
}

export interface FiltroAnuncios {
  de?: string | null;
  ate?: string | null;
  visualizacao?: VisualizacaoAnuncio;
  busca?: string;
}

export function filtrarAnuncios(lista: Anuncio[], f: FiltroAnuncios = {}): Anuncio[] {
  const q = semAcento(f.busca ?? "").trim();
  return lista.filter((a) => {
    const dia = a.publicadoEm.slice(0, 10);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;
    if (f.visualizacao === "nao_lidas" && a.lido) return false;
    if (f.visualizacao === "lidas" && !a.lido) return false;
    // O print pede busca "pelo título" — mas quem procura "Domínio" não sabe se
    // a palavra está no título ou no corpo, e um resultado vazio parece ausência.
    if (q && !semAcento(`${a.titulo} ${a.corpo}`).includes(q)) return false;
    return true;
  });
}

export const naoLidos = (lista: Anuncio[]): number => lista.filter((a) => !a.lido).length;
