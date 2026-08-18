// ALL4PAY · Edge Function get-rate (v4 — range por faturamento)
// CNPJ -> cache -> [BrasilAPI | cnpj.ws | ReceitaWS] (CNAE) -> CNAE->MCC -> taxa-cliente
// range: body.range (explicito) > faturamento->range > maq_settings.active_range
//   faturamento: ate20->1, acima20->2, acima40->3, acima80->4
// Sem CNPJ (fluxo CPF): usa MCC default e o range do faturamento. Nunca 502.
// POST { cnpj?, faturamento?, prazo?, antecipa?, online?, range? }

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_MCC = 5331;

// faturamento (valor do dropdown) -> range de taxas cadastrado em /taxas
const FAT_RANGE: Record<string, number> = { ate20: 1, acima20: 2, acima40: 3, acima80: 4 };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

async function db(path: string) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  if (!r.ok) throw new Error(`db ${path} -> ${r.status}`);
  return r.json();
}

async function dbWrite(path: string, body: unknown) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(body),
    });
  } catch (_) { /* cache e best-effort */ }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

// Extrai as 7 primeiras digitos de qualquer formato de CNAE ("5611-2/01", "56.11-2-01", 5611201)
const digits7 = (s: unknown) => {
  const d = String(s ?? "").replace(/\D/g, "").slice(0, 7);
  return d.length === 7 ? Number(d) : 0;
};

async function tryFetch(url: string, ms = 3500) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { accept: "application/json" } });
    clearTimeout(to);
    if (!r.ok) return null;
    return await r.json();
  } catch (_) {
    clearTimeout(to);
    return null;
  }
}

// Resolve CNAE por cascata de provedores. NUNCA lanca. Cacheia o vencedor.
async function lookupEmpresa(cnpj: string) {
  // 0) cache
  try {
    const cached = await db(`maq_cnpj_cache?cnpj=eq.${cnpj}&select=*`);
    if (cached?.length && cached[0]?.cnae) return { empresa: cached[0], source: "cache" as const };
  } catch (_) { /* sem cache, segue */ }

  // 1) BrasilAPI
  {
    const j = await tryFetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    const cnae = digits7(j?.cnae_fiscal);
    if (cnae) {
      const empresa = {
        cnpj, cnae,
        razao_social: j?.razao_social ?? null,
        nome_fantasia: j?.nome_fantasia ?? null,
        cnae_descricao: j?.cnae_fiscal_descricao ?? null,
        situacao: j?.descricao_situacao_cadastral ?? null,
      };
      await dbWrite("maq_cnpj_cache", empresa);
      return { empresa, source: "brasilapi" as const };
    }
  }

  // 2) cnpj.ws (publica)
  {
    const j = await tryFetch(`https://publica.cnpj.ws/cnpj/${cnpj}`);
    const est = j?.estabelecimento ?? {};
    const ap = est?.atividade_principal ?? {};
    const cnae = digits7(ap?.subclasse ?? ap?.id);
    if (cnae) {
      const empresa = {
        cnpj, cnae,
        razao_social: j?.razao_social ?? null,
        nome_fantasia: est?.nome_fantasia ?? null,
        cnae_descricao: ap?.descricao ?? null,
        situacao: est?.situacao_cadastral ?? null,
      };
      await dbWrite("maq_cnpj_cache", empresa);
      return { empresa, source: "cnpjws" as const };
    }
  }

  // 3) ReceitaWS
  {
    const j = await tryFetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`);
    const ap = Array.isArray(j?.atividade_principal) ? j.atividade_principal[0] : null;
    const cnae = digits7(ap?.code);
    if (cnae) {
      const empresa = {
        cnpj, cnae,
        razao_social: j?.nome ?? null,
        nome_fantasia: j?.fantasia ?? null,
        cnae_descricao: ap?.text ?? null,
        situacao: j?.situacao ?? null,
      };
      await dbWrite("maq_cnpj_cache", empresa);
      return { empresa, source: "receitaws" as const };
    }
  }

  return { empresa: null, source: "falha" as const };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const cnpj = String(body?.cnpj ?? "").replace(/\D/g, "");
    const hasCnpj = cnpj.length === 14;

    const { empresa, source } = hasCnpj
      ? await lookupEmpresa(cnpj)
      : { empresa: null, source: "sem_cnpj" as const };
    const cnae: number = Number(empresa?.cnae ?? 0);

    const sRows = await db("maq_settings?id=eq.1&select=*");
    const s = sRows?.[0] ?? {};
    const fatRange = body?.faturamento ? FAT_RANGE[String(body.faturamento)] : undefined;
    const range = Number(body?.range ?? fatRange ?? s.active_range ?? 1);
    const antecipa = body?.antecipa ?? s.antecipa_default ?? false;
    const online = body?.online ?? s.online_default ?? false;
    const monthly = Number(s.antecipacao_mensal ?? 0.019);
    const daily = Math.pow(1 + monthly, 1 / 30) - 1;

    let mcc = DEFAULT_MCC, matched = false;
    if (cnae) {
      try {
        const bridge = await db(`maq_cnae_mcc?cnae=eq.${cnae}&select=mcc`);
        if (bridge?.length) { mcc = Number(bridge[0].mcc); matched = true; }
      } catch (_) { /* usa default */ }
    }
    const catRows = await db(`maq_mcc_category?mcc=eq.${mcc}&select=mcc,descricao`);
    const categoria = catRows?.[0] ?? { mcc, descricao: "Comercio Geral" };

    let crRows = await db(
      `maq_customer_rate?mcc=eq.${mcc}&range=eq.${range}&select=group_code,brand,taxa`,
    );
    if ((!crRows || !crRows.length) && mcc !== DEFAULT_MCC) {
      mcc = DEFAULT_MCC; matched = false;
      crRows = await db(
        `maq_customer_rate?mcc=eq.${mcc}&range=eq.${range}&select=group_code,brand,taxa`,
      );
    }
    const mdr: Record<string, Record<string, number>> = {};
    for (const row of crRows) {
      (mdr[row.group_code] ??= {})[row.brand] = Number(row.taxa);
    }

    const parcelas = await db("maq_installment?select=code,group_code,days,ord,label&order=ord");
    const onlineRows = online ? await db("maq_online_spread?select=installment_code,brand,taxa") : [];
    const onlineMap: Record<string, Record<string, number>> = {};
    for (const o of onlineRows) {
      (onlineMap[o.installment_code] ??= {})[o.brand] = Number(o.taxa);
    }

    const taxas = parcelas.map((p: any) => {
      const grupo = mdr[p.group_code] ?? {};
      let antec = 0;
      if (antecipa && p.days != null) {
        antec = p.code === "avista" ? monthly : daily * Number(p.days);
      }
      const brands: Record<string, number> = {};
      for (const brand of Object.keys(grupo)) {
        const on = online ? (onlineMap[p.code]?.[brand] ?? 0) : 0;
        brands[brand] = Math.round((grupo[brand] + antec + on) * 1e6) / 1e6;
      }
      return { code: p.code, label: p.label, brands };
    });

    return json({
      ok: true,
      empresa: {
        cnpj: hasCnpj ? cnpj : null,
        razao_social: empresa?.razao_social ?? null,
        nome_fantasia: empresa?.nome_fantasia ?? null,
        cnae_fiscal: cnae || null,
        cnae_descricao: empresa?.cnae_descricao ?? null,
        situacao: empresa?.situacao ?? null,
      },
      categoria: { mcc: categoria.mcc, descricao: categoria.descricao, matched },
      range,
      antecipacao_aplicada: !!antecipa,
      online_aplicado: !!online,
      cnpj_lookup: source, // cache | brasilapi | cnpjws | receitaws | falha | sem_cnpj
      taxas,
    });
  } catch (e) {
    return json({ ok: false, error: "erro_interno", detalhe: String(e) }, 500);
  }
});
