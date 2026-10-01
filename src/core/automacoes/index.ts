/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTOMAÇÕES — o que sairia hoje, para quem, por qual canal (automacoes/1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O núcleo PURO das automações de e-mail e WhatsApp. Dado o contexto de UMA
 * empresa num dia, devolve as mensagens que sairiam — destino, canal, assunto,
 * texto, HTML e a CHAVE de deduplicação. Não envia nada, não lê relógio, não
 * fala com banco: é determinístico, e é por isso que a prévia da tela, o
 * `?dryRun=1` do runner e o envio de verdade mostram a MESMA mensagem.
 *
 * ⚠️ **Nenhum número é calculado aqui por conta própria.** Saldo, vencidos,
 * resultado, ruptura, fechamento e régua saem dos motores que as telas já usam
 * (`core/indicadores`, `core/contas-pagar`, `core/contas-receber`,
 * `risk-engine/liquidez`, `core/close`, `core/cobranca`, `core/late-fee`,
 * `core/pix`). Um resumo por e-mail que discorda da Visão geral é pior que
 * resumo nenhum: o dono passa a desconfiar das duas.
 *
 * ⚠️ **Empresa sem dados NÃO recebe "R$ 0"** (ONDA 4). Sem lançamentos, o
 * resumo não sai — e dentro dele, uma soma vazia vira frase ("nada vence
 * hoje"), nunca "R$0,00": zero da ausência lê como zero do negócio.
 *
 * ⚠️ **Tudo no condicional quando é projeção.** "O caixa FICARIA negativo em
 * 12/10, no ritmo agendado" — nunca "o caixa fica negativo". E o alerta de
 * caixa não imprime probabilidade nenhuma: o 97% do score é o TETO da fórmula,
 * não uma medida (A4P-032).
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import {
  saldo, previstoNaJanela, vencidoEmAberto, resultado, janela, janelaHoje, janelaDoMesDe,
  coberturaCompetencia, temValor,
} from "@/core/indicadores";
import { saldoEm, liquidado, previsto, cancelado, magnitude } from "@/core/indicadores/convencoes";
import { montarPainelContasPagar, type ContaDoCard } from "@/core/contas-pagar";
import { ehContaAReceber } from "@/core/contas-receber";
import { calcularLiquidezProjetada } from "@/core/risk-engine/liquidez.engine";
import { ponteRupturaRunway } from "@/core/ia/coerencia";
import { montarFechamento } from "@/core/close";
import {
  montarRegua, identificacaoDoCredor, FINALIDADE_DO_TOM, SE_JA_PAGOU, type EnvioRegistrado,
  type ItemRegua,
} from "@/core/cobranca";
import { calcularMora } from "@/core/late-fee";
import { gerarPixCopiaECola } from "@/core/pix";
import { diaUtilDoMes } from "@/core/folha/calendario";
import { formatBRL, comSinal } from "@/lib/format";
import { montarHtml, type LinhaEmail, type SecaoEmail } from "./email";
import {
  hojeEm, somarDias, diaDaSemana, diasEntre, diaUtil, proximoDiaUtil, segundaDaSemana,
  primeiroDiaUtilDaSemana, diaMes, dataBRcurta, nomeDoMes, mesAnterior,
} from "./tempo";
import {
  AUTOMACOES_VERSION, TIPOS_AUTOMACAO, contaComoAvisado,
  type TipoAutomacao, type CanalEnvio, type ConfigAutomacao, type ContextoAutomacao,
  type Conteudo, type SemEnvio, type MensagemAutomacao, type ResultadoAutomacao,
  type EnvioHistorico, type FinalidadeTemplate, type ParametrosAutomacao, type StatusEnvio,
} from "./tipos";

export * from "./tipos";
export { hojeEm, FUSO_DAS_AUTOMACOES } from "./tempo";
export { montarHtml } from "./email";
export { AUTOMACOES_VERSION };

/* ========================================================================== */
/* O catálogo — o que cada automação é, em português                          */
/* ========================================================================== */

export interface DescricaoAutomacao {
  tipo: TipoAutomacao;
  nome: string;
  /** O que ela responde, em uma frase. */
  resumo: string;
  /** Quando sai. */
  quando: string;
  /** A quem: o dono da empresa ou o cliente. */
  fala_com: "empresa" | "cliente";
  canaisPossiveis: CanalEnvio[];
}

export const CATALOGO_AUTOMACOES: DescricaoAutomacao[] = [
  { tipo: "resumo_diario", nome: "Resumo do caixa do dia", fala_com: "empresa", canaisPossiveis: ["email", "whatsapp"],
    resumo: "Saldo, o que entra e sai hoje, vencidos a receber e a pagar, aprovações e ruptura prevista.",
    quando: "Dias úteis, na execução diária da manhã." },
  { tipo: "resumo_semanal", nome: "Resumo da semana", fala_com: "empresa", canaisPossiveis: ["email", "whatsapp"],
    resumo: "O resultado da semana passada contra a anterior, os maiores recebimentos e as contas desta semana.",
    quando: "No primeiro dia útil de cada semana." },
  { tipo: "lembrete_pagar", nome: "Lembrete de contas a pagar", fala_com: "empresa", canaisPossiveis: ["email", "whatsapp"],
    resumo: "As contas que vencem hoje e no próximo dia útil, agrupadas por data, e as que já venceram.",
    quando: "Dias úteis; na sexta-feira, a semana seguinte inteira." },
  { tipo: "alerta_caixa", nome: "Alerta de caixa", fala_com: "empresa", canaisPossiveis: ["email", "whatsapp"],
    resumo: "Avisa quando, no ritmo agendado, o caixa ficaria negativo (ou abaixo do mínimo) dentro do prazo escolhido.",
    quando: "Na execução diária, só quando a situação muda de faixa." },
  { tipo: "fechamento_pendente", nome: "Aviso de fechamento do mês", fala_com: "empresa", canaisPossiveis: ["email", "whatsapp"],
    resumo: "Lembra que o mês anterior ainda não foi fechado, com a prontidão e o que falta.",
    quando: "No 3º e no 8º dia útil do mês, enquanto o mês anterior estiver aberto." },
  { tipo: "regua_cobranca", nome: "Régua de cobrança automática", fala_com: "cliente", canaisPossiveis: ["whatsapp", "email"],
    resumo: "Envia ao cliente o lembrete e os avisos de atraso de cada etapa da régua, identificando a sua empresa.",
    quando: "Na execução diária, só no dia em que o título chega à etapa. A etapa de 60 dias nunca é automática." },
];

export const descricaoDe = (t: TipoAutomacao) => CATALOGO_AUTOMACOES.find((c) => c.tipo === t)!;

/* ========================================================================== */
/* Utilidades                                                                  */
/* ========================================================================== */

const BRL = formatBRL;
/** O valor com o sinal ESCRITO (− U+2212 no negativo; "+" onde se mostra variação). */
const variacao = (v: number) => (v > 0 ? `+${BRL(v)}` : comSinal(v, BRL(v)));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** FNV-1a 32 bits → 8 hex. Curto e estável: a chave do destino não carrega o endereço. */
export function hashCurto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export const ehEmail = (s?: string | null): boolean => !!s && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.trim());
export const soDigitos = (s?: string | null) => String(s ?? "").replace(/\D/g, "");
export const ehTelefone = (s?: string | null): boolean => soDigitos(s).length >= 10;

/** "j***@dominio.com" · "••••-4321". O registro é lido pela empresa inteira. */
export function mascarar(canal: CanalEnvio | "manual", destino: string): string {
  if (canal === "email" || destino.includes("@")) {
    const [u, d] = destino.trim().split("@");
    return `${(u ?? "").slice(0, 1)}***@${d ?? ""}`;
  }
  const dg = soDigitos(destino);
  return dg ? `••••-${dg.slice(-4)}` : "—";
}

const normalizarDestino = (canal: CanalEnvio, d: string) =>
  canal === "email" ? d.trim().toLowerCase() : soDigitos(d);

const semEnvio = (tipo: TipoAutomacao, s: SemEnvio): ResultadoAutomacao =>
  ({ tipo, mensagens: [], conteudos: [], semEnvio: s, pulados: [] });

const temDados = (ctx: ContextoAutomacao) => ctx.input.movements.length > 0;
const SEM_DADOS: SemEnvio = {
  codigo: "sem_dados",
  motivo: "A empresa ainda não tem lançamentos: um resumo agora só teria zeros. Ele começa a sair quando o primeiro dado entrar.",
};

/** Envios que valem como "já feito": avisados de verdade, ou reservados (pendentes). */
const jaFeito = (e: EnvioHistorico) => contaComoAvisado(e.status) || e.status === "pendente";

const rodapePadrao = (ctx: ContextoAutomacao) =>
  `${identificacaoDoCredor(ctx.credor)} · mensagem automática do Quattro. Para mudar o que chega e para quem, abra Configurações › Automações.`;

const linkApp = (ctx: ContextoAutomacao, caminho: string, rotulo: string) =>
  ({ rotulo, url: `${ctx.appUrl.replace(/\/$/, "")}${caminho}` });

/** A versão TEXTO a partir das mesmas peças do HTML — as duas nunca divergem. */
function textoDe(titulo: string, abertura: string | undefined, destaques: LinhaEmail[], secoes: SecaoEmail[], avisos: string[], link?: { url: string }): string {
  const partes: string[] = [titulo];
  if (abertura) partes.push(abertura);
  for (const d of destaques) partes.push(`${d.rotulo}: ${d.valor}${d.detalhe ? ` (${d.detalhe})` : ""}`);
  for (const a of avisos) partes.push(a);
  for (const s of secoes) {
    partes.push(`${s.titulo}:`);
    for (const l of s.linhas) partes.push(`· ${l.rotulo} — ${l.valor}${l.detalhe ? ` (${l.detalhe})` : ""}`);
    if (s.nota) partes.push(s.nota);
  }
  if (link) partes.push(link.url);
  return partes.join("\n");
}

function conteudo(
  ctx: ContextoAutomacao,
  c: {
    chaveBase: string; assunto: string; titulo: string; preheader: string; abertura?: string;
    destaques?: LinhaEmail[]; secoes?: SecaoEmail[]; avisos?: string[];
    link?: { rotulo: string; url: string }; finalidade: FinalidadeTemplate; resumoCurto: string;
  },
): Conteudo {
  const destaques = c.destaques ?? [];
  const secoes = c.secoes ?? [];
  const avisos = c.avisos ?? [];
  const aviso = ctx.truncado ? ["A base tem mais de 5.000 lançamentos; este resumo considera os 5.000 mais recentes."] : [];
  return {
    chaveBase: c.chaveBase,
    assunto: c.assunto,
    texto: textoDe(c.titulo, c.abertura, destaques, secoes, [...avisos, ...aviso], c.link),
    html: montarHtml({
      preheader: c.preheader, titulo: c.titulo, abertura: c.abertura, destaques, secoes,
      avisos: [...avisos, ...aviso], link: c.link, rodape: rodapePadrao(ctx),
    }),
    finalidade: c.finalidade,
    // Template de uma variável só: o texto curto, numa linha (a Meta recusa
    // quebra de linha dentro de variável).
    variaveis: { "1": c.resumoCurto.replace(/\s+/g, " ").slice(0, 900) },
  };
}

/* ========================================================================== */
/* (a) RESUMO DO CAIXA — diário e semanal                                      */
/* ========================================================================== */

const vencidosAReceber = (input: RiskInput) =>
  input.movements.filter((m) => ehContaAReceber(m) && previsto(m) && (m.due_date?.slice(0, 10) ?? "") < input.hoje.slice(0, 10));

export function redigirResumoDiario(ctx: ContextoAutomacao, opts: { ignorarCalendario?: boolean } = {}): Conteudo | SemEnvio {
  if (!temDados(ctx)) return SEM_DADOS;
  if (!opts.ignorarCalendario && !diaUtil(ctx.hoje)) {
    return { codigo: "fora_do_dia", motivo: "O resumo diário sai só em dia útil." };
  }
  const { input } = ctx;
  const hojeJ = janelaHoje(ctx.hoje);
  const s = saldo(input, hojeJ);
  const entra = previstoNaJanela(input, hojeJ, "entrada");
  const sai = previstoNaJanela(input, hojeJ, "saida");
  const vr = vencidosAReceber(input);
  const vrTotal = vr.reduce((t, m) => t + magnitude(m), 0);
  const vp = vencidoEmAberto(input, "saida");
  const liq = calcularLiquidezProjetada({ ...input, hoje: ctx.hoje, horizonDias: 30 });

  const destaques: LinhaEmail[] = [
    // Saldo é POSIÇÃO: é o único número que existe mesmo sem movimento no dia.
    { rotulo: "Saldo em conta hoje", valor: comSinal(s.valor, BRL(s.valor)) },
  ];
  const linhasHoje: LinhaEmail[] = [
    entra.procedencia.lancamentos === 0
      ? { rotulo: "A receber hoje", valor: "nada vence hoje" }
      : { rotulo: "A receber hoje", valor: BRL(entra.valor), detalhe: plural(entra.procedencia.lancamentos, "título", "títulos") },
    sai.procedencia.lancamentos === 0
      ? { rotulo: "A pagar hoje", valor: "nada vence hoje" }
      : { rotulo: "A pagar hoje", valor: BRL(sai.valor), detalhe: plural(sai.procedencia.lancamentos, "título", "títulos") },
  ];
  const linhasVencidos: LinhaEmail[] = [
    vr.length === 0
      ? { rotulo: "Vencidos a receber", valor: "nenhum" }
      : { rotulo: "Vencidos a receber", valor: BRL(vrTotal), detalhe: plural(vr.length, "título", "títulos") },
    vp.procedencia.lancamentos === 0
      ? { rotulo: "Vencidos a pagar", valor: "nenhum" }
      : { rotulo: "Vencidos a pagar", valor: BRL(vp.valor), detalhe: plural(vp.procedencia.lancamentos, "título", "títulos") },
  ];
  if (ctx.aprovacoesPendentes !== null) {
    linhasVencidos.push({
      rotulo: "Aprovações pendentes",
      valor: ctx.aprovacoesPendentes === 0 ? "nenhuma" : plural(ctx.aprovacoesPendentes, "aguardando", "aguardando"),
    });
  }
  const avisos: string[] = [];
  if (liq.rupturaDia !== null) {
    const d = somarDias(ctx.hoje, liq.rupturaDia);
    avisos.push(`No ritmo agendado, o caixa ficaria negativo em ${dataBRcurta(d)}${liq.rupturaDia === 0 ? " (hoje)" : ` (daqui a ${plural(liq.rupturaDia, "dia", "dias")})`}.`);
  }
  const resumoCurto = `Saldo ${comSinal(s.valor, BRL(s.valor))}. Hoje: recebe ${entra.procedencia.lancamentos ? BRL(entra.valor) : "nada"}, paga ${sai.procedencia.lancamentos ? BRL(sai.valor) : "nada"}. Vencidos: ${vr.length ? BRL(vrTotal) : "nenhum"} a receber, ${vp.procedencia.lancamentos ? BRL(vp.valor) : "nenhum"} a pagar.${avisos[0] ? ` ${avisos[0]}` : ""}`;
  return conteudo(ctx, {
    chaveBase: `dia:${ctx.hoje}`,
    assunto: `Caixa de ${dataBRcurta(ctx.hoje)}: saldo ${comSinal(s.valor, BRL(s.valor))}`,
    titulo: `Caixa de ${diaMes(ctx.hoje)}`,
    preheader: resumoCurto,
    destaques,
    secoes: [{ titulo: "Hoje", linhas: linhasHoje }, { titulo: "Em aberto", linhas: linhasVencidos }],
    avisos,
    link: linkApp(ctx, "/", "Abrir a Visão geral"),
    finalidade: "resumo_diario",
    resumoCurto,
  });
}

export function redigirResumoSemanal(ctx: ContextoAutomacao, opts: { ignorarCalendario?: boolean } = {}): Conteudo | SemEnvio {
  if (!temDados(ctx)) return SEM_DADOS;
  if (!opts.ignorarCalendario && !primeiroDiaUtilDaSemana(ctx.hoje)) {
    return { codigo: "fora_do_dia", motivo: "O resumo semanal sai no primeiro dia útil da semana." };
  }
  const { input } = ctx;
  const seg = segundaDaSemana(ctx.hoje);
  const passada = janela(somarDias(seg, -7), somarDias(seg, -1), "semana passada");
  const retrasada = janela(somarDias(seg, -14), somarDias(seg, -8), "semana anterior");
  const estaSemana = janela(seg, somarDias(seg, 6), "esta semana");
  const r1 = resultado(input, passada, "caixa");
  const r0 = resultado(input, retrasada, "caixa");

  const destaques: LinhaEmail[] = [
    temValor(r1)
      ? { rotulo: "Resultado da semana passada", valor: variacao(r1.valor),
          detalhe: temValor(r0) ? `contra ${variacao(r0.valor)} na semana anterior` : "sem lançamentos liquidados na semana anterior" }
      : { rotulo: "Resultado da semana passada", valor: "sem lançamentos liquidados" },
  ];
  const recebimentos = input.movements
    .filter((m) => ehContaAReceber(m) && liquidado(m) && !!m.paid_date && m.paid_date >= passada.de && m.paid_date <= passada.ate)
    .sort((a, b) => magnitude(b) - magnitude(a)).slice(0, 3);
  const nome = (m: RiskMovement) => (m.party_id && input.partyNames?.[m.party_id]) || m.category || "Sem contraparte";
  const aPagarSemana = previstoNaJanela(input, estaSemana, "saida");
  const venceramSemPagar = input.movements.filter((m) => previsto(m) && !cancelado(m)
    && m.due_date >= passada.de && m.due_date <= passada.ate);
  const vsp = { receber: venceramSemPagar.filter(ehContaAReceber), pagar: venceramSemPagar.filter((m) => m.type === "saida") };
  const secoes: SecaoEmail[] = [
    { titulo: "Maiores recebimentos da semana passada",
      linhas: recebimentos.length
        ? recebimentos.map((m) => ({ rotulo: nome(m), valor: BRL(magnitude(m)), detalhe: dataBRcurta(m.paid_date ?? m.due_date) }))
        : [{ rotulo: "Nenhum recebimento liquidado", valor: "—" }] },
    { titulo: "Esta semana", linhas: [
      aPagarSemana.procedencia.lancamentos === 0
        ? { rotulo: "Contas a pagar", valor: "nada vence esta semana" }
        : { rotulo: "Contas a pagar", valor: BRL(aPagarSemana.valor), detalhe: plural(aPagarSemana.procedencia.lancamentos, "título", "títulos") },
    ] },
    { titulo: "Venceram na semana passada sem baixa", linhas: [
      vsp.receber.length
        ? { rotulo: "A receber", valor: BRL(vsp.receber.reduce((t, m) => t + magnitude(m), 0)), detalhe: plural(vsp.receber.length, "título", "títulos") }
        : { rotulo: "A receber", valor: "nenhum" },
      vsp.pagar.length
        ? { rotulo: "A pagar", valor: BRL(vsp.pagar.reduce((t, m) => t + magnitude(m), 0)), detalhe: plural(vsp.pagar.length, "título", "títulos") }
        : { rotulo: "A pagar", valor: "nenhum" },
    ] },
  ];
  const resumoCurto = `Semana passada: ${temValor(r1) ? variacao(r1.valor) : "sem lançamentos liquidados"}. Esta semana vencem ${aPagarSemana.procedencia.lancamentos ? BRL(aPagarSemana.valor) : "nenhuma conta"} a pagar.`;
  return conteudo(ctx, {
    chaveBase: `semana:${seg}`,
    assunto: `Semana de ${diaMes(passada.de)} a ${diaMes(passada.ate)}: ${temValor(r1) ? variacao(r1.valor) : "sem movimento liquidado"}`,
    titulo: `Semana de ${diaMes(passada.de)} a ${diaMes(passada.ate)}`,
    preheader: resumoCurto,
    destaques, secoes,
    link: linkApp(ctx, "/fluxo-caixa", "Abrir o fluxo de caixa"),
    finalidade: "resumo_diario",
    resumoCurto,
  });
}

/* ========================================================================== */
/* (b) LEMBRETE DE CONTAS A PAGAR                                             */
/* ========================================================================== */

/** Até quando o lembrete olha: o próximo dia útil — e, na sexta, a semana seguinte. */
export function janelaDoLembrete(hoje: string): { de: string; ate: string } {
  if (diaDaSemana(hoje) === 5) return { de: hoje, ate: somarDias(hoje, 9) };
  return { de: hoje, ate: proximoDiaUtil(hoje) };
}

export function redigirLembretePagar(ctx: ContextoAutomacao, opts: { ignorarCalendario?: boolean } = {}): Conteudo | SemEnvio {
  if (!temDados(ctx)) return SEM_DADOS;
  if (!opts.ignorarCalendario && !diaUtil(ctx.hoje)) {
    return { codigo: "fora_do_dia", motivo: "O lembrete sai só em dia útil." };
  }
  const { input } = ctx;
  const { de, ate } = janelaDoLembrete(ctx.hoje);
  // ⚠️ As definições são as do PAINEL de contas a pagar ("vence hoje" é A
  // VENCER), e o recorte das vencidas é a carteira inteira até ontem.
  const aVencer = montarPainelContasPagar(input, { de, ate }).aVencer.contas;
  const vencidas = montarPainelContasPagar(input, { de: "0000-01-01", ate: somarDias(ctx.hoje, -1) }).atrasadas.contas;
  if (aVencer.length === 0 && vencidas.length === 0) {
    return { codigo: "nada_a_avisar", motivo: `Nenhuma conta a pagar vence até ${dataBRcurta(ate)} e nenhuma está em atraso.` };
  }
  // Agrupado por DATA: a pergunta é "o que sai no dia 20", não "o que devo ao fornecedor X".
  const porData = new Map<string, ContaDoCard[]>();
  for (const c of aVencer) porData.set(c.data, [...(porData.get(c.data) ?? []), c]);
  const datas = Array.from(porData.keys()).sort();
  const soma = (cs: ContaDoCard[]) => cs.reduce((t, c) => t + c.valor, 0);
  const rotuloDia = (d: string) => (d === ctx.hoje ? `Vence hoje (${diaMes(d)})` : `Vence em ${dataBRcurta(d)}`);
  const secoes: SecaoEmail[] = datas.map((d) => ({
    titulo: `${rotuloDia(d)} · ${BRL(soma(porData.get(d)!))}`,
    linhas: porData.get(d)!.map((c) => ({ rotulo: c.contraparte, valor: BRL(c.valor), detalhe: c.categoria })),
  }));
  if (vencidas.length) {
    secoes.push({
      titulo: `Já venceram · ${BRL(soma(vencidas))}`,
      linhas: vencidas.slice(0, 15).map((c) => ({ rotulo: c.contraparte, valor: BRL(c.valor), detalhe: `venceu em ${dataBRcurta(c.data)} · ${plural(c.diasAtraso ?? 0, "dia", "dias")} de atraso` })),
      nota: vencidas.length > 15 ? `E mais ${vencidas.length - 15} — a lista completa está em Títulos a pagar.` : undefined,
    });
  }
  // A conta de onde sai: avisar quando o saldo DELA não cobre o que ela tem de pagar.
  const porConta = new Map<string, number>();
  const movPorId = new Map(input.movements.map((m) => [m.id, m]));
  for (const c of [...aVencer, ...vencidas]) {
    const conta = movPorId.get(c.id)?.accountId;
    if (conta) porConta.set(conta, (porConta.get(conta) ?? 0) + c.valor);
  }
  const avisos: string[] = [];
  porConta.forEach((devido, contaId) => {
    const conta = ctx.contas.find((x) => x.id === contaId);
    if (conta && conta.saldo < devido) {
      avisos.push(`O saldo da conta ${conta.nome} (${comSinal(conta.saldo, BRL(conta.saldo))}) não cobre os ${BRL(devido)} que saem dela nesta lista.`);
    }
  });
  const total = soma(aVencer);
  const resumoCurto = `${aVencer.length ? `A pagar até ${diaMes(ate)}: ${BRL(total)} (${plural(aVencer.length, "conta", "contas")})` : "Nada a pagar nos próximos dias"}${vencidas.length ? `; em atraso: ${BRL(soma(vencidas))} (${plural(vencidas.length, "conta", "contas")})` : ""}.`;
  return conteudo(ctx, {
    chaveBase: `dia:${ctx.hoje}`,
    assunto: aVencer.length
      ? `Contas a pagar até ${diaMes(ate)}: ${BRL(total)}`
      : `Contas a pagar em atraso: ${BRL(soma(vencidas))}`,
    titulo: diaDaSemana(ctx.hoje) === 5 ? "Contas da próxima semana" : "Contas a pagar",
    preheader: resumoCurto,
    abertura: aVencer.length
      ? `${plural(aVencer.length, "conta vence", "contas vencem")} até ${dataBRcurta(ate)}, somando ${BRL(total)}.`
      : "Nenhuma conta vence nos próximos dias.",
    secoes, avisos,
    link: linkApp(ctx, "/contas-a-pagar/titulos", "Abrir os títulos a pagar"),
    finalidade: "lembrete_pagar",
    resumoCurto,
  });
}

/* ========================================================================== */
/* (c) ALERTA DE CAIXA                                                         */
/* ========================================================================== */

export type FaixaAlerta = "hoje" | "3" | "7" | "15" | "30";

/** A faixa de um prazo em dias. Reenvia-se só quando ela MUDA. */
export function faixaDe(dias: number): FaixaAlerta {
  if (dias <= 0) return "hoje";
  if (dias <= 3) return "3";
  if (dias <= 7) return "7";
  if (dias <= 15) return "15";
  return "30";
}

export const HORIZONTES_ALERTA = [7, 15, 30] as const;
const JANELA_REPETICAO_DIAS = 7;

export function redigirAlertaCaixa(ctx: ContextoAutomacao, p: ParametrosAutomacao, opts: { ignorarHistorico?: boolean } = {}): Conteudo | SemEnvio {
  if (!temDados(ctx)) return SEM_DADOS;
  const N = HORIZONTES_ALERTA.includes(p.horizonteDias as 7) ? (p.horizonteDias as number) : 15;
  const minimo = Math.max(0, Number(p.saldoMinimo ?? 0));
  const input: RiskInput = { ...ctx.input, hoje: ctx.hoje, horizonDias: N };
  const liq = calcularLiquidezProjetada(input);

  let dia: number | null = null;
  let tipo: "negativo" | "minimo" = "negativo";
  if (liq.rupturaDia !== null && liq.rupturaDia <= N) dia = liq.rupturaDia;
  else if (minimo > 0) {
    const i = liq.pontos.findIndex((pt) => pt.saldo < minimo);
    if (i >= 0) { dia = i; tipo = "minimo"; }
  }
  if (dia === null) {
    return { codigo: "nada_a_avisar", motivo: `No ritmo agendado, o caixa não fica ${minimo > 0 ? `abaixo de ${BRL(minimo)}` : "negativo"} nos próximos ${N} dias.` };
  }
  const faixa = faixaDe(dia);
  const chaveFaixa = `${tipo === "minimo" ? "min" : "neg"}-${faixa}`;
  if (!opts.ignorarHistorico) {
    const limite = somarDias(ctx.hoje, -JANELA_REPETICAO_DIAS);
    const repetido = ctx.envios.some((e) => e.tipo === "alerta_caixa" && jaFeito(e)
      && e.chave.startsWith(`faixa:${chaveFaixa}:`) && e.em.slice(0, 10) > limite);
    if (repetido) {
      return { codigo: "faixa_ja_avisada", motivo: "O aviso desta faixa já saiu nos últimos 7 dias; ele volta quando a situação mudar de faixa." };
    }
  }
  const data = somarDias(ctx.hoje, dia);
  const projetado = liq.pontos[dia]?.saldo ?? 0;
  // ⚠️ A projeção pondera cada recebimento pela chance de ele entrar. O valor
  // NOMINAL (todo mundo pagando em dia) vai ao lado, senão a pessoa confere na
  // tela de saldo projetado e acha outro número.
  const nominal = saldoEm(ctx.input, data);
  const quando = dia === 0 ? "hoje" : `em ${dataBRcurta(data)} (daqui a ${plural(dia, "dia", "dias")})`;
  const frase = tipo === "negativo"
    ? `No ritmo agendado, o caixa ficaria negativo ${quando}: saldo projetado de ${comSinal(projetado, BRL(projetado))}.`
    : `No ritmo agendado, o caixa ficaria abaixo do mínimo de ${BRL(minimo)} ${quando}: saldo projetado de ${comSinal(projetado, BRL(projetado))}.`;
  const saidas = ctx.input.movements
    .filter((m) => m.type === "saida" && previsto(m) && m.due_date >= ctx.hoje && m.due_date <= data)
    .sort((a, b) => magnitude(b) - magnitude(a)).slice(0, 3);
  const entradas = ctx.input.movements
    .filter((m) => ehContaAReceber(m) && previsto(m) && m.due_date > data)
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || magnitude(b) - magnitude(a)).slice(0, 3);
  const nome = (m: RiskMovement) => (m.party_id && ctx.input.partyNames?.[m.party_id]) || m.category || "Sem contraparte";
  const ponte = ponteRupturaRunway(input, liq.rupturaDia);
  const avisos = [frase];
  if (ponte.pareceContradicao && ponte.explicacao) avisos.push(ponte.explicacao);
  const secoes: SecaoEmail[] = [
    { titulo: "As maiores saídas até lá", linhas: saidas.length
      ? saidas.map((m) => ({ rotulo: nome(m), valor: BRL(magnitude(m)), detalhe: `vence em ${dataBRcurta(m.due_date)}` }))
      : [{ rotulo: "Nenhuma saída agendada até a data", valor: "—" }] },
    { titulo: "Recebimentos que resolveriam se antecipados", linhas: entradas.length
      ? entradas.map((m) => ({ rotulo: nome(m), valor: BRL(magnitude(m)), detalhe: `vence em ${dataBRcurta(m.due_date)}` }))
      : [{ rotulo: "Nenhum recebimento agendado depois da data", valor: "—" }],
      nota: `Sem descontar o risco de atraso dos recebimentos, o saldo nesse dia seria de ${comSinal(nominal, BRL(nominal))}.` },
  ];
  return conteudo(ctx, {
    chaveBase: `faixa:${chaveFaixa}:${ctx.hoje}`,
    assunto: tipo === "negativo"
      ? `Alerta de caixa: negativo ${dia === 0 ? "hoje" : `em ${diaMes(data)}`}, no ritmo agendado`
      : `Alerta de caixa: abaixo do mínimo ${dia === 0 ? "hoje" : `em ${diaMes(data)}`}`,
    titulo: "Alerta de caixa",
    preheader: frase,
    avisos, secoes,
    link: linkApp(ctx, "/fluxo-caixa", "Abrir o fluxo de caixa"),
    finalidade: "alerta_caixa",
    resumoCurto: frase,
  });
}

/* ========================================================================== */
/* (d) AVISO DE FECHAMENTO DO MÊS                                              */
/* ========================================================================== */

export function redigirFechamento(ctx: ContextoAutomacao, p: ParametrosAutomacao, opts: { ignorarCalendario?: boolean } = {}): Conteudo | SemEnvio {
  if (!temDados(ctx)) return SEM_DADOS;
  const mesAtual = ctx.hoje.slice(0, 7);
  const dias = (p.diasUteis?.length ? p.diasUteis : [3, 8]).filter((n) => Number.isInteger(n) && n >= 1 && n <= 22);
  const n = dias.find((k) => diaUtilDoMes(mesAtual, k) === ctx.hoje);
  if (!opts.ignorarCalendario && n === undefined) {
    return { codigo: "fora_do_dia", motivo: `O aviso sai no ${dias.map((k) => `${k}º`).join(" e no ")} dia útil do mês.` };
  }
  const mes = mesAnterior(mesAtual);
  if (ctx.mesesTravados.includes(mes)) {
    return { codigo: "mes_fechado", motivo: `${nomeDoMes(mes)} já está fechado e travado.` };
  }
  const f = montarFechamento(ctx.input, mes, { travado: false, tarefasManuais: {} });
  const cob = coberturaCompetencia(ctx.input, janelaDoMesDe(`${mes}-01`));
  const semCategoria = ctx.input.movements.filter((m) => !cancelado(m) && (m.due_date ?? "").slice(0, 7) === mes && !m.category).length;
  const pendentes = f.tarefas.filter((t) => t.status !== "ok");
  const provisao = f.sugestoes.reduce((t, s) => t + s.valorSugerido, 0);
  const pctPronto = `${Math.round(f.prontidao * 100)}%`;
  const secoes: SecaoEmail[] = [
    { titulo: "O que falta", linhas: pendentes.length
      ? pendentes.map((t) => ({ rotulo: t.titulo, valor: t.status === "atencao" ? "atenção" : "pendente", detalhe: t.detalhe ?? t.descricao }))
      : [{ rotulo: "Todas as tarefas estão em dia", valor: "—" }] },
    { titulo: "Qualidade do mês", linhas: [
      { rotulo: "Lançamentos sem categoria", valor: semCategoria === 0 ? "nenhum" : String(semCategoria) },
      { rotulo: "Com data de competência", valor: cob.cobertura === null ? "sem lançamentos no mês" : `${Math.round(cob.cobertura * 100)}%`,
        detalhe: cob.cobertura === null ? undefined : `${cob.comCompetencia} de ${cob.total}` },
      f.sugestoes.length
        ? { rotulo: "Provisão sugerida", valor: BRL(provisao), detalhe: plural(f.sugestoes.length, "categoria recorrente ausente", "categorias recorrentes ausentes") }
        : { rotulo: "Provisão sugerida", valor: "nenhuma" },
    ] },
  ];
  const resumoCurto = `${nomeDoMes(mes)} ainda não foi fechado: ${pctPronto} pronto, ${plural(pendentes.length, "tarefa pendente", "tarefas pendentes")}.`;
  return conteudo(ctx, {
    chaveBase: `mes:${mes}:du${n ?? 0}`,
    assunto: `Fechamento de ${nomeDoMes(mes)} pendente (${pctPronto} pronto)`,
    titulo: `Fechamento de ${nomeDoMes(mes)}`,
    preheader: resumoCurto,
    abertura: `O mês ainda não foi fechado e travado. Prontidão: ${pctPronto}.`,
    secoes,
    link: linkApp(ctx, "/dashboard/reports/monthly-closing", "Abrir o fechamento"),
    finalidade: "fechamento_pendente",
    resumoCurto,
  });
}

/* ========================================================================== */
/* (e) RÉGUA DE COBRANÇA AUTOMÁTICA                                            */
/* ========================================================================== */

/** O registro da régua (título × etapa) que o histórico carrega. */
export function enviosDaRegua(envios: EnvioHistorico[]): EnvioRegistrado[] {
  const out: EnvioRegistrado[] = [];
  for (const e of envios) {
    if (e.tipo !== "regua_cobranca" || !contaComoAvisado(e.status)) continue;
    const m = /^titulo:(.+):([^:]+)$/.exec(e.chave);
    if (m) out.push({ movimentoId: m[1], etapaId: m[2], em: e.em, canal: e.canal === "manual" ? "manual" : e.canal });
  }
  return out;
}

export const chaveDoTitulo = (movimentoId: string, etapaId: string) => `titulo:${movimentoId}:${etapaId}`;
export const chaveDoClienteNoDia = (cliente: string, dia: string) => `cliente:${cliente}:${dia}`;

/** Teto dos encargos da régua (fração): 2% de multa, 1% ao mês de juros de mora (CDC). */
export const TETO_MULTA = 0.02;
export const TETO_JUROS_MES = 0.01;

const txidDe = (s: string) => s.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) || "COBRANCA";

export interface GrupoRegua { clienteChave: string; cliente: string; partyId: string | null; itens: ItemRegua[] }

/**
 * A fila AUTOMÁTICA de hoje, por cliente: só o que chega à etapa HOJE, nunca a
 * etapa manual, nunca o pausado, nunca quem já foi cobrado hoje por outra porta.
 */
export function filaAutomatica(ctx: ContextoAutomacao, p: ParametrosAutomacao): { grupos: GrupoRegua[]; pausados: string[]; jaCobrados: string[] } {
  const painel = montarRegua({ ...ctx.input, hoje: ctx.hoje }, enviosDaRegua(ctx.envios), undefined, { credor: ctx.credor });
  const pausas = (p.pausas ?? []).filter((x) => x.ate >= ctx.hoje);
  const pausado = (i: ItemRegua) => pausas.some((x) =>
    (x.alvo === "titulo" && x.id === i.movimentoId) || (x.alvo === "cliente" && !!i.partyId && x.id === i.partyId));
  const clienteChave = (i: ItemRegua) => i.partyId ?? `nome:${i.cliente.toLowerCase()}`;
  const cobradoHoje = new Set(ctx.envios
    .filter((e) => e.tipo === "regua_cobranca" && jaFeito(e) && e.chave.startsWith("cliente:") && e.chave.endsWith(`:${ctx.hoje}`))
    .map((e) => e.chave.slice("cliente:".length, -(ctx.hoje.length + 1))));

  // ⚠️ D+60 (canal manual) NUNCA sai sozinho: protesto e negativação são
  // decisões com efeito jurídico, e o calendário não decide isso.
  const candidatos = painel.filaDeHoje.filter((i) => i.hoje && i.etapa.canal !== "manual" && !i.jaEnviado);
  const pausados = candidatos.filter(pausado).map((i) => i.movimentoId);
  const jaCobrados: string[] = [];
  const grupos = new Map<string, GrupoRegua>();
  for (const i of candidatos) {
    if (pausado(i)) continue;
    const k = clienteChave(i);
    if (cobradoHoje.has(k)) { jaCobrados.push(i.movimentoId); continue; }
    const g = grupos.get(k) ?? { clienteChave: k, cliente: i.cliente, partyId: i.partyId, itens: [] };
    g.itens.push(i);
    grupos.set(k, g);
  }
  return { grupos: Array.from(grupos.values()), pausados, jaCobrados };
}

/** A mensagem de UM cliente, com todos os títulos do dia — uma mensagem por dia, não uma por título. */
export function redigirCobranca(ctx: ContextoAutomacao, g: GrupoRegua, p: ParametrosAutomacao): Conteudo {
  const itens = [...g.itens].sort((a, b) => b.dias - a.dias || a.vencimento.localeCompare(b.vencimento));
  // O tom é o da etapa MAIS avançada entre os títulos do cliente.
  const etapa = itens[0].etapa;
  const credor = identificacaoDoCredor(ctx.credor);
  // ⚠️ O TETO mora AQUI, não só no campo da tela: os parâmetros chegam do banco
  // e qualquer escritor (API, SQL, versão futura da tela) pode gravar `2` onde
  // se queria 2% — e o cliente receberia uma multa de 200%. Multa de 2% e juros
  // de 1% ao mês são o limite do CDC; acima disso, vale o limite.
  const multa = Math.min(TETO_MULTA, Math.max(0, Number(p.multaPct ?? 0) || 0));
  const juros = Math.min(TETO_JUROS_MES, Math.max(0, Number(p.jurosMesPct ?? 0) || 0));
  const comEncargo = multa > 0 || juros > 0;
  const linhas: LinhaEmail[] = itens.map((i) => {
    const mora = comEncargo && i.dias > 0 ? calcularMora(i.valor, i.dias, multa, juros) : null;
    return {
      rotulo: `Vencimento ${dataBRcurta(i.vencimento)}${i.dias > 0 ? ` · ${plural(i.dias, "dia", "dias")} de atraso` : i.dias === 0 ? " · vence hoje" : ""}`,
      valor: BRL(mora ? mora.totalCorrigido : i.valor),
      detalhe: mora ? `${BRL(i.valor)} + ${BRL(mora.totalEncargos)} de multa e juros de mora` : undefined,
    };
  });
  const total = itens.reduce((t, i) => t + (comEncargo && i.dias > 0 ? calcularMora(i.valor, i.dias, multa, juros).totalCorrigido : i.valor), 0);
  const chavePix = String(p.chavePix ?? "").trim();
  const pix = chavePix
    ? gerarPixCopiaECola({ chave: chavePix, valor: total, nome: ctx.credor.razaoSocial || ctx.credor.nome, cidade: p.cidadePix || "BRASIL",
        txid: txidDe(itens.length === 1 ? itens[0].movimentoId : `${g.clienteChave}${ctx.hoje}`) })
    : null;
  const intro = etapa.tom === "formal"
    ? `Prezado(a) ${g.cliente}, ${credor} informa que ${itens.length === 1 ? "consta em aberto o título abaixo" : `constam em aberto os ${itens.length} títulos abaixo`}.`
    : etapa.dia < 0
      ? `Olá, ${g.cliente}. Aqui é ${credor}. Lembramos ${itens.length === 1 ? "do pagamento abaixo" : "dos pagamentos abaixo"}.`
      : etapa.dia === 0
        ? `Olá, ${g.cliente}. Aqui é ${credor}. ${itens.length === 1 ? "O pagamento abaixo vence hoje" : "Os pagamentos abaixo vencem ou estão em aberto"}.`
        : `Olá, ${g.cliente}. Aqui é ${credor}. Não identificamos ${itens.length === 1 ? "o pagamento abaixo" : "os pagamentos abaixo"}.`;
  const secoes: SecaoEmail[] = [{ titulo: itens.length === 1 ? "Título" : `Títulos · total ${BRL(total)}`, linhas }];
  if (pix) secoes.push({ titulo: "PIX copia e cola", linhas: [{ rotulo: pix, valor: BRL(total) }] });
  const texto = [
    intro,
    ...linhas.map((l) => `· ${l.rotulo}: ${l.valor}${l.detalhe ? ` (${l.detalhe})` : ""}`),
    itens.length > 1 ? `Total: ${BRL(total)}.` : "",
    pix ? `PIX copia e cola: ${pix}` : "",
    SE_JA_PAGOU,
  ].filter(Boolean).join("\n");
  const primeiro = itens[0];
  return {
    chaveBase: chaveDoClienteNoDia(g.clienteChave, ctx.hoje),
    assunto: etapa.tom === "formal" ? `Aviso de débito em aberto — ${credor}` : `Lembrete de pagamento — ${credor}`,
    texto,
    html: montarHtml({
      preheader: `${credor}: ${BRL(total)} ${itens.length === 1 ? "em aberto" : `em ${itens.length} títulos`}.`,
      titulo: etapa.tom === "formal" ? "Aviso de débito em aberto" : "Lembrete de pagamento",
      abertura: intro, secoes, avisos: [SE_JA_PAGOU],
      rodape: `${credor}. Mensagem enviada em nome da empresa credora pelo Quattro.`,
    }),
    finalidade: FINALIDADE_DO_TOM[etapa.tom],
    variaveis: {
      "1": g.cliente, "2": credor, "3": BRL(total),
      "4": dataBRcurta(primeiro.vencimento), "5": String(Math.max(0, primeiro.dias)),
    },
    contatoId: g.partyId ?? undefined,
    chavesExtras: itens.map((i) => chaveDoTitulo(i.movimentoId, i.etapa.id)),
    canalPreferido: etapa.canal === "email" ? "email" : "whatsapp",
  };
}

/* ========================================================================== */
/* A saída: conteúdo → mensagens, com destino e chave                          */
/* ========================================================================== */

/** O conteúdo de uma automação de EMPRESA (as quatro que falam com o dono). */
export function redigir(cfg: ConfigAutomacao, ctx: ContextoAutomacao, opts: { previa?: boolean } = {}): Conteudo | SemEnvio {
  const o = { ignorarCalendario: !!opts.previa, ignorarHistorico: !!opts.previa };
  switch (cfg.tipo) {
    case "resumo_diario": return redigirResumoDiario(ctx, o);
    case "resumo_semanal": return redigirResumoSemanal(ctx, o);
    case "lembrete_pagar": return redigirLembretePagar(ctx, o);
    case "alerta_caixa": return redigirAlertaCaixa(ctx, cfg.parametros, o);
    case "fechamento_pendente": return redigirFechamento(ctx, cfg.parametros, o);
    case "regua_cobranca": {
      const { grupos } = filaAutomatica(ctx, cfg.parametros);
      if (!grupos.length) return { codigo: "nada_a_avisar", motivo: "Nenhum cliente chega a uma etapa automática da régua hoje." };
      return redigirCobranca(ctx, grupos[0], cfg.parametros);
    }
  }
}

export const ehSemEnvio = (x: Conteudo | SemEnvio): x is SemEnvio => "codigo" in x;

function envelope(tipo: TipoAutomacao, c: Conteudo, canal: CanalEnvio, destino: string): MensagemAutomacao {
  const normal = normalizarDestino(canal, destino);
  return {
    tipo, canal, destino: destino.trim(), destinoMascarado: mascarar(canal, destino),
    // ⚠️ A chave da régua é do CLIENTE no dia (uma mensagem por dia); a das
    // automações da empresa leva o DESTINO, porque dois administradores
    // recebem o mesmo resumo e cada um é um envio.
    chave: tipo === "regua_cobranca" ? c.chaveBase : `${c.chaveBase}:${hashCurto(normal)}`,
    assunto: c.assunto, texto: c.texto, html: c.html, finalidade: c.finalidade, variaveis: c.variaveis,
    chavesExtras: c.chavesExtras,
  };
}

/**
 * As mensagens que sairiam HOJE para uma automação, com destino e chave.
 *
 * ⚠️ Desligada não gera nada — tudo nasce desligado, e ligar é ato de alguém.
 * ⚠️ O e-mail do destinatário vem do MEMBRO (quem é titular/admin hoje), não da
 * configuração: quem saiu da empresa para de receber na execução seguinte.
 */
export function gerarMensagens(cfg: ConfigAutomacao, ctx: ContextoAutomacao): ResultadoAutomacao {
  if (!cfg.ativo) return semEnvio(cfg.tipo, { codigo: "desligada", motivo: "A automação está desligada." });
  const pulados: { alvo: string; motivo: string }[] = [];

  if (cfg.tipo === "regua_cobranca") {
    const { grupos } = filaAutomatica(ctx, cfg.parametros);
    if (!grupos.length) return semEnvio(cfg.tipo, { codigo: "nada_a_avisar", motivo: "Nenhum cliente chega a uma etapa automática da régua hoje." });
    const mensagens: MensagemAutomacao[] = [];
    const conteudos: Conteudo[] = [];
    for (const g of grupos) {
      const c = redigirCobranca(ctx, g, cfg.parametros);
      const contato = g.partyId ? ctx.contatos[g.partyId] : undefined;
      const tem = { whatsapp: ehTelefone(contato?.telefone) && cfg.canais.includes("whatsapp"), email: ehEmail(contato?.email) && cfg.canais.includes("email") };
      // O canal da etapa; sem o contato dele, o outro canal ligado.
      const canal: CanalEnvio | null = tem[c.canalPreferido ?? "whatsapp"] ? (c.canalPreferido ?? "whatsapp")
        : tem.whatsapp ? "whatsapp" : tem.email ? "email" : null;
      if (!canal) { pulados.push({ alvo: g.cliente, motivo: "sem telefone nem e-mail no cadastro do contato" }); continue; }
      conteudos.push(c);
      mensagens.push(envelope(cfg.tipo, c, canal, canal === "email" ? contato!.email! : contato!.telefone!));
    }
    return { tipo: cfg.tipo, mensagens, conteudos, pulados, ...(mensagens.length ? {} : { semEnvio: { codigo: "sem_contato" as const, motivo: "Os clientes da fila de hoje não têm telefone nem e-mail cadastrado." } }) };
  }

  const c = redigir(cfg, ctx);
  if (ehSemEnvio(c)) return semEnvio(cfg.tipo, c);
  const mensagens: MensagemAutomacao[] = [];
  const vistos = new Set<string>();
  for (const d of cfg.destinatarios) {
    const m = ctx.membros.find((x) => x.userId === d.userId);
    if (!m) { pulados.push({ alvo: d.nome || "destinatário", motivo: "não é mais titular nem administrador da empresa" }); continue; }
    const alvos: [CanalEnvio, string | null | undefined, boolean][] = [
      ["email", m.email, cfg.canais.includes("email") && d.email_ativo !== false],
      ["whatsapp", d.telefone, cfg.canais.includes("whatsapp") && !!d.whatsapp_ativo],
    ];
    for (const [canal, destino, ligado] of alvos) {
      if (!ligado) continue;
      const valido = canal === "email" ? ehEmail(destino) : ehTelefone(destino);
      if (!valido) { pulados.push({ alvo: m.nome || m.email || "membro", motivo: canal === "email" ? "sem e-mail válido" : "sem telefone de WhatsApp" }); continue; }
      const k = `${canal}|${normalizarDestino(canal, destino!)}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      mensagens.push(envelope(cfg.tipo, c, canal, destino!));
    }
  }
  return {
    tipo: cfg.tipo, mensagens, conteudos: [c], pulados,
    ...(mensagens.length ? {} : { semEnvio: { codigo: "sem_destinatario" as const, motivo: "Nenhum destinatário válido: escolha quem recebe entre os titulares e administradores." } }),
  };
}

/** A prévia: o conteúdo que SAIRIA, ignorando calendário e histórico (a tela mostra mesmo fora do dia). */
export function previa(cfg: ConfigAutomacao, ctx: ContextoAutomacao): Conteudo | SemEnvio {
  return redigir(cfg, ctx, { previa: true });
}

/* ========================================================================== */
/* O DESPACHO — grava ANTES de enviar                                          */
/* ========================================================================== */

export interface ChaveEnvio { orgId: string; tipo: TipoAutomacao; chave: string; canal: CanalEnvio }

/**
 * O registro dos envios. `reservar` grava a linha ANTES do provedor e devolve
 * `ja_existe` quando a chave já está lá — é o índice único do banco que
 * responde isso, não uma leitura prévia (ler e depois gravar deixaria dois
 * runners passarem juntos pela janela entre as duas).
 */
export interface RegistroEnvios {
  reservar(k: ChaveEnvio & { destinoMascarado: string }): Promise<"reservado" | "ja_existe">;
  concluir(k: ChaveEnvio, r: { status: Exclude<StatusEnvio, "pendente" | "manual">; provedorMsgId?: string | null; erro?: string | null }): Promise<void>;
}

export interface ProvedorEnvio {
  /** Há credencial para este canal? Sem ela o envio é SIMULADO — e simulado não é avisado. */
  ativo(canal: CanalEnvio): boolean;
  enviar(m: MensagemAutomacao): Promise<{ ok: boolean; id?: string | null; erro?: string | null }>;
}

export interface RelatorioDespacho {
  sairiam: number;
  enviados: number;
  simulados: number;
  falhas: number;
  jaRegistrados: number;
  itens: { tipo: TipoAutomacao; canal: CanalEnvio; destino: string; resultado: "sairia" | "enviado" | "simulado" | "falhou" | "ja_registrado"; erro?: string }[];
}

export function relatorioVazio(): RelatorioDespacho {
  return { sairiam: 0, enviados: 0, simulados: 0, falhas: 0, jaRegistrados: 0, itens: [] };
}

/**
 * Despacha as mensagens de UMA empresa.
 *
 * ⚠️ **A ORDEM É A TRAVA: reservar → enviar → concluir.** Se o registro viesse
 * depois do envio, um runner que morresse entre os dois (timeout da Vercel,
 * deploy no meio) deixaria a mensagem enviada SEM registro — e a próxima
 * execução a enviaria de novo. Gravando antes, o pior caso é uma linha
 * `pendente` sem envio: um aviso a menos, nunca um aviso em dobro.
 *
 * ⚠️ `dryRun` não toca no registro nem no provedor: responde quantas mensagens
 * sairiam e para quem (mascarado) — a prova de carga da 7ª regra.
 */
export async function despachar(
  orgId: string, mensagens: MensagemAutomacao[],
  dep: { registro: RegistroEnvios; provedor: ProvedorEnvio; dryRun?: boolean },
  rel: RelatorioDespacho = relatorioVazio(),
): Promise<RelatorioDespacho> {
  for (const m of mensagens) {
    const base = { tipo: m.tipo, canal: m.canal, destino: m.destinoMascarado };
    if (dep.dryRun) { rel.sairiam++; rel.itens.push({ ...base, resultado: "sairia" }); continue; }
    const k: ChaveEnvio = { orgId, tipo: m.tipo, chave: m.chave, canal: m.canal };
    let reserva: "reservado" | "ja_existe";
    try {
      reserva = await dep.registro.reservar({ ...k, destinoMascarado: m.destinoMascarado });
    } catch (e) {
      // Sem registro não há envio: mandar sem ter onde anotar é o caminho do
      // aviso em dobro na próxima execução.
      rel.falhas++; rel.itens.push({ ...base, resultado: "falhou", erro: `registro indisponível: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }
    if (reserva === "ja_existe") { rel.jaRegistrados++; rel.itens.push({ ...base, resultado: "ja_registrado" }); continue; }
    const extras = (m.chavesExtras ?? []).map((chave) => ({ ...k, chave }));
    for (const x of extras) {
      try { await dep.registro.reservar({ ...x, destinoMascarado: m.destinoMascarado }); } catch { /* o principal já está reservado */ }
    }
    const concluirTodos = async (r: Parameters<RegistroEnvios["concluir"]>[1]) => {
      for (const x of [k, ...extras]) { try { await dep.registro.concluir(x, r); } catch { /* fica pendente — nunca reenvia */ } }
    };
    if (!dep.provedor.ativo(m.canal)) {
      await concluirTodos({ status: "simulado", erro: "sem credencial do provedor neste ambiente — nada foi enviado" });
      rel.simulados++; rel.itens.push({ ...base, resultado: "simulado" });
      continue;
    }
    try {
      const r = await dep.provedor.enviar(m);
      if (r.ok) {
        await concluirTodos({ status: "enviado", provedorMsgId: r.id ?? null });
        rel.enviados++; rel.itens.push({ ...base, resultado: "enviado" });
      } else {
        await concluirTodos({ status: "falhou", erro: r.erro ?? "o provedor recusou" });
        rel.falhas++; rel.itens.push({ ...base, resultado: "falhou", erro: r.erro ?? undefined });
      }
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      await concluirTodos({ status: "falhou", erro });
      rel.falhas++; rel.itens.push({ ...base, resultado: "falhou", erro });
    }
  }
  return rel;
}

/** Todas as automações ativas de uma empresa → mensagens (o que o runner despacha). */
export function mensagensDoDia(configs: ConfigAutomacao[], ctx: ContextoAutomacao): ResultadoAutomacao[] {
  return TIPOS_AUTOMACAO
    .map((t) => configs.find((c) => c.tipo === t))
    .filter((c): c is ConfigAutomacao => !!c && c.ativo)
    .map((c) => gerarMensagens(c, ctx));
}

/** Padrões (espelho de `automacoes_padrao()` do banco — a demonstração usa este). */
export function configPadrao(tipo: TipoAutomacao): ConfigAutomacao {
  const p: Record<TipoAutomacao, ParametrosAutomacao> = {
    resumo_diario: {}, resumo_semanal: {}, lembrete_pagar: {},
    alerta_caixa: { horizonteDias: 15, saldoMinimo: 0 },
    fechamento_pendente: { diasUteis: [3, 8] },
    regua_cobranca: { multaPct: 0, jurosMesPct: 0, pausas: [] },
  };
  return {
    tipo, ativo: false,
    canais: tipo === "regua_cobranca" ? ["whatsapp", "email"] : ["email"],
    destinatarios: [], parametros: p[tipo],
  };
}

export { diasEntre };

export { registroEmMemoria, mesmaChave, type LinhaEnvio } from "./registro";
