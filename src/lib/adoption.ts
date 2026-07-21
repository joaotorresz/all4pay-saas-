/**
 * all4pay — Jornada de Adesão (`adoption/1.0.0`)
 * ----------------------------------------------
 * O motor que resolve a baixa aderência: o cliente tem MUITAS funções e não
 * sabe por onde começar. Aqui a plataforma se revela em ESTÁGIOS — Conectar →
 * Organizar → Analisar → Operar — cada um com passos concretos cujo "feito" é
 * derivado do ESTADO REAL (não de um checklist manual). O usuário vê o próximo
 * passo, entende o porquê, e caminha do essencial até usar 100% do sistema.
 *
 * Puro (recebe o RiskInput + as rotas já visitadas) e demo-safe: em demo o
 * dataset é rico, então a jornada aparece quase completa — um bom preview.
 */
import type { RiskInput } from "@/core/risk-engine/types";

export const VERSAO_ADOPTION = "adoption/1.0.0";

/** localStorage: rotas que o usuário já abriu (proxy de "conheceu a tela"). */
const SEEN_KEY = "a4p_seen_routes";

export function rotasVistas(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

/** Registra que uma rota foi vista (chamado centralmente pelo AppShell). */
export function marcarRotaVista(path: string): void {
  if (typeof window === "undefined" || !path) return;
  try {
    const set = rotasVistas();
    const base = path.split("?")[0];
    if (set.has(base)) return;
    set.add(base);
    localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(set)));
  } catch {
    /* ignore */
  }
}

export interface PassoJornada {
  id: string;
  titulo: string;
  desc: string;
  feito: boolean;
  /** para onde o passo leva (a ação que o cumpre ou a tela que ele revela) */
  href: string;
  cta: string;
}

export interface EstagioJornada {
  id: string;
  titulo: string;
  subtitulo: string;
  passos: PassoJornada[];
  feitos: number;
  total: number;
  concluido: boolean;
}

export type NivelJornada = "conectar" | "organizar" | "analisar" | "operar" | "completo";

export interface Jornada {
  estagios: EstagioJornada[];
  feitos: number;
  total: number;
  pct: number; // 0..100
  /** o próximo passo não-feito — o "faça isto agora" */
  proximo: PassoJornada | null;
  /** estágio atual (o primeiro não-concluído) */
  nivel: NivelJornada;
  versao: string;
}

const CATEGORIZAVEL = (c?: string | null) => !!c && c.trim() !== "" && c.trim() !== "—";

export function montarJornada(input: RiskInput | undefined, vistas: Set<string>): Jornada {
  const movs = input?.movements ?? [];
  const temDado = movs.length > 0;
  const nContatos = input?.partyNames ? Object.keys(input.partyNames).length : 0;
  const comCategoria = movs.filter((m) => CATEGORIZAVEL(m.category)).length;
  const pctCategorizado = temDado ? comCategoria / movs.length : 0;
  const temRecebivel = movs.some((m) => m.type === "entrada" && m.status === "pendente");
  const temSaldo = (input?.saldoAtual ?? 0) !== 0;
  const viu = (r: string) => vistas.has(r);

  const estagios: EstagioJornada[] = [
    montarEstagio("conectar", "Conectar", "Traga seus dados para dentro", [
      { id: "primeiro-dado", titulo: "Traga o primeiro dado", desc: "Importe um extrato (OFX/CSV) ou lance à mão — o all4pay reconstrói recebíveis, contas, fluxo e DRE sozinho.", feito: temDado, href: "/upload", cta: "Fazer upload" },
      { id: "contatos", titulo: "Tenha clientes e fornecedores", desc: "Contatos alimentam cobrança, DRE por cliente e o score de crédito.", feito: nContatos >= 2, href: "/contatos", cta: "Ver contatos" },
      { id: "conta-saldo", titulo: "Defina o saldo das contas", desc: "Com o saldo real, o caixa e o runway ficam precisos.", feito: temSaldo, href: "/upload?aba=conectar", cta: "Conectar conta" },
    ]),
    montarEstagio("organizar", "Organizar", "Dê sentido ao que entrou", [
      { id: "categorizar", titulo: "Categorize os lançamentos", desc: "Categoria certa = DRE e benchmark certos. A IA pré-classifica; você só confirma.", feito: temDado && pctCategorizado >= 0.6, href: "/upload", cta: "Revisar categorias" },
      { id: "recorrencias", titulo: "Registre o que se repete", desc: "Assinaturas e contratos viram faturas previstas no fluxo (MRR).", feito: viu("/recorrencias"), href: "/recorrencias", cta: "Ver recorrências" },
    ]),
    montarEstagio("analisar", "Analisar", "Entenda o seu negócio", [
      { id: "dre", titulo: "Leia o seu resultado (DRE)", desc: "Quanto sobrou, por quê e onde — do faturamento ao lucro.", feito: viu("/dre"), href: "/dre", cta: "Abrir DRE" },
      { id: "fluxo", titulo: "Projete o caixa", desc: "Entradas × saídas, saldo acumulado e quando aperta.", feito: viu("/fluxo-caixa"), href: "/fluxo-caixa", cta: "Ver fluxo de caixa" },
      { id: "cobranca", titulo: "Acompanhe a inadimplência", desc: "Quem deve, quanto, e o risco de cada cliente.", feito: temRecebivel && viu("/inadimplencia"), href: "/inadimplencia", cta: "Ver inadimplência" },
      { id: "ia", titulo: "Pergunte à All4Pay IA", desc: "Um CFO digital que responde sobre os SEUS números.", feito: viu("/copiloto"), href: "/copiloto", cta: "Abrir a IA" },
    ]),
    montarEstagio("operar", "Operar", "Automatize e cresça", [
      { id: "automacoes", titulo: "Ligue uma automação", desc: "Regras que alertam e agem sozinhas (saldo crítico, cobrança).", feito: viu("/automacoes"), href: "/automacoes", cta: "Ver automações" },
      { id: "investidores", titulo: "Gere um Investor update", desc: "Relatório mensal para investidores, pronto dos seus números.", feito: viu("/investidores"), href: "/investidores", cta: "Ver Investor update" },
      { id: "orcamento", titulo: "Defina o orçamento", desc: "Meta por linha e a variância orçado × realizado.", feito: viu("/orcamento"), href: "/orcamento", cta: "Abrir orçamento" },
    ]),
  ];

  const feitos = estagios.reduce((s, e) => s + e.feitos, 0);
  const total = estagios.reduce((s, e) => s + e.total, 0);
  const pct = total > 0 ? Math.round((feitos / total) * 100) : 0;

  let proximo: PassoJornada | null = null;
  for (const e of estagios) {
    const p = e.passos.find((x) => !x.feito);
    if (p) { proximo = p; break; }
  }

  const primeiroAberto = estagios.find((e) => !e.concluido);
  const nivel: NivelJornada = primeiroAberto ? (primeiroAberto.id as NivelJornada) : "completo";

  return { estagios, feitos, total, pct, proximo, nivel, versao: VERSAO_ADOPTION };
}

function montarEstagio(
  id: string,
  titulo: string,
  subtitulo: string,
  passos: PassoJornada[],
): EstagioJornada {
  const feitos = passos.filter((p) => p.feito).length;
  return { id, titulo, subtitulo, passos, feitos, total: passos.length, concluido: feitos === passos.length };
}
