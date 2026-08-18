/**
 * Leitura inteligente de documento (boleto/comprovante/nota) → análise +
 * gravação no sistema. Faz o cross-check do beneficiário contra os Contatos,
 * decide a ação (vou pagar/receber · paguei/recebi), detecta baixa de algo
 * agendado e gera ideias. Confirmado, grava o lançamento (demo: store local;
 * live: Supabase) — passando a refletir em dashboard/DRE/risco/tudo.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { appendImported } from "@/lib/imported";
import type { Movement, Party } from "@/lib/types";

import { formatBRL } from "@/lib/format";
/** Campos normalizados que vêm do OCR (Claude ou local) ou de entrada manual. */
export interface DocFields {
  tipo: string;
  beneficiario: string | null;
  pagador: string | null;
  valor: number | null;
  data: string | null;
  vencimento: string | null;
  cnpj: string | null;
  cpf: string | null;
  acaoTipo: "a_pagar" | "a_receber" | "entrada" | "baixa" | "transferencia" | "imposto" | null;
  acao: string | null;
  categoria: string | null;
  confianca: number;
}

export type AcaoFinal = "Vou pagar" | "Vou receber" | "Paguei" | "Recebi" | "Transferência";

export interface AnaliseDocumento {
  fields: DocFields;
  contraparte: string | null;
  acaoFinal: AcaoFinal;
  tipoMov: "entrada" | "saida";
  pago: boolean; // comprovante de algo já realizado
  jaVencido: boolean;
  contato: Party | null; // cross-check encontrou o cadastro
  sugerirCadastro: boolean; // beneficiário ainda não cadastrado
  baixaDe: Movement | null; // comprovante casa com um pendente (dar baixa)
  /** o beneficiário é um CUSTO RECORRENTE (aparece mês após mês no histórico) */
  custoRecorrente: { meses: number; mediaMensal: number } | null;
  crossCheck: string[];
  ideias: string[];
  confianca: number;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const soDigitos = (s: string | null | undefined) => (s || "").replace(/\D/g, "");

function parseISO(s: string | null): string | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const br = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (br) {
    const [, d, m, y] = br;
    return `${y.length === 2 ? "20" + y : y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/**
 * Analisa o documento: ação, cross-check do beneficiário e baixa de agendados.
 * `parties` e `pendentes` vêm do estado atual do sistema (Contatos + lançamentos
 * pendentes) — é o que permite o cross-check ("a conta cadastrada do CNPJ é a
 * Padaria 123 e o boleto é para ela").
 */
/** Forma mínima do histórico p/ detectar recorrência (Movement e RiskMovement servem). */
export interface MovimentoHistorico {
  type: "entrada" | "saida";
  status: string;
  amount: number;
  due_date: string;
  paid_date?: string | null;
  party_id?: string | null;
  category?: string | null;
  description?: string | null;
}

export function analisarDocumento(fields: DocFields, parties: Party[], pendentes: Movement[], historico: MovimentoHistorico[] = []): AnaliseDocumento {
  const hoje = isoDay(new Date());
  const venc = parseISO(fields.vencimento);
  const data = parseISO(fields.data);
  const contraparte = fields.beneficiario || fields.pagador || null;
  const docDigits = soDigitos(fields.cnpj) || soDigitos(fields.cpf);

  // Comprovante/recebimento = já realizado; boleto/nota/guia = futuro.
  const pago = fields.acaoTipo === "entrada" || fields.acaoTipo === "baixa" ||
    /comprovante|recibo|pix\s*recebido|pago/i.test(`${fields.tipo} ${fields.acao ?? ""}`);

  // Recebo (entrada) vs pago (saída).
  const ehReceita = fields.acaoTipo === "a_receber" ||
    (fields.acaoTipo === "entrada" && !/boleto|fatura|nota|darf|guia|imposto/i.test(fields.tipo));
  const tipoMov: "entrada" | "saida" = ehReceita ? "entrada" : "saida";

  const acaoFinal: AcaoFinal = pago
    ? (tipoMov === "entrada" ? "Recebi" : "Paguei")
    : (tipoMov === "entrada" ? "Vou receber" : "Vou pagar");

  // --- Cross-check do beneficiário contra os Contatos ---
  let contato: Party | null = null;
  if (docDigits) contato = parties.find((p) => soDigitos((p as Party & { doc?: string }).doc) === docDigits) ?? null;
  if (!contato && contraparte) {
    const alvo = norm(contraparte);
    // Exato primeiro; substring só com nome ≥4 chars (senão "Ana"/"Sá" casam
    // "Banana"/qualquer coisa e ligam o contato/party_id errado).
    contato = parties.find((p) => norm(p.name) === alvo)
      ?? (alvo.length >= 4
        ? parties.find((p) => { const n = norm(p.name); return n.length >= 4 && (n.includes(alvo) || alvo.includes(n)); })
        : undefined)
      ?? null;
  }
  const sugerirCadastro = !contato && !!contraparte;

  // --- Baixa de algo agendado: comprovante casa com um pendente parecido ---
  let baixaDe: Movement | null = null;
  if (pago && fields.valor) {
    const alvoNome = contraparte ? norm(contraparte) : null;
    baixaDe = pendentes.find((m) => {
      if (m.status !== "pendente" || m.type !== tipoMov) return false;
      const perto = Math.abs(m.amount - fields.valor!) / Math.max(1, fields.valor!) <= 0.02;
      if (!perto) return false;
      if (!alvoNome) return true;
      const rot = norm(`${m.description ?? ""} ${m.category ?? ""}`);
      // party_id (exato) é o sinal forte; substring do nome só com ≥4 chars,
      // senão um nome curto/truncado marca baixa num título não relacionado.
      return (contato ? m.party_id === contato.id : false)
        || (alvoNome.length >= 4 && (rot.includes(alvoNome) || alvoNome.includes(rot)));
    }) ?? null;
  }

  const jaVencido = !pago && !!venc && venc < hoje;

  // --- Custo recorrente: o beneficiário aparece mês após mês no histórico? ---
  // (só para saídas; ≥3 meses distintos do mesmo party/nome → é o "boleto fixo")
  let custoRecorrente: AnaliseDocumento["custoRecorrente"] = null;
  if (tipoMov === "saida" && historico.length) {
    const alvoNome = contraparte ? norm(contraparte) : null;
    const doMesmo = historico.filter((m) => {
      if (m.type !== "saida" || m.status === "cancelado") return false;
      if (contato && m.party_id) return m.party_id === contato.id;
      if (!alvoNome || alvoNome.length < 4) return false;
      const rot = norm(`${m.description ?? ""} ${m.category ?? ""}`);
      return rot.includes(alvoNome) || (rot.length >= 4 && alvoNome.includes(rot));
    });
    const meses = new Set(doMesmo.map((m) => (m.paid_date || m.due_date || "").slice(0, 7)).filter(Boolean));
    if (meses.size >= 3) {
      const total = doMesmo.reduce((s, m) => s + Math.abs(m.amount), 0);
      custoRecorrente = { meses: meses.size, mediaMensal: total / meses.size };
    }
  }

  // --- Cross-check legível ---
  const crossCheck: string[] = [];
  if (contato) crossCheck.push(`Beneficiário confere com o cadastro: ${contato.name}${docDigits ? ` (${fields.cnpj || fields.cpf})` : ""}.`);
  else if (sugerirCadastro) crossCheck.push(`${contraparte} ainda não está em Contatos — sugerimos cadastrar.`);
  if (baixaDe) crossCheck.push(`Casa com um lançamento agendado de ${formatBRLsafe(baixaDe.amount)} — dá para baixar.`);
  if (custoRecorrente) crossCheck.push(`Custo recorrente: aparece em ${custoRecorrente.meses} meses do histórico (~${formatBRLsafe(custoRecorrente.mediaMensal)}/mês).`);
  if (venc) crossCheck.push(`Vencimento ${venc}${jaVencido ? " (vencido)" : ""}.`);

  // --- Ideias ---
  const ideias: string[] = [];
  if (!pago && venc) ideias.push(`Agendar ${tipoMov === "saida" ? "pagamento" : "recebimento"} para ${venc}.`);
  if (jaVencido) ideias.push("Está vencido — priorize a regularização.");
  if (baixaDe) ideias.push("Dar baixa no agendamento correspondente (evita duplicar).");
  if (sugerirCadastro) ideias.push(`Cadastrar ${contraparte} em Contatos para cobrança/relatórios.`);
  if (custoRecorrente && !pago) ideias.push("É um custo mensal — considere criar uma recorrência para lançar sozinho.");
  if (!fields.categoria) ideias.push("Definir a categoria melhora DRE e benchmark.");

  return {
    fields: { ...fields, vencimento: venc, data },
    contraparte, acaoFinal, tipoMov, pago, jaVencido,
    contato, sugerirCadastro, baixaDe, custoRecorrente, crossCheck, ideias,
    confianca: fields.confianca,
  };
}

function formatBRLsafe(n: number): string {
  try { return formatBRL(n); }
  catch { return `R$${n.toFixed(2)}`; }
}

/** Mapa ação → (tipo do movimento, já realizado?). Usado quando o usuário
 *  corrige manualmente a leitura na confirmação. */
export const ACAO_MAP: Record<Exclude<AcaoFinal, "Transferência">, { tipoMov: "entrada" | "saida"; pago: boolean }> = {
  "Vou pagar": { tipoMov: "saida", pago: false },
  "Vou receber": { tipoMov: "entrada", pago: false },
  "Paguei": { tipoMov: "saida", pago: true },
  "Recebi": { tipoMov: "entrada", pago: true },
};

export interface ConfirmacaoInput {
  analise: AnaliseDocumento;
  criarContato: boolean; // o usuário aceitou cadastrar o beneficiário novo
  categoria?: string;
  valor?: number;
  vencimento?: string;
  acaoOverride?: AcaoFinal; // correção manual da ação (leitura errada)
}

export interface ResultadoConfirmacao {
  movimento: boolean;
  contatoCriado: boolean;
  baixa: boolean;
  simulado: boolean;
}

const ACC_FALLBACK = "acc-import";

/**
 * Grava o documento confirmado no sistema. Demo: anexa ao dataset (store local).
 * Live: cria o contato (se novo) e o lançamento no Supabase; se for baixa de um
 * agendado, marca o pendente como pago em vez de duplicar.
 */
export async function confirmarDocumento(input: ConfirmacaoInput): Promise<ResultadoConfirmacao> {
  const { analise, criarContato } = input;
  const f = analise.fields;
  const hoje = isoDay(new Date());
  const valor = input.valor ?? f.valor ?? 0;
  const venc = input.vencimento ?? f.vencimento ?? f.data ?? hoje;
  const categoria = input.categoria ?? f.categoria ?? analise.fields.tipo;
  const nome = analise.contraparte ?? f.tipo;

  // Ação efetiva: correção manual do usuário sobrepõe a leitura automática.
  const override = input.acaoOverride && input.acaoOverride !== "Transferência" ? ACAO_MAP[input.acaoOverride] : null;
  const tipoMov = override ? override.tipoMov : analise.tipoMov;
  const pago = override ? override.pago : analise.pago;
  // A baixa só vale se a ação ainda for "realizada" e do mesmo tipo que a casou.
  const baixaDe = pago && tipoMov === analise.tipoMov && analise.pago ? analise.baixaDe : null;

  if (isDemo) {
    const party: Party | undefined = criarContato && analise.sugerirCadastro
      ? {
          id: `cad-${Date.now()}`,
          type: soDigitos(f.cpf) ? "pf" : "pj",
          name: nome,
          is_customer: tipoMov === "entrada",
          is_supplier: tipoMov === "saida",
          ...(f.cnpj || f.cpf ? { doc: (f.cnpj || f.cpf) as string } : {}),
        } as Party
      : undefined;
    const partyId = analise.contato?.id ?? party?.id;
    const movement: Movement = {
      id: `up-doc-${Date.now()}`,
      account_id: ACC_FALLBACK,
      type: tipoMov,
      status: pago ? "pago" : "pendente",
      category: categoria,
      amount: valor,
      party_id: partyId,
      due_date: venc,
      paid_date: pago ? (f.data ?? hoje) : null,
      reconciled: pago,
      description: nome,
    } as Movement;
    appendImported({ movement, party, baixaDe: baixaDe?.id });
    await new Promise((r) => setTimeout(r, 350));
    return { movimento: !baixaDe, contatoCriado: !!party, baixa: !!baixaDe, simulado: true };
  }

  // ---- Live (Supabase) ----
  const supabase = createClient();
  const out: ResultadoConfirmacao = { movimento: false, contatoCriado: false, baixa: false, simulado: false };

  let partyId: string | null = analise.contato?.id ?? null;
  if (!partyId && criarContato && analise.sugerirCadastro) {
    const { data, error } = await supabase
      .from("parties")
      .insert({
        type: soDigitos(f.cpf) ? "pf" : "pj",
        name: nome,
        is_customer: tipoMov === "entrada",
        is_supplier: tipoMov === "saida",
        doc: f.cnpj || f.cpf || null,
      })
      .select("id")
      .single();
    if (!error) { partyId = (data as { id: string } | null)?.id ?? null; out.contatoCriado = true; }
  }

  // Baixa de agendado: atualiza o pendente em vez de criar outro lançamento.
  if (baixaDe) {
    const { error } = await supabase
      .from("movements")
      .update({ status: "pago", paid_date: f.data ?? hoje, reconciled: true })
      .eq("id", baixaDe.id);
    if (!error) { out.baixa = true; return out; }
  }

  // Caso geral: cria o lançamento (precisa de uma conta).
  let accId: string | undefined;
  const { data: accs } = await supabase.from("financial_accounts").select("id").limit(1);
  accId = (accs as { id: string }[] | null)?.[0]?.id;
  if (!accId) {
    const { data: created } = await supabase
      .from("financial_accounts")
      .insert({ name: "Conta consolidada", bank: "inter", balance: 0 })
      .select("id")
      .single();
    accId = (created as { id: string } | null)?.id;
  }
  if (accId) {
    const { error } = await supabase.from("movements").insert({
      // ⚠️ ONDA 5: documento avulso lido por OCR é IMPORTAÇÃO.
      origem: "importacao" as const,
      account_id: accId,
      type: tipoMov,
      status: pago ? "pago" : "pendente",
      category: categoria,
      amount: valor,
      due_date: venc,
      paid_date: pago ? (f.data ?? hoje) : null,
      reconciled: pago,
      description: nome,
      party_id: partyId,
    });
    if (!error) out.movimento = true;
  }
  return out;
}
