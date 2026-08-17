/**
 * Pipeline FDIP: ingestão (OFX/CSV/extrato) → entendimento → classificação
 * inteligente (destino + categoria + confiança) → resolução de entidades →
 * descoberta de padrões → plano de setup → central de confiança.
 */
import { limparContraparte, fingerprint } from "@/core/financial-os/gateway";
import { melhorNome } from "@/core/ingestao/contraparte";
import { memoriaDe } from "./learning";
import type {
  FinancialRecord,
  Classificacao,
  Destino,
  Entidade,
  Padroes,
  Recorrencia,
  GraphResumo,
  SetupPlan,
  ConfidenceCenter,
} from "./types";
import { uid } from "./types";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");

/** Normaliza o nome da contraparte: remove prefixos de transação, sufixos
 * societários e conectores — base da resolução de entidades. */
const PREFIXOS = /\b(pix|ted|doc|boleto|pagamento|pgto|recebido|recebimento|receb|cartao|compra|debito|credito|transferencia|transf|stone|cielo|rede|getnet|deposito|saque|de)\b/gi;
const SUFIXOS = /\b(ltda|me|epp|s\/?a|eireli|comercio|comercial|industria|incorporadora)\b/gi;
const CONECTORES = /\b(e|da|do|dos|das)\b/gi;
function normalizarNome(raw: string): string {
  let s = raw.toUpperCase().normalize("NFD").replace(new RegExp("[\\u0300-\\u036f]", "g"), "");
  s = s.replace(/[^A-Z0-9 ]/g, " ");
  s = s.replace(PREFIXOS, " ").replace(SUFIXOS, " ").replace(CONECTORES, " ");
  return s.replace(/\s+/g, " ").trim();
}

/* ============ Ingestão ============ */
export interface ParseResult {
  records: FinancialRecord[];
  totalLinhas: number;
  ignoradas: number;
  /**
   * ⚠️ O saldo que o BANCO declara no arquivo (`<LEDGERBAL>` do OFX): o
   * fechamento em `<DTASOF>`. É um campo de saldo dedicado, escrito pelo banco —
   * a autoridade do arquivo, e a fonte "importada" da abertura conferida. NUNCA
   * é o valor de uma linha de transação. Ausente quando o arquivo não o declara
   * (todo CSV, e OFX sem o bloco).
   */
  saldoDeclarado?: { valor: number; data: string };
}

function parseData(s: string): string | null {
  s = s.trim();
  let m: RegExpExecArray | null;
  if ((m = /(\d{4})-(\d{2})-(\d{2})/.exec(s))) return `${m[1]}-${m[2]}-${m[3]}`;
  // dia/mês podem vir com 1 dígito ("1/3/2024") — pad p/ não descartar a linha.
  if ((m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/.exec(s))) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if ((m = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})\b/.exec(s))) return `20${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  return null;
}

function parseValor(s: string): { valor: number; sign: number } | null {
  let raw = s.replace(/r\$|\s/gi, "");
  let sign = 1;
  if (/^-/.test(raw) || /d$/i.test(raw)) sign = -1;
  raw = raw.replace(/[cd]$/i, "").replace(/-/g, "");
  // pt-BR: vírgula = decimal, ponto = milhar. Sem vírgula, o ponto SÓ é decimal
  // se for um único ponto com ≤2 dígitos finais (OFX "2500.00"); senão é milhar
  // ("2.500" = 2500, "1.234.567" = 1234567) — antes virava 2.5 (erro de 1000×).
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
  else if ((raw.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(raw)) raw = raw.replace(/\./g, "");
  const v = parseFloat(raw);
  if (Number.isNaN(v)) return null;
  return { valor: Math.abs(v), sign };
}

function mkRecord(data: string, valorSigned: { valor: number; sign: number }, desc: string, doc?: string): FinancialRecord {
  const contraparte = normalizarNome(desc) || (limparContraparte(desc) || desc.trim());
  return {
    id: uid("rec"),
    data,
    valor: valorSigned.valor,
    tipo: valorSigned.sign < 0 ? "saida" : "entrada",
    descricao: desc.trim(),
    contraparte,
    contraparteNorm: norm(contraparte),
    documento: doc,
    fingerprint: fingerprint([valorSigned.valor, data, contraparte, doc]),
  };
}

function parseOFX(text: string): ParseResult {
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  const field = (b: string, re: RegExp) => {
    const m = re.exec(b);
    return m ? m[1].trim() : "";
  };
  const records: FinancialRecord[] = [];
  let ign = 0;
  for (const b of blocks) {
    const amt = parseValor(field(b, /<TRNAMT>([^<\r\n]+)/i));
    const data = parseData(field(b, /<DTPOSTED>([^<\r\n]+)/i));
    const memo = field(b, /<MEMO>([^<\r\n]+)/i) || field(b, /<NAME>([^<\r\n]+)/i);
    const doc = field(b, /<CHECKNUM>([^<\r\n]+)/i) || field(b, /<FITID>([^<\r\n]+)/i);
    if (!amt || !data) {
      ign++;
      continue;
    }
    records.push(mkRecord(data, amt, memo || "Lançamento", doc || undefined));
  }

  // ⚠️ O saldo DECLARADO pelo banco: `<LEDGERBAL><BALAMT><DTASOF>`. Lido de FORA
  // da lista de transações — é um campo próprio do OFX, não uma linha de
  // movimento. É a fonte "importada" da abertura conferida. `BALAMT` pode ser
  // negativo (cheque especial), então preserva o sinal, ao contrário do
  // `parseValor` das transações, que devolve magnitude.
  let saldoDeclarado: ParseResult["saldoDeclarado"];
  const balBlock = /<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i.exec(text)?.[1] ?? text;
  const balRaw = /<BALAMT>([^<\r\n]+)/i.exec(balBlock)?.[1];
  const balData = parseData(/<DTASOF>([^<\r\n]+)/i.exec(balBlock)?.[1] ?? "");
  if (balRaw != null && balData) {
    const p = parseValor(balRaw);
    if (p) saldoDeclarado = { valor: p.valor * p.sign, data: balData };
  }

  return { records, totalLinhas: blocks.length, ignoradas: ign, saldoDeclarado };
}

function parseCSV(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { records: [], totalLinhas: 0, ignoradas: 0 };
  const delim = [";", "\t", ","].sort((a, b) => (lines[0].split(b).length - 1) - (lines[0].split(a).length - 1))[0];
  const split = (l: string) => l.split(delim).map((c) => c.trim().replace(/^"|"$/g, ""));

  const head = split(lines[0]).map((h) => norm(h));
  const hasHeader = head.some((h) => /data|valor|descri|hist|lancamento|memo/.test(h));
  let di = 0, vi = 1, si = 2, doci = -1;
  let start = 0;
  if (hasHeader) {
    start = 1;
    const find = (re: RegExp) => head.findIndex((h) => re.test(h));
    di = find(/data|dt/);
    vi = find(/valor|amount|montante/);
    si = find(/descri|hist|memo|lancamento|contrapart|favorec/);
    doci = find(/doc|nf|boleto|autentic/);
    if (di < 0) di = 0;
    if (vi < 0) vi = 1;
    if (si < 0) si = head.length - 1;
  } else {
    // posicional: descobre a coluna de data e a de valor
    const cols = split(lines[0]);
    di = cols.findIndex((c) => parseData(c));
    // exclui colunas com cara de data: parseValor("16/01/2024") = 16 (parseFloat
    // para no "/"), então sem isto a coluna de valor casaria numa 2ª data.
    vi = cols.findIndex((c, i) => i !== di && !parseData(c) && parseValor(c));
    if (di < 0) di = 0;
    if (vi < 0) vi = cols.length - 1;
    si = cols.findIndex((_, i) => i !== di && i !== vi);
    if (si < 0) si = Math.min(1, cols.length - 1);
  }

  const records: FinancialRecord[] = [];
  let ign = 0;
  for (let i = start; i < lines.length; i++) {
    const cols = split(lines[i]);
    const data = parseData(cols[di] ?? "");
    const valor = parseValor(cols[vi] ?? "");
    const desc = (cols[si] ?? "").trim();
    if (!data || !valor || !desc) {
      ign++;
      continue;
    }
    records.push(mkRecord(data, valor, desc, doci >= 0 ? cols[doci] : undefined));
  }
  return { records, totalLinhas: lines.length - start, ignoradas: ign };
}

export function parseTexto(text: string): ParseResult {
  if (/<STMTTRN>/i.test(text) || /<OFX>/i.test(text)) return parseOFX(text);
  return parseCSV(text);
}

/* ============ Classificação inteligente ============ */
interface Cat {
  id: string;
  re: RegExp;
  destino?: Destino;
  assinatura?: boolean;
}
const CATS: Cat[] = [
  { id: "Marketing", re: /google ads|meta ads|facebook ads|instagram ads|\bads\b|marketing|midia|impulsionamento/ },
  { id: "Assinaturas / software", re: /netflix|spotify|amazon web|\baws\b|adobe|openai|chatgpt|google (cloud|workspace)|gworkspace|microsoft|office ?365|github|figma|slack|notion|dropbox|hubspot|salesforce|vercel|cloudflare|canva|zoom/, assinatura: true },
  { id: "Combustível", re: /posto|shell|ipiranga|petrobras|br distribu|texaco|ale combust|combustivel/ },
  { id: "Folha de pagamento", re: /folha|salario|pro.?labore|rescis|ferias|decimo terceiro|13.? salario|vale (transporte|refeic|aliment)|pessoal/ },
  { id: "Aluguel", re: /aluguel|locacao|condominio|imobiliaria/ },
  { id: "Utilidades", re: /energia|enel|cemig|copel|light|cpfl|sabesp|comgas|\bagua\b|internet|vivo|claro|\btim\b|telefon|net ?claro/ },
  { id: "Impostos", re: /\bdas\b|\bdarf\b|\bgps\b|\binss\b|\bfgts\b|\biss\b|icms|\bpis\b|cofins|irpj|csll|simples nacional|imposto|tribut/, destino: "Imposto" },
  { id: "Tarifas bancárias", re: /tarifa|\biof\b|juros|cesta de|manutencao de conta|pacote de servic|taxa banc/, destino: "Tarifa bancária" },
  { id: "Fornecedores / insumos", re: /fornecedor|atacad|distribuidora|insumo|materia.?prima|comercio|industria|compra/ },
];
export const TRANSFER_RE = /transfer|ted entre|entre contas|resgate|aplicac|movimentacao interna|p2p interno/;

export function classificarRecord(r: FinancialRecord): Classificacao {
  const txt = norm(`${r.descricao} ${r.contraparte}`);

  if (TRANSFER_RE.test(txt)) {
    return { recordId: r.id, destino: "Transferência", categoria: "Transferência", contraparteTipo: "interno", confianca: 0.9, motivo: "padrão de transferência", aprendido: false };
  }

  // memória (self-learning)
  const aprendida = memoriaDe(r.contraparteNorm);
  if (aprendida) {
    const destino = destinoPara(r.tipo, aprendida);
    return { recordId: r.id, destino, categoria: aprendida, contraparteTipo: r.tipo === "entrada" ? "cliente" : "fornecedor", confianca: 0.99, motivo: "confirmado anteriormente", aprendido: true };
  }

  const hit = CATS.find((c) => c.re.test(txt));
  if (hit) {
    const categoria = hit.id;
    const destino = hit.destino ?? destinoPara(r.tipo, categoria);
    return { recordId: r.id, destino, categoria, contraparteTipo: r.tipo === "entrada" ? "cliente" : "fornecedor", confianca: hit.assinatura ? 0.96 : 0.92, motivo: `correspondência: ${categoria.toLowerCase()}`, aprendido: false };
  }

  // genérico
  const categoria = r.tipo === "entrada" ? "Vendas" : "Outras despesas";
  const conf = r.contraparteNorm ? 0.7 : 0.55;
  return { recordId: r.id, destino: r.tipo === "entrada" ? "Receita" : "Despesa", categoria, contraparteTipo: r.tipo === "entrada" ? "cliente" : "fornecedor", confianca: conf, motivo: "inferência por tipo", aprendido: false };
}

function destinoPara(tipo: FinancialRecord["tipo"], categoria: string): Destino {
  if (tipo === "transferencia") return "Transferência";
  if (tipo === "entrada") return "Receita";
  if (/imposto/i.test(categoria)) return "Imposto";
  if (/tarifa/i.test(categoria)) return "Tarifa bancária";
  return "Despesa";
}

/* ============ Resolução de entidades ============ */
export function resolverEntidades(records: FinancialRecord[]): Entidade[] {
  const map = new Map<string, { aliases: Set<string>; total: number; entradas: number; saidas: number; n: number }>();
  for (const r of records) {
    if (!r.contraparteNorm) continue;
    if (TRANSFER_RE.test(norm(`${r.descricao} ${r.contraparte}`))) continue; // transferência não é cliente/fornecedor
    const cur = map.get(r.contraparteNorm) ?? { aliases: new Set(), total: 0, entradas: 0, saidas: 0, n: 0 };
    cur.aliases.add(r.contraparte);
    cur.total += r.valor;
    cur.n += 1;
    if (r.tipo === "entrada") cur.entradas += 1;
    else if (r.tipo === "saida") cur.saidas += 1;
    map.set(r.contraparteNorm, cur);
  }
  return Array.from(map.entries())
    .map(([k, v]) => {
      // ⚠️ O nome NÃO é mais "o alias mais longo". O mais longo é justamente o
      // que traz o CNPJ grudado na razão social — foi assim que a lista de
      // clientes nasceu com documento colado, parênteses invertidos e um nome
      // que era só um CPF. `melhorNome` separa documento de razão social e
      // recusa o que não é nome de ninguém.
      const saneado = melhorNome(Array.from(v.aliases));
      return {
        id: k,
        nome: saneado.nome || Array.from(v.aliases)[0] || k,
        documento: saneado.documento,
        /** `false` quando o texto é descrição de cobrança ou um número solto. */
        ehPessoa: saneado.ehPessoa,
        motivoNaoPessoa: saneado.motivo,
        aliases: Array.from(v.aliases),
        tipo: v.entradas >= v.saidas ? ("cliente" as const) : ("fornecedor" as const),
        total: v.total,
        transacoes: v.n,
        recorrente: v.n >= 3,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/* ============ Descoberta de padrões ============ */
export function descobrirPadroes(records: FinancialRecord[], cls: Map<string, Classificacao>, entidades: Entidade[]): Padroes {
  const recsPorEntidade = new Map<string, FinancialRecord[]>();
  for (const r of records) {
    if (!r.contraparteNorm) continue;
    (recsPorEntidade.get(r.contraparteNorm) ?? recsPorEntidade.set(r.contraparteNorm, []).get(r.contraparteNorm)!).push(r);
  }
  const recorrencias: Recorrencia[] = [];
  for (const e of entidades) {
    if (e.transacoes < 3) continue;
    const recs = recsPorEntidade.get(e.id) ?? [];
    const meses = new Set(recs.map((r) => r.data.slice(0, 7)));
    const periodicidade: Recorrencia["periodicidade"] = meses.size >= 3 && Math.abs(meses.size - e.transacoes) <= 2 ? "mensal" : e.transacoes > meses.size * 3 ? "semanal" : "irregular";
    const categoria = cls.get(recs[0].id)?.categoria ?? "—";
    const assinatura = recs.some((r) => cls.get(r.id)?.categoria === "Assinaturas / software");
    // a maioria dos lançamentos define o lado (custo × receita recorrente)
    const saidas = recs.filter((r) => r.tipo === "saida").length;
    const tipo: Recorrencia["tipo"] = saidas * 2 >= recs.length ? "saida" : "entrada";
    const mediaMensal = meses.size > 0 ? e.total / meses.size : 0;
    recorrencias.push({ contraparte: e.nome, categoria, periodicidade, valorMedio: e.total / e.transacoes, ocorrencias: e.transacoes, assinatura, tipo, mediaMensal });
  }
  recorrencias.sort((a, b) => b.ocorrencias - a.ocorrencias);

  // Custos recorrentes/mensais — o "boleto fixo" que a empresa paga todo mês
  const custosMensais = recorrencias
    .filter((r) => r.tipo === "saida" && r.periodicidade !== "irregular")
    .sort((a, b) => b.mediaMensal - a.mediaMensal);
  const custoRecorrenteMensal = custosMensais.reduce((s, r) => s + r.mediaMensal, 0);

  // Sazonalidade da receita
  const porMes = new Map<string, number>();
  for (const r of records) if (r.tipo === "entrada") porMes.set(r.data.slice(0, 7), (porMes.get(r.data.slice(0, 7)) ?? 0) + r.valor);
  const vals = Array.from(porMes.values());
  const media = vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0;
  const sazonalidade = Array.from(porMes.entries())
    .sort()
    .map(([m, v]) => ({ label: m.slice(5), indice: media ? Math.round((v / media) * 100) / 100 : 0 }));

  return {
    recorrencias,
    assinaturas: recorrencias.filter((r) => r.assinatura),
    custosMensais,
    custoRecorrenteMensal,
    clientesRecorrentes: entidades.filter((e) => e.recorrente && e.tipo === "cliente").length,
    fornecedoresRecorrentes: entidades.filter((e) => e.recorrente && e.tipo === "fornecedor").length,
    sazonalidade,
  };
}

/* ============ Grafo ============ */
export function montarGrafo(entidades: Entidade[]): GraphResumo {
  const clientes = entidades.filter((e) => e.tipo === "cliente");
  const fornecedores = entidades.filter((e) => e.tipo === "fornecedor");
  const totalCli = clientes.reduce((s, e) => s + e.total, 0);
  const top = clientes[0];
  return {
    clientes: clientes.length,
    fornecedores: fornecedores.length,
    fluxoTotal: entidades.reduce((s, e) => s + e.total, 0),
    topCliente: top ? { nome: top.nome, share: totalCli > 0 ? top.total / totalCli : 0 } : null,
  };
}

const CENTRO: Record<string, string> = {
  Vendas: "Comercial", Marketing: "Comercial",
  "Fornecedores / insumos": "Operações", Combustível: "Operações",
  "Folha de pagamento": "Administrativo", Aluguel: "Administrativo", Utilidades: "Administrativo",
  Impostos: "Financeiro", "Tarifas bancárias": "Financeiro", "Assinaturas / software": "Administrativo",
  "Outras despesas": "Administrativo",
};

/* ============ Plano de setup ============ */
export function montarPlano(records: FinancialRecord[], cls: Classificacao[], entidades: Entidade[], padroes: Padroes, meses: number): SetupPlan {
  const receitas = records.filter((r) => r.tipo === "entrada");
  const despesas = records.filter((r) => r.tipo === "saida");
  const totalRec = receitas.reduce((s, r) => s + r.valor, 0);
  const totalDesp = despesas.reduce((s, r) => s + r.valor, 0);
  const m = Math.max(1, meses);

  /*
   * ⚠️ Isto é ENTRADA e SAÍDA do extrato dividido por meses observados — não
   * receita e despesa no sentido do DRE. Ver o comentário em `SetupPlan.estimativas`.
   */
  const entradaMensalEstimada = totalRec / m;
  const saidaMensalEstimada = totalDesp / m;
  const resultadoMensalEstimado = entradaMensalEstimada - saidaMensalEstimada;
  const margemEstimada = entradaMensalEstimada > 0 ? resultadoMensalEstimado / entradaMensalEstimada : 0;

  const categorias = Array.from(new Set(cls.map((c) => c.categoria))).filter((c) => c !== "Transferência");
  const centrosCusto = Array.from(new Set(categorias.map((c) => CENTRO[c] ?? "Administrativo")));

  // Receita recorrente: clientes recorrentes.
  const clientesRec = entidades.filter((e) => e.tipo === "cliente" && e.recorrente);
  const recRecorrente = clientesRec.reduce((s, e) => s + e.total, 0);
  const receitaRecorrentePct = totalRec > 0 ? recRecorrente / totalRec : 0;

  const oportunidades: string[] = [];
  const assMensal = padroes.assinaturas.reduce((s, a) => s + a.valorMedio, 0);
  if (assMensal > 0) oportunidades.push(`${padroes.assinaturas.length} assinaturas somam ~${fmt(assMensal)}/mês — revisar redundâncias.`);
  if (margemEstimada > 0.15) oportunidades.push(`Sobra estimada da importação em ${Math.round(margemEstimada * 100)}% das entradas — espaço para reinvestir. Não é margem EBITDA: o DRE só existe depois de classificar.`);
  if (receitaRecorrentePct > 0.4) oportunidades.push(`${Math.round(receitaRecorrentePct * 100)}% da receita é recorrente — base previsível.`);

  const riscos: string[] = [];
  const top = entidades.find((e) => e.tipo === "cliente");
  if (top && totalRec > 0 && top.total / totalRec > 0.3) riscos.push(`Concentração: ${top.nome} ~ ${Math.round((top.total / totalRec) * 100)}% da receita.`);
  if (resultadoMensalEstimado < 0) riscos.push(`Queima estimada de ${fmt(-resultadoMensalEstimado)}/mês (estimativa da importação).`);
  const combust = cls.filter((c) => c.categoria === "Combustível").length;
  if (combust > 0 && saidaMensalEstimada > 0) riscos.push("Despesa de combustível relevante — monitorar variação de preço.");

  return {
    clientes: entidades.filter((e) => e.tipo === "cliente").length,
    fornecedores: entidades.filter((e) => e.tipo === "fornecedor").length,
    produtos: 0,
    servicos: 0,
    categorias,
    centrosCusto,
    recorrencias: padroes.recorrencias.length,
    estimativas: { entradaMensalEstimada, saidaMensalEstimada, resultadoMensalEstimado, margemEstimada, burnMensal: Math.max(0, -resultadoMensalEstimado), receitaRecorrentePct },
    oportunidades,
    riscos,
  };
}

/* ============ Central de confiança ============ */
export function centralConfianca(parse: ParseResult, cls: Classificacao[], records: FinancialRecord[]): ConfidenceCenter {
  const alta = cls.filter((c) => c.confianca >= 0.9).length;
  const media = cls.filter((c) => c.confianca >= 0.7 && c.confianca < 0.9).length;
  const baixa = cls.filter((c) => c.confianca < 0.7).length;
  const ambiguas = cls.filter((c) => c.confianca < 0.7).length;
  const semContraparte = records.filter((r) => !r.contraparteNorm).length;
  const pendencias = [
    { tipo: "Categoria ambígua", count: ambiguas },
    { tipo: "Contraparte desconhecida", count: semContraparte },
    { tipo: "Documento incompleto", count: parse.ignoradas },
  ].filter((p) => p.count > 0);
  return { total: parse.totalLinhas, lidos: records.length, alta, media, baixa, pendencias };
}

function fmt(v: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
}
