import { NextResponse } from "next/server";
import { provedorReal, statusNotificacoes } from "@/core/financial-os/notifications.server";
import {
  despachar, relatorioVazio, hojeEm, mascarar, chaveDoClienteNoDia, chaveDoTitulo, RODAPE_SAIR,
  type MensagemAutomacao, type FinalidadeTemplate,
} from "@/core/automacoes";
import { registroSupabase } from "@/lib/automacoes-registro";
import { createClient } from "@/lib/supabase/server";
import { isDemo } from "@/lib/demo";
import { soDigitosFone } from "@/lib/telefone";

/**
 * Disparo de cobrança por cliente via WhatsApp (server-side; chaves Twilio
 * ficam no servidor). Recebe os alvos já montados pelo app (cliente +
 * telefone + mensagem) — a segmentação/decisão é do Quattro, a Twilio só entrega.
 *
 * ⚠️ ESTA ROTA ESTAVA ABERTA PARA A INTERNET (achado de 30/09/2026). O
 * middleware deixa `/api` público, e ela aceitava POST sem sessão nenhuma: com
 * a Twilio ativa em produção, qualquer pessoa fazia o número da plataforma
 * mandar texto arbitrário para até 200 telefones por chamada.
 *
 * Agora ela exige, na ordem:
 *   1. SESSÃO — quem chama está logado;
 *   2. PERMISSÃO — o papel dele na empresa ativa lança ou dá baixa (leitor e
 *      contador externo não cobram cliente);
 *   3. DESTINO CONHECIDO — cada telefone tem de ser de um contato cadastrado
 *      na empresa de quem chama (a leitura passa pela RLS da sessão). É esta
 *      a trava que impede usar o número da empresa como megafone: mesmo um
 *      usuário legítimo não manda mensagem para um telefone que não é de
 *      cliente seu;
 *   4. AUTORIZAÇÃO — o cliente autorizou WhatsApp desta empresa
 *      (`whatsapp_autorizacoes`) e não respondeu SAIR (decisão do dono,
 *      15/10/2026). Sem isso a cobrança dele vai pelo e-mail da régua.
 * Em demonstração não há banco nem sessão: a rota responde SIMULADO, sem
 * chamar a Twilio — uma instância de demonstração com chave configurada não
 * pode virar porta de envio.
 *
 * ⚠️ **E TODO ENVIO É REGISTRADO em `automacao_envios`, ANTES do provedor** —
 * o mesmo registro da régua automática e do "Marcar como avisado". A chave
 * `cliente:<contato>:<dia>` é a trava de "uma cobrança por cliente por dia":
 * o copiloto, o botão da régua e a régua automática gravam a MESMA chave, então
 * o cliente não é cobrado pelas três portas no mesmo dia sem que uma saiba da
 * outra (eram duas moradas para o mesmo ato). Sem credencial da Twilio o
 * registro fica SIMULADO — e simulado não é avisado.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TETO_POR_CHAMADA = 50;
const FINALIDADES: FinalidadeTemplate[] = ["cobranca_lembrete", "cobranca_atraso", "cobranca_formal"];

interface Alvo {
  cliente: string;
  telefone: string;
  mensagem: string;
  finalidade?: FinalidadeTemplate;
  variaveis?: Record<string, string>;
  /** A quem pertence a trava do dia (o id do contato) e os títulos/etapas cobrados. */
  clienteChave: string;
  titulos: { movimentoId: string; etapaId: string }[];
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const lista: unknown[] = Array.isArray(body?.alvos) ? body.alvos : [];
  type Bruto = {
    cliente?: string; telefone?: string; mensagem?: string; finalidade?: string; variaveis?: Record<string, string>;
    registro?: { clienteChave?: string; titulos?: { movimentoId?: string; etapaId?: string }[] };
  };
  const candidatos: Alvo[] = lista
    .slice(0, TETO_POR_CHAMADA)
    .filter((a): a is Bruto => !!a && typeof a === "object")
    .filter((a) => typeof a.telefone === "string" && a.telefone.trim().length > 0 && typeof a.mensagem === "string")
    .map((a) => ({
      cliente: String(a.cliente ?? "Cliente"),
      telefone: a.telefone!.trim(),
      mensagem: String(a.mensagem).slice(0, 1200),
      finalidade: FINALIDADES.includes(a.finalidade as FinalidadeTemplate) ? (a.finalidade as FinalidadeTemplate) : undefined,
      variaveis:
        a.variaveis && typeof a.variaveis === "object"
          ? Object.fromEntries(Object.entries(a.variaveis).slice(0, 10).map(([k, v]) => [String(k), String(v).slice(0, 200)]))
          : undefined,
      // Sem contato informado, a trava do dia é o próprio telefone.
      clienteChave: String(a.registro?.clienteChave || `tel:${soDigitosFone(a.telefone!)}`).slice(0, 120),
      titulos: (a.registro?.titulos ?? [])
        .filter((t) => typeof t?.movimentoId === "string" && typeof t?.etapaId === "string")
        .slice(0, 20).map((t) => ({ movimentoId: t.movimentoId!, etapaId: t.etapaId! })),
    }));

  if (isDemo) {
    return NextResponse.json({
      ok: true,
      provedores: { ...statusNotificacoes(), whatsapp: false },
      total: candidatos.length,
      sucesso: 0,
      simulado: true,
      // O MESMO formato da resposta de produção (cliente + resultado com
      // `situacao`) — a demonstração devolvia `alvo` no lugar de `cliente`, e
      // a tela lia "falha: undefined" (Rodada 9).
      enviados: candidatos.map((a) => ({
        cliente: a.cliente,
        resultado: { canal: "whatsapp", para: mascarar("whatsapp", a.telefone), ok: false, detalhe: "simulado (demonstração)", situacao: "simulado" },
      })),
    });
  }

  // 1) sessão
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, motivo: "Entre na sua conta para enviar cobranças." }, { status: 401 });

  // 2) permissão na empresa ativa
  const [{ data: podeLancar }, { data: podeBaixar }] = await Promise.all([
    supabase.rpc("tem_permissao", { p_acao: "lancar" }),
    supabase.rpc("tem_permissao", { p_acao: "baixar" }),
  ]);
  if (!podeLancar && !podeBaixar) {
    return NextResponse.json({ ok: false, motivo: "Seu papel nesta empresa não envia cobranças a clientes." }, { status: 403 });
  }

  // 3) só telefones de contatos da própria empresa, e 4) só quem AUTORIZOU e
  // não pediu para sair. A situação vem do banco, recortada pela empresa
  // ativa da sessão; sem ela, nada sai (falha fechada).
  const { data: situacao, error } = await supabase.rpc("whatsapp_situacao_contatos");
  if (error) return NextResponse.json({ ok: false, motivo: `Não foi possível conferir a autorização de WhatsApp dos clientes: ${error.message}` }, { status: 500 });
  const porTelefone = new Map<string, { autorizado: boolean; saiu: boolean }>();
  for (const l of (situacao ?? []) as { telefone: string | null; autorizado: boolean; saiu: boolean }[]) {
    if (!l.telefone) continue;
    const atual = porTelefone.get(l.telefone);
    porTelefone.set(l.telefone, { autorizado: !!l.autorizado || !!atual?.autorizado, saiu: !!l.saiu || !!atual?.saiu });
  }
  let recusados = 0, semAutorizacao = 0, pediramSaida = 0;
  const alvos = candidatos.filter((a) => {
    const s = porTelefone.get(soDigitosFone(a.telefone));
    if (!s) { recusados++; return false; }
    if (s.saiu) { pediramSaida++; return false; }
    if (!s.autorizado) { semAutorizacao++; return false; }
    return true;
  });

  // O mesmo despacho do runner: reservar → enviar → concluir.
  const hoje = hojeEm(new Date());
  const mensagens: MensagemAutomacao[] = alvos.map((a) => ({
    tipo: "regua_cobranca", canal: "whatsapp", destino: a.telefone, destinoMascarado: mascarar("whatsapp", a.telefone),
    chave: chaveDoClienteNoDia(a.clienteChave, hoje),
    assunto: `Cobrança — ${a.cliente}`, texto: `${a.mensagem}\n\n${RODAPE_SAIR}`, html: "",
    finalidade: a.finalidade ?? "cobranca_lembrete", variaveis: a.variaveis ?? {},
    chavesExtras: a.titulos.map((t) => chaveDoTitulo(t.movimentoId, t.etapaId)),
  }));
  const rel = await despachar("", mensagens, { registro: registroSupabase(supabase), provedor: provedorReal() }, relatorioVazio());
  const enviados = alvos.map((a, i) => {
    const r = rel.itens[i];
    const detalhe = r.resultado === "ja_registrado" ? "já cobrado hoje (por esta ou outra porta)"
      : r.resultado === "simulado" ? "simulado (sem credenciais)" : r.erro ?? r.resultado;
    return { cliente: a.cliente, resultado: { canal: "whatsapp", para: mascarar("whatsapp", a.telefone), ok: r.resultado === "enviado", detalhe, situacao: r.resultado } };
  });
  return NextResponse.json({
    ok: true,
    provedores: statusNotificacoes(),
    total: enviados.length,
    sucesso: rel.enviados,
    jaCobradosHoje: rel.jaRegistrados,
    simulados: rel.simulados,
    recusados,
    semAutorizacao,
    pediramSaida,
    enviados,
  });
}
