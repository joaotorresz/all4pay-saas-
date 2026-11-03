/**
 * O ESTADO DOS INTERRUPTORES — SERVER-ONLY. Lê cada um pela MESMA função que a
 * rota usa (ver `core/interruptores`): o que esta tela diz é o que a rota faz.
 * As três rotas que leem o interruptor no próprio corpo (webhook da Pinbank,
 * caixa por e-mail, aprovação pelo WhatsApp) são lidas aqui pela mesma
 * comparação. Nunca devolve o valor de variável nenhuma: só ligado/motivo.
 */
import {
  boletoComEncargosLiberado, cobrancaPinbankLiberada, conferenciaPinbankLiberada,
  mensalidadePinbankLiberada, pixAtualizadoLiberado,
} from "@/lib/pinbank/api";
import { cobrancaBancoLigada } from "@/core/cobranca-banco/conexao";
import { iaWhatsappLigada } from "@/core/whatsapp/numero";
import { lembretesLigados } from "@/lib/cadastro-lembretes";
import { agentesLigados } from "@/core/agentes/ligado";
import {
  montarInterruptores, type EstadoInterruptor, type LinhaInterruptor, type MotivoDesligado,
} from "@/core/interruptores";

const sim = (ligado: boolean): EstadoInterruptor => (ligado ? { ligado: true } : { ligado: false, motivo: "desligado" });

const MOTIVO: Record<string, MotivoDesligado> = {
  desligada: "desligado", sem_configuracao: "sem_configuracao", ambiente_teste: "ambiente_teste",
};
const daPinbank = (r: { liberada: true } | { liberada: false; codigo: string }): EstadoInterruptor =>
  r.liberada ? { ligado: true } : { ligado: false, motivo: MOTIVO[r.codigo] ?? "desligado" };

export function estadoDosInterruptores(env: Record<string, string | undefined> = process.env): LinhaInterruptor[] {
  return montarInterruptores({
    pinbank_webhook: sim(env.PINBANK_WEBHOOK === "ligado"),
    pinbank_conferencia: daPinbank(conferenciaPinbankLiberada(env)),
    pinbank_cobranca: daPinbank(cobrancaPinbankLiberada(env)),
    pinbank_encargos: sim(boletoComEncargosLiberado(env)),
    pinbank_pix_atualizado: sim(pixAtualizadoLiberado(env)),
    mensalidade_pinbank: daPinbank(mensalidadePinbankLiberada(env)),
    cobranca_banco: sim(cobrancaBancoLigada(env)),
    whatsapp_aprovacao: sim(env.WHATSAPP_APROVACAO === "ligado"),
    whatsapp_ia: sim(iaWhatsappLigada(env)),
    caixa_email: sim(env.CAIXA_EMAIL === "ligado"),
    cadastro_lembretes: sim(lembretesLigados()),
    agentes: sim(agentesLigados(env)),
  });
}
