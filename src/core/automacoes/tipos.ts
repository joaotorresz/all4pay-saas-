/**
 * Os tipos das automações — o contrato entre o núcleo puro, o runner e a tela.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import type { Credor } from "@/core/cobranca";

export const AUTOMACOES_VERSION = "automacoes/1.0.0";

export type TipoAutomacao =
  | "resumo_diario"
  | "resumo_semanal"
  | "lembrete_pagar"
  | "alerta_caixa"
  | "fechamento_pendente"
  | "regua_cobranca";

export const TIPOS_AUTOMACAO: TipoAutomacao[] = [
  "resumo_diario", "resumo_semanal", "lembrete_pagar", "alerta_caixa", "fechamento_pendente", "regua_cobranca",
];

export type CanalEnvio = "email" | "whatsapp";

/**
 * pendente = gravado ANTES de chamar o provedor · enviado = o provedor ACEITOU
 * (não é "entregue") · simulado = sem credencial, nada saiu · falhou = recusado
 * · manual = uma pessoa declarou o contato.
 */
export type StatusEnvio = "pendente" | "enviado" | "simulado" | "falhou" | "manual";

/**
 * ⚠️ O que CONTA como "avisado". Simulado NUNCA: é esse registro que se mostra
 * antes de um protesto, e um contato que não aconteceu não pode aparecer como
 * prova de que aconteceu.
 */
export const STATUS_QUE_AVISAM: readonly StatusEnvio[] = ["enviado", "manual"];
export const contaComoAvisado = (s: StatusEnvio): boolean => STATUS_QUE_AVISAM.includes(s);

/** Quem recebe o que é da EMPRESA (resumo, lembrete, alerta, fechamento). */
export interface Destinatario {
  /** O membro da empresa — o runner confere, a cada execução, se ele AINDA é titular/admin. */
  userId: string;
  nome?: string | null;
  /** O telefone de WhatsApp que ESTA pessoa informou para receber. */
  telefone?: string | null;
  email_ativo?: boolean;
  whatsapp_ativo?: boolean;
}

export interface Pausa {
  alvo: "cliente" | "titulo";
  /** partyId (cliente) ou movimentoId (título). */
  id: string;
  /** Até quando (inclusive), YYYY-MM-DD. */
  ate: string;
  motivo?: string;
}

export interface ParametrosAutomacao {
  /** Alerta de caixa: o horizonte em dias (7, 15 ou 30). */
  horizonteDias?: number;
  /** Alerta de caixa: o saldo abaixo do qual avisar. 0 = só o negativo. */
  saldoMinimo?: number;
  /** Fechamento: em quais dias úteis do mês lembrar. */
  diasUteis?: number[];
  /** Régua: multa e juros de mora (frações; 0 = não cobra encargo). */
  multaPct?: number;
  jurosMesPct?: number;
  /** Régua: chave PIX do recebedor (sem ela, a mensagem não traz copia e cola). */
  chavePix?: string | null;
  cidadePix?: string | null;
  /** Régua: pausas por título ou por cliente (acordo, contestação). */
  pausas?: Pausa[];
}

export interface ConfigAutomacao {
  tipo: TipoAutomacao;
  ativo: boolean;
  canais: CanalEnvio[];
  destinatarios: Destinatario[];
  parametros: ParametrosAutomacao;
}

/** Um contato (cliente/fornecedor) — o destino da régua. */
export interface Contato {
  id: string;
  nome: string;
  telefone?: string | null;
  email?: string | null;
}

/** Titular/admin ATUAL da empresa. O e-mail vem daqui, nunca da configuração. */
export interface Membro {
  userId: string;
  papel: string;
  nome?: string | null;
  email?: string | null;
}

export interface EnvioHistorico {
  tipo: TipoAutomacao;
  chave: string;
  canal: CanalEnvio | "manual";
  status: StatusEnvio;
  /** ISO. */
  em: string;
}

export interface ContaSaldo {
  id: string;
  nome: string;
  saldo: number;
}

/** Tudo o que o núcleo precisa para decidir as mensagens de UMA empresa, num dia. */
export interface ContextoAutomacao {
  orgId: string;
  /** YYYY-MM-DD em America/Sao_Paulo (nunca o dia UTC do servidor). */
  hoje: string;
  credor: Credor;
  input: RiskInput;
  contas: ContaSaldo[];
  contatos: Record<string, Contato>;
  membros: Membro[];
  /** `null` = não se sabe (a fonte não respondeu) — a linha some, não vira "0". */
  aprovacoesPendentes: number | null;
  /** Meses travados (YYYY-MM). */
  mesesTravados: string[];
  /** O histórico recente de envios (60 dias). */
  envios: EnvioHistorico[];
  /** A origem do app, para os links ("https://…"). */
  appUrl: string;
  /** A base foi cortada no teto de linhas — a mensagem avisa. */
  truncado?: boolean;
}

/** O template aprovado que cada finalidade usa no WhatsApp. */
export type FinalidadeTemplate =
  | "cobranca_lembrete" | "cobranca_atraso" | "cobranca_formal"
  | "resumo_diario" | "lembrete_pagar" | "alerta_caixa" | "fechamento_pendente";

/** O conteúdo, antes de ter destino. É o que a PRÉVIA mostra. */
export interface Conteudo {
  /** A base da chave de deduplicação (sem o destino). */
  chaveBase: string;
  assunto: string;
  /** Texto corrido — vai no WhatsApp (sem template) e na versão texto do e-mail. */
  texto: string;
  html: string;
  finalidade: FinalidadeTemplate;
  /** Variáveis do template aprovado (quando houver um configurado). */
  variaveis: Record<string, string>;
  /** Régua: a quem se dirige (o destino vem do cadastro do contato). */
  contatoId?: string;
  /** Régua: as chaves por título/etapa que o envio também registra. */
  chavesExtras?: string[];
  /** Régua: o canal da etapa, quando é ela quem decide. */
  canalPreferido?: CanalEnvio;
}

/** Por que uma automação não gerou mensagem hoje — nunca um silêncio. */
export interface SemEnvio {
  codigo:
    | "desligada" | "sem_dados" | "fora_do_dia" | "nada_a_avisar" | "faixa_ja_avisada"
    | "mes_fechado" | "sem_destinatario" | "sem_contato";
  motivo: string;
}

export interface MensagemAutomacao {
  tipo: TipoAutomacao;
  canal: CanalEnvio;
  destino: string;
  destinoMascarado: string;
  /** A chave de deduplicação COMPLETA (com o destino). */
  chave: string;
  assunto: string;
  texto: string;
  html: string;
  finalidade: FinalidadeTemplate;
  variaveis: Record<string, string>;
  chavesExtras?: string[];
}

export interface ResultadoAutomacao {
  tipo: TipoAutomacao;
  mensagens: MensagemAutomacao[];
  /** Conteúdos gerados (a prévia). Vazio quando `semEnvio`. */
  conteudos: Conteudo[];
  semEnvio?: SemEnvio;
  /** Destinos pulados, com o motivo (cliente sem telefone, membro que saiu…). */
  pulados: { alvo: string; motivo: string }[];
}
