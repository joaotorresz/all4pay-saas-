import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { provedorReal, statusNotificacoes } from "@/core/financial-os/notifications.server";
import {
  despachar, relatorioVazio, mascarar, hashCurto, ehEmail, ehTelefone, soDigitos, TIPOS_AUTOMACAO,
  type MensagemAutomacao, type TipoAutomacao, type CanalEnvio, type FinalidadeTemplate,
} from "@/core/automacoes";
import { registroSupabase } from "@/lib/automacoes-registro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Enviar teste para mim" — a mensagem da PRÉVIA, enviada SÓ para quem clicou.
 *
 * ⚠️ A rota não é megafone: o destino NÃO vem do corpo da requisição. O e-mail
 * é o da própria sessão; o WhatsApp só sai para o telefone que ESTA pessoa
 * cadastrou como destinatária da automação (lido do banco pela sessão). Quem
 * chama consegue, no máximo, mandar uma mensagem para si mesmo.
 *
 * ⚠️ O teste também é registrado em `automacao_envios` (chave `teste:…`), com a
 * mesma ordem do runner: grava antes, envia depois. Sem credencial do provedor
 * o registro fica SIMULADO — e a tela diz isso.
 *
 * Em demonstração não há sessão nem banco: responde SIMULADO sem chamar
 * provedor nenhum (uma instância de demonstração com chave configurada não
 * pode virar porta de envio), e a tela registra no navegador.
 */
const FINALIDADES: FinalidadeTemplate[] = ["resumo_diario", "lembrete_pagar", "alerta_caixa", "fechamento_pendente", "cobranca_lembrete", "cobranca_atraso", "cobranca_formal"];

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tipo = TIPOS_AUTOMACAO.includes(b.tipo as TipoAutomacao) ? (b.tipo as TipoAutomacao) : null;
  const canal: CanalEnvio | null = b.canal === "email" || b.canal === "whatsapp" ? b.canal : null;
  if (!tipo || !canal) return NextResponse.json({ ok: false, situacao: "recusado", destino: "—", motivo: "Automação ou canal inválido." }, { status: 400 });
  const assunto = `[Teste] ${String(b.assunto ?? "").slice(0, 200)}`;
  const texto = `[Teste] ${String(b.texto ?? "").slice(0, 4000)}`;
  const html = String(b.html ?? "").slice(0, 60_000);
  const finalidade = FINALIDADES.includes(b.finalidade as FinalidadeTemplate) ? (b.finalidade as FinalidadeTemplate) : "resumo_diario";
  const variaveis = b.variaveis && typeof b.variaveis === "object"
    ? Object.fromEntries(Object.entries(b.variaveis as Record<string, unknown>).slice(0, 10).map(([k, v]) => [k, String(v).slice(0, 900)]))
    : {};

  if (isDemo) {
    return NextResponse.json({
      ok: true, situacao: "simulado", destino: "você (demonstração)",
      motivo: "Na demonstração nada é enviado: o teste fica registrado como simulado.",
      provedores: { ...statusNotificacoes(), whatsapp: false, email: false },
    });
  }

  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return NextResponse.json({ ok: false, situacao: "recusado", destino: "—", motivo: "Entre na sua conta para enviar o teste." }, { status: 401 });
  const { data: pode } = await supabase.rpc("tem_permissao", { p_acao: "administrar" });
  if (!pode) return NextResponse.json({ ok: false, situacao: "recusado", destino: "—", motivo: "Só quem administra a empresa configura e testa as automações." }, { status: 403 });

  let destino = "";
  if (canal === "email") {
    destino = user.email ?? "";
    if (!ehEmail(destino)) return NextResponse.json({ ok: false, situacao: "recusado", destino: "—", motivo: "Sua conta não tem e-mail." }, { status: 400 });
  } else {
    const { data: linha, error } = await supabase.from("automacoes").select("destinatarios").eq("tipo", tipo).limit(1).maybeSingle();
    if (error) return NextResponse.json({ ok: false, situacao: "falhou", destino: "—", motivo: error.message }, { status: 500 });
    const meu = ((linha?.destinatarios ?? []) as { userId?: string; telefone?: string }[]).find((d) => d.userId === user.id);
    destino = meu?.telefone ?? "";
    if (!ehTelefone(destino)) {
      return NextResponse.json({ ok: false, situacao: "recusado", destino: "—", motivo: "Salve o seu telefone de WhatsApp como destinatário desta automação antes de testar." }, { status: 400 });
    }
  }

  const m: MensagemAutomacao = {
    tipo, canal, destino, destinoMascarado: mascarar(canal, destino),
    chave: `teste:${hashCurto(`${user.id}|${canal === "email" ? destino.toLowerCase() : soDigitos(destino)}`)}:${Date.now().toString(36)}`,
    assunto, texto, html, finalidade, variaveis,
  };
  try {
    const rel = await despachar("", [m], { registro: registroSupabase(supabase), provedor: provedorReal() }, relatorioVazio());
    const r = rel.itens[0];
    return NextResponse.json({
      ok: r.resultado === "enviado" || r.resultado === "simulado",
      situacao: r.resultado === "enviado" ? "enviado" : r.resultado === "simulado" ? "simulado" : "falhou",
      destino: m.destinoMascarado,
      motivo: r.resultado === "simulado" ? "O provedor deste canal não está configurado: nada foi enviado, e o registro diz simulado."
        : r.resultado === "enviado" ? "O provedor aceitou a mensagem." : r.erro,
      provedores: statusNotificacoes(),
    });
  } catch (e) {
    return NextResponse.json({ ok: false, situacao: "falhou", destino: m.destinoMascarado, motivo: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
