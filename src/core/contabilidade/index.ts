/**
 * CONTABILIDADE — a ponte com o contador.
 *
 * Duas entregas, e as duas saem do sistema PARA fora: o pacote mensal de XMLs
 * das notas (entrada + saída) e o TXT de lançamentos para o Domínio. Nenhuma
 * das duas produz número novo — elas empacotam o que o resto do sistema já
 * apurou, e por isso o cuidado inteiro está em não deixar sair errado.
 *
 * Puro, tipado, demo-safe. Versão contabilidade/1.0.0.
 */

export * from "./cp1252";
import { paraCP1252 } from "./cp1252";

export const CONTABILIDADE_VERSION = "contabilidade/1.0.0";

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ====================== envio das NFs ao contador ====================== */

/**
 * Teto de 5 destinatários.
 *
 * O pacote leva os XMLs fiscais da empresa inteira. Uma lista aberta transforma
 * um envio de rotina em vazamento contínuo — o limite não é de infraestrutura,
 * é de escopo: contador, sócio do escritório, e mais ninguém.
 */
export const LIMITE_DESTINATARIOS = 5;

export interface DestinatarioContador {
  id: string;
  email: string;
  /** Só quem clicou no link recebe. Ver `statusEnvio`. */
  verificado: boolean;
  /** ISO — quando o e-mail foi cadastrado. */
  criadoEm: string;
  /** ISO — quando a confirmação foi aceita; null enquanto pendente. */
  verificadoEm: string | null;
}

export type StatusEnvio = "ativo" | "inativo";

/**
 * ⚠️ O envio só liga com ao menos UM e-mail verificado.
 *
 * Double opt-in aqui não é etiqueta de newsletter: o pacote carrega a
 * escrituração fiscal da empresa. Um endereço digitado errado — uma letra a
 * mais no domínio — entrega os XMLs a um estranho todo dia 1º, em silêncio, e
 * ninguém descobre porque o envio "funciona". Quem confirma é o destinatário.
 */
export function statusEnvio(destinatarios: DestinatarioContador[]): StatusEnvio {
  return destinatarios.some((d) => d.verificado) ? "ativo" : "inativo";
}

export function podeAdicionar(destinatarios: DestinatarioContador[]): boolean {
  return destinatarios.length < LIMITE_DESTINATARIOS;
}

/** Validação de e-mail deliberadamente simples — quem valida de verdade é o link. */
export function emailValido(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email ?? "").trim());
}

export function validarDestinatario(
  email: string,
  atuais: DestinatarioContador[],
): string | null {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return "Informe o e-mail do contador.";
  if (!emailValido(e)) return "E-mail inválido.";
  if (atuais.some((d) => d.email.toLowerCase() === e)) return "Este e-mail já está cadastrado.";
  if (!podeAdicionar(atuais)) return `Limite de ${LIMITE_DESTINATARIOS} destinatários atingido.`;
  return null;
}

/**
 * O próximo envio: dia 1º do mês seguinte, 21:00.
 *
 * Roda depois do fechamento do mês porque uma nota emitida no dia 31 às 23h
 * ainda é daquela competência — enviar no próprio dia 31 entregaria um pacote
 * incompleto que o contador teria de reconciliar à mão.
 *
 * ⚠️ A data é fatiada da string, nunca lida de um `Date` UTC: em UTC-3,
 * `new Date("2026-09-01").getMonth()` cai em agosto.
 */
export function proximoEnvio(hojeISO: string): string {
  const [a, m] = hojeISO.slice(0, 7).split("-").map(Number);
  const proxA = m === 12 ? a + 1 : a;
  const proxM = m === 12 ? 1 : m + 1;
  return `${proxA}-${String(proxM).padStart(2, "0")}-01T21:00`;
}

export function formatarProximoEnvio(iso: string): string {
  const [data, hora] = iso.split("T");
  return `${data.split("-").reverse().join("/")}, ${hora}`;
}

export interface NotaDoMes {
  /** ISO da emissão — só o mês importa. */
  emissao: string;
  /** Se o XML/chave está retido e vai no pacote. */
  arquivada: boolean;
}

export interface ResumoMesNFs {
  mes: string;
  entrada: number;
  entradaArquivadas: number;
  saida: number;
  saidaArquivadas: number;
}

/**
 * O contador do mês corrente.
 *
 * ⚠️ "Arquivada" NÃO é sinônimo de "existe". O arquivamento começa quando há um
 * destinatário verificado — antes disso o sistema conta as notas, mas não retém
 * nada para enviar. Mostrar "12 arquivadas" sem destinatário prometeria um
 * pacote que ninguém montou.
 */
export function resumoMesNFs(
  entradas: NotaDoMes[],
  saidas: NotaDoMes[],
  mes: string,
  arquivamentoDesde: string | null,
): ResumoMesNFs {
  const doMes = (n: NotaDoMes) => n.emissao.slice(0, 7) === mes;
  const retida = (n: NotaDoMes) =>
    n.arquivada && arquivamentoDesde != null && n.emissao >= arquivamentoDesde;
  const e = entradas.filter(doMes);
  const s = saidas.filter(doMes);
  return {
    mes,
    entrada: e.length,
    entradaArquivadas: e.filter(retida).length,
    saida: s.length,
    saidaArquivadas: s.filter(retida).length,
  };
}

/* ======================= TXT contábil — Domínio ======================= */

/**
 * O layout Partidas Simples.
 *
 * "Partidas simples" quer dizer que cada linha traz UMA conta — a contrapartida
 * do lançamento — porque a outra ponta é fixa: é a conta bancária escolhida na
 * tela. Por isso a tela pede o banco antes de carregar qualquer coisa; sem ele
 * o arquivo não tem o outro lado do débito.
 *
 * ⚠️ A ordem dos campos varia entre versões do Domínio. A ordem emitida está
 * declarada aqui e VISÍVEL na tela, e o preview mostra as linhas exatas antes
 * de gerar — conferir contra a tela de importação do escritório leva um minuto
 * e evita reimportar um mês inteiro.
 */
export const LAYOUT_DOMINIO =
  "DDMMAAAA;conta contábil;D/C;valor;código do histórico;histórico;centro de custo";

export interface MovimentoContabil {
  id: string;
  /** Data de CAIXA — o extrato é o que o Domínio concilia. */
  data: string;
  valor: number;
  tipo: "entrada" | "saida";
  descricao: string;
  categoria: string;
  centroCusto: string | null;
}

export interface LinhaDominio {
  id: string;
  data: string;
  /** Conta contábil da contrapartida (a categoria), vinda do Plano de Contas. */
  conta: string;
  /** D quando o dinheiro sai do banco, C quando entra. */
  natureza: "D" | "C";
  valor: number;
  codigoHistorico: string;
  historico: string;
  centroCusto: string;
}

export interface PendenciaDominio {
  movimentoId: string;
  descricao: string;
  motivo: string;
}

export interface MontagemDominio {
  linhas: LinhaDominio[];
  /** O que impede o arquivo de importar direito — nunca é silencioso. */
  pendencias: PendenciaDominio[];
}

export interface MapasContabeis {
  /** categoria → código contábil (do Plano de Contas). */
  categorias: Record<string, string>;
  /** centro de custo → código contábil (do cadastro). */
  centros: Record<string, string>;
  /** Código de histórico padrão do escritório, quando houver. */
  codigoHistorico?: string;
}

/**
 * Monta as linhas e SEPARA as pendências.
 *
 * ⚠️ Um lançamento cuja categoria não tem código contábil não vira linha com o
 * campo em branco — ele sai da lista e entra em `pendencias`. O Domínio aceita
 * a linha vazia e joga o valor numa conta transitória; o mês fecha, o número
 * bate, e o erro só aparece no balancete três semanas depois. É mais barato
 * avisar aqui.
 */
export function montarLancamentosDominio(
  movimentos: MovimentoContabil[],
  mapas: MapasContabeis,
): MontagemDominio {
  const linhas: LinhaDominio[] = [];
  const pendencias: PendenciaDominio[] = [];

  for (const m of movimentos) {
    const conta = mapas.categorias[m.categoria];
    if (!conta) {
      pendencias.push({
        movimentoId: m.id,
        descricao: m.descricao || m.categoria || "(sem descrição)",
        motivo: m.categoria
          ? `A categoria "${m.categoria}" não tem código contábil no Plano de Contas.`
          : "Lançamento sem categoria.",
      });
      continue;
    }
    linhas.push({
      id: m.id,
      data: m.data,
      conta,
      // Saída do banco DEBITA a contrapartida (despesa); entrada CREDITA
      // (receita). É a partida simples vista do lado da conta bancária.
      natureza: m.tipo === "saida" ? "D" : "C",
      valor: round2(m.valor),
      codigoHistorico: mapas.codigoHistorico ?? "",
      historico: (m.descricao || m.categoria).trim(),
      centroCusto: (m.centroCusto && mapas.centros[m.centroCusto]) || "",
    });
  }
  return { linhas, pendencias };
}

/** Valor em pt-BR sem separador de milhar: o Domínio lê vírgula decimal. */
export const valorDominio = (n: number): string => n.toFixed(2).replace(".", ",");

/** DDMMAAAA — fatiado da string ISO, nunca de um `Date` (fuso). */
export const dataDominio = (iso: string): string => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}${m}${a}`;
};

/**
 * Sanitiza um campo do arquivo.
 *
 * O separador é `;` — um ponto e vírgula dentro do histórico partiria a linha
 * em duas e deslocaria TODAS as colunas seguintes daquele lançamento. Quebra de
 * linha teria o mesmo efeito, pior.
 */
export const campoDominio = (s: string): string =>
  (s ?? "").replace(/[;\r\n]+/g, " ").replace(/\s+/g, " ").trim();

/** O conteúdo do `lanctos.txt`. CRLF porque o destino é Windows. */
export function gerarLanctosTxt(linhas: LinhaDominio[]): string {
  return linhas
    .map((l) => [
      dataDominio(l.data),
      campoDominio(l.conta),
      l.natureza,
      valorDominio(l.valor),
      campoDominio(l.codigoHistorico),
      campoDominio(l.historico),
      campoDominio(l.centroCusto),
    ].join(";"))
    .join("\r\n") + (linhas.length > 0 ? "\r\n" : "");
}

/** Os bytes do arquivo — ANSI, não UTF-8. Ver `cp1252.ts`. */
export const gerarLanctosBytes = (linhas: LinhaDominio[]): Uint8Array =>
  paraCP1252(gerarLanctosTxt(linhas));

export interface ConferenciaDominio {
  lancamentos: number;
  debitos: number;
  creditos: number;
  /** Entradas − saídas: o movimento líquido da conta no período. */
  liquido: number;
}

/**
 * A conferência que o operador faz ANTES de gerar.
 *
 * Débito e crédito não se anulam aqui — em partidas simples eles são os dois
 * sentidos do extrato, não os dois lados de um mesmo lançamento. Exigir que
 * fechassem em zero seria confundir os dois regimes.
 */
export function conferirDominio(linhas: LinhaDominio[]): ConferenciaDominio {
  const soma = (n: "D" | "C") =>
    round2(linhas.filter((l) => l.natureza === n).reduce((s, l) => s + l.valor, 0));
  const debitos = soma("D");
  const creditos = soma("C");
  return { lancamentos: linhas.length, debitos, creditos, liquido: round2(creditos - debitos) };
}
