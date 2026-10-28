/**
 * A JORNADA DO CADASTRO — regras puras (27/10/2026, etapa 1 do plano
 * "documentos e funil do cadastro no admin").
 *
 * O registro existe para o dono responder três perguntas no admin: quem
 * terminou a abertura de conta, quem parou no meio (e em que passo) e quanto
 * tempo cada passo leva. Puro, tipado e sem relógio próprio: `agora` entra
 * por parâmetro.
 *
 * ⚠️ **SÓ O MÍNIMO SAI DO NAVEGADOR.** O passo, o tipo de conta e o contato que
 * a pessoa já deu (nome, WhatsApp, e-mail) — o que a recuperação precisa. CPF,
 * CNPJ, senha, foto e documento NUNCA entram neste evento: `normalizarEvento`
 * só lê os campos permitidos, e o que vier a mais é descartado.
 *
 * ⚠️ **"PAROU" NÃO É UM ESTADO GRAVADO.** O banco guarda só quando a pessoa
 * chegou a cada passo; "parou" é derivado de quanto tempo passou desde o
 * último. Gravar o estado exigiria um processo que o mudasse com o relógio, e
 * esse processo é exatamente o escritor que ninguém lembra de rodar.
 */

export const VERSAO_JORNADA = "cadastro-jornada/1.0.0";

/** Sem passo novo há mais que isto, a jornada parou (decisão do dono, 27/10/2026). */
export const PARADA_MIN = 30;
/** Depois disto parada, a pessoa entra na fila de recuperação (etapa 5). */
export const RECUPERAR_APOS_H = 24;

export interface EventoJornada {
  id: string;
  etapa: string;
  tipo?: "pf" | "pj";
  nome?: string;
  whatsapp?: string;
  email?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ETAPA = /^[A-Za-z]{1,40}$/;

const texto = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/**
 * O evento que a rota aceita, ou `null`. Campo de contato inválido é
 * DESCARTADO, não recusa o evento inteiro: um telefone mal digitado não pode
 * apagar o passo que a pessoa acabou de dar.
 */
export function normalizarEvento(raw: unknown): EventoJornada | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = texto(r.id);
  const etapa = texto(r.etapa);
  if (!id || !UUID.test(id) || !etapa || !ETAPA.test(etapa)) return null;
  const ev: EventoJornada = { id: id.toLowerCase(), etapa };
  if (r.tipo === "pf" || r.tipo === "pj") ev.tipo = r.tipo;
  const nome = texto(r.nome);
  if (nome && nome.length <= 120) ev.nome = nome;
  const digitos = typeof r.whatsapp === "string" ? r.whatsapp.replace(/\D/g, "") : "";
  if (digitos.length >= 10 && digitos.length <= 13) ev.whatsapp = digitos;
  const email = texto(r.email)?.toLowerCase();
  if (email && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) ev.email = email;
  return ev;
}

export type EstadoJornada = "concluida" | "em_andamento" | "parou";

export interface JornadaRegistrada {
  etapa: string;
  atualizadaEm: string;
  concluidaEm: string | null;
}

export function estadoDaJornada(j: JornadaRegistrada, agora: Date): EstadoJornada {
  if (j.concluidaEm) return "concluida";
  const ultimo = Date.parse(j.atualizadaEm);
  if (!Number.isFinite(ultimo)) return "parou";
  return agora.getTime() - ultimo > PARADA_MIN * 60_000 ? "parou" : "em_andamento";
}

/** Já dá para recuperar: parou há mais de `RECUPERAR_APOS_H` E deixou um contato. */
export function podeRecuperar(
  j: JornadaRegistrada & { whatsapp?: string | null; email?: string | null },
  agora: Date,
): boolean {
  if (estadoDaJornada(j, agora) !== "parou") return false;
  if (!j.whatsapp && !j.email) return false;
  return agora.getTime() - Date.parse(j.atualizadaEm) > RECUPERAR_APOS_H * 3_600_000;
}
