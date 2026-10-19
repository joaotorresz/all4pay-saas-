/**
 * OS ITENS DA HOME e como cada pessoa os arruma (etapas 2 e 3 do "Ajustar
 * prioridades", 14/10/2026).
 *
 * A Home tem dez itens: as vendas da maquininha, os seis números do "Seu painel" e os três blocos de
 * baixo. Cada um tem NOME e SINÔNIMOS — é por eles que o que a pessoa DIGITA
 * no chat ("quero ver primeiro o que tenho a pagar, e tira o burn") vira ação
 * sobre a tela. A caixa da Quattro AI não é item: é por ela que se ajusta, e
 * escondê-la tiraria a porta de desfazer.
 *
 * O arranjo (`LayoutHome`: a ordem e o que está escondido) é de QUEM USA e mora
 * em `a4p_home_preferencias`, junto das prioridades (ver `./preferencias`).
 *
 * ⚠️ Toda ação que chega aqui é DADO DE FORA — da regra de texto ou da IA — e
 * passa por `normalizarAcoes`: tipo conhecido, id do catálogo. A IA só escolhe
 * entre os itens que existem; ela não inventa card nem muda número.
 *
 * ⚠️ Além dos dez FIXOS, a Home aceita os cards da BIBLIOTECA (`./biblioteca`,
 * id `card:<id do cockpit>`): ficam fora da tela até a pessoa pedir
 * ("coloca a inadimplência") e saem do mesmo jeito. O fixo que se tira fica
 * ESCONDIDO (tem "Mostrar de novo"); o card da biblioteca SAI da ordem — ele
 * nunca esteve na tela padrão, então não há o que lembrar.
 *
 * Puro, tipado, demo-safe.
 */

import { CARDS_BIBLIOTECA, TEMAS_CARD, type TemaCard } from "./biblioteca";

export const ITENS_HOME_VERSION = "home-itens/1.2.0";

export type IdItemHome =
  | "maquininha" | "caixa" | "arr" | "burn" | "runway" | "pagar" | "receber"
  | "acao" | "fechamento" | "relatorios";

/** Um card da biblioteca na Home: `card:` + o id do catálogo do cockpit. */
export type IdCard = `card:${string}`;
export type IdHome = IdItemHome | IdCard;
export type GrupoHome = "painel" | "bloco" | "card";

export interface ItemHome {
  id: IdHome;
  nome: string;
  /** "painel" = os números; "bloco" = as três colunas de baixo; "card" = os da biblioteca. */
  grupo: GrupoHome;
  /** Só os cards da biblioteca. */
  tema?: TemaCard;
  /** Só os números: o grande leva a curva de 7 meses. */
  tamanho?: "grande" | "pequeno";
  /** Uma linha sobre o que o item mostra (vai para a IA e para a ajuda). */
  descricao: string;
  /**
   * Como a pessoa chama o item, SEM acento e em minúsculas. ⚠️ O casamento é
   * pelo mais LONGO primeiro: "fluxo de caixa" é o relatório, não o caixa.
   */
  sinonimos: string[];
}

export const ITENS_HOME: ItemHome[] = [
  // Primeiro na esquerda (pedido do dono, 16/10/2026): as vendas que a Pinbank avisou pelo webhook.
  { id: "maquininha", nome: "Transações recentes na maquininha", grupo: "painel", tamanho: "grande", descricao: "as últimas vendas da maquininha Pinbank, com o dia da semana, e o total aprovado no dia, na semana ou no mês",
    sinonimos: ["transacoes recentes na maquininha", "transacoes da maquininha", "vendas da maquininha", "vendas na maquininha", "maquininha", "maquina de cartao", "pinbank", "vendas no cartao"] },
  { id: "caixa", nome: "Caixa consolidado", grupo: "painel", tamanho: "grande", descricao: "o saldo de todas as contas hoje, com a curva de 7 meses",
    sinonimos: ["caixa consolidado", "caixa", "saldo", "saldos", "dinheiro em conta", "dinheiro no banco", "quanto tenho", "banco", "bancos"] },
  { id: "arr", nome: "Receita recorrente (ARR)", grupo: "painel", tamanho: "grande", descricao: "a receita recorrente anualizada, com a curva de 7 meses",
    sinonimos: ["receita recorrente", "recorrente", "recorrencia", "arr", "mrr", "assinaturas", "assinatura", "mensalidades"] },
  { id: "burn", nome: "Burn mensal", grupo: "painel", tamanho: "pequeno", descricao: "quanto a empresa queima por mês",
    sinonimos: ["burn mensal", "burn", "queima", "queima de caixa", "gasto mensal", "gastos mensais", "quanto gasto", "gastos", "despesas"] },
  { id: "runway", nome: "Runway", grupo: "painel", tamanho: "pequeno", descricao: "quantos meses o caixa aguenta no ritmo atual",
    sinonimos: ["runway", "folego", "quanto tempo aguento", "meses de caixa", "sobrevivencia"] },
  { id: "pagar", nome: "Contas a pagar", grupo: "painel", tamanho: "pequeno", descricao: "o que vence a pagar nos próximos 30 dias",
    sinonimos: ["contas a pagar", "a pagar", "pagar", "pagamentos", "o que vou pagar", "o que tenho que pagar", "fornecedores", "fornecedor"] },
  { id: "receber", nome: "Contas a receber", grupo: "painel", tamanho: "pequeno", descricao: "o que vence a receber nos próximos 30 dias",
    sinonimos: ["contas a receber", "a receber", "receber", "recebimentos", "recebiveis", "o que vou receber", "quem me deve", "cobranca", "clientes devendo"] },
  { id: "acao", nome: "Precisa de ação", grupo: "bloco", descricao: "conciliação, notas a emitir, compras e lançamentos a aprovar, boletos",
    sinonimos: ["precisa de acao", "pendencias", "pendencia", "pendente", "pendentes", "tarefas", "o que fazer", "o que tenho que fazer", "conciliar", "conciliacao", "notas a emitir", "aprovar", "aprovacoes", "boletos", "boleto"] },
  { id: "fechamento", nome: "Fechamento do mês", grupo: "bloco", descricao: "o checklist de fechamento do mês e quanto já foi concluído",
    sinonimos: ["fechamento do mes", "fechamento", "fechar o mes", "checklist", "contabilidade", "contador"] },
  { id: "relatorios", nome: "Relatórios fixados", grupo: "bloco", descricao: "atalhos para DRE, balanço e fluxo de caixa",
    sinonimos: ["relatorios fixados", "relatorios", "relatorio", "dre", "balanco", "fluxo de caixa"] },
];

/** Os cards da biblioteca como itens da Home: fora da tela até a pessoa pedir. */
export const CARDS_HOME: ItemHome[] = CARDS_BIBLIOTECA.map((x) => ({
  id: `card:${x.id}` as IdCard, nome: x.nome, grupo: "card", tema: x.tema, descricao: x.descricao, sinonimos: x.sinonimos,
}));

/** Teto de cards da biblioteca na Home ao mesmo tempo: cada um roda um motor. */
export const TETO_CARDS = 12;

const IDS = new Set<string>(ITENS_HOME.map((i) => i.id));
const POR_ID = new Map<string, ItemHome>([...ITENS_HOME, ...CARDS_HOME].map((i) => [i.id, i]));
export const ehItemHome = (x: unknown): x is IdItemHome => typeof x === "string" && IDS.has(x);
export const ehCard = (x: unknown): x is IdCard => typeof x === "string" && x.startsWith("card:") && POR_ID.has(x);
export const ehIdHome = (x: unknown): x is IdHome => ehItemHome(x) || ehCard(x);
export function itemHome(id: IdHome): ItemHome {
  const i = POR_ID.get(id);
  if (!i) throw new Error(`Item da Home desconhecido: ${id}`);
  return i;
}
/** O id do card no catálogo do cockpit (`card:ebitda-mes` → `ebitda-mes`). */
export const idDoCockpit = (id: IdCard): string => id.slice("card:".length);

/* ------------------------------ o arranjo ------------------------------ */

export interface LayoutHome {
  /** Os dez fixos (sempre) e os cards da biblioteca que a pessoa pôs, na ordem em que aparecem. */
  ordem: IdHome[];
  /** Os FIXOS que a pessoa escondeu (card da biblioteca não se esconde: sai da ordem). */
  ocultos: IdItemHome[];
  /**
   * A LARGURA que a pessoa deu a cada item, em doze avos da linha (pedido do
   * dono, 16/10/2026: arrastar a borda do card). Só os valores de
   * `LARGURAS_HOME`; o menor é um quarto, então nunca há mais de QUATRO cards
   * por linha. Item sem largura guardada usa a padrão do tamanho dele.
   */
  larguras?: Partial<Record<IdHome, LarguraHome>>;
}

/** As larguras possíveis, em doze avos: ¼ · ⅓ · ½ · ⅔ · ¾ · inteira. */
export const LARGURAS_HOME = [3, 4, 6, 8, 9, 12] as const;
export type LarguraHome = (typeof LARGURAS_HOME)[number];
const ehLargura = (v: unknown): v is LarguraHome => (LARGURAS_HOME as readonly unknown[]).includes(v);

/** A largura de um item: a que a pessoa deu, ou a padrão do tamanho dele. */
export function larguraDe(layout: LayoutHome, id: IdHome): LarguraHome {
  const dada = layout.larguras?.[id];
  if (dada) return dada;
  if (ehCard(id)) return 4;
  return itemHome(id).grupo === "bloco" ? 4 : 6;
}

/** A largura possível mais perto de uma fração da linha (o arraste da borda). */
export function larguraMaisPerto(fracao: number): LarguraHome {
  const alvo = fracao * 12;
  return LARGURAS_HOME.reduce((m, v) => (Math.abs(v - alvo) < Math.abs(m - alvo) ? v : m), LARGURAS_HOME[0]);
}

/** A largura vizinha (as setas do teclado na borda). */
export function larguraVizinha(atual: LarguraHome, passo: -1 | 1): LarguraHome {
  const i = LARGURAS_HOME.indexOf(atual);
  return LARGURAS_HOME[Math.min(LARGURAS_HOME.length - 1, Math.max(0, i + passo))];
}

/** Grava a largura de um item; a padrão não é guardada (o arranjo fica enxuto). */
export function definirLargura(layout: LayoutHome, id: IdHome, largura: LarguraHome): LayoutHome {
  const larguras = { ...(layout.larguras ?? {}) };
  delete larguras[id];
  if (larguraDe({ ...layout, larguras }, id) !== largura) larguras[id] = largura;
  const { larguras: _antes, ...resto } = layout;
  return Object.keys(larguras).length ? { ...resto, larguras } : resto;
}

export const LAYOUT_PADRAO: LayoutHome = { ordem: ITENS_HOME.map((i) => i.id), ocultos: [] };

/**
 * O que veio de fora (servidor, cache, versão antiga) como arranjo válido: só
 * ids do catálogo, sem repetir, e o item que não estava na ordem (nasceu
 * depois) entra no lugar padrão — nunca some. Não é objeto: `null` (ausente).
 */
export function normalizarLayout(bruto: unknown): LayoutHome | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const b = bruto as { ordem?: unknown; ocultos?: unknown };
  const unicos = <T extends string>(x: unknown, ok: (v: unknown) => v is T): T[] =>
    (Array.isArray(x) ? x : []).filter(ok).filter((id, i, a) => a.indexOf(id) === i);
  // Card da biblioteca que deixou de existir sai; acima do teto, ficam os primeiros.
  let cards = 0;
  const ordem = unicos(b.ordem, ehIdHome).filter((id) => !ehCard(id) || ++cards <= TETO_CARDS);
  for (const id of LAYOUT_PADRAO.ordem) {
    if (ordem.includes(id)) continue;
    // Entra logo depois do vizinho padrão DO MESMO GRUPO que já está na lista;
    // sem nenhum, antes do primeiro do grupo, ou no fim. ⚠️ Sem o grupo, o
    // bloco que faltava caía no meio dos números (depois de "A receber") e
    // partia em dois a ordem que a pessoa tinha arrastado.
    const grupo = itemHome(id).grupo;
    const doGrupo = LAYOUT_PADRAO.ordem.filter((v) => itemHome(v).grupo === grupo);
    const antes = doGrupo.slice(0, doGrupo.indexOf(id)).reverse().find((v) => ordem.includes(v));
    const primeiro = ordem.find((v) => itemHome(v).grupo === grupo);
    ordem.splice(antes ? ordem.indexOf(antes) + 1 : primeiro ? ordem.indexOf(primeiro) : ordem.length, 0, id);
  }
  const larguras: Partial<Record<IdHome, LarguraHome>> = {};
  const brutas = (bruto as { larguras?: unknown }).larguras;
  if (brutas && typeof brutas === "object" && !Array.isArray(brutas)) {
    for (const [id, v] of Object.entries(brutas)) if (ordem.includes(id as IdHome) && ehLargura(v)) larguras[id as IdHome] = v;
  }
  const out: LayoutHome = { ordem, ocultos: unicos(b.ocultos, ehItemHome) };
  return Object.keys(larguras).length ? { ...out, larguras } : out;
}

const assinaturaLarguras = (l: LayoutHome): string =>
  Object.entries(l.larguras ?? {}).sort(([x], [y]) => x.localeCompare(y)).map(([k, v]) => `${k}=${v}`).join(",");

export const mesmoLayout = (a: LayoutHome | null | undefined, b: LayoutHome | null | undefined): boolean => {
  if (!a || !b) return !a && !b;
  return a.ordem.join(",") === b.ordem.join(",") && [...a.ocultos].sort().join(",") === [...b.ocultos].sort().join(",")
    && assinaturaLarguras(a) === assinaturaLarguras(b);
};

/**
 * O arranjo de quem arrastou os cards ANTES de o arranjo ir para o servidor:
 * a ordem ficava no dispositivo (`a4p_home_painel_ordem`, por grupo
 * "grandes"/"pequenos"). Quem já tinha arrumado não perde o que fez.
 */
export function layoutDasOrdensAntigas(bruto: unknown): LayoutHome | null {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) return null;
  const b = bruto as { grandes?: unknown; pequenos?: unknown };
  const g = Array.isArray(b.grandes) ? b.grandes : [], p = Array.isArray(b.pequenos) ? b.pequenos : [];
  if (g.length === 0 && p.length === 0) return null;
  return normalizarLayout({ ordem: [...g, ...p], ocultos: [] });
}

/** Os itens VISÍVEIS de um grupo, na ordem da pessoa. */
export function visiveis(layout: LayoutHome, grupo?: GrupoHome): IdHome[] {
  return layout.ordem.filter((id) => !(layout.ocultos as IdHome[]).includes(id) && (!grupo || itemHome(id).grupo === grupo));
}

/** Os cards da biblioteca que estão na Home. */
export const cardsNaHome = (layout: LayoutHome): IdCard[] => layout.ordem.filter(ehCard);

/**
 * Em que ordem as SEÇÕES aparecem: a do primeiro item visível vem antes.
 * "O que eu quero ver primeiro é o que precisa de ação" sobe os blocos para
 * cima do painel. ⚠️ Card da biblioteca MORA no painel ("Seu painel", acima dos
 * números fixos — decisão do dono, 14/10/2026): não há seção "Seus cards", e
 * card no topo da ordem sobe o painel. Seção sem nada visível fica no fim.
 */
export function ordemDasSecoes(layout: LayoutHome): ("painel" | "bloco")[] {
  const out: ("painel" | "bloco")[] = [];
  for (const id of visiveis(layout)) { const g = itemHome(id).grupo === "bloco" ? "bloco" : "painel"; if (!out.includes(g)) out.push(g); }
  for (const g of ["painel", "bloco"] as const) if (!out.includes(g)) out.push(g);
  return out;
}

/**
 * Os números do painel em FAIXAS do mesmo tamanho, respeitando a ordem: os
 * grandes (com curva) e os pequenos não cabem na mesma linha sem um esticar o
 * outro. [pagar, caixa, arr, burn] → [[pagar], [caixa, arr], [burn]].
 */
export function faixasDoPainel(layout: LayoutHome): { tamanho: "grande" | "pequeno"; ids: IdItemHome[] }[] {
  const out: { tamanho: "grande" | "pequeno"; ids: IdItemHome[] }[] = [];
  for (const id of visiveis(layout, "painel") as IdItemHome[]) {
    const tamanho = itemHome(id).tamanho ?? "pequeno";
    const ultima = out[out.length - 1];
    if (ultima && ultima.tamanho === tamanho) ultima.ids.push(id);
    else out.push({ tamanho, ids: [id] });
  }
  return out;
}

/** Troca `de` de lugar com `para` (o arraste e as setas do teclado). */
export function moverItem(layout: LayoutHome, de: IdHome, para: IdHome): LayoutHome {
  const i = layout.ordem.indexOf(de), j = layout.ordem.indexOf(para);
  if (i < 0 || j < 0 || i === j) return layout;
  const ordem = [...layout.ordem];
  ordem.splice(i, 1);
  ordem.splice(j, 0, de);
  return { ...layout, ordem };
}

/* ------------------------------ as ações ------------------------------ */

export type TipoAcaoHome = "primeiro" | "ultimo" | "mostrar" | "esconder" | "restaurar";
/**
 * Num card da biblioteca: "mostrar" o PÕE na Home (no fim), "primeiro" o põe
 * no topo, "esconder" o TIRA da Home.
 */
export interface AcaoHome { tipo: TipoAcaoHome; id?: IdHome }

const TIPOS = new Set<TipoAcaoHome>(["primeiro", "ultimo", "mostrar", "esconder", "restaurar"]);
/** Teto de ações de um pedido: dez fixos + o teto de cards, com folga. */
const TETO_ACOES = 40;

/**
 * As ações que podem ser aplicadas: tipo conhecido e, fora o "restaurar", id
 * do catálogo. Repetida sai. ⚠️ É a trava contra a IA e contra o texto: o que
 * não passa daqui não muda a tela.
 */
export function normalizarAcoes(bruto: unknown): AcaoHome[] {
  const out: AcaoHome[] = [];
  for (const a of (Array.isArray(bruto) ? bruto : []).slice(0, TETO_ACOES)) {
    if (!a || typeof a !== "object") continue;
    const { tipo, id } = a as { tipo?: unknown; id?: unknown };
    if (typeof tipo !== "string" || !TIPOS.has(tipo as TipoAcaoHome)) continue;
    if (tipo === "restaurar") { if (!out.some((x) => x.tipo === "restaurar")) out.push({ tipo }); continue; }
    if (!ehIdHome(id)) continue;
    if (!out.some((x) => x.tipo === tipo && x.id === id)) out.push({ tipo: tipo as TipoAcaoHome, id });
  }
  return out;
}

/**
 * Aplica as ações, na ordem. "Primeiro" também MOSTRA (pedir para ver primeiro
 * o que está escondido é pedir para ver), e vários "primeiro" seguidos ficam
 * na ordem em que foram ditos: "pagar e depois receber" → pagar, receber.
 *
 * Card da biblioteca: entrar ("mostrar" ou "primeiro") o põe no TOPO, "último" o põe no
 * lugar pedido, "esconder" o tira da ordem. ⚠️ Acima de `TETO_CARDS` o pedido
 * de pôr mais um NÃO entra (`cardsRecusados` diz quais, para o chat avisar).
 */
export function aplicarAcoes(layout: LayoutHome, acoes: AcaoHome[]): LayoutHome {
  let ordem: IdHome[] = [...layout.ordem];
  let ocultos = [...layout.ocultos];
  const topo: IdHome[] = [];
  const fim: IdHome[] = [];
  const tirar = (lista: IdHome[], id: IdHome) => { const k = lista.indexOf(id); if (k >= 0) lista.splice(k, 1); };
  const naHome = (id: IdHome) => ordem.includes(id) || topo.includes(id) || fim.includes(id);
  const totalCards = () => new Set([...ordem, ...topo, ...fim].filter(ehCard)).size;
  for (const a of normalizarAcoes(acoes)) {
    if (a.tipo === "restaurar") { ordem = [...LAYOUT_PADRAO.ordem]; ocultos = []; topo.length = 0; fim.length = 0; continue; }
    const id = a.id!;
    if (ehCard(id)) {
      if (a.tipo === "esconder") { ordem = ordem.filter((x) => x !== id); tirar(topo, id); tirar(fim, id); continue; }
      if (!naHome(id)) {
        if (totalCards() >= TETO_CARDS) continue;
        if (a.tipo === "mostrar") { topo.push(id); continue; }
      }
    } else {
      if (a.tipo === "esconder") { if (!ocultos.includes(id)) ocultos.push(id); continue; }
      ocultos = ocultos.filter((x) => x !== id);
    }
    if (a.tipo === "primeiro") { tirar(fim, id); if (!topo.includes(id)) topo.push(id); }
    if (a.tipo === "ultimo") { tirar(topo, id); if (!fim.includes(id)) fim.push(id); }
  }
  ordem = [...topo, ...ordem.filter((id) => !topo.includes(id) && !fim.includes(id)), ...fim];
  // As larguras ficam com quem continua na Home; "volta ao padrão" as desfaz.
  const restaurou = normalizarAcoes(acoes).some((a) => a.tipo === "restaurar");
  const larguras = Object.fromEntries(Object.entries(restaurou ? {} : layout.larguras ?? {}).filter(([id]) => ordem.includes(id as IdHome)));
  return Object.keys(larguras).length ? { ordem, ocultos, larguras } : { ordem, ocultos };
}

/** Os cards que a pessoa pediu para pôr e não entraram por causa do teto. */
export function cardsRecusados(depois: LayoutHome, acoes: AcaoHome[]): IdCard[] {
  return normalizarAcoes(acoes)
    .filter((a) => a.tipo !== "esconder" && a.tipo !== "restaurar" && ehCard(a.id) && !depois.ordem.includes(a.id!))
    .map((a) => a.id as IdCard)
    .filter((id, i, l) => l.indexOf(id) === i);
}

/**
 * O que mudou, em frases curtas para o chat dizer — só o que de fato mudou na
 * tela (pedir para subir o que já é o primeiro não vira frase). Vazio = nada
 * mudou, e o chat diz isso em vez de anunciar uma mudança que não houve.
 */
export function descreverMudancas(antes: LayoutHome, depois: LayoutHome, acoes: AcaoHome[] = []): string[] {
  const nomes = (ids: IdHome[]) => ids.map((id) => itemHome(id).nome).join(", ");
  const va = visiveis(antes), vd = visiveis(depois);
  const pedidos = (tipo: TipoAcaoHome) => normalizarAcoes(acoes).filter((a) => a.tipo === tipo).map((a) => a.id!);
  const out: string[] = [];
  if (normalizarAcoes(acoes).some((a) => a.tipo === "restaurar") && !mesmoLayout(antes, depois)) {
    out.push("A Home voltou ao arranjo padrão.");
  }
  const entraram = cardsNaHome(depois).filter((id) => !antes.ordem.includes(id));
  const sairamCards = cardsNaHome(antes).filter((id) => !depois.ordem.includes(id));
  const subiram = pedidos("primeiro").filter((id) => !entraram.includes(id as IdCard) && vd.includes(id) && vd.indexOf(id) < (va.includes(id) ? va.indexOf(id) : Infinity));
  const desceram = pedidos("ultimo").filter((id) => vd.includes(id) && va.includes(id) && vd.indexOf(id) > va.indexOf(id));
  const voltaram = antes.ocultos.filter((id) => !depois.ocultos.includes(id));
  const sairam = depois.ocultos.filter((id) => !antes.ocultos.includes(id));
  const noFim = entraram.filter((id) => pedidos("ultimo").includes(id));
  const noTopo = entraram.filter((id) => !noFim.includes(id));
  if (noTopo.length) out.push(`Na Home agora, no topo de "Seu painel": ${nomes(noTopo)}.`);
  if (noFim.length) out.push(`Na Home agora, no fim: ${nomes(noFim)}.`);
  if (subiram.length) out.push(`Para o topo: ${nomes(subiram)}.`);
  if (desceram.length) out.push(`Para o fim: ${nomes(desceram)}.`);
  if (voltaram.length) out.push(`De volta à tela: ${nomes(voltaram)}.`);
  if (sairam.length) out.push(`Escondidos: ${nomes(sairam)}.`);
  if (sairamCards.length) out.push(`Fora da Home: ${nomes(sairamCards)}.`);
  return out;
}

/* ------------------------------ o texto que a pessoa digita ------------------------------ */

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Pares (sinônimo, id), do mais LONGO ao mais curto. No empate de tamanho o
 * FIXO vem antes (a ordenação é estável e os fixos estão primeiro).
 */
const SINONIMOS = [...ITENS_HOME, ...CARDS_HOME]
  .flatMap((i) => i.sinonimos.map((s) => ({ s, id: i.id })))
  .sort((a, b) => b.s.length - a.s.length);

/** Os itens citados num trecho (fixos e da biblioteca), na ordem em que aparecem, sem repetir. */
export function itensCitados(trecho: string): IdHome[] {
  let t = ` ${semAcento(trecho)} `;
  const achados: { pos: number; id: IdHome }[] = [];
  for (const { s, id } of SINONIMOS) {
    const re = new RegExp(`(?<![a-z0-9])${escapar(s)}(?![a-z0-9])`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(t))) {
      achados.push({ pos: m.index, id });
      // Apaga o trecho casado: "fluxo de caixa" não pode casar "caixa" de novo.
      t = t.slice(0, m.index) + " ".repeat(m[0].length) + t.slice(m.index + m[0].length);
    }
  }
  return achados.sort((a, b) => a.pos - b.pos).map((a) => a.id).filter((id, i, a) => a.indexOf(id) === i);
}

const RE_ESCONDER = /\b(tir[ae]r?|tira|remov\w*|escond\w*|ocult\w*|some com|sumir|apag\w*|nao (quero|preciso|uso|ligo|me importa)\w*( (ver|de|mais|com))*|dispenso|sem (o|a|os|as)\b)/;
const RE_ULTIMO = /\b(no final|por ultimo|la embaixo|embaixo|no fim|mais pra baixo|mais para baixo|desc[ea]\w*|deixa? (pra|para) depois)\b/;
/** Posição pedida com todas as letras: vence o "coloca" ("coloca o EBITDA em cima"). */
const RE_TOPO = /\b(primeiro|topo|em cima|no alto|destaque|principal)\b/;
const RE_MOSTRAR = /\b(de volta|volt[ae]\w*|reaparec\w*|devolv\w*|desescond\w*|coloc\w*|poe|por (o|a|os|as|um|uma)|bot[ae]\w*|adicion\w*|acrescent\w*|inclu\w*|traz\w*|traga|insir\w*|insere|ponha)\b/;
const RE_PRIMEIRO = /\b(quero|queria|gostaria|mostr\w*|ver|vejo|importa\w*|preciso)\b/;
const RE_RESTAURAR = /\b(padrao|como (era|estava) antes|original|volt\w* ao normal|reset\w*|desfaz\w* tudo|restaur\w*)\b/;
const RE_SOMENTE = /\b(so|somente|apenas|unicamente)\b/;

/**
 * Palavras que não dizem QUAL item: artigos, preposições, possessivos, os
 * verbos do pedido e as palavras da própria tela. Fora delas, o que sobra no
 * trecho é o assunto.
 */
const VAZIAS = new Set(("a o as os um uma uns umas de do da dos das no na nos nas em ao aos pra para pro por com " +
  "meu minha meus minhas seu sua seus suas nosso nossa nossos nossas me mim eu voce e ou que qual quais isso esse essa " +
  "aqui ali la tambem favor ai so somente apenas tudo todo toda todos todas mais menos bem " +
  "home tela inicial card cards item itens indicador indicadores numero numeros painel quadro " +
  "quero queria gostaria ver veja coloque coloca colocar poe por ponha bota bote botar adicione adiciona adicionar " +
  "inclua inclui incluir mostre mostra mostrar deixa deixe tira tire tirar remova remove esconda esconde sobe suba").split(" "));
/** Raiz grosseira: as cinco primeiras letras ("movimentações" e "movimentos" viram "movim"). */
const raiz = (p: string) => (p.length > 5 ? p.slice(0, 5) : p);
const ehVerbo = (p: string) => [RE_ESCONDER, RE_ULTIMO, RE_TOPO, RE_MOSTRAR, RE_PRIMEIRO, RE_SOMENTE, RE_RESTAURAR].some((re) => re.test(p));
const raizesDoTexto = (t: string) =>
  Array.from(new Set(semAcento(t).split(/[^a-z0-9]+/).filter((p) => p.length > 1 && !VAZIAS.has(p) && !ehVerbo(p)).map(raiz)));
const RAIZES_DO_ITEM = [...ITENS_HOME, ...CARDS_HOME].map((i) => ({
  id: i.id,
  raizes: new Set([i.nome, ...i.sinonimos].flatMap((x) => raizesDoTexto(x))),
}));

/**
 * A segunda leitura, quando nenhum sinônimo casou ("coloque as movimentações do
 * MEU mês"): o item cujas palavras contêm TODAS as do trecho, pela raiz. Só
 * devolve quando a resposta é UMA — duas candidatas é dúvida, e dúvida não
 * mexe na Home (o chat lista o tema em vez de chutar).
 */
export function itemAproximado(trecho: string): IdHome | null {
  const q = raizesDoTexto(trecho);
  if (q.length === 0) return null;
  const cand = RAIZES_DO_ITEM.filter((i) => q.every((r) => i.raizes.has(r)));
  if (cand.length === 1) return cand[0].id;
  // Empate: vence o item cujas palavras o trecho cobre MELHOR, se for só um.
  const melhor = Math.max(...cand.map((i) => q.length / i.raizes.size));
  const top = cand.filter((i) => q.length / i.raizes.size === melhor);
  return cand.length > 1 && top.length === 1 && q.length >= 2 ? top[0].id : null;
}


/**
 * A REGRA que lê o pedido digitado e devolve ações — sem chave de IA, o chat
 * ainda ajusta a Home. O texto é partido em trechos (vírgula, ponto, "e",
 * "mas"); cada trecho tem um verbo (tirar, deixar por último, pôr, mostrar de
 * novo) ou herda o do anterior ("quero ver o caixa e o que vou pagar": os dois
 * sobem). Sem verbo nenhum, citar um item é pedir para vê-lo primeiro — é a
 * resposta natural à pergunta do chat.
 *
 * "Só" / "apenas" num trecho positivo esconde os fixos que o pedido não citou e
 * tira os cards da biblioteca que estão na Home (`layout`) e não foram citados.
 */
export function interpretarPedido(texto: unknown, layout: LayoutHome = LAYOUT_PADRAO): AcaoHome[] {
  if (typeof texto !== "string" || !texto.trim()) return [];
  const t = semAcento(texto);
  if (RE_RESTAURAR.test(t) && itensCitados(t).length === 0) return [{ tipo: "restaurar" }];
  const trechos = t.split(/[,.;!?\n]+|\s+(?:e|mas|porem|tambem|depois)\s+/).map((x) => x.trim()).filter(Boolean);
  const acoes: AcaoHome[] = [];
  const positivos: IdHome[] = [];
  let somente = false;
  let anterior: TipoAcaoHome = "primeiro";
  for (const trecho of trechos) {
    const tipo: TipoAcaoHome | null = RE_ESCONDER.test(trecho) ? "esconder"
      : RE_ULTIMO.test(trecho) ? "ultimo"
      : RE_TOPO.test(trecho) ? "primeiro"
      : RE_MOSTRAR.test(trecho) ? "mostrar"
      : RE_PRIMEIRO.test(trecho) ? "primeiro"
      : null;
    const citados = itensCitados(trecho);
    if (citados.length === 0) { const perto = itemAproximado(trecho); if (perto) citados.push(perto); }
    if (citados.length === 0) { if (tipo) anterior = tipo; continue; }
    const efetivo: TipoAcaoHome = tipo ?? anterior;
    for (const id of citados) {
      acoes.push({ tipo: efetivo, id });
      if (efetivo === "primeiro" || efetivo === "mostrar") positivos.push(id);
    }
    if (efetivo === "primeiro" && RE_SOMENTE.test(trecho)) somente = true;
    anterior = efetivo;
  }
  if (somente && positivos.length) {
    const fora = [...ITENS_HOME.map((i) => i.id as IdHome), ...cardsNaHome(layout)];
    for (const id of fora) if (!positivos.includes(id) && !acoes.some((a) => a.id === id)) acoes.push({ tipo: "esconder", id });
  }
  return normalizarAcoes(acoes);
}

/** O catálogo como a IA o recebe: id, nome, grupo, tema e o que mostra — sem número nenhum. */
export const catalogoParaIA = () =>
  [...ITENS_HOME, ...CARDS_HOME].map((i) => ({ id: i.id, nome: i.nome, grupo: i.grupo, ...(i.tema ? { tema: i.tema } : {}), mostra: i.descricao }));

/* ------------------------------ o que dá para colocar ------------------------------ */

const RE_CATALOGO = /\b(o que (mais )?(da|posso|pode|consigo|tem|existe)( pra| para)? (colocar|por|adicionar|incluir|ver|mostrar)|o que mais (tem|existe|ha)|quais (cards|opcoes|itens|indicadores)|que (cards|opcoes|indicadores)|(me )?mostr\w* (as )?opcoes|lista (de )?(cards|opcoes)|catalogo|biblioteca|cards disponiveis|mais cards|outros cards)\b/;
const TEMA_POR_PALAVRA: [RegExp, TemaCard][] = [
  [/\bcaixa|liquidez|banco/, "Caixa"],
  [/\breceita|vendas?|faturamento/, "Receita"],
  [/\bdespesas?|gastos?|custos?/, "Despesas"],
  [/\bresultado|lucro|margem|dre\b/, "Resultado do mês"],
  [/\bcobranca|clientes?|inadimplencia|carteira/, "Cobrança"],
  [/\bresumo|executivo|saude|risco/, "Resumo executivo"],
  [/\boperacao|lancamentos?/, "Operação"],
  [/\bradar|ia\b|inteligencia|alertas?/, "Radares da IA"],
];

/**
 * A pessoa pergunta o que dá para pôr na Home ("o que mais dá para colocar?",
 * "quais cards de caixa?"). Devolve o tema citado (ou `null` = todos), ou
 * `undefined` quando o texto não é essa pergunta. ⚠️ Pedido com item citado
 * ("coloca o EBITDA") nunca é pergunta de catálogo.
 */
export function pedeCatalogo(texto: unknown): TemaCard | null | undefined {
  if (typeof texto !== "string") return undefined;
  const t = semAcento(texto);
  if (!RE_CATALOGO.test(t)) {
    // só o NOME de um tema ("Resumo executivo", "coloca despesas") lista os cards dele
    if (itensCitados(t).length || itemAproximado(t)) return undefined;
    const tema = TEMAS_CARD.find((tm) => new RegExp(`\\b${escapar(semAcento(tm))}\\b`).test(t));
    return tema ?? undefined;
  }
  const sem = t.replace(RE_CATALOGO, " ");
  if (itensCitados(sem).some(ehCard)) return undefined;
  return TEMA_POR_PALAVRA.find(([re]) => re.test(sem))?.[1] ?? null;
}

/**
 * O catálogo em linhas para o chat: um tema por linha, com os cards que ainda
 * NÃO estão na Home. Com tema, só ele, e todos os nomes.
 */
export function catalogoPorTema(layout: LayoutHome, tema: TemaCard | null, porTema = 5): string[] {
  const fora = CARDS_HOME.filter((c) => !layout.ordem.includes(c.id));
  const temas = tema ? [tema] : TEMAS_CARD;
  return temas.flatMap((tm) => {
    const nomes = fora.filter((c) => c.tema === tm).map((c) => c.nome);
    if (nomes.length === 0) return [];
    const mostrados = tema ? nomes : nomes.slice(0, porTema);
    const resto = nomes.length - mostrados.length;
    return [`${tm}: ${mostrados.join(", ")}${resto > 0 ? ` e mais ${resto}` : ""}.`];
  });
}

/* ------------------------------ a resposta do chat ------------------------------ */

/** Exemplos de pedido que o chat oferece (e que a regra de texto entende). */
export const EXEMPLOS_DE_PEDIDO = [
  "Quero ver primeiro o que tenho a pagar e a receber",
  "Coloca a inadimplência e o EBITDA",
  "Tira o burn e o runway",
  "O que mais dá para colocar?",
];

export interface RespostaDoAjuste {
  /** A primeira linha da resposta. */
  abertura: string;
  /** O que mudou, uma frase por linha (de `descreverMudancas`). */
  mudancas: string[];
  /** A última linha: o convite para seguir conversando. */
  fecho: string;
  mudou: boolean;
}

/**
 * O que o chat responde depois de um pedido, em tom de conversa. Cada caso diz
 * a verdade sobre a tela: mudou (e o quê), já estava assim, não coube (teto de
 * cards) ou não achou item nenhum no pedido — nesse caso diz quais itens
 * existem e como ver o resto, em vez de fingir que entendeu.
 */
export function respostaDoAjuste(acoes: AcaoHome[], mudancas: string[], recusados: IdCard[] = []): RespostaDoAjuste {
  const teto = recusados.length
    ? `Não coloquei ${recusados.map((id) => itemHome(id).nome).join(", ")}: a Home já tem ${TETO_CARDS} cards da biblioteca. Tire um para pôr outro.`
    : "";
  if (mudancas.length > 0) {
    return { abertura: "Pronto, arrumei a sua Home:", mudancas, fecho: teto || "Quer mudar mais alguma coisa? É só me dizer.", mudou: true };
  }
  if (teto) return { abertura: teto, mudancas: [], fecho: "Quer tirar algum?", mudou: false };
  if (normalizarAcoes(acoes).length > 0) {
    return { abertura: "A sua Home já está desse jeito.", mudancas: [], fecho: "Quer mudar mais alguma coisa?", mudou: false };
  }
  const nomes = ITENS_HOME.map((i) => i.nome);
  return {
    abertura: "Não encontrei nesse pedido nada da Home para mudar.",
    mudancas: [],
    fecho: `Na Home estão: ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}. Também dá para pôr cards de outras telas, como Inadimplência, EBITDA ou Custos fixos — pergunte "o que mais dá para colocar?".`,
    mudou: false,
  };
}

/** A resposta à pergunta "o que dá para colocar?": nada muda na tela. */
export function respostaDoCatalogo(layout: LayoutHome, tema: TemaCard | null): RespostaDoAjuste {
  const linhas = catalogoPorTema(layout, tema);
  if (linhas.length === 0) {
    return { abertura: tema ? `Todos os cards de ${tema} já estão na sua Home.` : "Todos os cards já estão na sua Home.", mudancas: [], fecho: "Quer tirar algum?", mudou: false };
  }
  return {
    abertura: tema ? `De ${tema}, dá para colocar:` : "Além do que já está na Home, dá para colocar:",
    mudancas: linhas,
    fecho: tema ? "É só dizer quais." : "É só dizer quais, ou perguntar por um tema (\"quais de caixa?\").",
    mudou: false,
  };
}
