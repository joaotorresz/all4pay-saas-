/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O DISPARO DOS FLUXOS — o que sai agora (automacoes-disparo/1.0.0)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O executor roda a cada 15 minutos. Para cada empresa, este núcleo decide
 * QUAIS fluxos vencem agora, o QUE cada um escreve e PARA QUEM, com a chave de
 * deduplicação de cada envio. Quem envia é o `despachar` das seis automações
 * fixas — a mesma trava (grava antes, o índice único recusa o segundo).
 *
 * ⚠️ Puro: o instante, os fluxos e os dados entram prontos. A prévia da tela e
 * o envio de verdade escrevem com `mensagemDoFluxo`, a mesma função.
 *
 * ⚠️ O que vem do banco é DADO DE FORA: o fluxo foi gravado por um navegador.
 * `fluxosDoServidor` descarta o que não tem a forma de um fluxo antes de
 * qualquer outra regra olhar para ele, e `validarFluxo` decide o resto — um
 * fluxo com problema não roda, mesmo marcado como ligado.
 *
 * ⚠️ Fluxo gravado por quem não administra a empresa NÃO roda: sem isso, quem
 * só lança mandaria os números da empresa para qualquer telefone, todo dia.
 */
import {
  disparoDevido, validarFluxo, mensagemDoFluxo, ehMensagem, enviosDe, fonteDe,
  type Fluxo, type NoFluxo, type DadosDoFluxo, type DiaSemana, type FonteFluxo, type VendaMaquininha,
} from "./fluxo";
import { formaDaTransacao, type StatusPinbank } from "@/core/pinbank/evento";
import { hashCurto, mascarar, destinoCanonico } from "./index";
import { montarHtml, type SecaoEmail } from "./email";
import type { CanalEnvio, MensagemAutomacao } from "./tipos";

export const DISPARO_VERSION = "automacoes-disparo/1.0.0";

/* ========================================================================== */
/* A forma — o que veio do banco                                               */
/* ========================================================================== */

const ehObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown) => (typeof x === "string" ? x : null);

function noDoServidor(x: unknown): NoFluxo | null {
  if (!ehObj(x)) return null;
  const id = str(x.id);
  if (!id) return null;
  if (x.tipo === "gatilho" && ehObj(x.gatilho)) {
    const dias = Array.isArray(x.gatilho.dias) ? x.gatilho.dias.filter((d): d is DiaSemana => typeof d === "number") : [];
    return { id, tipo: "gatilho", gatilho: { tipo: "agenda", dias, hora: str(x.gatilho.hora) ?? "" } };
  }
  if (x.tipo === "dados" && typeof x.fonte === "string") return { id, tipo: "dados", fonte: x.fonte as FonteFluxo };
  if (x.tipo === "envio" && (x.canal === "whatsapp" || x.canal === "email")) {
    const destinos = (Array.isArray(x.destinos) ? x.destinos : [])
      .filter(ehObj)
      .map((d) => ({ endereco: str(d.endereco) ?? "", nome: str(d.nome), userId: str(d.userId) ?? undefined }));
    return { id, tipo: "envio", canal: x.canal, destinos };
  }
  return null;
}

/**
 * Os fluxos com FORMA de fluxo. ⚠️ Um nó que não se reconhece invalida o
 * fluxo inteiro (vira um fluxo sem aquele nó, e `validarFluxo` o reprova):
 * descartar o nó em silêncio poderia transformar um fluxo quebrado num que
 * roda com menos do que a pessoa montou.
 */
export function fluxosDoServidor(bruto: unknown): Fluxo[] {
  if (!Array.isArray(bruto)) return [];
  const out: Fluxo[] = [];
  for (const x of bruto) {
    if (!ehObj(x)) continue;
    const id = str(x.id);
    if (!id || !Array.isArray(x.nos)) continue;
    const nos = x.nos.map(noDoServidor);
    if (nos.some((n) => n === null)) continue;
    const ligacoes = (Array.isArray(x.ligacoes) ? x.ligacoes : [])
      .filter(ehObj)
      .map((l) => ({ de: str(l.de) ?? "", para: str(l.para) ?? "" }));
    out.push({ id, nome: str(x.nome) ?? "", ativo: x.ativo === true, nos: nos as NoFluxo[], ligacoes });
  }
  return out;
}

/* ========================================================================== */
/* O que vence agora                                                           */
/* ========================================================================== */

export interface FluxoDevido {
  fluxo: Fluxo;
  chave: string;
  dia: string;
}

/** Os fluxos LIGADOS, sem problema, cujo horário chegou (dentro da tolerância). */
export function devidosAgora(fluxos: Fluxo[], agora: Date): FluxoDevido[] {
  const out: FluxoDevido[] = [];
  for (const f of fluxos) {
    if (!f.ativo || validarFluxo(f).length > 0) continue;
    const d = disparoDevido(f, agora);
    if (d) out.push({ fluxo: f, chave: d.chave, dia: d.dia });
  }
  return out;
}

/** As fontes que os fluxos devidos precisam — o executor só lê o que vai usar. */
export function fontesNecessarias(devidos: FluxoDevido[]): Set<FonteFluxo> {
  return new Set(devidos.map((d) => fonteDe(d.fluxo)).filter((f): f is FonteFluxo => !!f));
}

/* ========================================================================== */
/* As mensagens                                                                */
/* ========================================================================== */

export interface ResultadoDisparo {
  fluxoId: string;
  nome: string;
  mensagens: MensagemAutomacao[];
  /** Por que nada saiu (sem dados, nada a avisar, não autorizado). */
  semEnvio?: { codigo: string; motivo: string };
}

export { destinoCanonico };

/**
 * O texto do WhatsApp em seções de e-mail: cada bloco (separado por linha em
 * branco) vira uma seção; "  • Nome: R$X" vira linha com o valor à direita.
 * O primeiro bloco é o título, que o e-mail já tem.
 */
export function secoesDoTexto(texto: string): SecaoEmail[] {
  const limpo = (s: string) => s.replace(/\*/g, "").trim();
  return texto.split(/\n\s*\n/).slice(1).map((bloco) => {
    const [cab, ...resto] = bloco.split("\n").filter((l) => l.trim());
    const linhas = resto.map((l) => {
      const t = limpo(l).replace(/^•\s*/, "");
      const i = t.lastIndexOf(": ");
      return i > 0 ? { rotulo: t.slice(0, i), valor: t.slice(i + 2) } : { rotulo: t, valor: "" };
    });
    return { titulo: limpo(cab ?? ""), linhas };
  }).filter((s) => s.titulo || s.linhas.length);
}

export function mensagensDoFluxo(d: FluxoDevido, dados: DadosDoFluxo, appUrl?: string): ResultadoDisparo {
  const base = { fluxoId: d.fluxo.id, nome: d.fluxo.nome };
  const r = mensagemDoFluxo(d.fluxo, dados, d.dia);
  if (!ehMensagem(r)) return { ...base, mensagens: [], semEnvio: r };

  const html = montarHtml({
    preheader: r.resumoCurto,
    titulo: r.titulo,
    abertura: r.resumoCurto,
    secoes: secoesDoTexto(r.texto),
    link: appUrl ? { rotulo: "Abrir o Quattro", url: `${appUrl}/automacoes` } : undefined,
    rodape: `Você recebe esta mensagem pelo fluxo "${d.fluxo.nome}". Para parar, desligue o fluxo em Automações.`,
  });

  const mensagens: MensagemAutomacao[] = [];
  const vistos = new Set<string>();
  for (const e of enviosDe(d.fluxo)) {
    for (const dest of e.destinos) {
      const canal: CanalEnvio = e.canal;
      const normal = destinoCanonico(canal, dest.endereco);
      // O mesmo destino em dois cards de envio recebe uma vez só.
      const k = `${canal}:${normal}`;
      if (!normal || vistos.has(k)) continue;
      vistos.add(k);
      mensagens.push({
        tipo: "fluxo",
        canal,
        destino: dest.endereco.trim(),
        destinoMascarado: mascarar(canal, dest.endereco),
        chave: `${d.chave}:${hashCurto(normal)}`,
        assunto: r.titulo,
        texto: r.texto,
        html,
        finalidade: "fluxo_agendado",
        variaveis: { "1": r.titulo, "2": r.resumoCurto },
      });
    }
  }
  return { ...base, mensagens };
}

/**
 * Tudo o que uma empresa dispara agora. ⚠️ Gravado por quem não administra:
 * nenhum fluxo roda, e cada um diz por quê.
 */
export function disparosDaEmpresa(
  devidos: FluxoDevido[], dados: DadosDoFluxo, opts: { salvoPorAdministra: boolean; appUrl?: string },
): ResultadoDisparo[] {
  if (!opts.salvoPorAdministra) {
    return devidos.map((d) => ({
      fluxoId: d.fluxo.id, nome: d.fluxo.nome, mensagens: [],
      semEnvio: {
        codigo: "nao_autorizado",
        motivo: "Os fluxos foram salvos por quem não administra a empresa: um titular ou administrador precisa revisar e salvar de novo.",
      },
    }));
  }
  return devidos.map((d) => mensagensDoFluxo(d, dados, opts.appUrl));
}

/* ========================================================================== */
/* As vendas da maquininha, como a RPC as devolve                              */
/* ========================================================================== */

export interface VendasBrutas {
  temMaquininha?: unknown;
  vendas?: unknown;
}

const STATUS_VALIDOS: StatusPinbank[] = ["Pendente", "Aprovada", "Negada", "Cancelada", "Desfeita", "Reembolsada"];
const num = (x: unknown) => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** `automacao_vendas_maquininha` → o que `mensagemMaquininhaDia` lê. */
export function vendasDaRpc(bruto: VendasBrutas | null | undefined): { temMaquininha: boolean; vendas: VendaMaquininha[] } {
  const lista = Array.isArray(bruto?.vendas) ? bruto!.vendas : [];
  const vendas: VendaMaquininha[] = [];
  for (const v of lista) {
    if (!ehObj(v)) continue;
    const status = STATUS_VALIDOS.find((s) => s === v.status);
    const valor = num(v.valor);
    const ocorridoEm = str(v.ocorridoEm);
    if (!status || valor === null || !ocorridoEm) continue;
    const parcelas = Math.max(1, Math.floor(num(v.numeroParcelas) ?? 1));
    vendas.push({
      nsu: typeof v.nsu === "number" || typeof v.nsu === "string" ? v.nsu : "",
      status, valor, ocorridoEm, parcelas,
      forma: formaDaTransacao(str(v.formaPagamento), v.ehPix === true, parcelas),
      bandeira: str(v.bandeira),
      liquido: num(v.liquido),
    });
  }
  return { temMaquininha: bruto?.temMaquininha === true, vendas };
}
