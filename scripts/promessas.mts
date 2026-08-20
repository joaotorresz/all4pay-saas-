/**
 * `npm run promessas` — A GUARDA DA PROMESSA (item 13 do P-19).
 *
 * Varre o TEXTO QUE CHEGA À TELA procurando afirmação que o sistema não
 * sustenta: integridade que não se confere, garantia que não se dá, automação
 * que não roda, selo que ninguém emitiu.
 *
 * ⚠️ **Por que ela existe.** Copy que promete demais não quebra teste nenhum:
 * typecheck passa, a tela renderiza, o número está certo. O defeito só aparece
 * quando um cliente cobra o que leu — e aí já foi vendido. Foi assim que
 * *"Trilha de auditoria imutável · cadeia SHA-256"* atravessou meses sobre uma
 * cadeia que era remontada a cada leitura (A4P-079), e *"Policy engine ·
 * avaliação em tempo real"* descreveu como proteção ativa um simulador que não
 * está no caminho de pagamento nenhum.
 *
 * ⚠️ **NEM TODA OCORRÊNCIA É PROMESSA, e tratá-las como iguais é o erro** — a
 * mesma lição da varredura de implementação (ONDA 11). Das 7 ocorrências da
 * primeira execução, **4 se refutaram**: três são definições CONCEITUAIS na
 * base de conhecimento ("a partida dobrada garante que o balanço fecha" é
 * contabilidade, não propaganda nossa) e uma é um recorte factual com o limite
 * dito na linha seguinte. Reescrevê-las pioraria o texto. Por isso as exceções
 * são NOMINAIS e carregam MOTIVO — nunca um padrão frouxo que silencia a
 * família inteira.
 *
 * ⚠️ **Comentários saem antes da busca.** Este arquivo explica cada defeito
 * citando a frase que o causou; sem tirar comentário, a guarda reprovaria a
 * própria documentação da regra — e guarda que faz isso é desligada na primeira
 * semana (terceira vez que a lição aparece neste repositório).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = "src";

/** As famílias de promessa, cada uma com o que a torna verificável. */
const PADROES: { nome: string; re: RegExp; porque: string }[] = [
  { nome: "integridade", re: /imut[áa]ve|imutabilidade|[àa] prova de adultera/i,
    porque: "só vale se o encadeamento for GRAVADO junto do evento (A4P-079)" },
  { nome: "garantia", re: /\bgarant(e|imos|ido|ida)\b/i,
    porque: "garantia é obrigação contratual; o produto assegura a aritmética, não o resultado" },
  { nome: "automação total", re: /totalmente autom|100% autom|sem interven[çc][ãa]o (humana|manual)/i,
    porque: "todo caminho automático deste produto tem revisão ou confirmação antes de gravar" },
  { nome: "tempo real", re: /tempo real/i,
    porque: "sugere caminho ativo; a maioria das leituras é sob demanda e vários motores são simuladores" },
  { nome: "infalibilidade", re: /nunca (erra|falha|perde)|sem erro|infal[íi]vel|zero erro|precis[ãa]o (total|absoluta)/i,
    porque: "nenhum classificador, OCR ou projeção deste sistema é infalível, e a tela já mostra confiança" },
  { nome: "criptografia", re: /criptografad|ponta a ponta/i,
    porque: "o dado trafega em TLS e repousa no Postgres do provedor; não há cifra fim a fim nossa" },
  { nome: "selo", re: /homologad[oa] pel|certificad[oa] pel|auditad[oa] por/i,
    porque: "nenhum órgão certificou este produto; dizer que sim é afirmação sobre terceiro" },
];

/**
 * ⚠️ EXCEÇÕES NOMINAIS, COM MOTIVO. Uma exceção sem motivo escrito vira
 * paisagem — a próxima leitura não sabe se ela foi pensada ou herdada.
 */
const DECLARADAS: { arquivo: string; trecho: string; motivo: string }[] = [
  { arquivo: "src/lib/assistant-kb.ts", trecho: "Garante que o saldo",
    motivo: "define o que é CONCILIAÇÃO como conceito contábil, não promete o nosso resultado" },
  { arquivo: "src/lib/assistant-kb.ts", trecho: "Garante que o balanço sempre fecha",
    motivo: "define a PARTIDA DOBRADA; a igualdade débito=crédito é a definição, não uma promessa nossa" },
  { arquivo: "src/lib/assistant-kb.ts", trecho: "até uma condição",
    motivo: "define conta ESCROW; a retenção é a natureza do instrumento" },
  { arquivo: "src/components/administracao/IntegracoesView.tsx", trecho: "Bancos homologados",
    motivo: "recorte factual da lista de Open Finance, e o limite está DITO na linha seguinte ('conta em banco fora da lista continua entrando por importação')" },
];

const CHAVES = "(?:title|titulo|hint|sub|label|oQue|comoCalcula|placeholder|description|descricao|texto|mensagem|resumo|motivo|frase|nota|aviso)";
const reProp = new RegExp(CHAVES + "\\s*[=:]\\s*[\"'`]([^\"'`]{4,})", "g");
const reJsx = />\s*([A-ZÁÉÍÓÚÂÊÔÃÕÇa-záéíóúâêôãõç][^<>{}\n]{8,})\s*</g;

function arquivos(dir: string): string[] {
  const out: string[] = [];
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p));
    else if (/\.(ts|tsx)$/.test(nome)) out.push(p);
  }
  return out;
}

/** Tira comentário de bloco e de linha — ver o aviso no cabeçalho. */
function semComentario(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

export function varrer(): { arquivo: string; linha: number; familia: string; texto: string }[] {
  const achados: { arquivo: string; linha: number; familia: string; texto: string }[] = [];
  for (const f of arquivos(RAIZ)) {
    let src: string;
    try { src = readFileSync(f, "utf8"); } catch { continue; }
    const rel = relative(".", f);
    const linhas = semComentario(src).split("\n");
    linhas.forEach((l, i) => {
      const alvos: string[] = [];
      for (const m of l.matchAll(reProp)) alvos.push(m[1]);
      for (const m of l.matchAll(reJsx)) alvos.push(m[1]);
      for (const a of alvos) {
        for (const p of PADROES) {
          if (!p.re.test(a)) continue;
          const isento = DECLARADAS.some((d) => rel === d.arquivo && a.includes(d.trecho));
          if (isento) continue;
          achados.push({ arquivo: rel, linha: i + 1, familia: p.nome, texto: a.trim().slice(0, 140) });
        }
      }
    });
  }
  return achados;
}

const direto = process.argv[1]?.endsWith("promessas.mts");
if (direto) {
  const achados = varrer();
  // ⚠️ Exceção que aponta para arquivo inexistente é exceção que sobreviveu ao
  // arquivo — silenciaria uma família inteira sem ninguém perceber.
  const orfas = DECLARADAS.filter((d) => {
    try { return !readFileSync(d.arquivo, "utf8").includes(d.trecho); } catch { return true; }
  });
  for (const o of orfas) console.log(`✗ FAIL exceção órfã: ${o.arquivo} não contém "${o.trecho}"`);
  for (const a of achados) console.log(`✗ FAIL ${a.arquivo}:${a.linha} [${a.familia}] ${a.texto}`);
  const total = achados.length + orfas.length;
  console.log(
    total === 0
      ? `✓ promessas — 0 afirmações a mais em ${arquivos(RAIZ).length} arquivos (${DECLARADAS.length} exceções declaradas com motivo)`
      : `✗ ${total} promessa(s) que o sistema não sustenta`,
  );
  if (total > 0) process.exit(1);
}
