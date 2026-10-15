import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { consultarExtratoPos, conferenciaPinbankLiberada, descreverErroApi, extratoServeParaConferir } from "@/lib/pinbank/api";
import { hojeSaoPaulo } from "@/lib/pinbank/processar";
import { lerDetalhesPorNsu, lerTitulosDaJanela, lerVinculosDaEmpresa } from "@/lib/pinbank/conferencia-leitura";
import {
  FRASE_LIMITE_INDISPONIVEL,
  RPC_RESERVA_CONFERENCIA,
  fraseDeEspera,
  lerReservaConferencia,
  relatorioParaEmpresa,
} from "@/core/pinbank/conferencia-portoes";
import {
  ACAO_CONFERENCIA,
  FRASE_EXTRATO_RECUSADO,
  FRASE_FALHA_PINBANK,
  FRASE_INDISPONIVEL,
  FRASE_VOLUME_ALTO,
  conferirExtratoPinbank,
  nsusParaDetalhar,
  problemasDoPeriodoExtratoPos,
} from "@/core/pinbank";

/**
 * A CONFERÊNCIA EXTRATO × SISTEMA da maquininha Pinbank — pedida pela EMPRESA.
 *
 *   POST /api/pinbank/conferencia   { vinculoId, de: "AAAA-MM-DD", ate: "AAAA-MM-DD" }
 *
 * Lê o extrato consolidado (`ExtratoPos`) do estabelecimento DESTE vínculo no
 * período (até 31 dias), lê os títulos que o webhook lançou e devolve o
 * relatório do motor puro (`core/pinbank/conferencia`). NÃO GRAVA NADA: nem
 * título, nem evento, nem vínculo.
 *
 * ⚠️ **MUDA QUEM PODE CHAMAR O QUÊ.** É o primeiro caminho em que alguém de uma
 * EMPRESA (não a plataforma) dispara uma chamada à Pinbank com a credencial da
 * plataforma. O merge espera o OK do dono.
 *
 * ⚠️ **O ESTABELECIMENTO VEM DO VÍNCULO, NUNCA DO PEDIDO.** O corpo traz só o id
 * do vínculo; o vínculo é lido COMO A PESSOA (a política de linha só mostra os
 * da empresa aberta) e o código do extrato sai dele. Um código vindo do pedido
 * deixaria qualquer empresa ler o extrato da loja vizinha.
 *
 * Portões, na ordem: sem banco (demonstração) → sessão → pedido bem formado →
 * o vínculo é desta empresa → a pessoa ADMINISTRA a empresa do vínculo → a
 * conferência está liberada (interruptor + ambiente de produção) → o vínculo
 * está ativo e tem o código do extrato → os títulos da janela → a ESPERA por
 * empresa, conferida e carimbada pelo BANCO (429; sem a resposta dele, 503
 * `limite_indisponivel`) → só então a Pinbank.
 *
 * ⚠️ A resposta nunca traz a credencial, a identificação dela, o motivo cru da
 * Pinbank nem nada de outro estabelecimento: só o relatório (que já sai sem
 * esses dados) ou um código com a frase para a tela. E, sem NENHUMA venda em
 * comum ATESTADA pelo aviso da Pinbank no dia da venda, só as CONTAGENS DE
 * CADA LADO (`relatorioParaEmpresa`): o EC é digitado pela plataforma, e um EC
 * errado é o extrato de outra loja — e o título a empresa grava, então só o
 * aviso (que só a plataforma grava) prova a venda em comum.
 *
 * ⚠️ Toda chamada à Pinbank deixa UM registro no log do servidor — quem, empresa,
 * vínculo, EC, período, quantas linhas e o código da resposta; nenhum valor,
 * nenhum dado pessoal. É o que responde "quem viu" se um EC errado expuser um
 * extrato, ou se a credencial da plataforma for usada demais.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Leituras do banco + token (até 10 s) + extrato (até 25 s) pela saída fixa.
export const maxDuration = 60;

const resposta = (status: number, corpo: Record<string, unknown>) =>
  NextResponse.json(corpo, { status, headers: { "cache-control": "no-store, max-age=0" } });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const FRASE_LEITURA_FALHOU = "Não foi possível ler as vendas da maquininha no sistema. Nada foi alterado.";

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return resposta(404, { ok: false, codigo: "demonstracao", motivo: "Indisponível na demonstração." });
  }
  const s = createClient();
  const { data: auth } = await s.auth.getUser();
  if (!auth?.user) {
    return resposta(401, { ok: false, codigo: "sem_sessao", motivo: "Sua sessão terminou. Entre de novo para conferir." });
  }

  // O pedido: só estes três campos são lidos.
  let pedido: unknown = null;
  try {
    pedido = await req.json();
  } catch {
    pedido = null;
  }
  const campo = (k: string) => {
    const v = pedido && typeof pedido === "object" ? (pedido as Record<string, unknown>)[k] : undefined;
    return typeof v === "string" ? v.trim() : "";
  };
  const vinculoId = campo("vinculoId");
  const de = campo("de");
  const ate = campo("ate");
  const problemas = [
    ...(UUID.test(vinculoId) ? [] : ["Maquininha não informada."]),
    ...problemasDoPeriodoExtratoPos(de, ate),
  ];
  if (problemas.length) return resposta(400, { ok: false, codigo: "pedido_invalido", motivo: problemas.join(" ") });

  // O vínculo, COMO A PESSOA: a política só devolve os da empresa aberta.
  const { data: v, error: eV } = await s.from("pinbank_vinculos").select("id, org_id, codigo_cliente, ativo, taxas, antecipado").eq("id", vinculoId).maybeSingle();
  if (eV) return resposta(500, { ok: false, codigo: "leitura_falhou", motivo: FRASE_LEITURA_FALHOU });
  if (!v) {
    return resposta(404, { ok: false, codigo: "vinculo_nao_encontrado", motivo: "Esta maquininha não está vinculada à empresa aberta." });
  }

  // A permissão, na empresa DO VÍNCULO (nunca "o que eu sou" em outra empresa).
  const { data: pode, error: eP } = await s.rpc("tem_permissao", { p_acao: ACAO_CONFERENCIA, p_org: v.org_id });
  if (eP || pode !== true) {
    return resposta(403, { ok: false, codigo: "sem_permissao", motivo: "Só quem administra a empresa pode conferir com o extrato da Pinbank." });
  }

  const liberada = conferenciaPinbankLiberada();
  if (!liberada.liberada) return resposta(503, { ok: false, codigo: liberada.codigo, motivo: FRASE_INDISPONIVEL[liberada.codigo] });

  if (!v.ativo) {
    return resposta(409, { ok: false, codigo: "vinculo_inativo", motivo: "Ative a maquininha (conta do repasse e taxas) antes de conferir com o extrato." });
  }
  const ec = Number(v.codigo_cliente);
  if (!Number.isSafeInteger(ec) || ec <= 0) {
    return resposta(409, { ok: false, codigo: "sem_codigo_extrato", motivo: "O código desta maquininha no extrato da Pinbank ainda não foi cadastrado. Peça ao suporte da Quattro." });
  }

  const hoje = hojeSaoPaulo();
  const janela = await lerTitulosDaJanela(s, v.org_id, { de, ate });
  if (!janela.ok) {
    return janela.codigo === "volume_alto"
      ? resposta(422, { ok: false, codigo: "volume_alto", motivo: FRASE_VOLUME_ALTO })
      : resposta(500, { ok: false, codigo: "leitura_falhou", motivo: FRASE_LEITURA_FALHOU });
  }

  // A ESPERA por empresa, logo antes da Pinbank — DURÁVEL (D4): o BANCO confere e carimba numa instrução,
  // pela empresa do VÍNCULO (lida lá, nunca do pedido), e exige 'administrar' nela. A recusa não carimba;
  // a chamada que falhar depois conta (já saiu com a credencial da plataforma). Sem a resposta do banco
  // (a função ausente antes da migration, erro, resposta ilegível) a rota FALHA FECHADA: a Pinbank não é chamada.
  const { data: reservaDoBanco, error: eR } = await s.rpc(RPC_RESERVA_CONFERENCIA, { p_vinculo: v.id });
  const reserva = lerReservaConferencia(reservaDoBanco, eR);
  if (!reserva.ok) {
    // O 429 leva o NÚMERO que o banco disse (além da frase): o botão espera isso, não os 60 s inteiros.
    if (reserva.codigo === "aguarde") return resposta(429, { ok: false, codigo: "aguarde", motivo: fraseDeEspera(reserva.restanteMs), restanteMs: reserva.restanteMs });
    console.error("[falha·pinbank] conferencia limite indisponível", JSON.stringify({ user: auth.user.id, org: v.org_id, vinculo: v.id, resultado: "limite_indisponivel", erro: eR?.code ?? null }));
    return resposta(503, { ok: false, codigo: "limite_indisponivel", motivo: FRASE_LIMITE_INDISPONIVEL });
  }

  // O rastro da chamada: identificadores e o período — nenhum valor, nenhum dado pessoal.
  const rastro = { user: auth.user.id, org: v.org_id, vinculo: v.id, ec, de, ate };
  const filtro = { codigoCliente: ec, de, ate, status: "Todos" as const, meio: "Todos" as const };
  let extrato: Awaited<ReturnType<typeof consultarExtratoPos>>;
  try {
    extrato = await consultarExtratoPos(filtro);
  } catch (e) {
    const d = descreverErroApi(e);
    console.error(`[falha·pinbank] conferencia ${d.etapa}: ${d.motivo}`, JSON.stringify({ ...rastro, resultado: "pinbank_falhou", etapa: d.etapa }));
    return resposta(502, { ok: false, codigo: "pinbank_falhou", motivo: FRASE_FALHA_PINBANK });
  }
  // Sem a LISTA, com erro de validação ou com o código de RECUSA (mesmo com a lista vazia),
  // "nenhuma venda" não quer dizer nada: conferir deixaria toda venda do sistema sem par.
  const ok = extratoServeParaConferir(extrato.resposta);
  const chamada = { ...rastro, linhas: extrato.resposta.linhas.length, codigo: extrato.resposta.codigo };
  if (!ok) {
    console.error(`[falha·pinbank] conferencia extrato recusado: codigo ${extrato.resposta.codigo ?? "—"} · ${extrato.resposta.mensagem ?? "sem mensagem"}`, JSON.stringify({ ...chamada, resultado: "extrato_recusado" }));
    return resposta(502, { ok: false, codigo: "extrato_recusado", motivo: FRASE_EXTRATO_RECUSADO });
  }
  console.info("[pinbank·conferencia]", JSON.stringify({ ...chamada, resultado: "ok" }));

  // Pelo NSU, cada lado com o SEU teto: primeiro os avisos e as transações (só a plataforma grava) da
  // janela e do extrato; depois os títulos só da janela e das NSUs do extrato com aviso desta empresa no
  // dia da venda. Nenhuma leitura cujo tamanho dependa do extrato alheio E do que a empresa grava — antes
  // do portão das contagens, o 422 contra o 200 seria um oráculo sobre a loja de um EC errado (D10).
  const [detalhes, vinculos] = await Promise.all([
    lerDetalhesPorNsu(s, v.org_id, nsusParaDetalhar(janela.dados, extrato.resposta.linhas, ec)),
    lerVinculosDaEmpresa(s, v.org_id),
  ]);
  if (!detalhes.ok || !vinculos.ok) {
    const alto = (!detalhes.ok && detalhes.codigo === "volume_alto") || (!vinculos.ok && vinculos.codigo === "volume_alto");
    return alto
      ? resposta(422, { ok: false, codigo: "volume_alto", motivo: FRASE_VOLUME_ALTO })
      : resposta(500, { ok: false, codigo: "leitura_falhou", motivo: FRASE_LEITURA_FALHOU });
  }

  // Sem nenhuma venda em comum ATESTADA pelo aviso, só as contagens de cada lado: o EC pode ser de outra loja (D10).
  const relatorio = relatorioParaEmpresa(conferirExtratoPinbank({
    de,
    ate,
    hoje,
    // As taxas CONTRATADAS (frações, jsonb do vínculo): o motor compara com o MDR do extrato — e, com o
    // repasse antecipado, a antecipação ao mês com o ValorTaxaMes.
    vinculo: { id: v.id, codigoCliente: ec, taxas: v.taxas ?? null, antecipado: v.antecipado === true },
    vinculosDoEstabelecimento: vinculos.dados.filter((x) => Number(x.codigo_cliente) === ec).map((x) => x.id),
    vinculosDaEmpresa: vinculos.dados.map((x) => x.id),
    extrato: extrato.resposta.linhas,
    titulos: [...janela.dados, ...detalhes.dados.titulos],
    eventos: detalhes.dados.eventos,
    transacoes: detalhes.dados.transacoes,
  }));
  return resposta(200, { ok: true, relatorio, consultadoEm: new Date().toISOString() });
}
