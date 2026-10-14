/**
 * OS ITENS DA HOME e como cada pessoa os arruma (etapas 2 e 3 do "Ajustar
 * prioridades", 14/10/2026).
 *
 * A Home tem nove itens: os seis números do "Seu painel" e os três blocos de
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
 * Puro, tipado, demo-safe.
 */

export const ITENS_HOME_VERSION = "home-itens/1.0.0";

export type IdItemHome =
  | "caixa" | "arr" | "burn" | "runway" | "pagar" | "receber"
  | "acao" | "fechamento" | "relatorios";

export interface ItemHome {
  id: IdItemHome;
  nome: string;
  /** "painel" = os números; "bloco" = as três colunas de baixo. */
  grupo: "painel" | "bloco";
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
  { id: "caixa", nome: "Caixa consolidado", grupo: "painel", tamanho: "grande", descricao: "o saldo de todas as contas hoje, com a curva de 7 meses",
    sinonimos: ["caixa consolidado", "caixa", "saldo", "saldos", "dinheiro em conta", "dinheiro no banco", "quanto tenho", "contas bancarias", "banco", "bancos"] },
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

const IDS = new Set<string>(ITENS_HOME.map((i) => i.id));
export const ehItemHome = (x: unknown): x is IdItemHome => typeof x === "string" && IDS.has(x);
export const itemHome = (id: IdItemHome): ItemHome => ITENS_HOME.find((i) => i.id === id)!;

/* ------------------------------ o arranjo ------------------------------ */

export interface LayoutHome {
  /** Todos os itens, na ordem em que aparecem. */
  ordem: IdItemHome[];
  /** Os que a pessoa escondeu. */
  ocultos: IdItemHome[];
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
  const lista = (x: unknown): IdItemHome[] =>
    (Array.isArray(x) ? x : []).filter(ehItemHome).filter((id, i, a) => a.indexOf(id) === i);
  const ordem = lista(b.ordem);
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
  return { ordem, ocultos: lista(b.ocultos) };
}

export const mesmoLayout = (a: LayoutHome | null | undefined, b: LayoutHome | null | undefined): boolean => {
  if (!a || !b) return !a && !b;
  return a.ordem.join(",") === b.ordem.join(",") && [...a.ocultos].sort().join(",") === [...b.ocultos].sort().join(",");
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
export function visiveis(layout: LayoutHome, grupo?: ItemHome["grupo"]): IdItemHome[] {
  return layout.ordem.filter((id) => !layout.ocultos.includes(id) && (!grupo || itemHome(id).grupo === grupo));
}

/**
 * Em que ordem as duas SEÇÕES aparecem: a do primeiro item visível vem antes.
 * "O que eu quero ver primeiro é o que precisa de ação" sobe os blocos para
 * cima do painel — senão o pedido seria atendido lá embaixo da tela.
 */
export function ordemDasSecoes(layout: LayoutHome): ItemHome["grupo"][] {
  const primeiro = visiveis(layout)[0];
  return primeiro && itemHome(primeiro).grupo === "bloco" ? ["bloco", "painel"] : ["painel", "bloco"];
}

/**
 * Os números do painel em FAIXAS do mesmo tamanho, respeitando a ordem: os
 * grandes (com curva) e os pequenos não cabem na mesma linha sem um esticar o
 * outro. [pagar, caixa, arr, burn] → [[pagar], [caixa, arr], [burn]].
 */
export function faixasDoPainel(layout: LayoutHome): { tamanho: "grande" | "pequeno"; ids: IdItemHome[] }[] {
  const out: { tamanho: "grande" | "pequeno"; ids: IdItemHome[] }[] = [];
  for (const id of visiveis(layout, "painel")) {
    const tamanho = itemHome(id).tamanho ?? "pequeno";
    const ultima = out[out.length - 1];
    if (ultima && ultima.tamanho === tamanho) ultima.ids.push(id);
    else out.push({ tamanho, ids: [id] });
  }
  return out;
}

/** Troca `de` de lugar com `para` (o arraste e as setas do teclado). */
export function moverItem(layout: LayoutHome, de: IdItemHome, para: IdItemHome): LayoutHome {
  const i = layout.ordem.indexOf(de), j = layout.ordem.indexOf(para);
  if (i < 0 || j < 0 || i === j) return layout;
  const ordem = [...layout.ordem];
  ordem.splice(i, 1);
  ordem.splice(j, 0, de);
  return { ...layout, ordem };
}

/* ------------------------------ as ações ------------------------------ */

export type TipoAcaoHome = "primeiro" | "ultimo" | "mostrar" | "esconder" | "restaurar";
export interface AcaoHome { tipo: TipoAcaoHome; id?: IdItemHome }

const TIPOS = new Set<TipoAcaoHome>(["primeiro", "ultimo", "mostrar", "esconder", "restaurar"]);
/** Teto de ações de um pedido: o catálogo tem nove itens. */
const TETO_ACOES = 20;

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
    if (!ehItemHome(id)) continue;
    if (!out.some((x) => x.tipo === tipo && x.id === id)) out.push({ tipo: tipo as TipoAcaoHome, id });
  }
  return out;
}

/**
 * Aplica as ações, na ordem. "Primeiro" também MOSTRA (pedir para ver primeiro
 * o que está escondido é pedir para ver), e vários "primeiro" seguidos ficam
 * na ordem em que foram ditos: "pagar e depois receber" → pagar, receber.
 */
export function aplicarAcoes(layout: LayoutHome, acoes: AcaoHome[]): LayoutHome {
  let ordem = [...layout.ordem];
  let ocultos = [...layout.ocultos];
  const topo: IdItemHome[] = [];
  const fim: IdItemHome[] = [];
  for (const a of normalizarAcoes(acoes)) {
    if (a.tipo === "restaurar") { ordem = [...LAYOUT_PADRAO.ordem]; ocultos = []; topo.length = 0; fim.length = 0; continue; }
    const id = a.id!;
    if (a.tipo === "esconder") { if (!ocultos.includes(id)) ocultos.push(id); continue; }
    ocultos = ocultos.filter((x) => x !== id);
    const tirar = (lista: IdItemHome[]) => { const k = lista.indexOf(id); if (k >= 0) lista.splice(k, 1); };
    if (a.tipo === "primeiro") { tirar(fim); if (!topo.includes(id)) topo.push(id); }
    if (a.tipo === "ultimo") { tirar(topo); if (!fim.includes(id)) fim.push(id); }
  }
  ordem = [...topo, ...ordem.filter((id) => !topo.includes(id) && !fim.includes(id)), ...fim];
  return { ordem, ocultos };
}

/**
 * O que mudou, em frases curtas para o chat dizer — só o que de fato mudou na
 * tela (pedir para subir o que já é o primeiro não vira frase). Vazio = nada
 * mudou, e o chat diz isso em vez de anunciar uma mudança que não houve.
 */
export function descreverMudancas(antes: LayoutHome, depois: LayoutHome, acoes: AcaoHome[] = []): string[] {
  const nomes = (ids: IdItemHome[]) => ids.map((id) => itemHome(id).nome).join(", ");
  const va = visiveis(antes), vd = visiveis(depois);
  const pedidos = (tipo: TipoAcaoHome) => normalizarAcoes(acoes).filter((a) => a.tipo === tipo).map((a) => a.id!);
  const out: string[] = [];
  if (normalizarAcoes(acoes).some((a) => a.tipo === "restaurar") && !mesmoLayout(antes, depois)) {
    out.push("A Home voltou ao arranjo padrão.");
  }
  const subiram = pedidos("primeiro").filter((id) => vd.includes(id) && vd.indexOf(id) < (va.includes(id) ? va.indexOf(id) : Infinity));
  const desceram = pedidos("ultimo").filter((id) => vd.includes(id) && va.includes(id) && vd.indexOf(id) > va.indexOf(id));
  const voltaram = antes.ocultos.filter((id) => !depois.ocultos.includes(id));
  const sairam = depois.ocultos.filter((id) => !antes.ocultos.includes(id));
  if (subiram.length) out.push(`Para o topo: ${nomes(subiram)}.`);
  if (desceram.length) out.push(`Para o fim: ${nomes(desceram)}.`);
  if (voltaram.length) out.push(`De volta à tela: ${nomes(voltaram)}.`);
  if (sairam.length) out.push(`Escondidos: ${nomes(sairam)}.`);
  return out;
}

/* ------------------------------ o texto que a pessoa digita ------------------------------ */

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pares (sinônimo, id), do mais LONGO ao mais curto. */
const SINONIMOS = ITENS_HOME
  .flatMap((i) => i.sinonimos.map((s) => ({ s, id: i.id })))
  .sort((a, b) => b.s.length - a.s.length);

/** Os itens citados num trecho, na ordem em que aparecem, sem repetir. */
export function itensCitados(trecho: string): IdItemHome[] {
  let t = ` ${semAcento(trecho)} `;
  const achados: { pos: number; id: IdItemHome }[] = [];
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
const RE_MOSTRAR = /\b(de volta|volt[ae]\w*|reaparec\w*|devolv\w*|desescond\w*)\b/;
const RE_PRIMEIRO = /\b(quero|queria|gostaria|mostr\w*|ver|vejo|primeiro|topo|em cima|destaque|importa\w*|preciso|principal)\b/;
const RE_RESTAURAR = /\b(padrao|como (era|estava) antes|original|volt\w* ao normal|reset\w*|desfaz\w* tudo|restaur\w*)\b/;
const RE_SOMENTE = /\b(so|somente|apenas|unicamente)\b/;

/**
 * A REGRA que lê o pedido digitado e devolve ações — sem chave de IA, o chat
 * ainda ajusta a Home. O texto é partido em trechos (vírgula, ponto, "e",
 * "mas"); cada trecho tem um verbo (tirar, deixar por último, mostrar de novo)
 * ou herda o do anterior ("quero ver o caixa e o que vou pagar": os dois
 * sobem). Sem verbo nenhum, citar um item é pedir para vê-lo primeiro — é a
 * resposta natural à pergunta do chat.
 *
 * "Só" / "apenas" num trecho positivo esconde os itens que o pedido não
 * citou: "só quero ver o caixa e o que vou pagar".
 */
export function interpretarPedido(texto: unknown): AcaoHome[] {
  if (typeof texto !== "string" || !texto.trim()) return [];
  const t = semAcento(texto);
  if (RE_RESTAURAR.test(t) && itensCitados(t).length === 0) return [{ tipo: "restaurar" }];
  const trechos = t.split(/[,.;!?\n]+|\s+(?:e|mas|porem|tambem|depois)\s+/).map((x) => x.trim()).filter(Boolean);
  const acoes: AcaoHome[] = [];
  const positivos: IdItemHome[] = [];
  let somente = false;
  let anterior: TipoAcaoHome = "primeiro";
  for (const trecho of trechos) {
    const tipo: TipoAcaoHome | null = RE_ESCONDER.test(trecho) ? "esconder"
      : RE_ULTIMO.test(trecho) ? "ultimo"
      : RE_MOSTRAR.test(trecho) ? "mostrar"
      : RE_PRIMEIRO.test(trecho) ? "primeiro"
      : null;
    const citados = itensCitados(trecho);
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
    for (const i of ITENS_HOME) if (!positivos.includes(i.id) && !acoes.some((a) => a.id === i.id)) acoes.push({ tipo: "esconder", id: i.id });
  }
  return normalizarAcoes(acoes);
}

/** O catálogo como a IA o recebe: id, nome, grupo e o que mostra — sem número nenhum. */
export const catalogoParaIA = () =>
  ITENS_HOME.map((i) => ({ id: i.id, nome: i.nome, grupo: i.grupo, mostra: i.descricao }));

/* ------------------------------ a resposta do chat ------------------------------ */

/** Exemplos de pedido que o chat oferece (e que a regra de texto entende). */
export const EXEMPLOS_DE_PEDIDO = [
  "Quero ver primeiro o que tenho a pagar e a receber",
  "O que precisa de ação vem primeiro",
  "Tira o burn e o runway",
  "Volta ao padrão",
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
 * O que o chat responde depois de um pedido, em tom de conversa. Três casos, e
 * cada um diz a verdade sobre a tela: mudou (e o quê), já estava assim, ou não
 * achou item nenhum no pedido — nesse caso diz quais itens existem, em vez de
 * fingir que entendeu.
 */
export function respostaDoAjuste(acoes: AcaoHome[], mudancas: string[]): RespostaDoAjuste {
  if (mudancas.length > 0) {
    return { abertura: "Pronto, arrumei a sua Home:", mudancas, fecho: "Quer mudar mais alguma coisa? É só me dizer.", mudou: true };
  }
  if (normalizarAcoes(acoes).length > 0) {
    return { abertura: "A sua Home já está desse jeito.", mudancas: [], fecho: "Quer mudar mais alguma coisa?", mudou: false };
  }
  const nomes = ITENS_HOME.map((i) => i.nome);
  return {
    abertura: "Não encontrei nesse pedido nada da Home para mudar.",
    mudancas: [],
    fecho: `Na Home estão: ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}. Diga o que quer ver primeiro, o que quer esconder ou "volta ao padrão".`,
    mudou: false,
  };
}
