/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O AGENTE DE COBRANÇA (Etapa 2 do plano "AI first", 04/11/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O agente NÃO tem régua própria: ele lê a MESMA régua da empresa
 * (`core/automacoes`, `filaAutomatica` + `gerarMensagens`) e transforma cada
 * mensagem do dia numa PROPOSTA ("Cobrar Padaria do Zé"). Quem envia, depois
 * do "Aprovar" ou dentro do limite, é o `despachar` de sempre, com a MESMA
 * chave `cliente:<contato>:<dia>`: a régua, o botão da tela e o agente nunca
 * cobram o mesmo cliente duas vezes no mesmo dia.
 *
 * ⚠️ Com o agente ligado, a régua automática NÃO envia sozinha (o runner tira
 * a régua da lista da empresa): cada cobrança passa por ele. Duas portas
 * mandando a mesma cobrança seria o defeito das duas moradas.
 *
 * ⚠️ A execução REFAZ a mensagem no dia em que sai: o que foi aprovado ontem,
 * ou o título que foi pago depois da proposta, não sai (falha com o motivo).
 *
 * Puro: nada de banco, relógio ou provedor.
 */
import {
  filaAutomatica, gerarMensagens, chaveDoClienteNoDia,
  type ConfigAutomacao, type ContextoAutomacao, type MensagemAutomacao, type RelatorioDespacho,
} from "@/core/automacoes";
import { rotear, type ConfigAgente, type Destino, type EstadoProposta } from "./index";

export interface PropostaDeCobranca {
  /** A chave da proposta é a da mensagem: `cliente:<contato>:<dia>`. */
  chave: string;
  titulo: string;
  porque: string;
  /** O total em aberto dos títulos da mensagem (sem multa e juros). */
  valor: number;
  mensagem: MensagemAutomacao;
  /** O que o executor guarda (sem o texto nem o endereço completo). */
  dados: { canal: MensagemAutomacao["canal"]; destino: string; titulos: string[]; dia: string };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** A frase do atraso do título mais avançado. */
export function fraseDoPrazo(dias: number): string {
  if (dias < 0) return `Vence em ${plural(-dias, "dia", "dias")}`;
  if (dias === 0) return "Vence hoje";
  return `Venceu há ${plural(dias, "dia", "dias")}`;
}

/**
 * As propostas do dia: uma por cliente que chega a uma etapa automática da
 * régua hoje e tem como receber. A régua entra LIGADA aqui mesmo que a
 * automação esteja desligada: ligar o agente é ligar a cobrança, com aprovação.
 */
export function propostasDeCobranca(regua: ConfigAutomacao, ctx: ContextoAutomacao): {
  propostas: PropostaDeCobranca[];
  pulados: { alvo: string; motivo: string }[];
} {
  const cfg: ConfigAutomacao = { ...regua, tipo: "regua_cobranca", ativo: true };
  const r = gerarMensagens(cfg, ctx);
  const { grupos } = filaAutomatica(ctx, cfg.parametros);
  const porChave = new Map(grupos.map((g) => [chaveDoClienteNoDia(g.clienteChave, ctx.hoje), g]));
  const propostas: PropostaDeCobranca[] = [];
  for (const m of r.mensagens) {
    const g = porChave.get(m.chave);
    if (!g) continue;
    const valor = Math.round(g.itens.reduce((t, i) => t + Math.abs(i.valor), 0) * 100) / 100;
    const maior = Math.max(...g.itens.map((i) => i.dias));
    const canal = m.canal === "email" ? "e-mail" : "WhatsApp";
    propostas.push({
      chave: m.chave,
      titulo: `Cobrar ${g.cliente}`.slice(0, 200),
      porque: `${fraseDoPrazo(maior)}, ${plural(g.itens.length, "título", "títulos")}. Vai pelo ${canal}, para ${m.destinoMascarado}.`.slice(0, 1000),
      valor,
      mensagem: m,
      dados: { canal: m.canal, destino: m.destinoMascarado, titulos: g.itens.map((i) => i.movimentoId), dia: ctx.hoje },
    });
  }
  return { propostas, pulados: r.pulados };
}

/** A proposta é do dia `hoje`? (a chave termina no dia da etapa). */
export const propostaDoDia = (chave: string, hoje: string) => chave.endsWith(`:${hoje}`);

/**
 * Para onde vai cada proposta nova, na ordem: o limite por dia conta as que o
 * agente já fez sozinho hoje E as que ele vai fazer nesta mesma leva.
 */
export function planejarCobranca(propostas: PropostaDeCobranca[], config: ConfigAgente, feitasHoje: number): { chave: string; destino: Destino }[] {
  let feitas = feitasHoje;
  return propostas.map((p) => {
    const destino = rotear({ config, valor: p.valor, feitasHoje: feitas });
    if (destino === "executar") feitas++;
    return { chave: p.chave, destino };
  });
}

export const MOTIVO_EXPIRADA = "Passou o dia da etapa. A régua de hoje traz a proposta nova.";
export const ERRO_FORA_DO_DIA = "Aprovada depois do dia da etapa: nada foi enviado. A régua de hoje traz a proposta nova.";
export const ERRO_SEM_COBRANCA = "Nada foi enviado: o título foi pago, saiu da régua ou o contato mudou.";
export const MOTIVO_NO_LIMITE = "Dentro do limite que a empresa escolheu.";

/**
 * O estado que a proposta ganha depois do despacho. ⚠️ Simulado NÃO é feito:
 * sem credencial do provedor nada saiu, e "Feita" mentiria.
 */
export function resultadoDoEnvio(item: RelatorioDespacho["itens"][number] | undefined): { estado: Extract<EstadoProposta, "executada" | "falhou">; erro: string | null } {
  if (!item) return { estado: "falhou", erro: "O envio não respondeu." };
  switch (item.resultado) {
    case "enviado": return { estado: "executada", erro: null };
    case "ja_registrado": return { estado: "executada", erro: "A cobrança de hoje deste cliente já tinha saído por outra porta." };
    case "simulado": return { estado: "falhou", erro: "Sem credencial do provedor neste ambiente: nada foi enviado." };
    case "bloqueado": return { estado: "falhou", erro: `Nada foi enviado: ${item.erro ?? "o cliente pediu para não receber"}.` };
    case "sairia": return { estado: "falhou", erro: "Prova sem envio: nada foi enviado." };
    default: return { estado: "falhou", erro: item.erro ?? "O provedor recusou." };
  }
}
