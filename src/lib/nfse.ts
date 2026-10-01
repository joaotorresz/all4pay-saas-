/**
 * Notas fiscais de serviço (NFS-e) — obrigação fiscal do RECEBER. Demo-safe:
 *  • demo → localStorage; receita/ISS no imported store;
 *  • live → tabela `public.nfse` (RLS) + receita/ISS em `movements`.
 * N2: nota que decorre de fatura de recorrência liga `recurrence_id`/`movement_id`
 * existentes e NÃO cria 2º movement de receita; nota avulsa cria normalmente.
 * Emissão real é assíncrona/externa (provedor + webservice) — aqui simulada.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { primeiraContaAtiva } from "@/lib/conta-padrao";
import { isoDay } from "@/lib/aggregations";
import { appendImported, removerImported } from "@/lib/imported";
import type { Movement } from "@/lib/types";
import { semAmostra, TETO_LINHAS } from "@/lib/supabase/consulta";
import { reportar } from "@/lib/erros";
import { ler as lerOrg, gravar as gravarOrg } from "@/lib/store-org";
import { receitaReaproveitada } from "@/core/vendas/nota";

export type StatusNfse = "rascunho" | "processando" | "autorizada" | "rejeitada" | "enviada" | "cancelada";

export interface Nfse {
  id: string;
  tomadorId: string;
  tomadorNome: string;
  discriminacao: string;
  codigoServico: string;
  valorServico: number;
  municipio: string;
  issAliquota: number;
  competencia: string;
  aguardarPagamento: boolean;
  recorrenciaId?: string;       // N2: origem (fatura de recorrência)
  movimentoReceita?: string;    // N2: movement já existente da fatura
  numero?: string;
  codigoVerificacao?: string;
  motivoRejeicao?: string;
  movimentos: string[];
  status: StatusNfse;
  criadoEm: string;
}

const KEY = "a4p_nfse";
let cache: Nfse[] | undefined;
let hydrated = false;
function loadLocal(): Nfse[] {
  if (cache) return cache;
  if (typeof window === "undefined") { cache = []; return cache; }
  cache = [...lerOrg<Nfse[]>(KEY, [])];
  return cache!;
}
// ⚠️ Só a DEMONSTRAÇÃO grava aqui (produção: tabela `nfse`; chave CONGELADA).
function saveLocal(list: Nfse[]) {
  cache = list;
  gravarOrg(KEY, list);
}

export const issDe = (n: Pick<Nfse, "valorServico" | "issAliquota">) => Math.round(n.valorServico * (n.issAliquota / 100) * 100) / 100;
export const liquidoDe = (n: Nfse) => Math.round((n.valorServico - issDe(n)) * 100) / 100;

type StatusDB = "rascunho" | "processando" | "autorizada" | "rejeitada" | "cancelada" | "substituida";
const statusToDB = (s: StatusNfse): StatusDB => (s === "enviada" ? "autorizada" : s);
type Embed = { name: string } | { name: string }[] | null | undefined;
const nomeEmbed = (p: Embed) => (Array.isArray(p) ? (p[0]?.name ?? "—") : (p?.name ?? "—"));
interface NfseRow {
  id: string; tomador_id: string | null; movement_id: string | null; recurrence_id: string | null;
  service_code: string | null; description: string | null; amount: number; iss_rate: number | null;
  municipality: string | null; competence: string | null; await_payment: boolean;
  numero: string | null; codigo_verificacao: string | null; status: StatusDB; created_at: string;
  parties?: Embed;
}
function fromRow(r: NfseRow): Nfse {
  return {
    id: r.id, tomadorId: r.tomador_id ?? "", tomadorNome: nomeEmbed(r.parties),
    discriminacao: r.description ?? "", codigoServico: r.service_code ?? "", valorServico: Number(r.amount),
    municipio: r.municipality ?? "", issAliquota: Number(r.iss_rate ?? 0),
    competencia: r.competence ?? isoDay(new Date()), aguardarPagamento: r.await_payment,
    recorrenciaId: r.recurrence_id ?? undefined, numero: r.numero ?? undefined,
    codigoVerificacao: r.codigo_verificacao ?? undefined,
    movimentos: r.movement_id ? [r.movement_id] : [], status: r.status === "substituida" ? "cancelada" : r.status, criadoEm: r.created_at,
    // ⚠️ O vínculo com a receita REAPROVEITADA tem de sobreviver à recarga:
    // sem ele, transmitir um rascunho lançava uma segunda receita e cancelar
    // a nota apagava a receita da fatura (ver `receitaReaproveitada`).
    movimentoReceita: receitaReaproveitada({ status: r.status, movimentoId: r.movement_id, recorrenciaId: r.recurrence_id })
      ? (r.movement_id ?? undefined) : undefined,
  };
}

export async function hydrateNfse(force = false): Promise<void> {
  if (hydrated && !force) return;
  if (isDemo) { cache = loadLocal(); hydrated = true; return; }
  try {
    // ⚠️ O cliente do banco não LANÇA: devolve `error`. Sem ler o erro, uma
    // recusa virava lista vazia ("nenhuma nota") sem aviso nenhum.
    const { data, error } = await createClient().from("nfse")
      .select("id,tomador_id,movement_id,recurrence_id,service_code,description,amount,iss_rate,municipality,competence,await_payment,numero,codigo_verificacao,status,created_at,parties(name)")
      .order("created_at", { ascending: false }).limit(TETO_LINHAS);
    if (error) throw new Error(error.message);
    cache = ((data ?? []) as unknown as NfseRow[]).map(fromRow);
    hydrated = true;
  } catch (e) {
    reportar("vendas.nfse", e, "as notas de serviço não aparecem na lista", true); cache = cache ?? []; }
}

export function listNfse(): Nfse[] {
  return [...(cache ?? [])].sort((a, b) => (b.criadoEm < a.criadoEm ? -1 : 1));
}

export interface NovaNfse {
  tomadorId: string; tomadorNome: string; discriminacao: string; codigoServico: string;
  valorServico: number; municipio: string; issAliquota: number; aguardarPagamento: boolean;
  recorrenciaId?: string; movimentoReceita?: string; // N2 (quando vem de recorrência)
}
export async function criarNfse(n: NovaNfse): Promise<Nfse> {
  await hydrateNfse();
  const nf: Nfse = {
    id: `nfse-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    ...n, competencia: isoDay(new Date()), movimentos: [], status: "rascunho", criadoEm: new Date().toISOString(),
  };
  if (isDemo) { saveLocal([nf, ...loadLocal()]); return nf; }
  const isUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);
  // ⚠️ O erro do banco era descartado: com a inserção recusada, `data` vinha
  // nulo e a função devolvia a nota LOCAL, com id inventado — a tela a listava
  // como criada, a transmissão atualizava um id que não existe, e a nota nunca
  // chegava à tabela. Agora a recusa sobe com a mensagem dele.
  const { data, error } = await createClient().from("nfse").insert({
    tomador_id: isUuid(n.tomadorId) ? n.tomadorId : null, recurrence_id: isUuid(n.recorrenciaId) ? n.recorrenciaId : null,
    service_code: n.codigoServico, description: n.discriminacao, amount: n.valorServico, iss_rate: n.issAliquota,
    taxes: { iss: Math.round(n.valorServico * (n.issAliquota / 100) * 100) / 100 }, municipality: n.municipio,
    competence: isoDay(new Date()), await_payment: n.aguardarPagamento, status: "rascunho",
    // ⚠️ A receita reaproveitada (título da venda ou fatura da assinatura) vai
    // para o BANCO desde o rascunho. Antes ela ficava só no objeto da sessão — e
    // nem nele: a nota devolvida era remontada da linha gravada, sem o campo.
    // Em produção, "Emitir NF" da venda transmitia sem saber da receita da
    // venda e lançava OUTRA: o faturamento dobrava no DRE.
    movement_id: isUuid(n.movimentoReceita) ? n.movimentoReceita : null,
  }).select("id,tomador_id,movement_id,recurrence_id,service_code,description,amount,iss_rate,municipality,competence,await_payment,numero,codigo_verificacao,status,created_at").single();
  if (error) throw new Error(error.message);
  const saved = data
    ? { ...fromRow({ ...(data as NfseRow), parties: { name: n.tomadorNome } }), movimentoReceita: n.movimentoReceita, recorrenciaId: n.recorrenciaId }
    : nf;
  cache = [saved, ...(cache ?? [])];
  return saved;
}

export async function transmitirNfse(id: string): Promise<Nfse | null> {
  await hydrateNfse();
  const list = cache ?? [];
  let i = list.findIndex((x) => x.id === id);
  if (i < 0) return null;
  list[i] = { ...list[i], status: "processando" };
  cache = [...list];
  if (isDemo) saveLocal(cache);
  else {
    const { error } = await createClient().from("nfse").update({ status: "processando" }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  await new Promise((r) => setTimeout(r, 1200)); // prefeitura (simulada)

  i = (cache ?? []).findIndex((x) => x.id === id);
  const nf = { ...(cache as Nfse[])[i] };
  // A nota autorizada é gravada mesmo quando a receita falha (a prefeitura já
  // a aceitou); a falha da receita sobe DEPOIS, para a tela dizer o que fazer.
  let falhaReceita: unknown = null;
  if (!nf.tomadorId) {
    nf.status = "rejeitada";
    nf.motivoRejeicao = "Tomador incompleto — a prefeitura exige CNPJ/CPF e endereço.";
  } else {
    nf.status = "autorizada";
    nf.numero = String(100000 + (list.length + 1));
    nf.codigoVerificacao = Math.random().toString(36).slice(2, 10).toUpperCase();
    try { nf.movimentos = await refletirNaDRE(nf); } catch (e) { falhaReceita = e; nf.movimentos = []; }
  }
  const next = [...(cache as Nfse[])]; next[i] = nf; cache = next;
  if (isDemo) saveLocal(next);
  else {
    const { error } = await createClient().from("nfse").update({
    status: statusToDB(nf.status), numero: nf.numero ?? null, codigo_verificacao: nf.codigoVerificacao ?? null,
    movement_id: nf.movimentos[0] ?? nf.movimentoReceita ?? null,
    }).eq("id", id);
    if (error) throw new Error(error.message);
  }
  if (falhaReceita) throw falhaReceita;
  return nf;
}

/** Liga a NFS-e ao hub: cria o `movement` de RECEITA do serviço (DRE receita
 *  bruta + /recebiveis). N2: se já há receita (fatura de recorrência), reaproveita
 *  e NÃO cria 2ª. N4: o ISS NÃO vira título "a pagar" avulso — fica computado na
 *  nota; a DRE-dedução do ISS lendo a nota é evolução do core/dre. */
async function refletirNaDRE(nf: Nfse): Promise<string[]> {
  const hoje = isoDay(new Date());
  const ids: string[] = [];
  if (nf.movimentoReceita) return [nf.movimentoReceita]; // N2: reaproveita a fatura

  const receita: Movement = {
    id: `${nf.id}-rec`, account_id: "", type: "entrada", status: "pendente", category: "Serviços",
    amount: nf.valorServico, party_id: nf.tomadorId, due_date: hoje,
    // A NFS-e é o fato gerador: a competência é a da emissão (hoje).
    competence_date: hoje, paid_date: null, reconciled: false,
    description: `NFS-e ${nf.numero} · ${nf.tomadorNome}`,
  } as Movement;

  if (isDemo) { appendImported({ movement: receita }); ids.push(receita.id); return ids; }
  const supabase = createClient();
  // ⚠️ Nota autorizada SEM receita era silêncio: sem conta, ou com o insert
  // recusado, a função devolvia vazio e a tela dizia "receita na DRE". A nota
  // continua autorizada (a prefeitura já a aceitou), mas a falha sobe.
  const accId = await primeiraContaAtiva(supabase);
  if (!accId) throw new Error("Nota autorizada, mas a receita não foi lançada: cadastre uma conta bancária e lance o recebimento em Títulos a receber.");
  const { data, error } = await supabase.from("movements").insert({
    // ⚠️ ONDA 5: o título nasce da NOTA, e a origem diz isso.
    origem: "venda" as const,
    account_id: accId, type: "entrada", situacao: "previsto", category: "Serviços", amount: nf.valorServico,
    party_id: nf.tomadorId, due_date: hoje, paid_date: null, reconciled: false, description: receita.description,
    competence_date: hoje, // a NFS-e é o fato gerador
  }).select("id").single();
  if (error) throw new Error(`Nota autorizada, mas a receita não foi lançada: ${error.message}`);
  if (data) ids.push((data as { id: string }).id);
  return ids;
}

export async function enviarAoTomador(id: string): Promise<void> {
  const list = cache ?? []; const i = list.findIndex((x) => x.id === id);
  if (i < 0 || list[i].status !== "autorizada") return;
  list[i] = { ...list[i], status: "enviada" }; cache = [...list];
  if (isDemo) saveLocal(cache); // live: "enviada" é sub-estado de UI; mantém autorizada no banco
}

export async function cancelarNfse(id: string): Promise<void> {
  const list = cache ?? []; const i = list.findIndex((x) => x.id === id);
  if (i < 0) return;
  const nf = list[i];
  // N2: não remove a receita reaproveitada (da venda ou da fatura). ⚠️ Em
  // produção a pergunta vai ao banco: a nota pode ter sido carregada de uma
  // sessão anterior, e o título com chave de venda é da VENDA — cancelar a nota
  // não pode tirar o recebível do contas a receber.
  const remover: string[] = [];
  for (const m of nf.movimentos) {
    if (m === nf.movimentoReceita || receitaReaproveitada({ status: nf.status, movimentoId: m, recorrenciaId: nf.recorrenciaId })) continue;
    if (!isDemo) {
      const { data, error } = await semAmostra(createClient().from("movements").select("sale_doc_id")).eq("id", m).maybeSingle();
      if (error) throw new Error(error.message);
      if ((data as { sale_doc_id: string | null } | null)?.sale_doc_id) continue;
    }
    remover.push(m);
  }
  if (remover.length) {
    if (isDemo) removerImported(remover);
    else {
      const { excluirLogicoEmLote } = await import("@/lib/exclusao");
      await excluirLogicoEmLote("movements", remover, "Nota fiscal cancelada");
    }
  }
  list[i] = { ...nf, movimentos: [], status: "cancelada" }; cache = [...list];
  if (isDemo) saveLocal([...list]);
  else {
    const { error } = await createClient().from("nfse").update({ status: "cancelada" }).eq("id", id);
    if (error) throw new Error(error.message);
  }
}

export function clearNfse(): void { saveLocal([]); }
