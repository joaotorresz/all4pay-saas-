"use client";

/**
 * A maquininha Pinbank vista pela EMPRESA — leitura e as duas ações dela.
 *
 * Lê pela sessão do usuário (a política recorta pela empresa aberta). As duas
 * escritas são RPC/rota que recusam quem não administra: ativar/configurar o
 * vínculo (`pinbank_configurar_vinculo`) e reprocessar os eventos
 * (`/api/pinbank/reprocessar`).
 *
 * ⚠️ Nada aqui grava venda nem título. Quem grava é o banco
 * (`pinbank_aplicar`), chamado pelo webhook com a chave de serviço.
 *
 * ⚠️ Em demonstração não há maquininha conectada: a leitura é vazia e a tela
 * diz isso. Inventar vendas de maquininha aqui seria mostrar dado que não existe.
 */
import { isDemo } from "@/lib/demo";
import { createClient } from "@/lib/supabase/client";
import { motivoDaRecusa } from "@/lib/erros";
import {
  falhaDaConferenciaSemCorpo, planejarTitulosDemo, type PrazosPinbank, type RelatorioParaEmpresa, type TaxasPinbank,
  type TituloMaquininhaBruto, type VendaRelatorioBruta,
} from "@/core/pinbank";
import { comTeto, semAmostra } from "@/lib/supabase/filtros";
import { conferirTeto } from "@/lib/supabase/consulta";

export interface VinculoTela {
  id: string;
  estabelecimento_id: number | null;
  chave_gateway: string | null;
  nome: string | null;
  /** O `CodigoCliente` do extrato consolidado (o EC) — cadastrado pela plataforma; `null` = ainda não. */
  codigo_cliente: number | null;
  conta_id: string | null;
  taxas: TaxasPinbank;
  prazos: PrazosPinbank;
  antecipado: boolean;
  ativo: boolean;
  ativado_em: string | null;
  /** A empresa ligou a cobrança por Pix e boleto pela conta Pinbank deste vínculo. */
  cobranca_ativa: boolean;
}

export interface EventoTela {
  event_id: string;
  event_type: string;
  nsu: number | null;
  ocorrido_em: string;
  recebido_em: string;
  situacao: string;
  motivo: string | null;
  tentativas: number;
  /** `Data.valor` em centavos, como chegou. */
  valor_centavos: number | null;
}

export interface EstadoPinbank {
  vinculos: VinculoTela[];
  eventos: EventoTela[];
  pendentes: number;
}

const VAZIO: EstadoPinbank = { vinculos: [], eventos: [], pendentes: 0 };
export const SITUACOES_PENDENTES = ["aguardando_ativacao", "bloqueado", "erro", "recebido"];

export async function lerPinbank(): Promise<EstadoPinbank> {
  if (isDemo) return VAZIO;
  const s = createClient();
  const [v, e] = await Promise.all([
    s.from("pinbank_vinculos")
      .select("id, estabelecimento_id, chave_gateway, nome, codigo_cliente, conta_id, taxas, prazos, antecipado, ativo, ativado_em, cobranca_ativa")
      .order("criado_em").limit(50),
    s.from("pinbank_eventos")
      .select("event_id, event_type, nsu, ocorrido_em, recebido_em, situacao, motivo, tentativas, valor_centavos:payload->valor")
      .order("recebido_em", { ascending: false }).limit(50),
  ]);
  if (v.error) throw new Error(motivoDaRecusa(v.error));
  if (e.error) throw new Error(motivoDaRecusa(e.error));
  const eventos = (e.data ?? []) as EventoTela[];
  return {
    vinculos: (v.data ?? []) as VinculoTela[],
    eventos,
    pendentes: eventos.filter((x) => SITUACOES_PENDENTES.includes(x.situacao)).length,
  };
}

export async function configurarVinculo(p: {
  id: string; contaId: string | null; taxas: TaxasPinbank; prazos: PrazosPinbank; antecipado: boolean; ativo: boolean;
}): Promise<void> {
  const { error } = await createClient().rpc("pinbank_configurar_vinculo", {
    p_vinculo: p.id, p_conta: p.contaId, p_taxas: p.taxas, p_prazos: p.prazos,
    p_antecipado: p.antecipado, p_ativo: p.ativo,
  });
  if (error) throw new Error(motivoDaRecusa(error));
}

/**
 * Liga ou desliga a cobrança por Pix e boleto pela conta Pinbank. Quem decide é
 * o banco (`pinbank_cobranca_configurar`): só quem administra, só com a
 * maquininha ativa e com o código da conta cadastrado pela plataforma.
 */
export async function configurarCobranca(p: { id: string; ativa: boolean }): Promise<void> {
  const { error } = await createClient().rpc("pinbank_cobranca_configurar", { p_vinculo: p.id, p_ativa: p.ativa });
  if (error) throw new Error(motivoDaRecusa(error));
}

export async function reprocessarPinbank(): Promise<{ total: number; contagem: Record<string, number> }> {
  const r = await fetch("/api/pinbank/reprocessar", { method: "POST" });
  const corpo = (await r.json().catch(() => null)) as { ok?: boolean; motivo?: string; total?: number; contagem?: Record<string, number> } | null;
  if (!r.ok || !corpo?.ok) throw new Error(corpo?.motivo ?? `O reprocessamento respondeu ${r.status}.`);
  return { total: corpo.total ?? 0, contagem: corpo.contagem ?? {} };
}

export type ResultadoConferencia =
  | { ok: true; relatorio: RelatorioParaEmpresa; consultadoEm: string }
  /** `restanteMs`: só no 429 (`aguarde`) — quanto o BANCO disse que falta; o botão espera isso. */
  | { ok: false; codigo: string; motivo: string; restanteMs?: number };

/**
 * Quanto a tela espera pela rota: o `maxDuration` dela (60 s) e uma folga.
 * Passado isso, a resposta não vem mais — e a pessoa precisa saber disso em vez
 * de olhar um botão girando para sempre.
 */
const ESPERA_DA_ROTA_MS = 75_000;

/**
 * Pede a conferência extrato × sistema de UMA maquininha num período. Só
 * leitura — a rota não grava nada. Nunca lança: toda falha volta como
 * `{ ok: false, codigo, motivo }`, com a frase pronta para a tela.
 *
 * ⚠️ O pedido leva só o id do vínculo e o período: o código do estabelecimento
 * no extrato é lido pela rota a partir do vínculo, nunca daqui.
 *
 * ⚠️ Resposta SEM a frase da rota (o 504 da plataforma, uma página de erro no
 * caminho, o tempo esgotado): a frase sai de `falhaDaConferenciaSemCorpo`, e o
 * número do status fica só no CÓDIGO — nunca na frase que a pessoa lê.
 */
export async function conferirComExtrato(p: { vinculoId: string; de: string; ate: string }): Promise<ResultadoConferencia> {
  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), ESPERA_DA_ROTA_MS);
  let r: Response;
  try {
    r = await fetch("/api/pinbank/conferencia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vinculoId: p.vinculoId, de: p.de, ate: p.ate }),
      signal: controle.signal,
    });
  } catch {
    clearTimeout(relogio);
    if (controle.signal.aborted) return { ok: false, ...falhaDaConferenciaSemCorpo(null) };
    return { ok: false, codigo: "rede", motivo: "Não foi possível falar com o servidor. Confira a conexão e tente de novo. Nada foi alterado." };
  }
  const corpo = (await r.json().catch(() => null)) as
    | { ok?: boolean; codigo?: string; motivo?: string; erro?: string; relatorio?: RelatorioParaEmpresa; consultadoEm?: string; restanteMs?: unknown }
    | null;
  clearTimeout(relogio);
  // O tempo acabou no meio do corpo: a resposta não veio inteira.
  if (corpo == null && controle.signal.aborted) return { ok: false, ...falhaDaConferenciaSemCorpo(null) };
  if (corpo?.erro === "codigo_pendente") {
    return { ok: false, codigo: "codigo_pendente", motivo: "Confirme o código do aplicativo autenticador para continuar." };
  }
  if (r.ok && corpo?.ok && corpo.relatorio && corpo.consultadoEm) {
    return { ok: true, relatorio: corpo.relatorio, consultadoEm: corpo.consultadoEm };
  }
  const semFrase = falhaDaConferenciaSemCorpo(r.status);
  return {
    ok: false,
    codigo: typeof corpo?.codigo === "string" && corpo.codigo ? corpo.codigo : semFrase.codigo,
    motivo: typeof corpo?.motivo === "string" && corpo.motivo.trim() ? corpo.motivo : semFrase.motivo,
    // O 429 diz quanto o BANCO ainda recusa; a tela o lê por `esperaDoBotao` (que o limita a 1 ms … 60 s).
    ...(typeof corpo?.restanteMs === "number" && Number.isFinite(corpo.restanteMs) ? { restanteMs: corpo.restanteMs } : {}),
  };
}

/* ------------------------- as vendas recentes (Home) ------------------------- */

/**
 * O que o card "Transações recentes na maquininha" da Home lê: se a empresa
 * tem maquininha ligada e as últimas vendas que a Pinbank avisou pelo webhook
 * (`pinbank_transacoes` + o último evento de cada uma, pela forma e bandeira).
 * Pela sessão da pessoa: a política recorta pela empresa aberta.
 *
 * ⚠️ Em demonstração o card mostra vendas de EXEMPLO, marcadas como tal
 * (`exemplo: true`), como o resto da Home de demonstração. Fora dela, nunca.
 */
export interface LeituraVendasMaquininha {
  temMaquininha: boolean;
  linhas: VendaRelatorioBruta[];
  exemplo: boolean;
}

/**
 * Vendas de exemplo da demonstração: 62 dias, sempre terminando agora, com a
 * mesma semente (a tela não muda a cada recarga). Pix, débito, crédito e
 * parcelado em quatro bandeiras, mais algumas negadas e uma cancelada.
 */
function vendasDeExemplo(agora = new Date()): VendaRelatorioBruta[] {
  let semente = 20261019;
  const rnd = () => { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; };
  const formas: [string | null, number][] = [[null, 0.22], ["DEBITO", 0.3], ["AVISTA", 0.3], ["PARCELADO_LOJA", 0.18]];
  const bandeiras = ["VISA", "MASTERCARD", "ELO", "AMEX"];
  const horas = [8, 9, 10, 11, 11, 12, 12, 12, 13, 14, 15, 16, 17, 17, 18, 18, 19, 20];
  const out: VendaRelatorioBruta[] = [];
  let nsu = 900000;
  for (let d = 61; d >= 0; d--) {
    const dia = new Date(agora.getTime() - d * 86_400_000);
    const semana = new Date(`${diaEHoraLocal(dia)}T12:00:00Z`).getUTCDay();
    const n = semana === 0 ? 3 : semana === 6 ? 9 : 6 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const h = horas[Math.floor(rnd() * horas.length)];
      const ocorrido = new Date(`${diaEHoraLocal(dia)}T${String(h).padStart(2, "0")}:${String(Math.floor(rnd() * 60)).padStart(2, "0")}:00-03:00`);
      if (ocorrido > agora) continue;
      let x = rnd(); let forma: string | null = null;
      for (const [f, p] of formas) { if ((x -= p) <= 0) { forma = f; break; } }
      const parcelas = forma === "PARCELADO_LOJA" ? 2 + Math.floor(rnd() * 5) : 1;
      const base = forma === "PARCELADO_LOJA" ? 300 + rnd() * 1400 : 15 + rnd() * 240;
      const r = rnd();
      out.push({
        nsu: nsu++, status: r < 0.05 ? "Negada" : r < 0.06 ? "Cancelada" : "Aprovada",
        valor: Math.round(base * 100) / 100, ocorridoEm: ocorrido.toISOString(),
        formaPagamento: forma, numeroParcelas: parcelas, bandeira: forma ? bandeiras[Math.floor(rnd() * (rnd() < 0.85 ? 3 : 4))] : null,
        ehPix: forma === null, vinculoId: rnd() < 0.7 ? "demo-balcao" : "demo-delivery",
      });
    }
  }
  return out;
}

/** O dia de São Paulo de um instante (`YYYY-MM-DD`). */
function diaEHoraLocal(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Lê os eventos das vendas em lotes (uma URL com 2.000 NSUs não cabe). */
async function formasDasVendas(s: ReturnType<typeof createClient>, nsus: number[]) {
  const porNsu = new Map<number, { forma: string | null; parcelas: string | null; bandeira: string | null; pix: boolean }>();
  for (let i = 0; i < nsus.length; i += 200) {
    const lote = nsus.slice(i, i + 200);
    const e = await s.from("pinbank_eventos")
      .select("nsu, event_type, ocorrido_em, forma:payload->>formaPagamento, parcelas:payload->>numeroParcelas, bandeira:payload->cartao->>bandeira")
      .in("nsu", lote).order("ocorrido_em", { ascending: false }).limit(lote.length * 6);
    if (e.error) throw new Error(motivoDaRecusa(e.error));
    for (const ev of (e.data ?? []) as { nsu: number; event_type: string; forma: string | null; parcelas: string | null; bandeira: string | null }[]) {
      // O primeiro de cada NSU é o mais recente (a lista vem do mais novo ao mais velho).
      if (!porNsu.has(ev.nsu)) porNsu.set(ev.nsu, { forma: ev.forma, parcelas: ev.parcelas, bandeira: ev.bandeira, pix: /^compra\.pix/i.test(ev.event_type) });
    }
  }
  return porNsu;
}

/**
 * As vendas da maquininha desde `desde` (`YYYY-MM-DD`, dia de São Paulo; sem
 * ele, as `limite` mais recentes). Pela sessão: a política recorta pela empresa.
 */
export async function lerVendasMaquininha(limite = 100, desde?: string): Promise<LeituraVendasMaquininha> {
  if (isDemo) {
    const todas = vendasDeExemplo();
    return { temMaquininha: true, exemplo: true, linhas: desde ? todas.filter((v) => diaEHoraLocal(new Date(v.ocorridoEm)) >= desde) : todas.slice(-limite) };
  }
  const s = createClient();
  const [v, t] = await Promise.all([
    s.from("pinbank_vinculos").select("id").eq("ativo", true).limit(1),
    s.from("pinbank_transacoes").select("nsu, status, valor, ocorrido_em, vinculo_id")
      .gte("ocorrido_em", `${desde ?? "2000-01-01"}T00:00:00-03:00`)
      .order("ocorrido_em", { ascending: false }).limit(limite),
  ]);
  if (v.error) throw new Error(motivoDaRecusa(v.error));
  if (t.error) throw new Error(motivoDaRecusa(t.error));
  const trans = (t.data ?? []) as { nsu: number; status: string; valor: number | string; ocorrido_em: string; vinculo_id: string | null }[];
  conferirTeto("pinbank_transacoes", trans.length, limite);
  const porNsu = trans.length ? await formasDasVendas(s, trans.map((x) => x.nsu)) : new Map();
  return {
    temMaquininha: (v.data ?? []).length > 0 || trans.length > 0,
    exemplo: false,
    linhas: trans.map((x) => {
      const ev = porNsu.get(x.nsu);
      return {
        nsu: x.nsu, status: x.status, valor: Number(x.valor), ocorridoEm: x.ocorrido_em, vinculoId: x.vinculo_id,
        formaPagamento: ev?.forma ?? null, numeroParcelas: ev?.parcelas ?? null, bandeira: ev?.bandeira ?? null, ehPix: ev?.pix ?? false,
      };
    }),
  };
}

/* ------------------------ o relatório da maquininha ------------------------ */

export interface LeituraRelatorioMaquininha extends LeituraVendasMaquininha {
  /** Os títulos que as vendas geraram (receita, taxa, tarifa, antecipação, estorno). */
  titulos: TituloMaquininhaBruto[];
  /** Nome de cada maquininha (vínculo), para "vendas por maquininha". */
  maquininhas: { id: string; nome: string }[];
}

/**
 * O que a página "Maquininha Quattro" lê: as vendas desde `desde` e os títulos
 * delas (e os que ainda vão cair). Só leitura, pela sessão da pessoa.
 */
export async function lerRelatorioMaquininha(desde: string): Promise<LeituraRelatorioMaquininha> {
  const vendas = await lerVendasMaquininha(5000, desde);
  if (isDemo) {
    return {
      ...vendas,
      titulos: planejarTitulosDemo(vendas.linhas, diaEHoraLocal(new Date())),
      maquininhas: [{ id: "demo-balcao", nome: "Balcão" }, { id: "demo-delivery", nome: "Delivery" }],
    };
  }
  const s = createClient();
  const [m, vin] = await Promise.all([
    comTeto(semAmostra(
      s.from("movements").select("chave, type, amount, due_date, situacao, status")
        .like("chave", "pinbank:%").gte("due_date", desde),
    )),
    s.from("pinbank_vinculos").select("id, nome, estabelecimento_id").order("criado_em").limit(50),
  ]);
  if (m.error) throw new Error(motivoDaRecusa(m.error));
  if (vin.error) throw new Error(motivoDaRecusa(vin.error));
  const titulos = (m.data ?? []) as TituloMaquininhaBruto[];
  conferirTeto("movements (maquininha)", titulos.length);
  return {
    ...vendas,
    titulos: titulos.map((x) => ({ ...x, amount: Number(x.amount) })),
    maquininhas: ((vin.data ?? []) as { id: string; nome: string | null; estabelecimento_id: number | null }[])
      .map((x) => ({ id: x.id, nome: x.nome?.trim() || (x.estabelecimento_id ? `Maquininha ${x.estabelecimento_id}` : "Maquininha") })),
  };
}
