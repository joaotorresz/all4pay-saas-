/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS INTERRUPTORES DA PLATAFORMA — o que está ligado, num lugar só
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Cada integração nova nasce DESLIGADA por uma variável `=ligado` na Vercel.
 * São treze, espalhadas por rotas e clientes de API, e até aqui a única forma
 * de saber o que estava ligado era abrir o painel da Vercel e ler variável por
 * variável — sem saber, por exemplo, que a cobrança ligada com a credencial de
 * TESTE continua desligada.
 *
 * ⚠️ **Só LEITURA.** Ligar e desligar continua sendo na Vercel, com redeploy:
 * um botão aqui seria uma segunda porta para decidir quem fala com banco,
 * adquirente e WhatsApp, e essa decisão fica com o dono, fora do app.
 *
 * ⚠️ **O estado vem das MESMAS funções que as rotas usam** (`lib/interruptores`),
 * nunca de uma releitura da variável: a cobrança pela Pinbank só sai com o
 * interruptor, a credencial e o ambiente de produção, e uma tela que olhasse só
 * o interruptor diria "ligada" quando nada sai. Vários desses interruptores têm
 * guarda de leitor ÚNICO — por isso o catálogo não cita o nome da variável; o
 * nome mora no `.env.example`, ao lado do que ela faz.
 *
 * Puro, tipado, demo-safe. Nunca devolve o VALOR de variável nenhuma.
 */
export const VERSAO_INTERRUPTORES = "interruptores/1.0.0";

export type IdInterruptor =
  | "pinbank_webhook" | "pinbank_conferencia" | "pinbank_cobranca" | "pinbank_encargos"
  | "pinbank_pix_atualizado" | "mensalidade_pinbank" | "cobranca_banco"
  | "whatsapp_aprovacao" | "whatsapp_ia" | "caixa_email" | "cadastro_lembretes" | "focus_empresas" | "contador_optin" | "agentes";

export type GrupoInterruptor = "Maquininha e conta Pinbank" | "Cobrança" | "WhatsApp e e-mail" | "Notas fiscais" | "Quattro AI";

/** Por que não está ligado. `desligado` = a variável não está `ligado`. */
export type MotivoDesligado = "desligado" | "sem_configuracao" | "ambiente_teste";

export type EstadoInterruptor = { ligado: true } | { ligado: false; motivo: MotivoDesligado };

export interface Interruptor {
  id: IdInterruptor;
  grupo: GrupoInterruptor;
  nome: string;
  /** O que acontece quando está ligado, em uma frase. */
  oQueFaz: string;
  /** O que mais precisa estar de pé além do interruptor (vazio = só ele). */
  exige: string[];
}

export const INTERRUPTORES: readonly Interruptor[] = [
  { id: "pinbank_webhook", grupo: "Maquininha e conta Pinbank", nome: "Vendas da maquininha (webhook)",
    oQueFaz: "Cada venda aprovada na maquininha Pinbank vira venda e títulos no sistema.", exige: [] },
  { id: "pinbank_conferencia", grupo: "Maquininha e conta Pinbank", nome: "Conferir com o extrato",
    oQueFaz: "O botão que confere as vendas lançadas com o extrato da Pinbank.", exige: ["credencial da API", "ambiente de produção"] },
  { id: "pinbank_cobranca", grupo: "Cobrança", nome: "Pix e boleto pela conta Pinbank",
    oQueFaz: "Gerar Pix e boleto de um título a receber, e o link de pagamento.", exige: ["credencial da API", "ambiente de produção"] },
  { id: "pinbank_encargos", grupo: "Cobrança", nome: "Multa e juros no boleto",
    oQueFaz: "O boleto sai registrado com a multa e os juros da régua.", exige: [] },
  { id: "pinbank_pix_atualizado", grupo: "Cobrança", nome: "Pix com o valor de hoje",
    oQueFaz: "Depois do vencimento, o link oferece um Pix com multa e juros do dia.", exige: ["cobrança pela conta Pinbank ligada"] },
  { id: "mensalidade_pinbank", grupo: "Cobrança", nome: "Mensalidade do ERP pela Pinbank",
    oQueFaz: "A mensalidade dos clientes é cobrada na conta Pinbank da Quattro.", exige: ["credencial da API", "código da conta da Quattro", "ambiente de produção"] },
  { id: "cobranca_banco", grupo: "Cobrança", nome: "Cobrança pela conta do cliente (Inter e Itaú)",
    oQueFaz: "A empresa conecta o próprio banco e emite boleto com Pix por ele.", exige: [] },
  { id: "whatsapp_aprovacao", grupo: "WhatsApp e e-mail", nome: "Aprovar pelo WhatsApp",
    oQueFaz: "O aprovador recebe o pedido no WhatsApp e responde para aprovar.", exige: [] },
  { id: "whatsapp_ia", grupo: "WhatsApp e e-mail", nome: "Quattro AI no WhatsApp",
    oQueFaz: "O número confirmado conversa com a Quattro AI sobre a empresa (só leitura).", exige: [] },
  { id: "caixa_email", grupo: "WhatsApp e e-mail", nome: "Caixa de entrada por e-mail",
    oQueFaz: "Boleto e nota mandados por e-mail viram item na caixa de entrada de contas a pagar.", exige: [] },
  { id: "cadastro_lembretes", grupo: "WhatsApp e e-mail", nome: "Lembretes do cadastro",
    oQueFaz: "Quem parou a abertura de conta recebe lembrete por e-mail e WhatsApp.", exige: [] },
  { id: "contador_optin", grupo: "WhatsApp e e-mail", nome: "Confirmação do e-mail do contador",
    oQueFaz: "O contador cadastrado no envio de NFs recebe o link e confirma o próprio e-mail.", exige: ["chave do Resend"] },
  { id: "focus_empresas", grupo: "Notas fiscais", nome: "Cadastrar empresas na Focus",
    oQueFaz: "A área da plataforma cria a empresa do cliente na Focus com o certificado A1.", exige: ["token de produção da Focus"] },
  { id: "agentes", grupo: "Quattro AI", nome: "Agentes da Quattro AI",
    oQueFaz: "Os agentes que cada empresa ligou preparam o trabalho e pedem aprovação.", exige: ["o agente ligado pela empresa"] },
];

export const GRUPOS_INTERRUPTOR: readonly GrupoInterruptor[] = ["Maquininha e conta Pinbank", "Cobrança", "WhatsApp e e-mail", "Notas fiscais", "Quattro AI"];

export const ROTULO_MOTIVO: Record<MotivoDesligado, string> = {
  desligado: "Desligado",
  sem_configuracao: "Ligado, mas falta configuração",
  ambiente_teste: "Ligado, mas no ambiente de teste",
};

export interface LinhaInterruptor extends Interruptor { estado: EstadoInterruptor }

/** Junta catálogo e estado. Interruptor sem estado conhecido conta como desligado (falha fechada). */
export function montarInterruptores(estados: Partial<Record<IdInterruptor, EstadoInterruptor>>): LinhaInterruptor[] {
  return INTERRUPTORES.map((i) => ({ ...i, estado: estados[i.id] ?? { ligado: false, motivo: "desligado" } }));
}

export function resumoInterruptores(linhas: readonly LinhaInterruptor[]): { ligados: number; pendentes: number; total: number } {
  const ligados = linhas.filter((l) => l.estado.ligado).length;
  const pendentes = linhas.filter((l) => !l.estado.ligado && l.estado.motivo !== "desligado").length;
  return { ligados, pendentes, total: linhas.length };
}
