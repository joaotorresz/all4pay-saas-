/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FLUXOS DE AUTOMAÇÃO — o que o cliente monta (automacoes-fluxo/1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As seis automações de `./index.ts` são FIXAS: o sistema decide o dia e o
 * conteúdo. O fluxo é a peça que o cliente monta (pela tela de cards ou pela
 * conversa com a Quattro AI): um GATILHO de agenda (dias da semana + hora de
 * Brasília) → uma FONTE de dados → um ou mais ENVIOS.
 *
 * O formato é o de um grafo (nós + ligações) porque é o que a tela desenha;
 * mas a regra é uma corrente só, gatilho → dados → envio, e `validarFluxo` a
 * cobra. Um grafo livre aceitaria ciclos e dados soltos que ninguém executa —
 * a tela mostraria um fluxo que nunca roda.
 *
 * ⚠️ Puro: não lê relógio nem banco. O instante entra como parâmetro, os dados
 * entram prontos. A prévia da tela e o disparo de verdade chamam as MESMAS
 * funções — senão a prévia mostra uma mensagem e o WhatsApp recebe outra.
 *
 * ⚠️ Nenhum número calculado por conta própria: as contas a pagar saem de
 * `montarPainelContasPagar` (as definições do painel: "vence hoje" é A VENCER),
 * e a maquininha soma só as transações APROVADAS — negada, cancelada e
 * desfeita não são venda.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { montarPainelContasPagar, type ContaDoCard } from "@/core/contas-pagar";
import type { FormaPinbank, StatusPinbank } from "@/core/pinbank/evento";
import { formatBRL } from "@/lib/format";
import { hojeEm, somarDias, diaDaSemana, segundaDaSemana, diaMes, dataBRcurta, FUSO_DAS_AUTOMACOES } from "./tempo";
import type { CanalEnvio } from "./tipos";

export const FLUXO_VERSION = "automacoes-fluxo/1.0.0";

/* ========================================================================== */
/* O modelo                                                                    */
/* ========================================================================== */

/** 0 = domingo … 6 = sábado. */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface GatilhoAgenda {
  tipo: "agenda";
  dias: DiaSemana[];
  /** "HH:MM", horário de Brasília. */
  hora: string;
}

export type FonteFluxo = "contas_pagar_semana" | "maquininha_dia";

export interface DestinoEnvio {
  /** O membro da empresa (o disparo confere, a cada vez, se ele ainda está nela). */
  userId?: string;
  nome?: string | null;
  /** Telefone (WhatsApp) ou e-mail, conforme o canal. */
  endereco: string;
}

export type NoFluxo =
  | { id: string; tipo: "gatilho"; gatilho: GatilhoAgenda }
  | { id: string; tipo: "dados"; fonte: FonteFluxo }
  | { id: string; tipo: "envio"; canal: CanalEnvio; destinos: DestinoEnvio[] };

export interface Ligacao {
  de: string;
  para: string;
}

export interface Fluxo {
  id: string;
  nome: string;
  ativo: boolean;
  nos: NoFluxo[];
  ligacoes: Ligacao[];
}

/* ========================================================================== */
/* O catálogo — o que cada peça é, em português                                */
/* ========================================================================== */

export const NOME_DIA: Record<DiaSemana, string> = {
  0: "domingo", 1: "segunda", 2: "terça", 3: "quarta", 4: "quinta", 5: "sexta", 6: "sábado",
};

export const FONTES_FLUXO: Record<FonteFluxo, { nome: string; resumo: string }> = {
  contas_pagar_semana: {
    nome: "Contas a pagar da semana",
    resumo: "O que vence de hoje até domingo, dia a dia, com quem recebe e quanto. As vencidas vão no fim.",
  },
  maquininha_dia: {
    nome: "Vendas da maquininha no dia",
    resumo: "Quanto passou na maquininha hoje: débito, crédito à vista e parcelado, em quantas vezes, bandeiras e quanto fica para você.",
  },
};

export const NOME_CANAL: Record<CanalEnvio, string> = { whatsapp: "WhatsApp", email: "E-mail" };

/** "segunda, quarta e sexta às 08:00" · "todo dia às 19:00" · "dias úteis às 08:00". */
export function descreverGatilho(g: GatilhoAgenda): string {
  const dias = Array.from(new Set(g.dias)).sort((a, b) => a - b) as DiaSemana[];
  const quais =
    dias.length === 7 ? "todo dia"
    : dias.length === 5 && dias.every((d) => d >= 1 && d <= 5) ? "dias úteis"
    : dias.length === 1 ? `toda ${NOME_DIA[dias[0]]}`
    : `${dias.slice(0, -1).map((d) => NOME_DIA[d]).join(", ")} e ${NOME_DIA[dias[dias.length - 1]]}`;
  return `${quais} às ${g.hora}`;
}

/* ========================================================================== */
/* Validação — a corrente gatilho → dados → envio                              */
/* ========================================================================== */

export interface ProblemaFluxo {
  /** O nó com problema, quando é um nó só — a tela o destaca. */
  noId?: string;
  motivo: string;
}

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;
const soDigitos = (s: string) => s.replace(/\D/g, "");
const ehEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());

export function validarFluxo(f: Fluxo): ProblemaFluxo[] {
  const p: ProblemaFluxo[] = [];
  if (!f.nome.trim()) p.push({ motivo: "Dê um nome ao fluxo." });
  const porId = new Map(f.nos.map((n) => [n.id, n]));
  if (porId.size !== f.nos.length) p.push({ motivo: "Há dois cards com o mesmo identificador." });

  const gatilhos = f.nos.filter((n) => n.tipo === "gatilho");
  const dados = f.nos.filter((n) => n.tipo === "dados");
  const envios = f.nos.filter((n) => n.tipo === "envio");
  if (gatilhos.length !== 1) p.push({ motivo: gatilhos.length ? "O fluxo tem mais de um gatilho; deixe um só." : "Falta o gatilho: quando o fluxo roda." });
  if (dados.length !== 1) p.push({ motivo: dados.length ? "O fluxo tem mais de uma fonte de dados; deixe uma só." : "Falta o card de dados: o que a mensagem conta." });
  if (envios.length === 0) p.push({ motivo: "Falta o envio: para quem e por qual canal." });

  for (const n of f.nos) {
    if (n.tipo === "gatilho") {
      if (!HORA.test(n.gatilho.hora)) p.push({ noId: n.id, motivo: "A hora precisa estar no formato 08:00." });
      const validos = n.gatilho.dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
      if (validos.length === 0 || validos.length !== n.gatilho.dias.length) p.push({ noId: n.id, motivo: "Escolha ao menos um dia da semana." });
    }
    if (n.tipo === "dados" && !(n.fonte in FONTES_FLUXO)) p.push({ noId: n.id, motivo: "Fonte de dados desconhecida." });
    if (n.tipo === "envio") {
      if (n.destinos.length === 0) p.push({ noId: n.id, motivo: `Diga quem recebe pelo ${NOME_CANAL[n.canal]}.` });
      for (const d of n.destinos) {
        const ok = n.canal === "email" ? ehEmail(d.endereco) : soDigitos(d.endereco).length >= 10;
        if (!ok) p.push({ noId: n.id, motivo: n.canal === "email" ? `"${d.endereco}" não é um e-mail.` : `"${d.endereco}" não é um telefone com DDD.` });
      }
    }
  }

  // A corrente: toda ligação aponta para nós que existem, na ordem certa.
  const ordem = { gatilho: 0, dados: 1, envio: 2 } as const;
  for (const l of f.ligacoes) {
    const de = porId.get(l.de);
    const para = porId.get(l.para);
    if (!de || !para) { p.push({ motivo: "Uma ligação aponta para um card que não existe." }); continue; }
    if (ordem[para.tipo] !== ordem[de.tipo] + 1) {
      p.push({ noId: para.id, motivo: "A ordem é gatilho, depois dados, depois envio." });
    }
  }
  // Card solto não roda: a tela mostraria algo que nunca acontece.
  if (gatilhos.length === 1 && dados.length === 1) {
    const liga = (a: string, b: string) => f.ligacoes.some((l) => l.de === a && l.para === b);
    if (!liga(gatilhos[0].id, dados[0].id)) p.push({ noId: dados[0].id, motivo: "Ligue o gatilho ao card de dados." });
    for (const e of envios) if (!liga(dados[0].id, e.id)) p.push({ noId: e.id, motivo: "Ligue o card de dados a este envio." });
  }
  return p;
}

export const gatilhoDe = (f: Fluxo) => f.nos.find((n): n is Extract<NoFluxo, { tipo: "gatilho" }> => n.tipo === "gatilho")?.gatilho;
export const fonteDe = (f: Fluxo) => f.nos.find((n): n is Extract<NoFluxo, { tipo: "dados" }> => n.tipo === "dados")?.fonte;
export const enviosDe = (f: Fluxo) => f.nos.filter((n): n is Extract<NoFluxo, { tipo: "envio" }> => n.tipo === "envio");

/* ========================================================================== */
/* Quando dispara                                                              */
/* ========================================================================== */

/** O dia e a hora de Brasília num instante — o servidor roda em UTC. */
export function agoraEm(agora: Date, fuso: string = FUSO_DAS_AUTOMACOES): { dia: string; hora: string } {
  const hora = new Intl.DateTimeFormat("en-GB", { timeZone: fuso, hour: "2-digit", minute: "2-digit", hour12: false }).format(agora);
  // Alguns ambientes escrevem meia-noite como "24:00".
  return { dia: hojeEm(agora, fuso), hora: hora.replace(/^24/, "00") };
}

/**
 * Quanto atraso ainda vale disparar. O executor confere a cada 15 minutos; se
 * ele falhar por uma janela, a mensagem sai na seguinte. Depois de 3 horas, não
 * sai mais: a projeção das 8h chegando às 14h é pior que não chegar — a pessoa
 * já decidiu o dia sem ela.
 */
export const TOLERANCIA_MIN = 180;

const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

export interface Disparo {
  /** Chave de deduplicação: uma execução por fluxo por dia. */
  chave: string;
  dia: string;
}

/**
 * Este fluxo deve disparar agora? Devolve a chave do disparo do dia, ou `null`.
 *
 * ⚠️ Não basta "a hora é igual": o executor roda em janelas, e o cron atrasa.
 * Vale qualquer momento entre a hora marcada e a tolerância; quem impede a
 * segunda mensagem na mesma janela é a CHAVE (gravada antes de enviar, como
 * nas outras automações), não a coincidência do relógio.
 */
export function disparoDevido(f: Fluxo, agora: Date): Disparo | null {
  if (!f.ativo) return null;
  const g = gatilhoDe(f);
  if (!g || !HORA.test(g.hora)) return null;
  const { dia, hora } = agoraEm(agora);
  if (!g.dias.includes(diaDaSemana(dia) as DiaSemana)) return null;
  const atraso = minutos(hora) - minutos(g.hora);
  if (atraso < 0 || atraso > TOLERANCIA_MIN) return null;
  return { chave: `fluxo:${f.id}:${dia}`, dia };
}

/* ========================================================================== */
/* As fontes — a mensagem que cada uma escreve                                 */
/* ========================================================================== */

export interface MensagemFluxo {
  titulo: string;
  /** Texto do WhatsApp (negrito com *asteriscos*). */
  texto: string;
  /** Uma linha, para template aprovado e para a lista da tela. */
  resumoCurto: string;
}

/** Por que não houve mensagem — nunca um silêncio. */
export interface SemMensagem {
  codigo: "sem_dados" | "nada_a_avisar";
  motivo: string;
}

const BRL = formatBRL;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const NOME_DIA_CHEIO = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/* ---------- contas a pagar da semana ---------- */

/**
 * De hoje até o domingo. Na segunda às 8h é a semana inteira; disparado numa
 * quarta, olha de quarta a domingo — o que já passou não é projeção.
 */
export function janelaDaSemana(hoje: string): { de: string; ate: string } {
  return { de: hoje, ate: somarDias(segundaDaSemana(hoje), 6) };
}

export function mensagemContasPagarSemana(input: RiskInput, hoje: string): MensagemFluxo | SemMensagem {
  if (input.movements.length === 0) {
    return { codigo: "sem_dados", motivo: "A empresa ainda não tem lançamentos: a projeção só teria zeros." };
  }
  const { de, ate } = janelaDaSemana(hoje);
  const aVencer = montarPainelContasPagar(input, { de, ate }).aVencer.contas;
  const vencidas = montarPainelContasPagar(input, { de: "0000-01-01", ate: somarDias(hoje, -1) }).atrasadas.contas;
  if (aVencer.length === 0 && vencidas.length === 0) {
    return { codigo: "nada_a_avisar", motivo: `Nenhuma conta a pagar vence até ${dataBRcurta(ate)} e nenhuma está em atraso.` };
  }
  const soma = (cs: ContaDoCard[]) => cs.reduce((t, c) => t + c.valor, 0);
  const porData = new Map<string, ContaDoCard[]>();
  for (const c of aVencer) porData.set(c.data, [...(porData.get(c.data) ?? []), c]);

  const linhas: string[] = [`*Projeção de contas a pagar · ${diaMes(de)} a ${diaMes(ate)}*`, ""];
  if (aVencer.length) {
    linhas.push(`${plural(aVencer.length, "conta vence", "contas vencem")} nesta semana, somando *${BRL(soma(aVencer))}*.`, "");
    for (const d of Array.from(porData.keys()).sort()) {
      const cs = porData.get(d)!;
      const rotulo = d === hoje ? `Hoje (${diaMes(d)})` : `${NOME_DIA_CHEIO[diaDaSemana(d)]} (${diaMes(d)})`;
      linhas.push(`*${rotulo}* · ${plural(cs.length, "conta", "contas")} · ${BRL(soma(cs))}`);
      for (const c of cs) linhas.push(`  • ${c.contraparte}: ${BRL(c.valor)}`);
      linhas.push("");
    }
  } else {
    linhas.push("Nenhuma conta vence nesta semana.", "");
  }
  if (vencidas.length) {
    linhas.push(`*Já venceram* · ${plural(vencidas.length, "conta", "contas")} · ${BRL(soma(vencidas))}`);
    for (const c of vencidas.slice(0, 10)) linhas.push(`  • ${c.contraparte}: ${BRL(c.valor)} (venceu em ${dataBRcurta(c.data)})`);
    if (vencidas.length > 10) linhas.push(`  E mais ${vencidas.length - 10} em Títulos a pagar.`);
  }
  const resumoCurto =
    (aVencer.length ? `Semana de ${diaMes(de)} a ${diaMes(ate)}: ${BRL(soma(aVencer))} a pagar em ${plural(aVencer.length, "conta", "contas")}` : `Nada vence até ${diaMes(ate)}`)
    + (vencidas.length ? `; ${BRL(soma(vencidas))} em atraso.` : ".");
  return { titulo: "Contas a pagar da semana", texto: linhas.join("\n").trimEnd(), resumoCurto };
}

/* ---------- vendas da maquininha no dia ---------- */

export interface VendaMaquininha {
  nsu: number | string;
  status: StatusPinbank;
  valor: number;
  forma: FormaPinbank;
  parcelas: number;
  bandeira: string | null;
  /** ISO com hora — o dia é contado em Brasília. */
  ocorridoEm: string;
  /**
   * O que fica para a empresa (valor − taxa − tarifa − antecipação), quando os
   * títulos da venda já existem. `null` = ainda não se sabe — não vira o bruto.
   */
  liquido: number | null;
}

const NOME_FORMA: Record<FormaPinbank, string> = {
  debito: "Débito", credito_vista: "Crédito à vista", parcelado: "Crédito parcelado",
  voucher: "Voucher", pix: "Pix", desconhecida: "Forma não identificada",
};

export interface ResumoMaquininha {
  dia: string;
  aprovadas: number;
  bruto: number;
  /** Soma do líquido das vendas que o têm. */
  liquido: number;
  /** Quantas aprovadas ainda sem líquido conhecido. */
  semLiquido: number;
  porForma: { forma: FormaPinbank; quantidade: number; valor: number }[];
  /** Só o parcelado: em quantas vezes. */
  porParcelas: { parcelas: number; quantidade: number; valor: number }[];
  porBandeira: { bandeira: string; quantidade: number; valor: number }[];
  /** Canceladas/desfeitas/reembolsadas no dia: não somam, mas se dizem. */
  estornadas: { quantidade: number; valor: number };
  negadas: number;
}

const ESTORNO: StatusPinbank[] = ["Cancelada", "Desfeita", "Reembolsada"];

export function resumirMaquininha(vendas: VendaMaquininha[], dia: string): ResumoMaquininha {
  const doDia = vendas.filter((v) => hojeEm(new Date(v.ocorridoEm)) === dia);
  const aprovadas = doDia.filter((v) => v.status === "Aprovada");
  const agrupar = <K extends string | number>(chave: (v: VendaMaquininha) => K) => {
    const m = new Map<K, { quantidade: number; valor: number }>();
    for (const v of aprovadas) {
      const k = chave(v);
      const a = m.get(k) ?? { quantidade: 0, valor: 0 };
      m.set(k, { quantidade: a.quantidade + 1, valor: a.valor + v.valor });
    }
    return Array.from(m.entries()).sort((a, b) => b[1].valor - a[1].valor);
  };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const comLiquido = aprovadas.filter((v) => v.liquido !== null);
  const estornadas = doDia.filter((v) => ESTORNO.includes(v.status));
  return {
    dia,
    aprovadas: aprovadas.length,
    bruto: r2(aprovadas.reduce((t, v) => t + v.valor, 0)),
    liquido: r2(comLiquido.reduce((t, v) => t + (v.liquido ?? 0), 0)),
    semLiquido: aprovadas.length - comLiquido.length,
    porForma: agrupar((v) => v.forma).map(([forma, a]) => ({ forma, ...a })),
    porParcelas: agrupar((v) => (v.forma === "parcelado" ? Math.max(2, v.parcelas) : 0))
      .filter(([p]) => p > 0).sort((a, b) => a[0] - b[0]).map(([parcelas, a]) => ({ parcelas, ...a })),
    porBandeira: agrupar((v) => v.bandeira?.trim() || "Não informada").map(([bandeira, a]) => ({ bandeira, ...a })),
    estornadas: { quantidade: estornadas.length, valor: r2(estornadas.reduce((t, v) => t + v.valor, 0)) },
    negadas: doDia.filter((v) => v.status === "Negada").length,
  };
}

export function mensagemMaquininhaDia(vendas: VendaMaquininha[], dia: string, temMaquininha: boolean): MensagemFluxo | SemMensagem {
  if (!temMaquininha) {
    return { codigo: "sem_dados", motivo: "A empresa não tem maquininha ligada ao Quattro: não há vendas para contar." };
  }
  const r = resumirMaquininha(vendas, dia);
  const titulo = `Maquininha · ${dataBRcurta(dia)}`;
  // Dia sem venda É notícia (a loja abriu?) — sai a frase, não "R$0,00".
  if (r.aprovadas === 0) {
    const texto = `*${titulo}*\n\nNenhuma venda aprovada hoje na maquininha.${r.estornadas.quantidade ? `\n${plural(r.estornadas.quantidade, "venda foi cancelada", "vendas foram canceladas")} (${BRL(r.estornadas.valor)}).` : ""}`;
    return { titulo, texto, resumoCurto: `${dataBRcurta(dia)}: nenhuma venda aprovada na maquininha.` };
  }
  const linhas: string[] = [`*${titulo}*`, ""];
  linhas.push(`Vendeu *${BRL(r.bruto)}* em ${plural(r.aprovadas, "venda", "vendas")}.`);
  if (r.semLiquido === 0) linhas.push(`Fica para você: *${BRL(r.liquido)}* (já sem taxas).`);
  else if (r.semLiquido < r.aprovadas) linhas.push(`Fica para você: *${BRL(r.liquido)}* nas vendas já lançadas; ${plural(r.semLiquido, "venda ainda não tem", "vendas ainda não têm")} o valor líquido calculado.`);
  else linhas.push("O valor líquido (sem taxas) ainda não foi calculado para as vendas de hoje.");
  linhas.push("", "*Por forma*");
  for (const f of r.porForma) linhas.push(`  • ${NOME_FORMA[f.forma]}: ${BRL(f.valor)} (${plural(f.quantidade, "venda", "vendas")})`);
  if (r.porParcelas.length) {
    linhas.push("", "*Parcelado*");
    for (const p of r.porParcelas) linhas.push(`  • ${p.parcelas}x: ${BRL(p.valor)} (${plural(p.quantidade, "venda", "vendas")})`);
  }
  linhas.push("", "*Bandeiras*");
  for (const b of r.porBandeira) linhas.push(`  • ${b.bandeira}: ${BRL(b.valor)} (${plural(b.quantidade, "venda", "vendas")})`);
  if (r.estornadas.quantidade) linhas.push("", `${plural(r.estornadas.quantidade, "venda cancelada", "vendas canceladas")}: ${BRL(r.estornadas.valor)} (fora do total).`);
  if (r.negadas) linhas.push(`${plural(r.negadas, "transação negada", "transações negadas")} pelo cartão.`);
  return {
    titulo,
    texto: linhas.join("\n"),
    resumoCurto: `${dataBRcurta(dia)}: ${BRL(r.bruto)} em ${plural(r.aprovadas, "venda", "vendas")} na maquininha${r.semLiquido === 0 ? `, ${BRL(r.liquido)} líquido` : ""}.`,
  };
}

/* ========================================================================== */
/* Executar — o que o fluxo escreveria hoje                                    */
/* ========================================================================== */

export interface DadosDoFluxo {
  input: RiskInput;
  vendasMaquininha: VendaMaquininha[];
  temMaquininha: boolean;
}

export function mensagemDoFluxo(f: Fluxo, dados: DadosDoFluxo, dia: string): MensagemFluxo | SemMensagem {
  const fonte = fonteDe(f);
  if (fonte === "contas_pagar_semana") return mensagemContasPagarSemana(dados.input, dia);
  if (fonte === "maquininha_dia") return mensagemMaquininhaDia(dados.vendasMaquininha, dia, dados.temMaquininha);
  return { codigo: "sem_dados", motivo: "O fluxo não tem fonte de dados." };
}

export const ehMensagem = (r: MensagemFluxo | SemMensagem): r is MensagemFluxo => "texto" in r;

/* ========================================================================== */
/* Os modelos — os dois exemplos do pedido, prontos para ligar                 */
/* ========================================================================== */

export interface ModeloFluxo {
  id: string;
  nome: string;
  descricao: string;
  montar: (destinos: DestinoEnvio[], id: string) => Fluxo;
}

function corrente(id: string, nome: string, gatilho: GatilhoAgenda, fonte: FonteFluxo, destinos: DestinoEnvio[]): Fluxo {
  return {
    id, nome, ativo: false,
    nos: [
      { id: "gatilho", tipo: "gatilho", gatilho },
      { id: "dados", tipo: "dados", fonte },
      { id: "envio-whatsapp", tipo: "envio", canal: "whatsapp", destinos },
    ],
    ligacoes: [{ de: "gatilho", para: "dados" }, { de: "dados", para: "envio-whatsapp" }],
  };
}

/** ⚠️ Os modelos nascem DESLIGADOS: mensagem que sai da empresa é decisão de alguém. */
export const MODELOS_FLUXO: ModeloFluxo[] = [
  {
    id: "contas-pagar-segunda",
    nome: "Projeção de contas a pagar da semana",
    descricao: "Toda segunda às 08:00, no WhatsApp: o que vence em cada dia da semana e para quem.",
    montar: (destinos, id) => corrente(id, "Projeção de contas a pagar da semana", { tipo: "agenda", dias: [1], hora: "08:00" }, "contas_pagar_semana", destinos),
  },
  {
    id: "maquininha-fim-do-dia",
    nome: "Fechamento da maquininha",
    descricao: "Todo dia às 19:00, no WhatsApp: quanto passou no débito e no crédito, em quantas vezes, bandeiras e quanto fica para você.",
    montar: (destinos, id) => corrente(id, "Fechamento da maquininha", { tipo: "agenda", dias: [0, 1, 2, 3, 4, 5, 6], hora: "19:00" }, "maquininha_dia", destinos),
  },
];
