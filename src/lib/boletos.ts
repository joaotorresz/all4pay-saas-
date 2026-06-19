/**
 * Boleto — instrumento de cobrança do RECEBER. Vive DENTRO do recebível
 * (`movements.boleto` jsonb), sem tabela nova. Demo-safe:
 *  • demo → imported store (`updateImportedMovement`);
 *  • live → Supabase (`movements.boleto`).
 * Conciliação AUTOMÁTICA: como o all4pay é o emissor/recebedor, boleto pago vai
 * direto a `conciliado` (não passa pelo /conciliacao). Emissão real = // TODO PSP.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { isoDay } from "@/lib/aggregations";
import { updateImportedMovement } from "@/lib/imported";
import { gerarPixCopiaECola, dadosPixEmpresa } from "@/lib/pix";
import type { Movement, BoletoData } from "@/lib/types";

const digitos = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join("");
function mockNossoNumero(): string { return `${digitos(11)}-${digitos(1)}`; }
function mockLinhaDigitavel(): string {
  return `${digitos(5)}.${digitos(5)} ${digitos(5)}.${digitos(6)} ${digitos(5)}.${digitos(6)} ${digitos(1)} ${digitos(14)}`;
}
function mockCodigoBarras(): string { return digitos(44); }

export interface OpcoesBoleto {
  multa?: number; juros?: number; desconto?: number; instrucoes?: string; conta?: string | null;
}

/** Emite o boleto de um recebível. (// TODO INTEGRAÇÃO PSP/BANCO EMISSOR — mock por ora.) */
export async function emitirBoleto(mov: Movement, opts: OpcoesBoleto = {}): Promise<BoletoData> {
  // PIX é emissão REAL (BR Code/EMV, sem PSP) quando a empresa tem chave (CNPJ).
  const pix = dadosPixEmpresa();
  const boleto: BoletoData = {
    status: "emitido", // TODO: gerado → registrado → emitido via PSP; mock vai direto a emitido
    nosso_numero: mockNossoNumero(),
    linha_digitavel: mockLinhaDigitavel(),
    codigo_barras: mockCodigoBarras(),
    conta_recebimento: opts.conta ?? mov.account_id ?? null,
    multa: opts.multa ?? 0, juros: opts.juros ?? 0, desconto: opts.desconto ?? 0,
    instrucoes: opts.instrucoes,
    emitido_em: isoDay(new Date()), paid_date: null,
    pix_copia_cola: pix ? gerarPixCopiaECola({ chave: pix.chave, valor: mov.amount, nome: pix.nome, cidade: pix.cidade, txid: mov.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 25) }) : null,
  };
  if (isDemo) updateImportedMovement(mov.id, { boleto });
  else await createClient().from("movements").update({ boleto }).eq("id", mov.id);
  return boleto;
}

/**
 * Marca o boleto pago → conciliado AUTOMÁTICO (boleto próprio). O recebível
 * liquida (status pago + paid_date) e o saldo da conta sobe.
 */
export async function marcarPagoBoleto(mov: Movement): Promise<void> {
  if (!mov.boleto) return;
  const hoje = isoDay(new Date());
  const boleto: BoletoData = { ...mov.boleto, status: "conciliado", paid_date: hoje };
  if (isDemo) {
    updateImportedMovement(mov.id, { boleto }, { liquidar: true, paidISO: hoje });
    return;
  }
  const s = createClient();
  await s.from("movements").update({ boleto, status: "pago", paid_date: hoje, reconciled: true }).eq("id", mov.id);
  // saldo sobe na conta de recebimento (entrada liquidada)
  const accId = boleto.conta_recebimento ?? mov.account_id;
  if (accId) {
    const { data } = await s.from("financial_accounts").select("balance").eq("id", accId).single();
    const saldo = data ? Number((data as { balance: number }).balance) : null;
    if (saldo != null) await s.from("financial_accounts").update({ balance: Math.round((saldo + mov.amount) * 100) / 100 }).eq("id", accId);
  }
}

export async function cancelarBoleto(mov: Movement): Promise<void> {
  if (!mov.boleto) return;
  const boleto: BoletoData = { ...mov.boleto, status: "cancelado" };
  if (isDemo) updateImportedMovement(mov.id, { boleto });
  else await createClient().from("movements").update({ boleto }).eq("id", mov.id);
}

/** Status efetivo (vencido se emitido e due_date passou). */
export function statusEfetivo(mov: Movement, hoje: string): BoletoData["status"] | null {
  const b = mov.boleto;
  if (!b) return null;
  if (b.status === "emitido" && mov.due_date < hoje) return "vencido";
  return b.status;
}
