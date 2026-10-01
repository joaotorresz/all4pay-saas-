"use server";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS AÇÕES DA CENTRAL — no SERVIDOR, e é ele quem fala com a máquina
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Estas são as primeiras server actions do projeto**, e a razão é de
 * autoridade: o navegador falando direto com o PostgREST funciona, mas espalha
 * pela rede a superfície que decide dinheiro. Aqui a sessão fica no cookie, a
 * chamada sai do servidor, e o cliente recebe só o veredito já traduzido.
 *
 * ⚠️ **O CLIENTE NÃO REIMPLEMENTA A REGRA.** Quem autoriza é o gatilho
 * `central_maquina`. Estas funções pedem e traduzem — nada mais. Repetir a
 * alçada aqui criaria a segunda morada da regra, que é o defeito que este
 * repositório passou dois dias matando.
 */
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { primeiraContaAtiva } from "@/lib/conta-padrao";
import { traduzirRecusa, type RecusaCentral } from "@/lib/central";
import type { Situacao } from "@/core/central";
import { statusNotificacoes, enviarWhatsapp } from "@/core/financial-os/notifications.server";
import { mensagemDoPedido, telefoneParaPedido } from "@/core/aprovacao-whatsapp";
import { dataBR, formatBRL } from "@/lib/format";
import { TETO_LINHAS, semAmostra } from "@/lib/supabase/consulta";

export type ResultadoAcao = { ok: true } | { ok: false; recusa: RecusaCentral };

/**
 * Move o título na esteira. O UPDATE toca `situacao` — é ele que acorda o
 * gatilho. Qualquer outra coluna de estado passaria por fora da máquina.
 */
export async function moverTituloAction(id: string, para: Situacao): Promise<ResultadoAcao> {
  const s = createClient();
  const { error } = await s.from("movements").update({ situacao: para }).eq("id", id);
  if (error) {
    /*
     * ⚠️ As recusas da máquina chegam como SQLSTATE **P0001** com o código no
     * PREFIXO DA MENSAGEM (`A4P-CENTRAL-*`) — não há errcode próprio por
     * recusa. É acoplamento a texto, declarado como dívida em
     * docs/auditoria.md: errcode por recusa é o certo e não é agora.
     */
    return { ok: false, recusa: traduzirRecusa(`${error.message} ${error.details ?? ""} ${error.hint ?? ""}`) };
  }
  revalidatePath("/central");
  return { ok: true };
}

export interface NovoTitulo {
  descricao: string;
  valor: number;
  vencimento: string;
  categoria: string;
  tipo: "entrada" | "saida";
}

/**
 * Lança um título. ⚠️ Ele **nasce `previsto`** — é o começo da esteira, e é o
 * que torna a Central um caminho e não uma lista.
 *
 * ⚠️ `origem: 'manual'` não é decoração: `titulo_exige_origem` RECUSA com
 * `A4P05` todo título sem procedência. Foi o defeito de gravação da ONDA 5 —
 * todo lançamento manual em produção era recusado pelo banco porque o escritor
 * não mandava este campo.
 */
export async function lancarTituloAction(t: NovoTitulo): Promise<ResultadoAcao & { id?: string }> {
  const s = createClient();
  const { data: sessao } = await s.auth.getUser();
  const uid = sessao.user?.id ?? null;
  if (!uid) {
    return { ok: false, recusa: { codigo: "permissao", motivo: "Sua sessão expirou.", comoResolver: "Entre de novo e repita o lançamento." } };
  }
  // ⚠️ `org_id` NÃO é enviado: o padrão da coluna é `auth_org_id()`, a empresa
  // ABERTA no seletor. Ler o primeiro vínculo (`limit(1)`) gravava o título na
  // empresa mais antiga de quem é sócio de duas — a RLS então o recusava ou, pior,
  // o aceitava na empresa errada (Rodada 4).
  const contaId = await primeiraContaAtiva(s);

  const { data, error } = await s.from("movements").insert({
    account_id: contaId,
    type: t.tipo,
    amount: Math.abs(t.valor),
    description: t.descricao.trim(),
    category: t.categoria.trim() || null,
    due_date: t.vencimento,
    competence_date: t.vencimento,
    situacao: "previsto",
    origem: "manual",
    especie: "titulo",
  }).select("id").maybeSingle();

  if (error) {
    return { ok: false, recusa: traduzirRecusa(`${error.message} ${error.details ?? ""} ${error.hint ?? ""}`) };
  }
  revalidatePath("/central");
  return { ok: true, id: (data as { id?: string } | null)?.id };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * APROVAÇÃO POR WHATSAPP — pedir a um aprovador que responda "SIM <código>"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ NASCE DESLIGADA: sem `WHATSAPP_APROVACAO=ligado` no ambiente, nada é
 * pedido nem enviado. A tela nem mostra a ação (a página lê o mesmo portão),
 * mas o portão mora AQUI — esconder o botão não é controle.
 *
 * ⚠️ UM CAMINHO DE APROVAÇÃO SÓ: este pedido não aprova nada. A resposta chega
 * pela rota `/api/whatsapp/aprovacao` e a RPC faz o MESMO UPDATE da Central,
 * como o aprovador — quem decide é o gatilho `central_maquina`.
 *
 * ⚠️ ENVIO SIMULADO NUNCA É "ENVIADO": sem as credenciais da Twilio a ação
 * recusa ANTES de gerar o código e diz que nada saiu. E o código nunca vai
 * para log — ele só existe na mensagem.
 */
export type ResultadoPedidoWhatsapp = { ok: true; mensagem: string } | { ok: false; motivo: string };

export interface AprovadorWhatsapp { id: string; nome: string }

/** Quem pode receber o pedido: membros da empresa ativa cujo papel tem `aprovar`. */
export async function aprovadoresWhatsappAction(): Promise<AprovadorWhatsapp[]> {
  if (process.env.WHATSAPP_APROVACAO !== "ligado") return [];
  const s = createClient();
  const [{ data: membros }, { data: regras }] = await Promise.all([
    s.rpc("org_members"),
    s.from("role_permissions").select("papel").eq("acao", "aprovar").limit(TETO_LINHAS),
  ]);
  const papeis = new Set(((regras ?? []) as { papel: string }[]).map((r) => r.papel));
  return ((membros ?? []) as Array<{ user_id: string; role: string; display_name: string | null; email: string | null }>)
    .filter((m) => papeis.has(m.role))
    .map((m) => ({ id: m.user_id, nome: m.display_name || m.email || "membro sem nome" }));
}

/** A recusa do banco sem o prefixo técnico (`A4P-WA-…:`). */
const semPrefixo = (msg: string): string => msg.replace(/^A4P-[A-Z-]+:\s*/, "");

export async function pedirAprovacaoWhatsappAction(
  movementId: string, aprovadorId: string, telefone: string,
): Promise<ResultadoPedidoWhatsapp> {
  // 1. O portão: desligada, nada acontece.
  if (process.env.WHATSAPP_APROVACAO !== "ligado") {
    return { ok: false, motivo: "A aprovação por WhatsApp está desligada neste ambiente. Nada foi enviado." };
  }
  // 2. Sem provedor configurado, o envio seria SIMULADO — e simulado não é enviado.
  if (!statusNotificacoes().whatsapp) {
    return { ok: false, motivo: "O envio de WhatsApp não está configurado neste ambiente. Nada foi enviado." };
  }

  const s = createClient();
  const tel = telefoneParaPedido(telefone);
  const { data: codigo, error } = await s.rpc("pedir_aprovacao_whatsapp", {
    p_movement: movementId, p_aprovador: aprovadorId, p_telefone: tel,
  });
  if (error || typeof codigo !== "string") {
    return { ok: false, motivo: semPrefixo(error?.message ?? "O pedido não foi registrado.") };
  }

  // A fila da Central já exclui a amostra (`semAmostra`): o título que chegou
  // aqui veio dela, e a leitura segue o mesmo filtro.
  const { data: mov } = await semAmostra(
    s.from("movements").select("description, amount, due_date"),
  ).eq("id", movementId).maybeSingle();
  const m = (mov ?? {}) as { description?: string | null; amount?: number | null; due_date?: string | null };
  const texto = mensagemDoPedido({
    descricao: m.description ?? "título",
    valorFormatado: formatBRL(Number(m.amount ?? 0)),
    vencimento: dataBR(m.due_date),
    codigo,
  });

  const envio = await enviarWhatsapp(`+${tel}`, texto);
  if (!envio.ok) {
    return {
      ok: false,
      motivo: `O provedor recusou a mensagem (${envio.detalhe}). O pedido ficou registrado, mas nada chegou ao aprovador — peça de novo.`,
    };
  }
  // "aceito pelo provedor", não "entregue": sem status callback é o máximo que se afirma.
  return { ok: true, mensagem: `Pedido enviado ao aprovador (telefone final ${tel.slice(-4)}). O código vale por 24 horas.` };
}
