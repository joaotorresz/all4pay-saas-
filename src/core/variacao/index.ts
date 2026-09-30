/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANÁLISE DE VARIAÇÃO (flux analysis) — o que mudou no resultado, e POR QUÊ.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Inspirada no agente de variação do Campfire: o fechamento só termina quando
 * alguém consegue explicar as linhas que se mexeram. Aqui a explicação sai dos
 * PRÓPRIOS lançamentos — cada linha material traz as categorias que a moveram,
 * com os ids dos lançamentos (o drill-down), e um comentário redigido pronto
 * para ser editado e levado ao sócio, ao conselho ou ao contador.
 *
 * ⚠️ **NENHUMA SOMA NOVA.** Os números saem de `montarDRE` (a cascata canônica
 * do relatório), rodada UMA vez sobre a janela de quatro meses. Uma análise de
 * variação com consulta própria seria a sétima "duas fontes para um fato": o
 * DRE diria uma coisa e a explicação dele, outra — e quem descobre é o
 * contador, semanas depois.
 *
 * ⚠️ **MATERIALIDADE TEM DOIS PISOS, e os dois precisam valer.** Só o
 * percentual acusaria "+200%" numa tarifa que foi de R$ 3 para R$ 9; só o valor
 * acusaria R$ 1.500 de oscilação numa folha de R$ 300 mil. A linha é material
 * quando passa do valor mínimo E do percentual mínimo — ou quando não existia
 * no mês anterior (surgir do zero é sempre notícia, se tiver tamanho).
 *
 * ⚠️ **"SUBIU" NÃO É "MELHOROU".** A leitura vem do SINAL DA LINHA: despesa que
 * sobe piora o resultado; receita que sobe melhora. A mesma regra que a tela de
 * orçamento usa para pintar a diferença — pintar de verde uma despesa que
 * estourou diria que gastar mais foi bom.
 *
 * ⚠️ **SEM MÊS ANTERIOR COM DADO, NÃO HÁ VARIAÇÃO** (regra da ONDA 4). Comparar
 * contra um mês vazio transformaria todo o resultado em "+100%": o motivo
 * ocupa o lugar do número.
 *
 * Puro, tipado, demo-safe, sem relógio (o mês vem do chamador). Versão
 * variacao/1.0.0.
 */
import type { RiskInput } from "@/core/risk-engine/types";
import { montarDRE, deslocarMes, fimDoMes, rotuloColuna, type LinhaRelatorio } from "@/core/relatorios";
import { formatBRL, pctDeInteiro } from "@/lib/format";

export const VARIACAO_VERSION = "variacao/1.0.0";

export interface LimiaresVariacao {
  /** Variação mínima em reais para a linha contar. */
  valor: number;
  /** Variação mínima em pontos percentuais (10 = 10%). */
  pct: number;
}
export const LIMIARES_PADRAO: LimiaresVariacao = { valor: 1000, pct: 10 };

export type Leitura = "melhorou" | "piorou" | "neutro";

export interface Motivo {
  categoria: string;
  atual: number;
  anterior: number;
  delta: number;
  /** Os lançamentos do mês analisado que formam a categoria — o drill-down. */
  movimentos: string[];
  /** A contraparte que mais pesa na categoria no mês analisado, quando há. */
  principalContraparte: string | null;
}

export interface LinhaVariacao {
  id: string;
  label: string;
  nivel: 1 | 2 | 3;
  tipo: "soma" | "total";
  atual: number;
  anterior: number;
  /** Média dos três meses ANTES do analisado — a régua do "normal". */
  media3: number;
  delta: number;
  /** Em pontos percentuais; `null` quando o anterior é zero (não há base). */
  deltaPct: number | null;
  /** Diferença contra a média de 3 meses. */
  deltaMedia: number;
  material: boolean;
  leitura: Leitura;
  motivos: Motivo[];
  comentario: string;
}

export interface AnaliseVariacao {
  versao: typeof VARIACAO_VERSION;
  mes: string;
  mesAnterior: string;
  rotuloMes: string;
  rotuloAnterior: string;
  limiares: LimiaresVariacao;
  linhas: LinhaVariacao[];
  /** Só as materiais, das maiores para as menores em módulo. */
  materiais: LinhaVariacao[];
  /** A variação do resultado líquido — o número que resume o mês. */
  resultado: { atual: number; anterior: number; delta: number };
  /** Preenchido quando não há base de comparação; nesse caso não exibir as variações. */
  indisponivel: { codigo: "sem_base"; motivo: string } | null;
  /** O comentário do mês inteiro, pronto para editar. */
  resumo: string;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A direção boa da linha: receita e totais melhoram subindo; dedução e despesa, descendo. */
function leituraDe(sinal: LinhaRelatorio["sinal"], delta: number): Leitura {
  if (Math.abs(delta) < 0.005) return "neutro";
  const sobeEhBom = sinal !== "-";
  return (delta > 0) === sobeEhBom ? "melhorou" : "piorou";
}

function verbo(delta: number): string {
  return delta > 0 ? "alta" : "queda";
}

function contraparteDominante(input: RiskInput, ids: string[]): string | null {
  if (ids.length === 0) return null;
  const set = new Set(ids);
  const porParte = new Map<string, number>();
  for (const m of input.movements) {
    if (!set.has(m.id)) continue;
    const nome = (m.party_id && input.partyNames?.[m.party_id]) || null;
    if (!nome) continue;
    porParte.set(nome, (porParte.get(nome) ?? 0) + Math.abs(m.amount));
  }
  let melhor: string | null = null;
  let maior = 0;
  porParte.forEach((v, k) => { if (v > maior) { maior = v; melhor = k; } });
  return melhor;
}

function redigir(l: Omit<LinhaVariacao, "comentario">, rotuloAnterior: string): string {
  if (!l.material) return "";
  const pctTxt = l.deltaPct == null ? "" : ` (${l.deltaPct > 0 ? "+" : "−"}${pctDeInteiro(Math.abs(l.deltaPct))})`;
  // "Linha: alta de X" e não "Linha subiu X" — os rótulos do DRE são plurais
  // ("Despesas Operacionais"), e o verbo conjugado no singular erra a frase.
  const base = l.anterior === 0
    ? `${l.label}: ${formatBRL(Math.abs(l.atual))} neste mês, sem valor em ${rotuloAnterior}.`
    : `${l.label}: ${verbo(l.delta)} de ${formatBRL(Math.abs(l.delta))}${pctTxt} contra ${rotuloAnterior}.`;
  const efeito = l.leitura === "melhorou" ? " O efeito no resultado é positivo." : l.leitura === "piorou" ? " O efeito no resultado é negativo." : "";
  const quem = l.motivos.slice(0, 3).filter((m) => Math.abs(m.delta) >= 0.005).map((m) => {
    const sinal = m.delta > 0 ? "+" : "−";
    const parte = m.principalContraparte ? `, sobretudo ${m.principalContraparte}` : "";
    return `${m.categoria} ${sinal}${formatBRL(Math.abs(m.delta))}${parte}`;
  });
  const explica = quem.length ? ` Explicam a diferença: ${quem.join("; ")}.` : "";
  const media = Math.abs(l.media3) >= 0.005
    ? ` Contra a média dos três meses anteriores (${formatBRL(Math.abs(l.media3))}), a diferença é de ${formatBRL(Math.abs(l.deltaMedia))}.`
    : "";
  return `${base}${efeito}${explica}${media}`;
}

export function analisarVariacao(
  input: RiskInput,
  mes: string,
  limiares: LimiaresVariacao = LIMIARES_PADRAO,
  linhaPorCategoria?: Record<string, string>,
): AnaliseVariacao {
  const mesAnterior = deslocarMes(mes, -1);
  const inicio = deslocarMes(mes, -3);
  const dre = montarDRE(input, {
    intervalo: { de: `${inicio}-01`, ate: fimDoMes(mes) },
    tipo: "horizontal",
    linhaPorCategoria,
  });
  const k = dre.colunas.indexOf(mes);
  const kAnt = dre.colunas.indexOf(mesAnterior);
  const kMedia = [k - 3, k - 2, k - 1].filter((i) => i >= 0);

  const semBase = kAnt < 0 || dre.colunasSemDado.includes(mesAnterior);
  const rotuloMes = rotuloColuna(mes);
  const rotuloAnterior = rotuloColuna(mesAnterior);

  const linhas: LinhaVariacao[] = dre.linhas.map((l) => {
    const atual = r2(l.celulas[k]?.valor ?? 0);
    const anterior = r2(l.celulas[kAnt]?.valor ?? 0);
    const media3 = kMedia.length ? r2(kMedia.reduce((s, i) => s + (l.celulas[i]?.valor ?? 0), 0) / kMedia.length) : 0;
    const delta = r2(atual - anterior);
    const deltaPct = Math.abs(anterior) < 0.005 ? null : r2((delta / Math.abs(anterior)) * 100);
    const surgiu = Math.abs(anterior) < 0.005 && Math.abs(atual) >= limiares.valor;
    const material = !semBase && Math.abs(delta) >= limiares.valor
      && (surgiu || (deltaPct != null && Math.abs(deltaPct) >= limiares.pct));

    const motivos: Motivo[] = l.filhos
      .map((f) => {
        const a = r2(f.celulas[k]?.valor ?? 0);
        const b = r2(f.celulas[kAnt]?.valor ?? 0);
        const movs = f.celulas[k]?.movimentos ?? [];
        return {
          categoria: f.label, atual: a, anterior: b, delta: r2(a - b), movimentos: movs,
          principalContraparte: contraparteDominante(input, movs),
        };
      })
      .filter((m) => Math.abs(m.delta) >= 0.005)
      .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

    const base: Omit<LinhaVariacao, "comentario"> = {
      id: l.id, label: l.label, nivel: l.nivel, tipo: l.tipo, atual, anterior, media3, delta, deltaPct,
      deltaMedia: r2(atual - media3), material, leitura: leituraDe(l.sinal, delta), motivos,
    };
    return { ...base, comentario: redigir(base, rotuloAnterior) };
  });

  const materiais = linhas.filter((l) => l.material).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const res = linhas.find((l) => l.id === "resultado_liquido") ?? linhas[linhas.length - 1];
  const resultado = { atual: res?.atual ?? 0, anterior: res?.anterior ?? 0, delta: res?.delta ?? 0 };

  const indisponivel = semBase
    ? { codigo: "sem_base" as const, motivo: `Não há lançamentos em ${rotuloAnterior} para comparar. A variação passa a existir quando o mês anterior tiver movimento.` }
    : null;

  const resumo = semBase
    ? indisponivel!.motivo
    : [
        `O resultado de ${rotuloMes} foi de ${formatBRL(resultado.atual)}, contra ${formatBRL(resultado.anterior)} em ${rotuloAnterior} — ${resultado.delta >= 0 ? "melhora" : "piora"} de ${formatBRL(Math.abs(resultado.delta))}.`,
        materiais.length === 0
          ? `Nenhuma linha passou dos limites de materialidade (${formatBRL(limiares.valor)} e ${pctDeInteiro(limiares.pct, 0)}).`
          : `As variações relevantes foram:`,
        ...materiais.filter((l) => l.tipo === "soma").slice(0, 5).map((l) => `• ${l.comentario}`),
      ].join("\n");

  return {
    versao: VARIACAO_VERSION, mes, mesAnterior, rotuloMes, rotuloAnterior, limiares,
    linhas, materiais, resultado, indisponivel, resumo,
  };
}
