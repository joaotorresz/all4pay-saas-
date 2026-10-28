/**
 * O EXECUTOR DOS LEMBRETES DO CADASTRO — SERVER-ONLY (chave de serviço e
 * segredos do provedor). Etapa 5 do plano "documentos e funil do cadastro".
 *
 * Ordem de cada lembrete: RESERVA no banco → ENVIA → CONCLUI. A reserva vem
 * antes porque é ela que impede o cron repetido (ou dois ao mesmo tempo) de
 * mandar duas vezes; o que falhou depois da reserva fica como falho e não é
 * repetido — sem saber se o provedor aceitou, repetir pode mandar em dobro.
 *
 * ⚠️ **NASCE DESLIGADO** (`CADASTRO_LEMBRETES=ligado`). Mandar mensagem a quem
 * ainda não é cliente é falar fora da empresa: o dono liga quando o texto e o
 * template estiverem aprovados. Desligado, só a prova de carga (`dryRun`) roda.
 *
 * ⚠️ **SEM CREDENCIAL, NADA É RESERVADO.** O canal sem provedor (ou o WhatsApp
 * sem o template aprovado `TWILIO_TEMPLATE_CADASTRO_SID` — fora da janela de
 * 24 h a Twilio só entrega template, e quem abandonou o cadastro nunca nos
 * escreveu) sai como "sem provedor" na resposta e a vaga continua livre.
 *
 * ⚠️ **QUEM RESPONDEU SAIR NÃO RECEBE**, pela mesma pergunta de todo executor
 * (`whatsapp_saidas_entre`), e ela falha FECHADA: sem resposta, nenhum WhatsApp.
 */
import { destinoCanonico, RODAPE_SAIR } from "@/core/automacoes";
import {
  lembretesVencidos, mascararContato, textoDoLembrete,
  type CanalLembrete, type JornadaParaLembrete,
} from "@/core/cadastro/lembretes";

export const lembretesLigados = () => process.env.CADASTRO_LEMBRETES === "ligado";
export const templateDoCadastro = () => process.env.TWILIO_TEMPLATE_CADASTRO_SID || undefined;

interface ClienteRpc {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

export interface EnvioLembrete {
  canal: CanalLembrete;
  para: string;
  assunto: string;
  texto: string;
  html: string;
  variaveis: Record<string, string>;
  template?: string;
}

export interface DepsLembretes {
  admin: ClienteRpc;
  /** Há credencial para o canal (e, no WhatsApp, o template)? */
  ativo(canal: CanalLembrete): boolean;
  enviar(m: EnvioLembrete): Promise<{ ok: boolean; id?: string | null; erro?: string | null }>;
  template?: string;
}

export type ResultadoItem = "sairia" | "enviado" | "falhou" | "ja_lembrado" | "sem_provedor" | "bloqueado";

export interface RelatorioLembretes {
  ligado: boolean;
  dryRun: boolean;
  candidatas: number;
  enviados: number;
  falhas: number;
  semProvedor: number;
  bloqueados: number;
  itens: { jornada: string; canal: CanalLembrete; destino: string; resultado: ResultadoItem; erro?: string }[];
  erro?: string;
}

export function candidataDaLinha(r: Record<string, unknown>): JornadaParaLembrete | null {
  const s = (v: unknown) => (typeof v === "string" && v ? v : null);
  const id = s(r.id), atualizadaEm = s(r.atualizada_em);
  if (!id || !atualizadaEm) return null;
  const ja = Array.isArray(r.ja_lembrados) ? r.ja_lembrados.filter((c): c is CanalLembrete => c === "whatsapp" || c === "email") : [];
  return {
    id, atualizadaEm, etapa: s(r.etapa) ?? "", concluidaEm: null,
    nome: s(r.nome), whatsapp: s(r.whatsapp), email: s(r.email),
    jaLembrados: ja, contatoJaTemConta: r.contato_ja_tem_conta === true,
  };
}

export async function rodarLembretesCadastro(
  deps: DepsLembretes,
  opts: { dryRun: boolean; link: string; agora?: Date },
): Promise<RelatorioLembretes> {
  const agora = opts.agora ?? new Date();
  const rel: RelatorioLembretes = {
    ligado: lembretesLigados(), dryRun: opts.dryRun, candidatas: 0,
    enviados: 0, falhas: 0, semProvedor: 0, bloqueados: 0, itens: [],
  };
  // Desligado, só a prova de carga: nada é reservado nem enviado.
  const dryRun = opts.dryRun || !rel.ligado;
  rel.dryRun = dryRun;

  const { data, error } = await deps.admin.rpc("cadastro_lembretes_candidatas", { p_limite: 200 });
  if (error) return { ...rel, erro: error.message };
  const candidatas = (Array.isArray(data) ? data : [])
    .map((r) => candidataDaLinha(r as Record<string, unknown>))
    .filter((j): j is JornadaParaLembrete => j !== null);
  rel.candidatas = candidatas.length;

  const vencidos = candidatas.flatMap((j) => lembretesVencidos(j, agora).map((canal) => ({ j, canal })));

  // Quem respondeu SAIR — uma pergunta só, para a leva inteira.
  const telefones = Array.from(new Set(vencidos.filter((v) => v.canal === "whatsapp").map((v) => destinoCanonico("whatsapp", v.j.whatsapp!))));
  let saidas: Set<string> | "todos" = new Set();
  if (telefones.length) {
    try {
      const r = await deps.admin.rpc("whatsapp_saidas_entre", { p_telefones: telefones });
      saidas = r.error || !Array.isArray(r.data) ? "todos" : new Set(r.data.filter((t): t is string => typeof t === "string"));
    } catch {
      saidas = "todos";
    }
  }

  for (const { j, canal } of vencidos) {
    const para = canal === "whatsapp" ? j.whatsapp! : j.email!;
    const item = { jornada: j.id, canal, destino: mascararContato(canal, para) };
    if (canal === "whatsapp" && (saidas === "todos" || saidas.has(destinoCanonico("whatsapp", para)))) {
      rel.bloqueados++; rel.itens.push({ ...item, resultado: "bloqueado" }); continue;
    }
    if (!deps.ativo(canal)) {
      rel.semProvedor++; rel.itens.push({ ...item, resultado: "sem_provedor" }); continue;
    }
    if (dryRun) { rel.itens.push({ ...item, resultado: "sairia" }); continue; }

    const reserva = await deps.admin.rpc("cadastro_lembrete_reservar", { p_jornada: j.id, p_canal: canal });
    if (reserva.error) { rel.falhas++; rel.itens.push({ ...item, resultado: "falhou", erro: reserva.error.message }); continue; }
    const idReserva = typeof reserva.data === "string" ? reserva.data : null;
    if (!idReserva) { rel.itens.push({ ...item, resultado: "ja_lembrado" }); continue; }

    const t = textoDoLembrete(j, opts.link, RODAPE_SAIR, canal);
    let r: { ok: boolean; id?: string | null; erro?: string | null };
    try {
      r = await deps.enviar({ canal, para, ...t, template: canal === "whatsapp" ? deps.template : undefined });
    } catch (e) {
      r = { ok: false, erro: e instanceof Error ? e.message : "erro ao enviar" };
    }
    const fim = await deps.admin.rpc("cadastro_lembrete_concluir", {
      p_id: idReserva, p_situacao: r.ok ? "enviado" : "falhou", p_id_provedor: r.id ?? null, p_erro: r.ok ? null : (r.erro ?? "falha do provedor"),
    });
    if (r.ok) rel.enviados++; else rel.falhas++;
    rel.itens.push({ ...item, resultado: r.ok ? "enviado" : "falhou", erro: r.ok ? (fim.error ? `concluir: ${fim.error.message}` : undefined) : (r.erro ?? undefined) });
  }
  return rel;
}
