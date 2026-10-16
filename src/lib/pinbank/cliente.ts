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
import { falhaDaConferenciaSemCorpo, type PrazosPinbank, type RelatorioParaEmpresa, type TaxasPinbank, type VendaMaquininhaBruta } from "@/core/pinbank";

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
      .select("id, estabelecimento_id, chave_gateway, nome, codigo_cliente, conta_id, taxas, prazos, antecipado, ativo, ativado_em")
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
  linhas: VendaMaquininhaBruta[];
  exemplo: boolean;
}

/** Vendas de exemplo da demonstração, sempre de hoje e de ontem. */
function vendasDeExemplo(agora = new Date()): VendaMaquininhaBruta[] {
  const base: [number, string, number, string | null, number, string | null][] = [
    // minutos atrás, status, valor, forma, parcelas, bandeira
    [6, "Aprovada", 189.9, "AVISTA", 1, "VISA"],
    [27, "Aprovada", 64.5, "DEBITO", 1, "ELO"],
    [48, "Aprovada", 42, null, 1, null],
    [71, "Negada", 320, "AVISTA", 1, "MASTERCARD"],
    [96, "Aprovada", 1250, "PARCELADO_LOJA", 3, "MASTERCARD"],
    [140, "Aprovada", 37.8, "DEBITO", 1, "VISA"],
    [1500, "Aprovada", 98, "AVISTA", 1, "AMEX"],
  ];
  return base.map(([min, status, valor, forma, parcelas, bandeira], i) => ({
    nsu: 900100 + i, status, valor, ocorridoEm: new Date(agora.getTime() - min * 60_000).toISOString(),
    formaPagamento: forma, numeroParcelas: parcelas, bandeira, ehPix: forma === null,
  }));
}

export async function lerVendasMaquininha(limite = 100): Promise<LeituraVendasMaquininha> {
  if (isDemo) return { temMaquininha: true, linhas: vendasDeExemplo(), exemplo: true };
  const s = createClient();
  const [v, t] = await Promise.all([
    s.from("pinbank_vinculos").select("id").eq("ativo", true).limit(1),
    s.from("pinbank_transacoes")
      .select("nsu, status, valor, ocorrido_em")
      .order("ocorrido_em", { ascending: false }).limit(limite),
  ]);
  if (v.error) throw new Error(motivoDaRecusa(v.error));
  if (t.error) throw new Error(motivoDaRecusa(t.error));
  const trans = (t.data ?? []) as { nsu: number; status: string; valor: number | string; ocorrido_em: string }[];
  const nsus = trans.map((x) => x.nsu);
  const porNsu = new Map<number, { forma: string | null; parcelas: string | null; bandeira: string | null; pix: boolean }>();
  if (nsus.length) {
    const e = await s.from("pinbank_eventos")
      .select("nsu, event_type, ocorrido_em, forma:payload->>formaPagamento, parcelas:payload->>numeroParcelas, bandeira:payload->cartao->>bandeira")
      .in("nsu", nsus).order("ocorrido_em", { ascending: false }).limit(limite * 4);
    if (e.error) throw new Error(motivoDaRecusa(e.error));
    for (const ev of (e.data ?? []) as { nsu: number; event_type: string; forma: string | null; parcelas: string | null; bandeira: string | null }[]) {
      // O primeiro de cada NSU é o mais recente (a lista vem do mais novo ao mais velho).
      if (!porNsu.has(ev.nsu)) porNsu.set(ev.nsu, { forma: ev.forma, parcelas: ev.parcelas, bandeira: ev.bandeira, pix: /^compra\.pix/i.test(ev.event_type) });
    }
  }
  return {
    temMaquininha: (v.data ?? []).length > 0 || trans.length > 0,
    exemplo: false,
    linhas: trans.map((x) => {
      const ev = porNsu.get(x.nsu);
      return {
        nsu: x.nsu, status: x.status, valor: Number(x.valor), ocorridoEm: x.ocorrido_em,
        formaPagamento: ev?.forma ?? null, numeroParcelas: ev?.parcelas ?? null, bandeira: ev?.bandeira ?? null, ehPix: ev?.pix ?? false,
      };
    }),
  };
}
