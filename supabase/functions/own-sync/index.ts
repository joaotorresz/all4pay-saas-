// Edge Function: own-sync — perna PRIMÁRIA da integração com a OWN.
// Arquivo único, self-contained. verify_jwt = false; a proteção é OWN_SYNC_SECRET
// na query, porque quem chama é o pg_cron do próprio banco.
//
// Por que pull-first e não webhook-first
// ───────────────────────────────────
// O cadastro de webhook na OWN é manual, por chamado, e é o item de maior prazo
// do projeto. Enquanto ele for a perna principal, o projeto inteiro fica parado
// esperando terceiro. Invertendo, o webhook vira otimização de latência que se
// liga depois, sem reescrever nada: ele grava nas MESMAS tabelas, com as MESMAS
// chaves naturais, e o upsert absorve a duplicidade.
//
// O custo de inverter é latência: minutos em vez de instantâneo. Para extrato
// de lojista em ERP, isso é indistinguível de tempo real.
//
// Três coisas neste arquivo existem por medição em sandbox, não por precaução
// genérica:
//   · o token vem do Postgres, não de variável de módulo — isolate morre entre
//     invocações e cache em memória re-autentica todo ciclo, que é o gatilho
//     exato do 429;
//   · o User-Agent é de navegador — UA de cliente HTTP recebe 403 em HTML;
//   · a janela tem sobreposição — a OWN indexa por data da transação, e venda
//     confirmada no fim de um ciclo pode aparecer na base depois do corte.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BASES = {
  sandbox: "https://acquirer-qa.own.financial",
  producao: "https://acquirer.own.financial",
} as const;

const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

/** Bloqueio observado em sandbox: ~7 min. 420s com folga. */
const BLOQUEIO_S = Number(env("OWN_BLOQUEIO_SEGUNDOS", "420"));
/** Sobreposição da janela. Barato: o upsert é idempotente. */
const SOBREPOSICAO_MIN = Number(env("OWN_SOBREPOSICAO_MINUTOS", "30"));

// ── Datas ──────────────────────────────────────────────────────────────
// A OWN exige "AAAA-MM-DD HH:MM" com espaço, e interpreta em horário de
// Brasília. Formatar em UTC atrasa a janela em 3 horas e faz o job perder as
// vendas do fim do dia — silenciosamente, sem erro nenhum.

function paraSP(d: Date): { data: string; hora: string } {
  const f = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const [data, hora] = f.format(d).split(" ");
  return { data, hora: hora.slice(0, 5) };
}
const carimboOwn = (d: Date) => { const { data, hora } = paraSP(d); return `${data} ${hora}`; };
const diaOwn = (d: Date) => paraSP(d).data;

/** "2024-12-28T11:07:34" (sem zona) é horário de Brasília, não UTC. */
const isoSP = (v: unknown): string | null =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)
    ? (v.length <= 19 ? `${v}-03:00` : v)
    : null;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const sn = (v: unknown) => (v === "S" || v === "s" ? true : v === "N" || v === "n" ? false : null);
const dig = (v: unknown) => { const s = String(v ?? "").replace(/\D/g, ""); return s || null; };

// ── Token, servido pelo banco ────────────────────────────────────────────

class PerimetroBloqueado extends Error {}

async function obterToken(db: SupabaseClient, chave: string): Promise<string> {
  for (let tentativa = 0; tentativa < 4; tentativa++) {
    const { data, error } = await db.rpc("own_token_pegar", { p_chave: chave });
    if (error) throw new Error(`own_token_pegar: ${error.message}`);
    const e = data as { estado: string; token?: string; segundos?: number };

    if (e.estado === "ok") return e.token!;
    if (e.estado === "bloqueado") {
      throw new PerimetroBloqueado(`perimetro fechado por mais ~${e.segundos}s`);
    }
    if (e.estado === "aguarde") {
      // Outra invocação está autenticando. Esperar é mais barato que um 429.
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }

    // estado === "autentique": ganhamos o lease. Somos os únicos a logar.
    const base = BASES[chave as keyof typeof BASES];
    const r = await fetch(`${base}/agilli/v2/auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": UA },
      body: JSON.stringify({
        client_id: env("OWN_CLIENT_ID"),
        client_secret: env("OWN_CLIENT_SECRET"),
        scope: env("OWN_SCOPE", "wl.api_acquirer.api"),
        grant_type: "client_credentials",
      }),
    });
    const texto = await r.text();
    const ehHtml = (r.headers.get("content-type") ?? "").includes("text/html");

    if (r.status === 429 || ehHtml) {
      await db.rpc("own_token_bloquear", {
        p_chave: chave, p_segundos: BLOQUEIO_S, p_erro: `auth ${r.status} (perimetro)`,
      });
      throw new PerimetroBloqueado(`auth ${r.status}: perimetro`);
    }
    if (!r.ok) {
      await db.rpc("own_token_bloquear", { p_chave: chave, p_segundos: 60, p_erro: `auth ${r.status}` });
      throw new Error(`auth ${r.status}: ${texto.slice(0, 200)}`);
    }

    const d = JSON.parse(texto) as { access_token: string; expires_in?: number };
    await db.rpc("own_token_gravar", {
      p_chave: chave, p_token: d.access_token, p_expires_in: d.expires_in ?? 300,
    });
    return d.access_token;
  }
  throw new Error("nao consegui token apos 4 tentativas");
}

// ── Chamada à OWN ────────────────────────────────────────────────────

async function chamarOwn<T>(
  db: SupabaseClient, chave: string, rota: string,
  init: { method?: string; query?: Record<string, string>; body?: unknown },
): Promise<T> {
  const base = BASES[chave as keyof typeof BASES];
  const token = await obterToken(db, chave);
  const url = new URL(base + rota);
  for (const [k, v] of Object.entries(init.query ?? {})) url.searchParams.set(k, v);

  const r = await fetch(url.toString(), {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": UA,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  const texto = await r.text();
  const ehHtml = (r.headers.get("content-type") ?? "").includes("text/html");
  if (r.status === 429 || ehHtml) {
    await db.rpc("own_token_bloquear", { p_chave: chave, p_segundos: BLOQUEIO_S, p_erro: `${rota} ${r.status}` });
    throw new PerimetroBloqueado(`${rota}: ${r.status} perimetro`);
  }
  if (!r.ok) throw new Error(`${rota} ${r.status}: ${texto.slice(0, 250)}`);
  return (texto ? JSON.parse(texto) : null) as T;
}

// ── Gravação ───────────────────────────────────────────────────────

interface Lojista { id: string; org_id: string; doc_parceiro: string; cnpj_cliente: string | null }

async function gravarTransacoes(db: SupabaseClient, linhas: Record<string, unknown>[], porDoc: Map<string, Lojista>) {
  let novas = 0, alteradas = 0, semLojista = 0;

  for (const t of linhas) {
    const doc = dig(t.cnpjCpfParceiro ?? t.docParceiro);
    const lj = doc ? porDoc.get(doc) : undefined;
    if (!lj) { semLojista++; continue; }

    const antes = await db.from("own_transacoes")
      .select("id, status_transacao").eq("org_id", lj.org_id)
      .eq("identificador_transacao", String(t.identificadorTransacao)).maybeSingle();

    const { data: linha, error } = await db.from("own_transacoes").upsert({
      org_id: lj.org_id,
      lojista_id: lj.id,
      identificador_transacao: String(t.identificadorTransacao),
      doc_parceiro: doc,
      cnpj_cliente: dig(t.cnpjCpfCliente),
      data_transacao: isoSP(t.data),
      numero_serie: t.numeroSerieEquipamento ?? null,
      valor: num(t.valor),
      quantidade_parcelas: num(t.quantidadeParcelas) ?? 1,
      mdr: num(t.mdr),
      valor_antecipacao_total: num(t.valorAntecipacaoTotal),
      taxa_antecipacao_total: num(t.taxaAntecipacaoTotal),
      status_transacao: String(t.statusTransacao ?? ""),
      bandeira: t.bandeira ?? null,
      modalidade: t.modalidade ?? null,
      codigo_autorizacao: t.codigoAutorizacao ?? null,
      numero_cartao: t.numeroCartao ?? null,
      // Se o webhook já tinha trazido, a origem passa a 'ambos' — é assim que
      // se mede se a perna 1 está entregando.
      origem: antes.data ? "ambos" : "pull",
      visto_em_pull_em: new Date().toISOString(),
      raw: t,
    }, { onConflict: "org_id,identificador_transacao" }).select("id").single();

    if (error) { console.error("upsert transacao", error.message); continue; }
    if (!antes.data) novas++;
    else if (antes.data.status_transacao !== t.statusTransacao) alteradas++;

    for (const p of (t.parcelas ?? []) as Record<string, unknown>[]) {
      const { data: pl } = await db.from("own_parcelas").upsert({
        org_id: lj.org_id,
        transacao_id: linha.id,
        parcela_id: num(p.parcelaId ?? p.idParcela),
        identificador_transacao: String(t.identificadorTransacao),
        numero_parcela: num(p.numeroParcela),
        status_pagamento: p.statusPagamento ?? null,
        valor_parcela: num(p.valorParcela),
        mdr: num(p.mdr),
        data_transacao: isoSP(p.dataHoraTransacao ?? p.dataTransacao),
        data_pagamento_prevista: (isoSP(p.dataPagamentoPrevista) ?? "").slice(0, 10) || null,
        data_pagamento_real: typeof p.dataPagamentoReal === "string" ? p.dataPagamentoReal.slice(0, 10) : null,
        valor_antecipado: num(p.valorAntecipado),
        taxa_antecipada: num(p.taxaAntecipada ?? p.taxaAntecipacao),
        // "antecipado" em buscaTransacoesGerais, "antecipada" em buscaParcela.
        antecipada: sn(p.antecipado ?? p.antecipada),
        numero_titulo: p.numeroTitulo != null ? String(p.numeroTitulo) : null,
        raw: p,
      }, { onConflict: "org_id,parcela_id" }).select("id").single();

      for (const a of (p.detalheAntecipacao ?? []) as Record<string, unknown>[]) {
        await db.from("own_antecipacoes").upsert({
          org_id: lj.org_id,
          antecipacao_id: num(a.id),
          parcela_id: num(a.parcelaId),
          parcela_uuid: pl?.id ?? null,
          valor_bruto_antecipado: num(a.valorBrutoAntecipado),
          valor_liquido_antecipado: num(a.valorLiquidoAntecipado),
          taxa_antecipacao: num(a.taxaAntecipacao),
          data_antecipacao: isoSP(a.dataAntecipacao),
          raw: a,
        }, { onConflict: "org_id,antecipacao_id,parcela_id" });
      }
    }
  }
  return { novas, alteradas, semLojista };
}

function brParaIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
  const [, d, mes, a] = m;
  return `${a.length === 2 ? "20" + a : a}-${mes}-${d}`;
}

async function gravarLiquidacoes(db: SupabaseClient, linhas: Record<string, unknown>[], porDoc: Map<string, Lojista>) {
  let n = 0;
  for (const l of linhas) {
    const doc = dig(l.docParceiro);
    const lj = doc ? porDoc.get(doc) : undefined;
    if (!lj) continue;
    const { error } = await db.from("own_liquidacoes").upsert({
      org_id: lj.org_id, lojista_id: lj.id,
      lancamento_id: num(l.lancamentoId),
      identificador_transacao: l.identificadorTransacao != null ? String(l.identificadorTransacao) : null,
      doc_parceiro: doc,
      codigo_cliente: dig(l.codigoCliente),
      numero_parcela: num(l.numeroParcela),
      numero_titulo: l.numeroTitulo != null ? String(l.numeroTitulo) : null,
      nsu_transacao: l.nsuTransacao ?? null,
      status_pagamento: l.statusPagamento ?? null,
      valor: num(l.valor), mdr: num(l.mdr),
      valor_antecipado: num(l.valorAntecipado),
      taxa_antecipacao: num(l.taxaAntecipacao),
      antecipada: sn(l.antecipada),
      // Vem "25/11/2024" aqui e "10/04/25" no webhook. Dois formatos, um campo.
      data_pagamento_prevista: brParaIso(l.dataPagamentoPrevista),
      data_pagamento_real: brParaIso(l.dataPagamentoReal),
      origem: "pull", raw: l,
    }, { onConflict: "org_id,lancamento_id" });
    if (!error) n++;
  }
  return n;
}

// ── Ciclo ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // Falha fechado: sem OWN_SYNC_SECRET configurado, a função recusa tudo.
  // Um endpoint aberto aqui seria um botão de "autentique na OWN" exposto na
  // internet — e é justamente autenticação repetida que dispara o 429 deles.
  const segredo = env("OWN_SYNC_SECRET");
  if (!segredo || new URL(req.url).searchParams.get("secret") !== segredo) {
    return json(401, { erro: "nao autorizado" });
  }

  const chave = env("OWN_AMBIENTE", "sandbox");
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: lojistasRaw } = await db
    .from("own_lojistas").select("id, org_id, doc_parceiro, cnpj_cliente").eq("ativo", true);
  const lojistas = (lojistasRaw ?? []) as Lojista[];
  if (!lojistas.length) {
    return json(200, { ok: true, pulado: "nenhum lojista ativo em own_lojistas" });
  }
  const porDoc = new Map(lojistas.map((l) => [l.doc_parceiro, l]));

  // Janela: do fim do último ciclo OK, menos a sobreposição, até agora.
  const { data: ultimo } = await db.from("own_sync_execucoes")
    .select("janela_fim").eq("status", "ok").eq("endpoint", "buscaTransacoesGerais")
    .order("concluido_em", { ascending: false }).limit(1).maybeSingle();

  const agora = new Date();
  const inicio = new Date(
    (ultimo?.janela_fim ? new Date(ultimo.janela_fim).getTime() : agora.getTime() - 24 * 3600e3)
    - SOBREPOSICAO_MIN * 60e3,
  );

  const { data: exec } = await db.from("own_sync_execucoes").insert({
    org_id: lojistas[0].org_id, endpoint: "buscaTransacoesGerais",
    janela_inicio: inicio.toISOString(), janela_fim: agora.toISOString(),
  }).select("id").single();

  try {
    const cnpjCliente = env("OWN_CNPJ_CLIENTE") || lojistas[0].cnpj_cliente || "";

    const transacoes = await chamarOwn<Record<string, unknown>[]>(
      db, chave, "/agilli/transacoes/v2/buscaTransacoesGerais",
      { method: "POST", body: {
          cnpjCliente, docParceiro: null, identificadorTransacao: null, statusTransacao: null,
          dataInicial: carimboOwn(inicio), dataFinal: carimboOwn(agora),
      } },
    ) ?? [];

    const t = await gravarTransacoes(db, transacoes, porDoc);

    // Liquidações: hoje e ontem. A data de pagamento real só é conhecida no dia,
    // e reprocessar ontem custa uma chamada e fecha buraco de virada de dia.
    let liquidadas = 0;
    for (const d of [agora, new Date(agora.getTime() - 864e5)]) {
      const l = await chamarOwn<Record<string, unknown>[]>(
        db, chave, "/agilli/parceiro/v2/consultaLiquidacoes",
        { query: { dataPagamentoReal: diaOwn(d), cnpjCliente } },
      ) ?? [];
      liquidadas += await gravarLiquidacoes(db, l, porDoc);
    }

    // Quantas transações desta janela o webhook NÃO trouxe. Se ficar sempre em
    // zero, o webhook está saudável. Se sobe, alguém precisa saber.
    const { count: soPull } = await db.from("own_transacoes")
      .select("id", { count: "exact", head: true })
      .eq("origem", "pull").gte("data_transacao", inicio.toISOString());

    await db.from("own_sync_execucoes").update({
      status: "ok", concluido_em: new Date().toISOString(),
      registros_lidos: transacoes.length, registros_novos: t.novas,
      registros_alterados: t.alteradas, faltaram_no_webhook: soPull ?? 0,
      detalhe: { liquidacoes: liquidadas, sem_lojista: t.semLojista },
    }).eq("id", exec!.id);

    return json(200, {
      ok: true, janela: [carimboOwn(inicio), carimboOwn(agora)],
      transacoes: transacoes.length, novas: t.novas, alteradas: t.alteradas,
      liquidacoes: liquidadas, sem_lojista: t.semLojista,
    });
  } catch (e) {
    const bloqueio = e instanceof PerimetroBloqueado;
    await db.from("own_sync_execucoes").update({
      // Perímetro fechado não é falha de código e não deve acordar ninguém.
      status: bloqueio ? "bloqueado_perimetro" : "erro",
      concluido_em: new Date().toISOString(),
      erro: String((e as Error)?.message ?? e),
    }).eq("id", exec!.id);

    // 200 mesmo em bloqueio: o pg_cron não tem o que fazer com um 500, e o
    // próximo ciclo já sabe esperar pelo bloqueado_ate.
    return json(bloqueio ? 200 : 500, { ok: false, bloqueio, erro: String((e as Error)?.message ?? e) });
  }
});
