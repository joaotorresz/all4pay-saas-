/**
 * As dependências REAIS do executor dos lembretes (chave de serviço, Twilio,
 * Resend) — separadas de `cadastro-lembretes.ts` para a guarda montar o
 * executor com um banco e um provedor de mentira. SERVER-ONLY.
 */
import { enviarEmail, enviarWhatsapp, statusNotificacoes } from "@/core/financial-os/notifications.server";
import { origemDoApp } from "@/core/area-admin";
import { rodarLembretesCadastro, templateDoCadastro, type DepsLembretes, type RelatorioLembretes } from "./cadastro-lembretes";

type ClienteRpc = DepsLembretes["admin"];

export function depsReais(admin: ClienteRpc): DepsLembretes {
  const st = statusNotificacoes();
  const template = templateDoCadastro();
  return {
    admin,
    template,
    // ⚠️ WhatsApp só com o template aprovado: quem abandonou o cadastro nunca
    // nos escreveu, e fora da janela de 24 h a mensagem livre não é entregue.
    ativo: (canal) => (canal === "email" ? st.email : st.whatsapp && !!template),
    async enviar(m) {
      const r = m.canal === "email"
        ? await enviarEmail(m.para, m.assunto, m.texto, m.html)
        : await enviarWhatsapp(m.para, m.texto, m.template ? { contentSid: m.template, contentVariables: m.variaveis } : undefined);
      return { ok: r.ok, id: r.id ?? null, erro: r.ok ? null : r.detalhe };
    },
  };
}

/** O link do lembrete: sempre o endereço do APP, nunca o da plataforma. */
export const linkDoCadastro = (origem: string) =>
  `${origemDoApp({ origem, hostAdmin: process.env.ADMIN_HOST, hostApp: process.env.APP_HOST })}/criar-conta`;

export const rodarLembretesReais = (admin: ClienteRpc, origem: string, dryRun: boolean): Promise<RelatorioLembretes> =>
  rodarLembretesCadastro(depsReais(admin), { dryRun, link: linkDoCadastro(origem) });
