/**
 * Motor de resposta NATIVO do assistente (all4pay IA) — responde perguntas em
 * linguagem natural calculando os números REAIS dos dados do cliente
 * (movements, contas, clientes) na hora, sem depender de chave de LLM. É o que
 * faz a IA "funcionar de verdade" mesmo offline: entende intenção (quanto/quem/
 * quando/quais) e devolve resposta + números + fontes (explainability).
 *
 * Cobre: saldo, gastos/receita/resultado do período, maiores gastos por
 * categoria, a receber/a pagar, vencimentos, inadimplência, maior cliente,
 * comparação mês a mês, ticket médio, contagem de vendas, runway/burn/score.
 * Perguntas consultivas/abertas (contratação, investir, expansão) NÃO casam
 * aqui (retorna null) e sobem para o Claude / motor consultivo.
 *
 * Determinístico, puro, demo/live idêntico (roda sobre o RiskInput).
 */
import type { RiskInput, RiskMovement } from "@/core/risk-engine/types";
import type { ExecutiveContext, RespostaCopiloto } from "@/core/executive/types";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const pad = (n: number) => String(n).padStart(2, "0");
const MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dia = (ds: string) => ds.slice(0, 10).split("-").reverse().join("/");
/** Dias corridos de a → b (positivo = b depois de a). */
const diasEntre = (a: string, b: string) => Math.round((new Date(b.slice(0, 10) + "T00:00:00").getTime() - new Date(a.slice(0, 10) + "T00:00:00").getTime()) / 86400000);

interface Janela { label: string; from: string; to: string }

function janela(p: string, hojeISO: string): Janela {
  const hoje = new Date(hojeISO + "T00:00:00");
  const y = hoje.getFullYear(), m = hoje.getMonth(), d = hoje.getDate();
  const iso = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  if (/\bhoje\b/.test(p)) return { label: "hoje", from: hojeISO, to: hojeISO };
  if (/ontem/.test(p)) { const o = new Date(y, m, d - 1); return { label: "ontem", from: iso(o), to: iso(o) }; }
  if (/amanh[ãa]/.test(p)) { const o = new Date(y, m, d + 1); return { label: "amanhã", from: iso(o), to: iso(o) }; }
  const ult = p.match(/[úu]ltim[oa]s?\s+(\d+)\s+dias/);
  if (ult) { const n = +ult[1]; const a = new Date(y, m, d - n + 1); return { label: `nos últimos ${n} dias`, from: iso(a), to: hojeISO }; }
  if (/semana/.test(p)) { const dom = new Date(y, m, d - hoje.getDay()); const sab = new Date(dom); sab.setDate(dom.getDate() + 6); return { label: "nesta semana", from: iso(dom), to: iso(sab) }; }
  if (/m[êe]s passad|m[êe]s anterior|[úu]ltimo m[êe]s/.test(p)) { const f = new Date(y, m - 1, 1); const t = new Date(y, m, 0); return { label: `em ${MES[f.getMonth()]}`, from: iso(f), to: iso(t) }; }
  if (/\bano\b|anual|no ano|do ano|12 meses/.test(p)) return { label: `em ${y}`, from: `${y}-01-01`, to: `${y}-12-31` };
  if (/trimestre|[úu]ltimos?\s+3\s+meses|\b3 meses\b/.test(p)) { const q0 = Math.floor(m / 3) * 3; return { label: "no trimestre", from: iso(new Date(y, q0, 1)), to: iso(new Date(y, q0 + 3, 0)) }; }
  if (/semestre|[úu]ltimos?\s+6\s+meses|\b6 meses\b/.test(p)) { const s0 = m < 6 ? 0 : 6; return { label: "no semestre", from: iso(new Date(y, s0, 1)), to: iso(new Date(y, s0 + 6, 0)) }; }
  // mês NOMEADO ("em março", "de janeiro") — limite de palavra p/ maio≠maior.
  if (!/m[êe]s passad|m[êe]s anterior/.test(p)) {
    const mi = MES.findIndex((nm) => new RegExp(`(^|[^a-zà-ú])${nm}([^a-zà-ú]|$)`, "i").test(p));
    if (mi >= 0) {
      const yy = mi > m ? y - 1 : y; // mês no futuro → ano passado
      const f = new Date(yy, mi, 1), t = new Date(yy, mi + 1, 0);
      return { label: `em ${MES[mi]}${yy !== y ? `/${yy}` : ""}`, from: iso(f), to: iso(t) };
    }
  }
  const f = new Date(y, m, 1); const t = new Date(y, m + 1, 0); return { label: `em ${MES[m]}`, from: iso(f), to: iso(t) };
}

const within = (ds: string | null | undefined, w: Janela) => !!ds && ds.slice(0, 10) >= w.from && ds.slice(0, 10) <= w.to;
const cashDate = (m: RiskMovement) => (m.paid_date || m.due_date || "").slice(0, 10);
const ativos = (ms: RiskMovement[]) => ms.filter((m) => m.status !== "cancelado");

function topCategorias(ms: RiskMovement[], n = 5) {
  const map = new Map<string, number>();
  for (const m of ms) { const c = (m.category || "Outros").trim() || "Outros"; map.set(c, (map.get(c) || 0) + Math.abs(m.amount)); }
  return Array.from(map.entries()).map(([nome, valor]) => ({ nome: cap(nome), valor })).sort((a, b) => b.valor - a.valor).slice(0, n);
}
function topClientes(ms: RiskMovement[], nomes: Record<string, string> | undefined, n = 5) {
  const map = new Map<string, number>();
  for (const m of ms) { const k = m.party_id || "—"; map.set(k, (map.get(k) || 0) + Math.abs(m.amount)); }
  return Array.from(map.entries()).map(([id, valor]) => ({ nome: (nomes?.[id]) || (id === "—" ? "Sem cliente" : "Cliente"), valor })).sort((a, b) => b.valor - a.valor).slice(0, n);
}
/** party_id da contraparte de maior volume (|valor|) numa lista — ignora nulos. */
function topId(ms: RiskMovement[]): string | undefined {
  const map = new Map<string, number>();
  for (const m of ms) { if (!m.party_id) continue; map.set(m.party_id, (map.get(m.party_id) || 0) + Math.abs(m.amount)); }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}
const R = (resposta: string, numeros: { label: string; valor: string }[], fontes: string[], confianca = 0.9): RespostaCopiloto => ({ resposta, numeros, fontes, confianca });

export function responderLocal(pergunta: string, input: RiskInput, ctx?: ExecutiveContext): (RespostaCopiloto & { contatoId?: string }) | null {
  const p = pergunta.toLowerCase();
  const hoje = input.hoje;
  const movs = ativos(input.movements);
  const nomes = input.partyNames;

  // ——— TOTAL EM ATRASO (ambos os lados) — só em frasear "total vencido/atraso" ———
  // Fica ANTES de a-receber/a-pagar/inadimplência para não roubar "quem deve".
  if (/total\s+(vencid|em atraso|atrasad|de vencid)|em atraso no total|atrasad[oa]s? no total|quanto (est[áa]|t[êe]m|tem).*atrasad.*total|total.*(vencid|em atraso)/.test(p)) {
    const vencidos = movs.filter((m) => m.status === "pendente" && m.due_date.slice(0, 10) < hoje);
    const rec = vencidos.filter((m) => m.type === "entrada");
    const pag = vencidos.filter((m) => m.type === "saida");
    const totRec = rec.reduce((s, m) => s + Math.abs(m.amount), 0);
    const totPag = pag.reduce((s, m) => s + Math.abs(m.amount), 0);
    const geral = totRec + totPag;
    if (vencidos.length === 0) return R("Nada está vencido no momento — não há títulos em atraso a receber nem a pagar.", [{ label: "Total em atraso", valor: fmt(0) }], ["títulos vencidos"]);
    return R(
      `Você tem ${fmt(geral)} vencidos em ${vencidos.length} título(s): ${fmt(totRec)} a receber (${rec.length}) e ${fmt(totPag)} a pagar (${pag.length}).`,
      [{ label: "A receber vencido", valor: fmt(totRec) }, { label: "A pagar vencido", valor: fmt(totPag) }, { label: "Total em atraso", valor: fmt(geral) }],
      ["recebíveis vencidos", "contas a pagar vencidas"]);
  }

  // ——— PONTUALIDADE DE RECEBIMENTO (atraso médio dos clientes / DSO) ———
  // ANTES de A RECEBER: "para receber" contém a substring "a receber".
  if (/quanto tempo (demoro|levo|leva|demora)( para| pra)? receber|prazo m[ée]dio de recebiment|atraso m[ée]dio (dos |de )?clientes?|(meus )?clientes? (pagam?|est[ãa]o pagando|andam pagando)( em dia| no prazo| atrasad| com atraso| adiantad)|clientes? pagam em dia|recebo (em dia|no prazo|com atraso)/.test(p)) {
    const pagos = movs.filter((m) => m.type === "entrada" && m.status === "pago" && m.paid_date && m.due_date);
    if (!pagos.length) return R("Ainda não há recebimentos liquidados para medir a pontualidade dos clientes.", [], ["recebimentos liquidados"]);
    const atrasos = pagos.map((m) => diasEntre(m.due_date, m.paid_date as string));
    const media = atrasos.reduce((s, d) => s + d, 0) / atrasos.length;
    const noPrazo = atrasos.filter((d) => d <= 0).length;
    const pctPrazo = Math.round((noPrazo / atrasos.length) * 100);
    const arred = Math.round(media);
    const frase = arred <= 0
      ? `Seus clientes pagam em dia — em média ${Math.abs(arred)} dia(s) ${arred < 0 ? "antes" : "no"} do vencimento. ${pctPrazo}% dos títulos foram pagos no prazo.`
      : `Seus clientes pagam com ${arred} dia(s) de atraso em média. Só ${pctPrazo}% foram pagos no prazo — vale apertar a cobrança.`;
    return R(frase, [{ label: "Atraso médio", valor: `${arred} d` }, { label: "Pagos no prazo", valor: `${pctPrazo}%` }, { label: "Títulos", valor: String(atrasos.length) }], ["comportamento de pagamento dos clientes"], 0.88);
  }

  // ——— PONTUALIDADE DE PAGAMENTO (atraso médio com que EU pago / DPO) ———
  if (/pago (minhas |as )?(contas?|fornecedores?|boletos?)( em dia| no prazo| atrasad| com atraso| adiantad)|(estou |ando )?pagando (em dia|no prazo|atrasad|com atraso)|prazo m[ée]dio de pagament|atraso m[ée]dio (que eu pago|de pagament|dos meus pagament)|pago (tudo )?em dia|estou pagando em dia/.test(p)) {
    const pagos = movs.filter((m) => m.type === "saida" && m.status === "pago" && m.paid_date && m.due_date);
    if (!pagos.length) return R("Ainda não há pagamentos liquidados para medir sua pontualidade.", [], ["pagamentos liquidados"]);
    const atrasos = pagos.map((m) => diasEntre(m.due_date, m.paid_date as string));
    const media = atrasos.reduce((s, d) => s + d, 0) / atrasos.length;
    const noPrazo = atrasos.filter((d) => d <= 0).length;
    const pctPrazo = Math.round((noPrazo / atrasos.length) * 100);
    const arred = Math.round(media);
    const frase = arred <= 0
      ? `Você paga em dia — em média ${Math.abs(arred)} dia(s) ${arred < 0 ? "antes" : "no"} do vencimento (${pctPrazo}% no prazo). Boa disciplina, mas pagar exatamente no vencimento preserva mais caixa.`
      : `Você paga com ${arred} dia(s) de atraso em média (${pctPrazo}% no prazo). Atrasar demais gera multa/juros e arranha o relacionamento com fornecedores.`;
    return R(frase, [{ label: "Atraso médio", valor: `${arred} d` }, { label: "Pagos no prazo", valor: `${pctPrazo}%` }, { label: "Títulos", valor: String(atrasos.length) }], ["comportamento de pagamento a fornecedores"], 0.88);
  }

  // ——— A RECEBER (total) — "quem deve/devendo" cai na inadimplência abaixo ———
  if (/a receber|contas? a receber|receb[íi]veis|tenho a receber|me devem|v[ãa]o me pagar/.test(p)) {
    const ab = movs.filter((m) => m.type === "entrada" && m.status === "pendente");
    const total = ab.reduce((s, m) => s + Math.abs(m.amount), 0);
    const vencidos = ab.filter((m) => m.due_date.slice(0, 10) < hoje);
    const totVenc = vencidos.reduce((s, m) => s + Math.abs(m.amount), 0);
    const prox = ab.filter((m) => m.due_date.slice(0, 10) >= hoje).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    return R(
      `Você tem ${fmt(total)} a receber em ${ab.length} título(s)${totVenc > 0 ? `, dos quais ${fmt(totVenc)} já estão vencidos (${vencidos.length})` : ""}.${prox ? ` O próximo vence em ${dia(prox.due_date)} (${fmt(Math.abs(prox.amount))}).` : ""}`,
      [{ label: "Total a receber", valor: fmt(total) }, { label: "Vencido", valor: fmt(totVenc) }, { label: "Títulos", valor: String(ab.length) }],
      ["recebíveis em aberto"]);
  }

  // ——— A PAGAR ———
  if (/a pagar|contas? a pagar|pag[áa]veis|quanto.*(devo|tenho (que|a) pagar|preciso pagar)|minhas? d[íi]vidas?/.test(p)) {
    const ab = movs.filter((m) => m.type === "saida" && m.status === "pendente");
    const total = ab.reduce((s, m) => s + Math.abs(m.amount), 0);
    const vencidos = ab.filter((m) => m.due_date.slice(0, 10) < hoje);
    const totVenc = vencidos.reduce((s, m) => s + Math.abs(m.amount), 0);
    const prox = ab.filter((m) => m.due_date.slice(0, 10) >= hoje).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    return R(
      `Você tem ${fmt(total)} a pagar em ${ab.length} título(s)${totVenc > 0 ? `, sendo ${fmt(totVenc)} já vencidos (${vencidos.length})` : ""}.${prox ? ` O próximo vence em ${dia(prox.due_date)} (${fmt(Math.abs(prox.amount))}).` : ""}`,
      [{ label: "Total a pagar", valor: fmt(total) }, { label: "Vencido", valor: fmt(totVenc) }, { label: "Títulos", valor: String(ab.length) }],
      ["contas a pagar em aberto"]);
  }

  // ——— VENCIMENTOS no período ———
  if (/(o que|quais|quanto|tem algo).*(vence|vencer|vencimento)|vence (hoje|amanh[ãa]|essa semana|esse m[êe]s)|a vencer|vencimentos?/.test(p)) {
    const w = /semana|m[êe]s|hoje|amanh|dias/.test(p) ? janela(p, hoje) : { label: "nesta semana", ...semanaDe(hoje) };
    const venc = movs.filter((m) => m.status === "pendente" && within(m.due_date, w)).sort((a, b) => a.due_date.localeCompare(b.due_date));
    const receb = venc.filter((m) => m.type === "entrada").reduce((s, m) => s + Math.abs(m.amount), 0);
    const pagar = venc.filter((m) => m.type === "saida").reduce((s, m) => s + Math.abs(m.amount), 0);
    if (venc.length === 0) return R(`Nada vence ${w.label}. Sem títulos pendentes nesse intervalo.`, [], ["agenda de vencimentos"]);
    return R(
      `${w.label.charAt(0).toUpperCase() + w.label.slice(1)} vencem ${venc.length} título(s): ${fmt(receb)} a receber e ${fmt(pagar)} a pagar — resultado de ${fmt(receb - pagar)} no caixa.`,
      [{ label: "A receber", valor: fmt(receb) }, { label: "A pagar", valor: fmt(pagar) }, { label: "Líquido", valor: fmt(receb - pagar) }],
      ["agenda de vencimentos"]);
  }

  // ——— INADIMPLÊNCIA / quem está atrasado ———
  if (/inadimpl|em atraso|atrasad|quem.*dev|devendo|devedor|clientes? devendo|vencid|caloteir/.test(p)) {
    const venc = movs.filter((m) => m.type === "entrada" && m.status === "pendente" && m.due_date.slice(0, 10) < hoje);
    const total = venc.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (venc.length === 0) return R("Nenhum recebível está vencido no momento — sua carteira está em dia.", [{ label: "Em atraso", valor: fmt(0) }], ["recebíveis vencidos"]);
    const porCliente = topClientes(venc, nomes, 3);
    const lista = porCliente.map((c) => `${c.nome} (${fmt(c.valor)})`).join(", ");
    return {
      ...R(
        `Há ${fmt(total)} vencidos e não pagos em ${venc.length} título(s). Os maiores devedores: ${lista}. Vale priorizar a cobrança desses clientes.`,
        porCliente.slice(0, 3).map((c) => ({ label: c.nome, valor: fmt(c.valor) })),
        ["recebíveis vencidos", "motor de inadimplência"]),
      ...(topId(venc) ? { contatoId: topId(venc) } : {}),
    };
  }

  // ——— MAIOR / MELHOR CLIENTE ———
  // Defere frases de concentração/dependência ("quanto representa meu maior
  // cliente") para o intent de CONCENTRAÇÃO abaixo — senão "maior cliente" as
  // rouba por substring.
  if (/(maior|melhor|principa(l|is)) cliente|quem mais (paga|compra|fatura|me paga)|top clientes?/.test(p) && !/representa|depend|concentra/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const top = topClientes(ent, nomes, 4).filter((c) => c.valor > 0 && c.nome !== "Sem cliente").slice(0, 3);
    if (top.length === 0) return R(`Não há receita paga por cliente identificado ${w.label}.`, [], ["receita por cliente"]);
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    const share = tot > 0 ? Math.round((top[0].valor / tot) * 100) : 0;
    return {
      ...R(
        `Seu maior cliente ${w.label} é ${top[0].nome}, com ${fmt(top[0].valor)} (${share}% da receita do período). Em seguida: ${top.slice(1).map((c) => `${c.nome} (${fmt(c.valor)})`).join(", ") || "—"}.`,
        top.map((c) => ({ label: c.nome, valor: fmt(c.valor) })),
        ["receita por cliente"]),
      ...(topId(ent) ? { contatoId: topId(ent) } : {}),
    };
  }

  // ——— CONCENTRAÇÃO / DEPENDÊNCIA de cliente (risco) — últimos 6 meses ———
  if (/concentra[çc][ãa]o|\bdependo\b|depend[êe]ncia (de|dos|do)|risco de concentra|quanto (representa|vale) (o )?meu maior cliente|(muito )?dependente de (algum |um )?cliente|um cliente s[óo]/.test(p)) {
    const base = new Date(hoje + "T00:00:00"); base.setMonth(base.getMonth() - 5);
    const from = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-01`;
    const w: Janela = { label: "nos últimos 6 meses", from, to: hoje };
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const top = topClientes(ent, nomes, 5).filter((c) => c.valor > 0 && c.nome !== "Sem cliente");
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (!top.length || tot <= 0) return R("Ainda não há receita por cliente identificado suficiente para medir concentração.", [], ["receita por cliente"]);
    const share = Math.round((top[0].valor / tot) * 100);
    const top3 = Math.round((top.slice(0, 3).reduce((s, c) => s + c.valor, 0) / tot) * 100);
    const alerta = share >= 30
      ? `Atenção: ${share}% da sua receita depende de ${top[0].nome} — concentração alta, um risco se esse cliente sair.`
      : `Saudável: seu maior cliente (${top[0].nome}) é ${share}% da receita, sem dependência crítica.`;
    return {
      ...R(
        `${alerta} Os 3 maiores somam ${top3}% do que você recebe (últimos 6 meses).`,
        [{ label: `Maior (${top[0].nome})`, valor: `${share}%` }, { label: "Top 3", valor: `${top3}%` }, { label: "Receita 6m", valor: fmt(tot) }],
        ["receita por cliente", "índice de concentração"], 0.88),
      ...(topId(ent) ? { contatoId: topId(ent) } : {}),
    };
  }

  // ——— COMPARAÇÃO ENTRE DOIS MESES NOMEADOS ("gastei mais em maio ou junho?") ———
  {
    const achados = MES.map((_, i) => i).filter((i) => new RegExp(`(^|[^a-zà-ú])${MES[i]}([^a-zà-ú]|$)`, "i").test(p));
    if (achados.length === 2 && /(mais|menos|compar|\bou\b|vs|versus|diferen)/.test(p)) {
      const hojeD = new Date(hoje + "T00:00:00"); const cm = hojeD.getMonth(), cy = hojeD.getFullYear();
      const pad = (n: number) => String(n).padStart(2, "0");
      const winOf = (mi: number): Janela => { const yy = mi > cm ? cy - 1 : cy; return { label: `${MES[mi]}${yy !== cy ? `/${yy}` : ""}`, from: `${yy}-${pad(mi + 1)}-01`, to: `${yy}-${pad(mi + 1)}-${new Date(yy, mi + 1, 0).getDate()}` }; };
      const tipo: "entrada" | "saida" = /receb|receita|fatur|entr|vend/.test(p) ? "entrada" : "saida";
      const [wa, wb] = [winOf(achados[0]), winOf(achados[1])];
      const soma = (w: Janela) => movs.filter((m) => m.type === tipo && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
      const va = soma(wa), vb = soma(wb);
      const verbo = tipo === "entrada" ? "recebeu" : "gastou";
      const maior = va >= vb ? wa : wb;
      return R(
        `Você ${verbo} ${fmt(va)} em ${wa.label} e ${fmt(vb)} em ${wb.label} — ${va === vb ? "empate" : `mais em ${maior.label} (${fmt(Math.abs(va - vb))} de diferença)`}.`,
        [{ label: cap(wa.label), valor: fmt(va) }, { label: cap(wb.label), valor: fmt(vb) }],
        ["comparação por mês"]);
    }
  }

  // ——— POR CONTRAPARTE (cliente/fornecedor citado na pergunta) ———
  if (nomes && /(quanto|gast|paguei|recebi|receb|devo|deve|com|para|pro|pra|hist[óo]rico|mostr|abr[ai]|ficha|ver o|dados d|perfil d)/.test(p)) {
    // casa o nome como PALAVRA (limites), não substring solto — evita
    // "Sol"⊂"saldo"/"Casa"⊂"na casa" sequestrarem perguntas genéricas.
    const alvo = Object.entries(nomes).find(([, n]) => {
      const t = (n || "").toLowerCase().trim();
      if (t.length < 4) return false;
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^a-zà-ú0-9])${esc}([^a-zà-ú0-9]|$)`, "i").test(p);
    });
    if (alvo) {
      const [id, nome] = alvo;
      const doParty = movs.filter((m) => m.party_id === id);
      const recebido = doParty.filter((m) => m.type === "entrada" && m.status === "pago").reduce((s, m) => s + Math.abs(m.amount), 0);
      const pago = doParty.filter((m) => m.type === "saida" && m.status === "pago").reduce((s, m) => s + Math.abs(m.amount), 0);
      const aberto = doParty.filter((m) => m.status === "pendente").reduce((s, m) => s + (m.type === "entrada" ? Math.abs(m.amount) : -Math.abs(m.amount)), 0);
      const partes: string[] = [];
      if (recebido > 0) partes.push(`recebeu ${fmt(recebido)}`);
      if (pago > 0) partes.push(`pagou ${fmt(pago)}`);
      const abertoTxt = Math.abs(aberto) > 0.5 ? ` Em aberto: ${fmt(Math.abs(aberto))} ${aberto > 0 ? "a receber" : "a pagar"}.` : "";
      return {
        ...R(
          `Com ${nome} você ${partes.join(" e ") || "não teve movimento realizado"} em ${doParty.length} lançamento(s).${abertoTxt}`,
          [...(recebido > 0 ? [{ label: "Recebido", valor: fmt(recebido) }] : []), ...(pago > 0 ? [{ label: "Pago", valor: fmt(pago) }] : [])],
          ["histórico por contraparte"]),
        contatoId: id,
      };
    }
  }

  // ——— MAIOR GASTO INDIVIDUAL (singular) ———
  if (/maior (gasto|despesa|conta|pagamento|sa[íi]da)\b|gasto mais (alto|caro)|meu maior gasto/.test(p)) {
    const w = janela(p, hoje);
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w));
    if (!sai.length) return R(`Nenhum gasto pago ${w.label}.`, [], ["despesas realizadas"]);
    const maior = sai.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
    const nome = (maior.party_id && nomes?.[maior.party_id]) || maior.category || "Despesa";
    return {
      ...R(
        `Seu maior gasto ${w.label} foi ${fmt(Math.abs(maior.amount))} — ${cap(String(nome))}${maior.category ? ` (${maior.category})` : ""}, em ${dia(cashDate(maior))}.`,
        [{ label: "Maior gasto", valor: fmt(Math.abs(maior.amount)) }], ["despesas realizadas"]),
      ...(maior.party_id ? { contatoId: maior.party_id } : {}),
    };
  }

  // ——— MAIOR RECEBIMENTO INDIVIDUAL (singular) ———
  if (/maior (recebimento|entrada|venda|receita|dep[óo]sito)\b|recebimento mais (alto|caro)|maior (valor )?recebido|minha maior (venda|entrada)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    if (!ent.length) return R(`Nenhum recebimento pago ${w.label}.`, [], ["receita realizada"]);
    const maior = ent.reduce((a, b) => (Math.abs(b.amount) > Math.abs(a.amount) ? b : a));
    const nome = (maior.party_id && nomes?.[maior.party_id]) || maior.category || "Recebimento";
    return {
      ...R(
        `Seu maior recebimento ${w.label} foi ${fmt(Math.abs(maior.amount))} — ${cap(String(nome))}${maior.category ? ` (${maior.category})` : ""}, em ${dia(cashDate(maior))}.`,
        [{ label: "Maior recebimento", valor: fmt(Math.abs(maior.amount)) }], ["receita realizada"]),
      ...(maior.party_id ? { contatoId: maior.party_id } : {}),
    };
  }

  // ——— DE ONDE VEM A RECEITA (top categorias de entradas pagas) ———
  if (/(de onde|da onde).*(vem|v[êe]m|veio|vier).*(receita|dinheiro|faturamento|grana|entra)|origem (da|das) receita|receita por categoria|categorias? de (receita|entrada|faturamento)|de onde (vem|veio) (o|a) (dinheiro|receita)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const top = topCategorias(ent, 5);
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (top.length === 0) return R(`Não encontrei receita paga ${w.label}.`, [], ["receita por categoria"]);
    const lista = top.slice(0, 3).map((c) => `${c.nome} (${fmt(c.valor)}, ${tot > 0 ? Math.round((c.valor / tot) * 100) : 0}%)`).join(", ");
    return R(
      `Sua receita ${w.label} (${fmt(tot)} no total) vem principalmente de: ${lista}.`,
      top.slice(0, 4).map((c) => ({ label: c.nome, valor: fmt(c.valor) })),
      ["receita por categoria"]);
  }

  // ——— POR CENTRO DE CUSTO / PROJETO ———
  if (/centro de custo|por projeto|no projeto|custo por/.test(p)) {
    const w = janela(p, hoje);
    const map = new Map<string, number>();
    for (const m of movs) { if (m.type !== "saida" || m.status !== "pago" || !within(cashDate(m), w)) continue; const c = (m.costCenter || "Sem centro").trim() || "Sem centro"; map.set(c, (map.get(c) || 0) + Math.abs(m.amount)); }
    const arr = Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
    if (!arr.length) return R(`Não há gastos com centro de custo definido ${w.label}.`, [], ["despesas por centro de custo"]);
    const top = arr.slice(0, 3);
    return R(`Gastos por centro de custo ${w.label}: ${top.map(([n, v]) => `${cap(n)} (${fmt(v)})`).join(", ")}.`, top.map(([n, v]) => ({ label: cap(n), valor: fmt(v) })), ["despesas por centro de custo"]);
  }

  // ——— GASTO COM UMA CATEGORIA ESPECÍFICA ("quanto gastei com marketing?") ———
  // Casa dinamicamente com QUALQUER categoria de despesa que o cliente tenha.
  {
    const cats = Array.from(new Set(movs.filter((m) => m.type === "saida" && m.category).map((m) => (m.category as string).toLowerCase().trim()))).filter((c) => c.length >= 3);
    const alvo = cats.sort((a, b) => b.length - a.length).find((c) => new RegExp(`(^|[^a-zà-ú])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zà-ú]|$)`, "i").test(p));
    if (alvo && /(gast|paguei|despes|quanto|custo)/.test(p)) {
      const w = janela(p, hoje);
      const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && (m.category || "").toLowerCase().trim() === alvo && within(cashDate(m), w));
      const tot = sai.reduce((s, m) => s + Math.abs(m.amount), 0);
      return R(`Você gastou ${fmt(tot)} com ${cap(alvo)} ${w.label}, em ${sai.length} pagamento(s).`, [{ label: cap(alvo), valor: fmt(tot) }], ["despesas da categoria"]);
    }
  }

  // ——— RECEITA DE UMA FONTE ESPECÍFICA ("quanto recebi de venda/serviço?") ———
  {
    const cats = Array.from(new Set(movs.filter((m) => m.type === "entrada" && m.category).map((m) => (m.category as string).toLowerCase().trim()))).filter((c) => c.length >= 3);
    const alvo = cats.sort((a, b) => b.length - a.length).find((c) => new RegExp(`(^|[^a-zà-ú])${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-zà-ú]|$)`, "i").test(p));
    if (alvo && /(receb|recebi|receita|fatur|entr|vend)/.test(p)) {
      const w = janela(p, hoje);
      const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && (m.category || "").toLowerCase().trim() === alvo && within(cashDate(m), w));
      const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
      return R(`Você recebeu ${fmt(tot)} de ${cap(alvo)} ${w.label}, em ${ent.length} entrada(s).`, [{ label: cap(alvo), valor: fmt(tot) }], ["receita da categoria"]);
    }
  }

  // ——— MAIORES GASTOS / por categoria ———
  if (/(maior(es)?|principa|onde|com o que|em que).*(gast|despes|custo)|gast(ei|os)? com|por categoria|categorias? de (gasto|despesa)|no que.*gast/.test(p)) {
    const w = janela(p, hoje);
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w));
    const top = topCategorias(sai, 5);
    const tot = sai.reduce((s, m) => s + Math.abs(m.amount), 0);
    if (top.length === 0) return R(`Não encontrei gastos pagos ${w.label}.`, [], ["despesas por categoria"]);
    const lista = top.slice(0, 3).map((c) => `${c.nome} (${fmt(c.valor)}, ${Math.round((c.valor / tot) * 100)}%)`).join(", ");
    return R(
      `Seus maiores gastos ${w.label} (${fmt(tot)} no total): ${lista}.`,
      top.slice(0, 4).map((c) => ({ label: c.nome, valor: fmt(c.valor) })),
      ["despesas por categoria"]);
  }

  // ——— TOP FORNECEDORES ———
  if (/(maior(es)?|principa|top|para quem).*(fornecedor|fornec)|quem mais (recebo de mim|me cobra|eu pago)|para quem (mais )?pago/.test(p)) {
    const w = janela(p, hoje);
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w));
    const top = topClientes(sai, nomes, 4).filter((c) => c.valor > 0 && c.nome !== "Sem cliente").slice(0, 3);
    if (!top.length) return R(`Não há pagamentos a fornecedor identificado ${w.label}.`, [], ["pagamentos por fornecedor"]);
    return {
      ...R(`Seus maiores fornecedores ${w.label}: ${top.map((c) => `${c.nome} (${fmt(c.valor)})`).join(", ")}.`, top.map((c) => ({ label: c.nome, valor: fmt(c.valor) })), ["pagamentos por fornecedor"]),
      ...(topId(sai) ? { contatoId: topId(sai) } : {}),
    };
  }

  // ——— QUANTOS clientes/fornecedores ———
  if (/quant(os|as) (clientes|fornecedores|contatos|parceiros|contrapartes)/.test(p)) {
    const forn = /fornecedor/.test(p);
    const tipo: "entrada" | "saida" = forn ? "saida" : "entrada";
    const set = new Set<string>();
    for (const m of movs) if (m.type === tipo && m.party_id) set.add(m.party_id);
    return R(`Você tem ${set.size} ${forn ? "fornecedor(es)" : "cliente(s)"} com movimento registrado.`, [{ label: forn ? "Fornecedores" : "Clientes", valor: String(set.size) }], ["contrapartes"]);
  }

  // ——— ONDE ECONOMIZAR / CORTAR (categoria que mais cresceu MoM) ———
  if (/onde (posso |d[áa] (pra|para) )?(economiz|cortar|reduzir|cortar gasto)|como economizar|gastar menos|reduzir (custo|despesa|gasto)|onde estou gastando (mais|demais)/.test(p)) {
    const wA = janela("mês", hoje), wB = janela("mês passado", hoje);
    const catW = (w: Janela) => { const map = new Map<string, number>(); for (const m of movs) { if (m.type !== "saida" || m.status !== "pago" || !within(cashDate(m), w)) continue; const c = (m.category || "Outros").trim() || "Outros"; map.set(c, (map.get(c) || 0) + Math.abs(m.amount)); } return map; };
    const atual = catW(wA), ant = catW(wB);
    let melhor: { c: string; v: number; d: number } | null = null;
    for (const [c, v] of Array.from(atual)) { const d = v - (ant.get(c) || 0); if (d > (melhor?.d ?? 0)) melhor = { c: cap(c), v, d }; }
    if (melhor && melhor.d > 0) {
      return R(
        `Melhor lugar para cortar: ${melhor.c} subiu ${fmt(melhor.d)} vs. o mês passado (${fmt(melhor.v)} este mês). Reduzir aí tem o maior impacto imediato.`,
        [{ label: melhor.c, valor: fmt(melhor.v) }, { label: "Alta vs. mês ant.", valor: `+${fmt(melhor.d)}` }],
        ["despesas por categoria (mês vs. mês)"]);
    }
    return R("Nenhuma categoria de despesa cresceu vs. o mês passado — seus gastos estão controlados. Veja as maiores despesas para priorizar cortes.", [], ["despesas por categoria (mês vs. mês)"]);
  }

  // ——— MARGEM / lucratividade (resultado ÷ receita no período) ———
  if (/margem|lucratividade|% de lucro|percentual de lucro|quanto sobra de cada|quanto (me )?sobra (de|por) (real|venda)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const res = ent - sai;
    if (ent <= 0) return R(`Não houve receita paga ${w.label}, então não dá para calcular a margem do período.`, [], ["receita realizada"]);
    const margem = Math.round((res / ent) * 100);
    return R(
      `Sua margem ${w.label} é ${margem}%: de cada R$ 100 que entraram, ${margem >= 0 ? `sobraram R$ ${margem}` : `faltaram R$ ${-margem}`}. Receita ${fmt(ent)}, despesa ${fmt(sai)}, resultado ${fmt(res)}.`,
      [{ label: "Margem", valor: `${margem}%` }, { label: "Receita", valor: fmt(ent) }, { label: "Resultado", valor: fmt(res) }],
      ["fluxo de caixa realizado"]);
  }

  // ——— CRESCIMENTO da receita (mês atual vs. mês anterior) ———
  if (/(estou |est[áa] |venho |vem )?cresc|crescimento|cresci|em alta|em queda|desacelerand|minha receita (t[áa]|est[áa]|vem) (subindo|crescendo|caindo|melhorando)|receita (subiu|caiu|cresceu)|estou (vendendo|faturando) (mais|menos)/.test(p)) {
    const atual = janela("mês", hoje), ant = janela("mês passado", hoje);
    const soma = (w: Janela) => movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const a = soma(atual), b = soma(ant);
    if (b <= 0) return R(`Ainda não há receita no mês anterior para comparar o crescimento. Este mês você recebeu ${fmt(a)}.`, [{ label: cap(atual.label), valor: fmt(a) }], ["receita realizada"]);
    const pct = Math.round(((a - b) / b) * 100);
    const dir = a > b ? "crescendo" : a < b ? "caindo" : "estável";
    return R(
      `Sua receita está ${dir}: ${fmt(a)} ${atual.label} vs. ${fmt(b)} ${ant.label} — ${pct >= 0 ? "+" : ""}${pct}% no mês. ${a >= b ? "Mantenha o ritmo de vendas." : "Vale investigar o que caiu."}`,
      [{ label: cap(atual.label), valor: fmt(a) }, { label: cap(ant.label), valor: fmt(b) }, { label: "Crescimento", valor: `${pct >= 0 ? "+" : ""}${pct}%` }],
      ["receita realizada (mês vs. mês)"]);
  }

  // ——— PONTO DE EQUILÍBRIO / break-even (quanto faturar para empatar) ———
  // Nota: "pagar as contas" fica FORA do gatilho — "para pagar" contém a
  // substring "a pagar" e o intent A PAGAR (acima) o captura primeiro. Servimos
  // as frases limpas (empatar / fechar no zero / me pagar / não ter prejuízo).
  if (/ponto de equil[íi]brio|break.?even|equil[íi]brio|quanto preciso (faturar|vender|receber) (para|pra) (empatar|n[ãa]o ter preju[íi]zo|me pagar|fechar no zero)|quanto (tenho|preciso) (que )?(faturar|vender) (para|pra) (empatar|fechar|cobrir|n[ãa]o ter preju)/.test(p)) {
    const meses = new Map<string, number>();
    for (const m of movs) { if (m.type !== "saida" || m.status !== "pago") continue; const k = cashDate(m).slice(0, 7); if (!k) continue; meses.set(k, (meses.get(k) || 0) + Math.abs(m.amount)); }
    const ult = Array.from(meses.entries()).sort((x, y) => x[0].localeCompare(y[0])).slice(-6);
    if (!ult.length) return R("Ainda não há despesas pagas suficientes para calcular seu ponto de equilíbrio.", [], ["despesas realizadas"]);
    const breakeven = ult.reduce((s, [, v]) => s + v, 0) / ult.length;
    const wMes = janela("mês", hoje);
    const recMes = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), wMes)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const falta = breakeven - recMes;
    return R(
      `Seu ponto de equilíbrio é ${fmt(breakeven)}/mês — é o quanto você precisa faturar para cobrir as despesas. Este mês já recebeu ${fmt(recMes)}, ${falta > 0 ? `faltam ${fmt(falta)} para empatar` : `${fmt(-falta)} acima do equilíbrio (no lucro)`}.`,
      [{ label: "Ponto de equilíbrio", valor: fmt(breakeven) }, { label: "Recebido no mês", valor: fmt(recMes) }, { label: falta > 0 ? "Falta" : "Acima", valor: fmt(Math.abs(falta)) }],
      ["despesa média mensal", "receita do mês"]);
  }

  // ——— RECEITA MÉDIA POR CLIENTE (LTV proxy) — antes de MÉDIA mensal ———
  // "receita média por cliente" tem "média"+"receita" e cairia na média mensal.
  if (/quanto cada cliente (me )?(rende|vale|gera|paga em m[ée]dia)|receita m[ée]dia por cliente|valor m[ée]dio por cliente|quanto (vale|rende) (cada|um) cliente|receita por cliente m[ée]dia/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w) && m.party_id);
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    const clientes = new Set(ent.map((m) => m.party_id as string)).size;
    if (!clientes) return R(`Não há receita paga por cliente identificado ${w.label} para calcular a média por cliente.`, [], ["receita por cliente"]);
    const porCliente = tot / clientes;
    return R(
      `Cada cliente rende em média ${fmt(porCliente)} ${w.label} — ${fmt(tot)} de ${clientes} cliente(s) que pagaram. É uma proxy do LTV no período.`,
      [{ label: "Receita/cliente", valor: fmt(porCliente) }, { label: "Clientes", valor: String(clientes) }, { label: "Receita", valor: fmt(tot) }],
      ["receita por cliente"], 0.88);
  }

  // ——— MÉDIA mensal (gasto/receita) ———
  if (/m[ée]di[ao]/.test(p) && !/ticket/.test(p) && /(gast|despesa|receb|receita|entr|m[êe]s|mensal)/.test(p)) {
    const tipo: "entrada" | "saida" = /receb|receita|entr/.test(p) ? "entrada" : "saida";
    const byMonth = new Map<string, number>();
    for (const m of movs) { if (m.type !== tipo || m.status !== "pago") continue; const k = cashDate(m).slice(0, 7); if (!k) continue; byMonth.set(k, (byMonth.get(k) || 0) + Math.abs(m.amount)); }
    const meses = Array.from(byMonth.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-6);
    if (!meses.length) return R("Ainda não há histórico suficiente para calcular a média mensal.", [], ["histórico mensal"]);
    const media = meses.reduce((s, [, v]) => s + v, 0) / meses.length;
    return R(
      `Sua média ${tipo === "entrada" ? "de receita" : "de gasto"} é ${fmt(media)} por mês, considerando os últimos ${meses.length} ${meses.length === 1 ? "mês" : "meses"}.`,
      [{ label: "Média mensal", valor: fmt(media) }], ["histórico mensal"]);
  }

  // ——— AFORDABILIDADE: posso gastar X? ———
  if (/(posso|consigo|d[áa] (pra|para)|tenho como|cabe).*(gastar|comprar|investir|pagar|gasto)|cabe no (caixa|or[çc]amento)/.test(p)) {
    const nm = p.replace(/r\$\s*/g, "").match(/(\d[\d.]*(,\d+)?)/);
    const valor = nm ? parseFloat(nm[1].replace(/\./g, "").replace(",", ".")) : 0;
    const burn = ctx?.burnRate && ctx.burnRate > 0 ? ctx.burnRate : input.saldoAtual * 0.15;
    const reserva = burn * 3; // reserva de ~3 meses de operação
    const folga = Math.max(0, input.saldoAtual - reserva);
    if (valor <= 0) return R(`Preservando ~3 meses de operação (${fmt(reserva)}), seu caixa comporta cerca de ${fmt(folga)} sem apertar. Diga um valor que eu digo se cabe.`, [{ label: "Folga segura", valor: fmt(folga) }], ["saldo", "reserva de segurança"]);
    const cabe = valor <= folga;
    return R(
      `${cabe ? "Sim, cabe" : "Cuidado"}: gastar ${fmt(valor)} ${cabe ? `deixa ${fmt(folga - valor)} de folga` : `comeria sua reserva — a folga segura é ${fmt(folga)}`}. Reserva preservada: ~3 meses (${fmt(reserva)}).`,
      [{ label: "Valor", valor: fmt(valor) }, { label: "Folga segura", valor: fmt(folga) }],
      ["saldo", "reserva de segurança"]);
  }

  // ——— GASTO MÉDIO POR DIA (burn diário) — antes do GASTO total ———
  // "quanto gasto por dia" casaria em "quanto.*gast" do GASTO total.
  if (/gasto (m[ée]dio )?(por|ao|no) dia|gasto di[áa]rio|quanto (gasto|gasta|sai|saem|torro) (por|ao|no) dia|burn di[áa]rio|quanto queimo por dia/.test(p)) {
    const fim = new Date(hoje + "T00:00:00");
    const ini = new Date(fim); ini.setDate(fim.getDate() - 29);
    const from = `${ini.getFullYear()}-${pad(ini.getMonth() + 1)}-${pad(ini.getDate())}`;
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && cashDate(m) >= from && cashDate(m) <= hoje);
    const tot = sai.reduce((s, m) => s + Math.abs(m.amount), 0);
    const porDia = tot / 30;
    if (tot <= 0) return R("Não houve gastos pagos nos últimos 30 dias para calcular o gasto diário.", [], ["despesas dos últimos 30 dias"]);
    return R(
      `Você gasta em média ${fmt(porDia)} por dia — ${fmt(tot)} em despesas pagas nos últimos 30 dias. No mês, isso projeta ~${fmt(porDia * 30)}.`,
      [{ label: "Gasto/dia", valor: fmt(porDia) }, { label: "30 dias", valor: fmt(tot) }],
      ["despesas dos últimos 30 dias"], 0.88);
  }

  // ——— GASTO total no período ———
  if (/(quanto).*(gast|gastei|sa[íi]|paguei|despes)|gast(ei|os)? (esse|este|do|neste|no)\s*m[êe]s|gasto total|total de (gasto|despesa)|minhas? despesas?/.test(p)) {
    const w = janela(p, hoje);
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w));
    const tot = sai.reduce((s, m) => s + Math.abs(m.amount), 0);
    const top = topCategorias(sai, 3);
    return R(
      `Você gastou ${fmt(tot)} ${w.label}, em ${sai.length} pagamento(s).${top.length ? ` Maior categoria: ${top[0].nome} (${fmt(top[0].valor)}).` : ""}`,
      [{ label: `Gasto ${w.label}`, valor: fmt(tot) }, ...top.slice(0, 2).map((c) => ({ label: c.nome, valor: fmt(c.valor) }))],
      ["despesas realizadas"]);
  }

  // ——— RECEITA / RECEBI no período ———
  if (/(quanto).*(receb|recebi|entr|faturei|fatur|vend)|receita (do|desse|deste|este|no)\s*m[êe]s|faturamento|quanto (vendi|entrou)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    const topC = topCategorias(ent, 3);
    return R(
      `Você recebeu ${fmt(tot)} ${w.label}, em ${ent.length} entrada(s).${topC.length ? ` Principal origem: ${topC[0].nome} (${fmt(topC[0].valor)}).` : ""}`,
      [{ label: `Receita ${w.label}`, valor: fmt(tot) }, ...topC.slice(0, 2).map((c) => ({ label: c.nome, valor: fmt(c.valor) }))],
      ["receita realizada"]);
  }

  // ——— PREVISÃO: quanto vai sobrar no mês (antes do RESULTADO realizado) ———
  if (/(vai sobrar|vou sobrar|sobra prevista|previs[ãa]o|proje[çc][ãa]o|fecha o m[êe]s|fim do m[êe]s|vou conseguir pagar|fecho o m[êe]s)/.test(p)) {
    const w = janela("mês", hoje);
    const realRec = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const realPag = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const prevRec = movs.filter((m) => m.type === "entrada" && m.status === "pendente" && within(m.due_date, w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const prevPag = movs.filter((m) => m.type === "saida" && m.status === "pendente" && within(m.due_date, w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const ent = realRec + prevRec, sai = realPag + prevPag, proj = ent - sai;
    return R(
      `Projeção do mês: entradas ${fmt(ent)} (${fmt(realRec)} já entraram + ${fmt(prevRec)} previstas) e saídas ${fmt(sai)} — deve ${proj >= 0 ? `sobrar ${fmt(proj)}` : `faltar ${fmt(-proj)}`} no fim do mês.`,
      [{ label: "Entradas (mês)", valor: fmt(ent) }, { label: "Saídas (mês)", valor: fmt(sai) }, { label: "Projeção", valor: fmt(proj) }],
      ["realizado + previsto do mês"]);
  }

  // ——— RESULTADO / sobrou / lucro ———
  if (/(sobrou|sobra|resultado|lucro|preju[íi]zo|fechei o m[êe]s|no azul|no vermelho|saldo do m[êe]s|ganhei mais do que gastei)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const sai = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const res = ent - sai;
    return R(
      `${w.label.charAt(0).toUpperCase() + w.label.slice(1)} entraram ${fmt(ent)} e saíram ${fmt(sai)} — ${res >= 0 ? `sobrou ${fmt(res)} (no azul)` : `faltou ${fmt(-res)} (no vermelho)`}.`,
      [{ label: "Recebido", valor: fmt(ent) }, { label: "Gasto", valor: fmt(sai) }, { label: "Resultado", valor: fmt(res) }],
      ["fluxo de caixa realizado"]);
  }

  // ——— COMPARAÇÃO mês a mês ———
  if (/(gast|receb|fatur).*(mais|menos|comparad|que.*(m[êe]s passad|anterior))|comparad|vs\.?\s*m[êe]s/.test(p)) {
    const tipo = /receb|fatur|vend|receita/.test(p) ? "entrada" : "saida";
    const atual = janela("mês", hoje);
    const ant = janela("mês passado", hoje);
    const soma = (w: Janela) => movs.filter((m) => m.type === tipo && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const a = soma(atual), b = soma(ant);
    const dlt = a - b; const pct = b > 0 ? Math.round((dlt / b) * 100) : 0;
    const verbo = tipo === "entrada" ? "recebeu" : "gastou";
    return R(
      `Você ${verbo} ${fmt(a)} ${atual.label} vs. ${fmt(b)} ${ant.label} — ${dlt >= 0 ? "alta" : "queda"} de ${fmt(Math.abs(dlt))}${b > 0 ? ` (${Math.abs(pct)}%)` : ""}.`,
      [{ label: cap(atual.label), valor: fmt(a) }, { label: cap(ant.label), valor: fmt(b) }, { label: "Variação", valor: `${dlt >= 0 ? "+" : "−"}${fmt(Math.abs(dlt))}` }],
      ["fluxo de caixa realizado"]);
  }

  // ——— TICKET MÉDIO ———
  if (/ticket m[ée]dio|valor m[ée]dio.*(venda|compra|recebiment)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w));
    const tot = ent.reduce((s, m) => s + Math.abs(m.amount), 0);
    const tm = ent.length ? tot / ent.length : 0;
    return R(`Seu ticket médio ${w.label} é ${fmt(tm)} (${fmt(tot)} em ${ent.length} venda(s)).`, [{ label: "Ticket médio", valor: fmt(tm) }, { label: "Vendas", valor: String(ent.length) }], ["receita realizada"]);
  }

  // ——— CONTAGEM de vendas/transações ———
  if (/quant(as|os).*(venda|transa[çc]|lan[çc]ament|movimenta|entrada|recebiment)/.test(p)) {
    const w = janela(p, hoje);
    const ent = movs.filter((m) => m.type === "entrada" && within(cashDate(m), w));
    return R(`Foram ${ent.length} entrada(s)/venda(s) ${w.label}, somando ${fmt(ent.reduce((s, m) => s + Math.abs(m.amount), 0))}.`, [{ label: "Vendas", valor: String(ent.length) }], ["lançamentos"]);
  }

  // ——— RESUMO DO DIA / briefing ———
  if (/resumo (do|de) (dia|hoje)|como (est[áa]|vai) (o )?(dia|hoje)|briefing|o que (tem|rolou|entrou) hoje|meu dia/.test(p)) {
    const w: Janela = { label: "hoje", from: hoje, to: hoje };
    const entrou = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const saiu = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const venc = movs.filter((m) => m.status === "pendente" && within(m.due_date, w));
    const vencVal = venc.reduce((s, m) => s + (m.type === "entrada" ? Math.abs(m.amount) : -Math.abs(m.amount)), 0);
    return R(
      `Hoje entraram ${fmt(entrou)} e saíram ${fmt(saiu)}${venc.length ? `; vencem ${venc.length} título(s) (líquido ${fmt(vencVal)})` : "; nada vence hoje"}. Saldo atual: ${fmt(input.saldoAtual)}.`,
      [{ label: "Entrou hoje", valor: fmt(entrou) }, { label: "Saiu hoje", valor: fmt(saiu) }, { label: "Saldo", valor: fmt(input.saldoAtual) }],
      ["resumo do dia"]);
  }

  // ——— RESUMO DO PERÍODO (mês/trimestre/semestre/ano) ———
  if (/resumo (do|de|deste|desse|do) (m[êe]s|per[íi]odo|ano|trimestre|semestre)|como (foi|est[áa]|vai) (o|meu|este|esse) (m[êe]s|ano|trimestre|semestre)|fechamento do (m[êe]s|ano|trimestre)|panorama (do|de) (m[êe]s|ano|per[íi]odo|trimestre|semestre)/.test(p)) {
    const w = janela(p, hoje);
    const entrou = movs.filter((m) => m.type === "entrada" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const saiu = movs.filter((m) => m.type === "saida" && m.status === "pago" && within(cashDate(m), w)).reduce((s, m) => s + Math.abs(m.amount), 0);
    const res = entrou - saiu;
    const aVencer = movs.filter((m) => m.status === "pendente" && within(m.due_date, w) && m.due_date.slice(0, 10) >= hoje);
    const aVencerVal = aVencer.reduce((s, m) => s + (m.type === "entrada" ? Math.abs(m.amount) : -Math.abs(m.amount)), 0);
    return R(
      `${cap(w.label)}: entraram ${fmt(entrou)} e saíram ${fmt(saiu)} — ${res >= 0 ? `sobrou ${fmt(res)}` : `faltou ${fmt(-res)}`}.${aVencer.length ? ` Ainda vencem ${aVencer.length} título(s) (líquido ${fmt(aVencerVal)}).` : ""}`,
      [{ label: "Recebido", valor: fmt(entrou) }, { label: "Gasto", valor: fmt(saiu) }, { label: "Resultado", valor: fmt(res) }],
      ["resumo do mês"]);
  }

  // ——— SALDO / quanto tenho ———
  if (/\bsaldo\b|quanto (eu )?tenho|quanto (h[áa]|tem) (no|em) caixa|dispon[íi]vel|tenho em conta|meu dinheiro/.test(p)) {
    const runway = ctx?.runwayMeses;
    return R(
      `Seu saldo consolidado é ${fmt(input.saldoAtual)}.${runway != null ? ` No ritmo atual de caixa, ele cobre cerca de ${runway} ${runway === 1 ? "mês" : "meses"} de operação.` : ""}`,
      [{ label: "Saldo atual", valor: fmt(input.saldoAtual) }, ...(runway != null ? [{ label: "Runway", valor: `${runway} m` }] : [])],
      ["saldo consolidado"]);
  }

  // ——— RUNWAY ———
  if (ctx && /runway|f[oô]lego|quanto.*(dura|aguenta).*caixa|at[ée] quando.*caixa/.test(p)) {
    return R(
      `Seu runway é de ${ctx.runwayMeses} ${ctx.runwayMeses === 1 ? "mês" : "meses"}: o saldo de ${fmt(ctx.saldoAtual)} cobre o burn de ${fmt(ctx.burnRate)}/mês por esse tempo.`,
      [{ label: "Runway", valor: `${ctx.runwayMeses} m` }, { label: "Saldo", valor: fmt(ctx.saldoAtual) }, { label: "Burn", valor: `${fmt(ctx.burnRate)}/m` }],
      ["motor quantitativo"]);
  }

  // ——— BURN ———
  if (ctx && /burn|queima de caixa|consumo de caixa|quanto.*queim/.test(p)) {
    return R(`Seu burn é de ${fmt(ctx.burnRate)}/mês (saídas líquidas). Com o saldo de ${fmt(ctx.saldoAtual)}, isso equivale a ${ctx.runwayMeses} ${ctx.runwayMeses === 1 ? "mês" : "meses"} de runway.`,
      [{ label: "Burn", valor: `${fmt(ctx.burnRate)}/m` }, { label: "Runway", valor: `${ctx.runwayMeses} m` }], ["motor quantitativo"]);
  }

  // ——— SCORE / saúde ———
  if (ctx && /score|sa[úu]de financeira|como (est[áa]|vai) (minha )?(empresa|sa[úu]de|financ)|nota da empresa/.test(p)) {
    const nivel = ctx.scoreFinanceiro >= 80 ? "excelente" : ctx.scoreFinanceiro >= 60 ? "boa" : ctx.scoreFinanceiro >= 40 ? "de atenção" : "crítica";
    return R(
      `Sua saúde financeira está ${nivel}: score ${ctx.scoreFinanceiro}/100, runway de ${ctx.runwayMeses} meses e inadimplência em ${Math.round(ctx.inadimplencia * 100)}%. Probabilidade de ruptura de caixa em 90 dias: ${Math.round(ctx.probRuptura * 100)}%.`,
      [{ label: "Score", valor: `${ctx.scoreFinanceiro}/100` }, { label: "Runway", valor: `${ctx.runwayMeses} m` }, { label: "Prob. ruptura", valor: `${Math.round(ctx.probRuptura * 100)}%` }],
      ["motor quantitativo", "motor de risco"]);
  }

  // ——— PROJEÇÃO / vou ficar negativo ———
  if (ctx && /vou ficar (no )?negativo|caixa.*negativo|ruptura|quando.*(acaba|falta).*(dinheiro|caixa)|risco de caixa/.test(p)) {
    const risco = ctx.probRuptura >= 0.5 ? "alta" : ctx.probRuptura >= 0.25 ? "moderada" : "baixa";
    return R(
      `A probabilidade de o caixa ficar negativo em 90 dias é ${risco} (${Math.round(ctx.probRuptura * 100)}%), com runway de ${ctx.runwayMeses} meses sobre ${fmt(ctx.saldoAtual)}. ${ctx.probRuptura >= 0.25 ? "Antecipar recebíveis e segurar despesas não essenciais reduz o risco." : "O caixa está sob controle no horizonte atual."}`,
      [{ label: "Prob. ruptura", valor: `${Math.round(ctx.probRuptura * 100)}%` }, { label: "Runway", valor: `${ctx.runwayMeses} m` }],
      ["motor de risco de caixa"]);
  }

  // ——— PRÓXIMO recebimento / pagamento ———
  if (/pr[óo]xim[oa].*(receb|entrada|pagament|sa[íi]da|conta|t[íi]tulo)|quando (recebo|vou receber|pago|vou pagar|cai)/.test(p)) {
    const tipo: "entrada" | "saida" = /pag|sa[íi]da|dev[oa]|contas? a pagar/.test(p) ? "saida" : "entrada";
    const prox = movs.filter((m) => m.type === tipo && m.status === "pendente" && m.due_date.slice(0, 10) >= hoje).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
    if (!prox) return R(`Não há ${tipo === "entrada" ? "recebimentos" : "pagamentos"} futuros agendados.`, [], ["agenda de vencimentos"]);
    const nome = (prox.party_id && nomes?.[prox.party_id]) || prox.category || (tipo === "entrada" ? "Recebimento" : "Pagamento");
    return R(
      `Seu próximo ${tipo === "entrada" ? "recebimento" : "pagamento"} é ${fmt(Math.abs(prox.amount))} em ${dia(prox.due_date)} — ${cap(String(nome))}.`,
      [{ label: "Valor", valor: fmt(Math.abs(prox.amount)) }, { label: "Vence", valor: dia(prox.due_date) }], ["agenda de vencimentos"]);
  }

  return null; // sem intenção concreta → sobe para Claude / motor consultivo
}

function semanaDe(hojeISO: string): { from: string; to: string } {
  const hoje = new Date(hojeISO + "T00:00:00");
  const iso = (dt: Date) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const dom = new Date(hoje); dom.setDate(hoje.getDate() - hoje.getDay());
  const sab = new Date(dom); sab.setDate(dom.getDate() + 6);
  return { from: iso(dom), to: iso(sab) };
}
