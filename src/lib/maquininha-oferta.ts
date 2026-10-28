/**
 * A OFERTA DA MAQUININHA — a ponte entre a tela e o resto do sistema:
 *
 * - `taxaDeReferencia(segmento)`: a `TaxaDe` do motor puro
 *   (`core/maquininha/oferta`), montada sobre a MESMA tabela do simulador de
 *   taxas do POS (`lib/pos-taxas`, faixa 1, sem spread próprio). Média entre
 *   as bandeiras, porque quem simula não sabe com que cartão o cliente paga.
 * - `listarPedidos` / `enviarPedido`: o pedido de maquininha (ou de vínculo)
 *   que chega à plataforma (`maquininha_pedidos`, RPC
 *   `maquininha_pedido_criar`). Em demonstração fica só na memória desta aba
 *   — nada vai para o navegador nem para o servidor, e a tela diz isso.
 */
import { createClient } from "@/lib/supabase/client";
import { isDemo } from "@/lib/demo";
import { motivoDaRecusa, reportar } from "@/lib/erros";
import { POS_DEFAULT, PARCELAS, custoTable, taxaFinalParcela, type Bandeira } from "@/lib/pos-taxas";
import { lerSimulacao, lerTaxasPropostas } from "@/core/maquininha/oferta";
import type { FormaOferta, MotivoPerda, OrigemPedido, PedidoMaquininha, SimulacaoDoPedido, SituacaoPedido, TaxaDe, TaxasPorForma } from "@/core/maquininha/oferta";

/** Segmentos que a tabela de referência conhece (MCC da planilha do POS). */
export const SEGMENTOS: { id: string; nome: string; mcc: string }[] = [
  { id: "RESTAURANTE", nome: "Restaurante e alimentação", mcc: "5812" },
  { id: "BARES", nome: "Bar e lanchonete", mcc: "5813" },
  { id: "SUPERMERCADOS", nome: "Mercado e supermercado", mcc: "5411" },
  { id: "DROGARIAS E FARMÁCIAS", nome: "Farmácia", mcc: "5912" },
  { id: "COMÉRCIO GERAL / VARIEDADES", nome: "Comércio e varejo", mcc: "5331" },
  { id: "LOJAS DE MATERIAL DE CONSTRUÇÃO E FERRAGENS", nome: "Material de construção", mcc: "5211" },
];

export const SEGMENTO_PADRAO = SEGMENTOS[4].id;

const BANDEIRAS: Bandeira[] = ["master", "visa", "elo"];

/** A taxa de referência do segmento, para o motor da oferta. */
export function taxaDeReferencia(segmento: string, taxaAntecipMensal = POS_DEFAULT.taxaAntecipMensal): TaxaDe {
  const custo = custoTable(segmento, "RANGE 1");
  return (forma: FormaOferta, parcelas: number, antecipado: boolean) => {
    const id = forma === "pix" ? "pix" : forma === "debito" ? "debito" : parcelas <= 1 ? "cv" : `p${parcelas}`;
    const row = PARCELAS.find((p) => p.id === id);
    if (!row) return null;
    const cfg = { ...POS_DEFAULT, mccDesc: segmento, antecipacao: antecipado, online: false, taxaAntecipMensal };
    const taxas = BANDEIRAS.map((b) => taxaFinalParcela(cfg, custo, row, b)).filter((t): t is number => typeof t === "number");
    if (!taxas.length) return null;
    return taxas.reduce((s, t) => s + t, 0) / taxas.length;
  };
}

/**
 * Taxas TÍPICAS das maquininhas do mercado (out/2026), só para completar o
 * que a pessoa não sabe na comparação ("Sua maquininha atual"). Não é a taxa
 * de ninguém em particular — a tela marca o número como "estimada" e pede
 * para conferir no extrato. Parcelado considerado em 4x.
 *
 * ⚠️ Duas colunas porque a maquininha que paga no dia seguinte cobra a
 * antecipação dentro da taxa: completar uma taxa antecipada com o número de
 * prazo normal subestimaria o que a pessoa paga hoje.
 */
export const MERCADO_PRAZO_NORMAL: Record<FormaOferta, number> = { pix: 0.0049, debito: 0.0179, credito: 0.0319, parcelado: 0.0379 };
export const MERCADO_ANTECIPADO: Record<FormaOferta, number> = { pix: 0.0049, debito: 0.0179, credito: 0.0479, parcelado: 0.0929 };

export function taxasDeMercado(antecipado: boolean): Record<FormaOferta, number> {
  return antecipado ? MERCADO_ANTECIPADO : MERCADO_PRAZO_NORMAL;
}

/* ------------------------------- pedidos ------------------------------- */

export interface PedidoRegistrado {
  id: string;
  tipo: PedidoMaquininha["tipo"];
  quantidade: number;
  codigoEstabelecimento: string | null;
  situacao: SituacaoPedido;
  criadoEm: string;
  origem?: OrigemPedido;
  simulacao?: SimulacaoDoPedido | null;
}

/** Demonstração: só nesta aba, some ao recarregar. */
let pedidosDemo: PedidoRegistrado[] = [];

export async function listarPedidos(): Promise<PedidoRegistrado[]> {
  if (isDemo) return pedidosDemo;
  const { data, error } = await createClient()
    .from("maquininha_pedidos")
    .select("id, tipo, quantidade, codigo_estabelecimento, situacao, criado_em")
    .order("criado_em", { ascending: false })
    .limit(20);
  if (error) {
    // Sem a migration aplicada a tabela não existe: a oferta continua de pé, só sem a lista.
    reportar("maquininha.listarPedidos", error, "a lista de pedidos de maquininha não aparece", true);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    tipo: r.tipo as PedidoMaquininha["tipo"],
    quantidade: Number(r.quantidade),
    codigoEstabelecimento: (r.codigo_estabelecimento as string | null) ?? null,
    situacao: r.situacao as SituacaoPedido,
    criadoEm: r.criado_em as string,
  }));
}

/** Envia o pedido. Lança com o motivo do banco quando ele recusa. */
export async function enviarPedido(p: PedidoMaquininha): Promise<PedidoRegistrado> {
  const vincular = p.tipo === "vincular";
  if (isDemo) {
    const novo: PedidoRegistrado = {
      id: `demo-${pedidosDemo.length + 1}`,
      tipo: p.tipo,
      quantidade: vincular ? 1 : p.quantidade,
      codigoEstabelecimento: vincular ? p.codigoEstabelecimento.trim() : null,
      situacao: "recebido",
      criadoEm: new Date().toISOString(),
      origem: p.origem ?? "formulario",
      simulacao: lerSimulacao(p.simulacao),
    };
    pedidosDemo = [novo, ...pedidosDemo];
    return novo;
  }
  const base = {
    p_tipo: p.tipo,
    p_quantidade: vincular ? 1 : p.quantidade,
    p_segmento: p.segmento || null,
    p_faturamento_mensal: (p.faturamentoMensal ?? 0) > 0 ? p.faturamentoMensal : null,
    p_codigo_estabelecimento: vincular ? p.codigoEstabelecimento.trim() : null,
    p_contato_nome: p.contatoNome,
    p_contato_telefone: p.contatoTelefone || null,
    p_contato_email: p.contatoEmail || null,
    p_endereco: vincular ? null : p.endereco,
    p_observacao: p.observacao || null,
  };
  const simulacao = lerSimulacao(p.simulacao);
  let { data, error } = await createClient().rpc("maquininha_pedido_criar", {
    ...base, p_origem: p.origem ?? "formulario", p_simulacao: simulacao,
  });
  // ⚠️ Entre o deploy e a migration (20261028170000) o banco só conhece a
  // função de dez parâmetros: o pedido não pode se perder por isso. Sem a
  // função nova (PGRST202), envia o mesmo pedido sem a origem e a simulação,
  // que continuam escritas na observação.
  if (error && (error as { code?: string }).code === "PGRST202") {
    ({ data, error } = await createClient().rpc("maquininha_pedido_criar", base));
  }
  if (error) {
    reportar("maquininha.enviarPedido", error, "o pedido de maquininha não foi enviado");
    throw new Error(motivoDaRecusa(error).replace(/^A4P-MAQUININHA:\s*/, ""));
  }
  return {
    id: String(data),
    tipo: p.tipo,
    quantidade: vincular ? 1 : p.quantidade,
    codigoEstabelecimento: vincular ? p.codigoEstabelecimento.trim() : null,
    situacao: "recebido",
    criadoEm: new Date().toISOString(),
  };
}

/* ---------------------------- a plataforma ---------------------------- */

export interface PedidoNaFila {
  id: string;
  org_id: string;
  empresa: string;
  tipo: PedidoMaquininha["tipo"];
  quantidade: number;
  segmento: string | null;
  faturamento_mensal: number | null;
  codigo_estabelecimento: string | null;
  contato_nome: string;
  contato_telefone: string | null;
  contato_email: string | null;
  endereco: string | null;
  observacao: string | null;
  situacao: SituacaoPedido;
  /** Ausente antes da migration 20261028170000: leia como "formulario". */
  origem: OrigemPedido;
  /** Já conferida por `lerSimulacao`: a fora de faixa chega como null. */
  simulacao: SimulacaoDoPedido | null;
  criado_em: string;
  atualizado_em: string | null;
  /** O resumo da ficha do lead (ausente antes da migration 20261029130000). */
  responsavel_email?: string | null;
  proximo_contato?: string | null;
  motivo_perda?: MotivoPerda | null;
  notas?: number;
}

export async function filaDePedidos(): Promise<PedidoNaFila[]> {
  if (isDemo) {
    return pedidosDemo.map((p) => ({
      id: p.id, org_id: "demo", empresa: "Empresa de demonstração", tipo: p.tipo, quantidade: p.quantidade,
      segmento: null, faturamento_mensal: null, codigo_estabelecimento: p.codigoEstabelecimento,
      contato_nome: "Contato de demonstração", contato_telefone: null, contato_email: null, endereco: null,
      observacao: null, situacao: p.situacao, origem: p.origem ?? "formulario", simulacao: p.simulacao ?? null,
      criado_em: p.criadoEm, atualizado_em: null,
      responsavel_email: fichasDemo[p.id]?.responsavel ? EMAIL_DEMO : null,
      proximo_contato: fichasDemo[p.id]?.proximo_contato ?? null,
      motivo_perda: fichasDemo[p.id]?.motivo_perda ?? null,
      notas: fichasDemo[p.id]?.notas.length ?? 0,
    }));
  }
  const { data, error } = await createClient().rpc("admin_maquininha_pedidos");
  if (error) throw new Error(motivoDaRecusa(error));
  return ((data as Record<string, unknown>[] | null) ?? []).map((r) => ({
    ...(r as unknown as PedidoNaFila),
    origem: r.origem === "economia" || r.origem === "consultor" ? r.origem : "formulario",
    simulacao: lerSimulacao(r.simulacao),
  }));
}

export async function mudarSituacaoPedido(id: string, situacao: SituacaoPedido): Promise<void> {
  if (isDemo) {
    pedidosDemo = pedidosDemo.map((p) => (p.id === id ? { ...p, situacao } : p));
    return;
  }
  const { error } = await createClient().rpc("admin_maquininha_pedido_situacao", { p_pedido: id, p_situacao: situacao });
  if (error) throw new Error(motivoDaRecusa(error));
}

/* ------------------------- a ficha do lead (CRM, etapa 3) ------------------------- */

export interface DadosDoLead {
  responsavel: string | null;
  proximo_contato: string | null;
  motivo_perda: MotivoPerda | null;
  motivo_detalhe: string | null;
  taxas_propostas: TaxasPorForma | null;
}

export interface NotaDoLead { id: string; autor_email: string | null; texto: string; criado_em: string }

export interface FichaDoLead extends DadosDoLead {
  atualizado_em: string | null;
  notas: NotaDoLead[];
  /** Quem da plataforma pode ser o responsável. */
  responsaveis: { id: string; email: string }[];
}

export const LEAD_VAZIO: DadosDoLead = { responsavel: null, proximo_contato: null, motivo_perda: null, motivo_detalhe: null, taxas_propostas: null };

/** Demonstração: a ficha também fica só na memória desta aba. */
const ID_DEMO = "demo-plataforma";
const EMAIL_DEMO = "voce@quattro.finance";
const fichasDemo: Record<string, DadosDoLead & { notas: NotaDoLead[]; atualizado_em: string | null }> = {};

export async function fichaDoLead(pedido: string): Promise<FichaDoLead> {
  if (isDemo) {
    const f = fichasDemo[pedido] ?? { ...LEAD_VAZIO, notas: [], atualizado_em: null };
    return { ...f, notas: [...f.notas], responsaveis: [{ id: ID_DEMO, email: EMAIL_DEMO }] };
  }
  const { data, error } = await createClient().rpc("admin_maquininha_lead", { p_pedido: pedido });
  if (error) throw new Error(motivoDaRecusa(error));
  const d = (data ?? {}) as { lead?: Record<string, unknown> | null; notas?: NotaDoLead[]; responsaveis?: { id: string; email: string }[] };
  const l = d.lead ?? {};
  return {
    responsavel: (l.responsavel as string | null) ?? null,
    proximo_contato: (l.proximo_contato as string | null) ?? null,
    motivo_perda: (l.motivo_perda as MotivoPerda | null) ?? null,
    motivo_detalhe: (l.motivo_detalhe as string | null) ?? null,
    taxas_propostas: lerTaxasPropostas(l.taxas_propostas),
    atualizado_em: (l.atualizado_em as string | null) ?? null,
    notas: d.notas ?? [],
    responsaveis: d.responsaveis ?? [],
  };
}

export async function salvarLead(pedido: string, dados: DadosDoLead): Promise<void> {
  const taxas = lerTaxasPropostas(dados.taxas_propostas);
  if (isDemo) {
    const antes = fichasDemo[pedido];
    fichasDemo[pedido] = { ...dados, taxas_propostas: taxas, notas: antes?.notas ?? [], atualizado_em: new Date().toISOString() };
    return;
  }
  const { error } = await createClient().rpc("admin_maquininha_lead_salvar", {
    p_pedido: pedido,
    p_responsavel: dados.responsavel,
    p_proximo_contato: dados.proximo_contato || null,
    p_motivo_perda: dados.motivo_perda,
    p_motivo_detalhe: dados.motivo_detalhe,
    p_taxas_propostas: taxas,
  });
  if (error) throw new Error(motivoDaRecusa(error));
}

export async function anotarLead(pedido: string, texto: string): Promise<void> {
  const t = texto.trim();
  if (!t) throw new Error("A anotação está vazia.");
  if (isDemo) {
    const f = fichasDemo[pedido] ?? { ...LEAD_VAZIO, notas: [], atualizado_em: null };
    f.notas = [{ id: `nota-${f.notas.length + 1}`, autor_email: EMAIL_DEMO, texto: t, criado_em: new Date().toISOString() }, ...f.notas];
    fichasDemo[pedido] = f;
    return;
  }
  const { error } = await createClient().rpc("admin_maquininha_lead_anotar", { p_pedido: pedido, p_texto: t });
  if (error) throw new Error(motivoDaRecusa(error));
}
