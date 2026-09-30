/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RÉGUA DE COBRANÇA — quem avisar HOJE, em que tom, e por qual canal.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Inspirada no lembrete automático de cobrança do Campfire. A tela de
 * inadimplência já dizia QUEM está atrasado e com que risco; faltava o passo
 * seguinte, que é o que traz o dinheiro de volta: a sequência de contatos,
 * com data, em vez de a pessoa lembrar de cobrar.
 *
 * ⚠️ **A ETAPA SAI DA IDADE DO TÍTULO, não de uma fila escrita à mão.** Cada
 * título em aberto está, hoje, exatamente numa etapa — a última cujo dia já
 * chegou. Uma fila persistida divergiria dos títulos no primeiro pagamento que
 * entrasse por outra porta (conciliação, importação), e o cliente que pagou
 * ontem receberia a cobrança amanhã. O que se guarda é só o REGISTRO do envio
 * (prova de que o cliente foi avisado), nunca a fila.
 *
 * ⚠️ **"Vence hoje" não é atraso** (mesma regra do contas a pagar e da
 * inadimplência canônica): o dia 0 é lembrete amigável, não cobrança.
 *
 * ⚠️ **Transferência entre contas próprias NÃO se cobra.** A base é a mesma do
 * painel de contas a receber (`ehContaAReceber`): sem ela, a régua mandaria
 * mensagem de cobrança para a própria empresa.
 *
 * ⚠️ **Mandar mensagem é ação que sai da empresa**, então o motor NÃO envia:
 * ele monta a fila e o texto. Quem envia é a tela, por decisão de alguém, e o
 * envio fica registrado por título e etapa — reenviar a mesma etapa ao mesmo
 * título é recusado (`jaEnviado`), para o cliente não receber a mesma cobrança
 * duas vezes num dia de clique repetido.
 *
 * Puro, tipado, demo-safe, sem relógio (`hoje` vem do RiskInput). Versão
 * cobranca/1.0.0.
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import { ehContaAReceber } from "@/core/contas-receber";
import { formatBRL } from "@/lib/format";

export const COBRANCA_VERSION = "cobranca/1.0.0";

export type Canal = "whatsapp" | "email" | "manual";
export type Tom = "lembrete" | "aviso" | "firme" | "formal";

export interface EtapaRegua {
  id: string;
  /** Dia relativo ao vencimento: −3 = três dias antes · 0 = no dia · 10 = dez dias depois. */
  dia: number;
  nome: string;
  canal: Canal;
  tom: Tom;
  /** Modelo com {cliente} {valor} {vencimento} {dias}. */
  modelo: string;
}

/**
 * A régua padrão — do lembrete amigável ao aviso formal. O último degrau é
 * MANUAL de propósito: protesto e negativação são decisões com efeito jurídico
 * sobre o cliente e não podem ser disparadas por calendário.
 */
export const REGUA_PADRAO: EtapaRegua[] = [
  { id: "d-3", dia: -3, nome: "Lembrete antes do vencimento", canal: "email", tom: "lembrete",
    modelo: "Olá, {cliente}. Lembramos que o pagamento de {valor} vence em {vencimento}. Se já pagou, desconsidere esta mensagem." },
  { id: "d0", dia: 0, nome: "Vence hoje", canal: "whatsapp", tom: "lembrete",
    modelo: "Olá, {cliente}. O pagamento de {valor} vence hoje, {vencimento}. Qualquer dúvida, estamos à disposição." },
  { id: "d+3", dia: 3, nome: "Primeiro aviso de atraso", canal: "whatsapp", tom: "aviso",
    modelo: "Olá, {cliente}. Não identificamos o pagamento de {valor}, vencido em {vencimento} ({dias} dias). Pode nos confirmar a previsão?" },
  { id: "d+10", dia: 10, nome: "Segundo aviso", canal: "whatsapp", tom: "firme",
    modelo: "{cliente}, o pagamento de {valor} está em atraso há {dias} dias (vencimento {vencimento}). Precisamos regularizar esta semana." },
  { id: "d+30", dia: 30, nome: "Aviso formal", canal: "email", tom: "formal",
    modelo: "Prezado(a) {cliente}, consta em aberto o valor de {valor}, vencido em {vencimento} ({dias} dias). Solicitamos a regularização para evitar medidas de cobrança." },
  { id: "d+60", dia: 60, nome: "Protesto ou negativação (decisão manual)", canal: "manual", tom: "formal",
    modelo: "Título de {cliente} de {valor}, vencido em {vencimento} ({dias} dias): avaliar protesto, negativação ou acordo." },
];

export interface EnvioRegistrado {
  movimentoId: string;
  etapaId: string;
  em: string; // ISO
  canal: Canal;
}

export interface ItemRegua {
  movimentoId: string;
  cliente: string;
  partyId: string | null;
  valor: number;
  vencimento: string;
  /** Dias desde o vencimento (negativo = ainda não venceu). */
  dias: number;
  etapa: EtapaRegua;
  /** A etapa cai exatamente hoje (é a fila do dia). */
  hoje: boolean;
  proxima: { etapa: EtapaRegua; em: string } | null;
  mensagem: string;
  jaEnviado: boolean;
}

export interface PainelRegua {
  versao: typeof COBRANCA_VERSION;
  hoje: string;
  /** Todos os títulos que já estão em alguma etapa. */
  itens: ItemRegua[];
  /** Os que têm contato previsto para HOJE e ainda não foram avisados. */
  filaDeHoje: ItemRegua[];
  porEtapa: { etapa: EtapaRegua; quantidade: number; valor: number }[];
}

/** Dias entre duas datas `YYYY-MM-DD`, pelo calendário (sem fuso). */
export function diasEntre(de: string, ate: string): number {
  const [a, b] = [de, ate].map((s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86_400_000);
}

export function somarDias(iso: string, n: number): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

const br = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

export function redigirMensagem(etapa: EtapaRegua, dados: { cliente: string; valor: number; vencimento: string; dias: number }): string {
  return etapa.modelo
    .replaceAll("{cliente}", dados.cliente)
    .replaceAll("{valor}", formatBRL(dados.valor))
    .replaceAll("{vencimento}", br(dados.vencimento))
    .replaceAll("{dias}", String(Math.max(0, dados.dias)));
}

/** A etapa em que um título está: a última cujo dia já chegou. `null` = ainda cedo. */
export function etapaDoTitulo(dias: number, regua: EtapaRegua[]): EtapaRegua | null {
  const ordenada = [...regua].sort((a, b) => a.dia - b.dia);
  let atual: EtapaRegua | null = null;
  for (const e of ordenada) if (dias >= e.dia) atual = e;
  return atual;
}

const emAberto = (m: RiskMovement) => ehContaAReceber(m) && m.status === "pendente";

export function montarRegua(
  input: RiskInput,
  envios: EnvioRegistrado[] = [],
  regua: EtapaRegua[] = REGUA_PADRAO,
): PainelRegua {
  const hoje = input.hoje.slice(0, 10);
  const ordenada = [...regua].sort((a, b) => a.dia - b.dia);
  const enviados = new Set(envios.map((e) => `${e.movimentoId}|${e.etapaId}`));

  const itens: ItemRegua[] = [];
  for (const m of input.movements) {
    if (!emAberto(m) || !m.due_date) continue;
    const dias = diasEntre(m.due_date, hoje);
    const etapa = etapaDoTitulo(dias, ordenada);
    if (!etapa) continue;
    const cliente = (m.party_id && input.partyNames?.[m.party_id]) || m.category || "Cliente";
    const i = ordenada.findIndex((e) => e.id === etapa.id);
    const prox = ordenada[i + 1];
    itens.push({
      movimentoId: m.id,
      cliente,
      partyId: m.party_id ?? null,
      valor: Math.abs(m.amount),
      vencimento: m.due_date.slice(0, 10),
      dias,
      etapa,
      hoje: dias === etapa.dia,
      proxima: prox ? { etapa: prox, em: somarDias(m.due_date, prox.dia) } : null,
      mensagem: redigirMensagem(etapa, { cliente, valor: Math.abs(m.amount), vencimento: m.due_date, dias }),
      jaEnviado: enviados.has(`${m.id}|${etapa.id}`),
    });
  }
  itens.sort((a, b) => b.dias - a.dias || b.valor - a.valor);

  const filaDeHoje = itens.filter((i) => i.hoje && !i.jaEnviado && i.etapa.canal !== "manual")
    .concat(itens.filter((i) => i.etapa.canal === "manual" && !i.jaEnviado));
  const porEtapa = ordenada.map((etapa) => {
    const da = itens.filter((i) => i.etapa.id === etapa.id);
    return { etapa, quantidade: da.length, valor: da.reduce((s, i) => s + i.valor, 0) };
  });
  return { versao: COBRANCA_VERSION, hoje, itens, filaDeHoje, porEtapa };
}

/** Registra um envio — recusa o repetido (mesmo título, mesma etapa). */
export function registrarEnvio(envios: EnvioRegistrado[], novo: EnvioRegistrado): { envios: EnvioRegistrado[]; repetido: boolean } {
  const repetido = envios.some((e) => e.movimentoId === novo.movimentoId && e.etapaId === novo.etapaId);
  return { envios: repetido ? envios : [...envios, novo], repetido };
}
