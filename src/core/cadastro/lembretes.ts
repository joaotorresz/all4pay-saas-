/**
 * OS LEMBRETES DE QUEM PAROU NO CADASTRO — regras puras (28/10/2026, etapa 5
 * do plano "documentos e funil do cadastro no admin").
 *
 * Decisão do dono: WhatsApp depois de 24 h parado, e-mail depois de 3 dias,
 * NO MÁXIMO dois lembretes por jornada (um por canal). Puro e sem relógio:
 * `agora` entra por parâmetro.
 *
 * ⚠️ **O BANCO É QUEM GARANTE O "NO MÁXIMO".** O índice único (jornada, canal)
 * de `cadastro_lembretes` recusa o segundo lembrete do mesmo canal; esta
 * função só diz o que está VENCIDO. Duas execuções ao mesmo tempo podem achar
 * o mesmo lembrete vencido — só uma consegue a reserva.
 *
 * ⚠️ **QUEM VOLTOU NÃO RECEBE O SEGUNDO.** Se a pessoa retomou o cadastro
 * depois do primeiro lembrete, o relógio recomeça do último passo: o lembrete
 * de 3 dias conta da última vez que ela mexeu, nunca do começo.
 *
 * ⚠️ **TETO DE 30 DIAS.** Quem parou há mais de um mês não recebe nada: um
 * lembrete sobre um cadastro que a pessoa já esqueceu lê como spam, e é o
 * caminho mais curto para o número da empresa ser denunciado no WhatsApp.
 */
import { estadoDaJornada, RECUPERAR_APOS_H } from "./jornada";

export const VERSAO_LEMBRETES = "cadastro-lembretes/1.0.0";

export type CanalLembrete = "whatsapp" | "email";

/** Quanto tempo PARADA a jornada precisa estar para cada canal (horas). */
export const ESPERA_H: Record<CanalLembrete, number> = { whatsapp: RECUPERAR_APOS_H, email: 72 };
/** Depois disto parada, nenhum lembrete sai. */
export const TETO_DIAS = 30;
/** No máximo um por canal, dois no total. */
export const MAX_LEMBRETES = 2;

export interface JornadaParaLembrete {
  id: string;
  etapa: string;
  atualizadaEm: string;
  concluidaEm: string | null;
  nome: string | null;
  whatsapp: string | null;
  email: string | null;
  /** Os canais que já tiveram lembrete (reservado, enviado ou falho: todos contam). */
  jaLembrados: readonly CanalLembrete[];
  /** O mesmo contato já tem conta (outra jornada concluída, ou o e-mail em uso). */
  contatoJaTemConta?: boolean;
}

/** Os canais vencidos desta jornada, na ordem em que devem sair. */
export function lembretesVencidos(j: JornadaParaLembrete, agora: Date): CanalLembrete[] {
  if (j.concluidaEm || j.contatoJaTemConta) return [];
  if (estadoDaJornada(j, agora) !== "parou") return [];
  const ultimo = Date.parse(j.atualizadaEm);
  if (!Number.isFinite(ultimo)) return [];
  const paradaH = (agora.getTime() - ultimo) / 3_600_000;
  if (paradaH > TETO_DIAS * 24) return [];
  if (j.jaLembrados.length >= MAX_LEMBRETES) return [];
  const sai: CanalLembrete[] = [];
  const contato: Record<CanalLembrete, string | null> = { whatsapp: j.whatsapp, email: j.email };
  for (const canal of ["whatsapp", "email"] as const) {
    if (!contato[canal] || j.jaLembrados.includes(canal)) continue;
    if (paradaH > ESPERA_H[canal]) sai.push(canal);
  }
  return sai.slice(0, MAX_LEMBRETES - j.jaLembrados.length);
}

/** O primeiro nome, para a saudação ("Olá, Marina."). Sem nome, nada. */
export function primeiroNome(nome: string | null): string | null {
  const p = nome?.trim().split(/\s+/)[0];
  return p && p.length <= 40 ? p : null;
}

export interface TextoLembrete {
  assunto: string;
  texto: string;
  html: string;
  /** Variáveis do template aprovado do WhatsApp: 1 = primeiro nome, 2 = link. */
  variaveis: Record<string, string>;
}

const escapar = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * O texto do lembrete. ⚠️ Não repete nenhum dado do cadastro além do primeiro
 * nome: o e-mail pode ter sido digitado errado e cair na caixa de outra
 * pessoa, e o WhatsApp pode ser de outro número. Nada de CPF, CNPJ, empresa
 * ou passo em que parou.
 */
export function textoDoLembrete(j: Pick<JornadaParaLembrete, "nome">, link: string, rodapeWhatsapp: string, canal: CanalLembrete): TextoLembrete {
  const nome = primeiroNome(j.nome);
  const ola = nome ? `Olá, ${nome}.` : "Olá.";
  const corpo = "Você começou a abrir sua conta na Quattro e não terminou. Leva poucos minutos para concluir:";
  const fim = "Se não foi você, é só ignorar esta mensagem.";
  const texto = canal === "whatsapp"
    ? `${ola} ${corpo} ${link}\n\n${fim}\n${rodapeWhatsapp}`
    : `${ola}\n\n${corpo}\n${link}\n\n${fim}\n\nEquipe Quattro`;
  const html = [
    `<p>${escapar(ola)}</p>`,
    `<p>${escapar(corpo)}</p>`,
    `<p><a href="${escapar(link)}">Concluir minha conta</a></p>`,
    `<p style="color:#7A7A72">${escapar(fim)}</p>`,
    `<p>Equipe Quattro</p>`,
  ].join("");
  return { assunto: "Sua conta na Quattro está quase pronta", texto, html, variaveis: { "1": nome ?? "tudo bem", "2": link } };
}

/** Telefone e e-mail mascarados para a resposta da rota e o log (nunca o contato inteiro). */
export function mascararContato(canal: CanalLembrete, v: string): string {
  if (canal === "email") {
    const [u, d] = v.split("@");
    return `${(u ?? "").slice(0, 2)}***@${d ?? ""}`;
  }
  return `***${v.slice(-4)}`;
}
