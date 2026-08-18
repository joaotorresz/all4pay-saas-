/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAPEAMENTO DE COLUNAS — layout desconhecido não é RECUSA, é uma pergunta
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O parser do FDIP adivinha as colunas por palavra-chave no cabeçalho ou por
 * posição. Quando não reconhece, ele CAI em 0/1/2 em silêncio — e um extrato
 * com as colunas em outra ordem entra inteiro errado, sem ninguém saber.
 *
 * Este módulo troca o palpite calado por três coisas:
 *   1. detecta as colunas COM CONFIANÇA (0..100), e quando a confiança é baixa
 *      DECLARA `precisaConfirmar` em vez de chutar;
 *   2. dá ao layout uma ASSINATURA estável (o cabeçalho normalizado), para o
 *      mapeamento que o usuário confirmou uma vez ser reusado no próximo arquivo
 *      do MESMO banco;
 *   3. valida o mapeamento contra AMOSTRAS — uma coluna dita "valor" que não
 *      tem número em nenhuma amostra não é valor, por mais que o nome diga.
 *
 * Puro, tipado, sem I/O. Versão `ingestao/1.0.0` (parte do pipeline único).
 */

/** Os quatro papéis que uma coluna de extrato pode ter. `-1` = ausente. */
export interface Mapeamento {
  data: number;
  valor: number;
  descricao: number;
  documento: number;
}

export interface DeteccaoColunas {
  mapeamento: Mapeamento;
  /** 0..100 — quão seguro o detector está do mapeamento. */
  confianca: number;
  /**
   * ⚠️ `true` quando a confiança é baixa: a tela PROPÕE o mapeamento e pede
   * confirmação, em vez de gravar no escuro. É o oposto de recusar o arquivo.
   */
  precisaConfirmar: boolean;
  /** Por papel, por que o detector escolheu aquela coluna (para a tela explicar). */
  motivos: Record<keyof Mapeamento, string>;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Uma célula parece data BR/ISO? */
export function pareceData(s: string): boolean {
  const t = s.trim();
  return /^\d{2}[/-]\d{2}[/-]\d{2,4}$/.test(t) || /^\d{4}-\d{2}-\d{2}/.test(t) || /^\d{8}$/.test(t);
}

/** Uma célula parece VALOR monetário (e NÃO uma data)? */
export function pareceValor(s: string): boolean {
  const t = s.trim();
  if (!t || pareceData(t)) return false;
  // aceita 1.234,56 · -1234.56 · (1.234,56) · R$ 10,00 · 10,00 D
  return /^[-(]?\s*(r\$)?\s*\d{1,3}([.,]\d{3})*([.,]\d{1,2})?\s*[)dc]?$/i.test(t)
    || /^-?\d+([.,]\d+)?$/.test(t);
}

const RE_DATA = /\b(data|dt|date|dia)\b/;
const RE_VALOR = /\b(valor|amount|montante|vlr|credito|debito|entrada|saida)\b/;
const RE_DESC = /\b(descri|hist|memo|lancamento|contrapart|favorec|benefici|detalhe)\b/;
const RE_DOC = /\b(doc|documento|nf|nsu|boleto|autentic|identific)\b/;

/**
 * Detecta as colunas cruzando o CABEÇALHO (nome) com as AMOSTRAS (conteúdo).
 *
 * ⚠️ **O conteúdo VENCE o nome quando discordam.** Uma coluna chamada "valor"
 * cujas amostras não têm número nenhum não é a coluna de valor — provavelmente
 * o cabeçalho está deslocado. A confiança sobe quando nome E conteúdo
 * concordam, e despenca quando só um dos dois aponta.
 */
export function detectarColunas(cabecalho: string[], amostras: string[][]): DeteccaoColunas {
  const heads = cabecalho.map(norm);
  const n = cabecalho.length;

  // Perfil de conteúdo por coluna: fração das amostras que parecem data/valor.
  const fracData: number[] = [];
  const fracValor: number[] = [];
  for (let c = 0; c < n; c++) {
    const vals = amostras.map((a) => a[c] ?? "").filter((x) => x !== "");
    const total = Math.max(1, vals.length);
    fracData[c] = vals.filter(pareceData).length / total;
    fracValor[c] = vals.filter(pareceValor).length / total;
  }

  const acharPorNome = (re: RegExp) => heads.findIndex((h) => re.test(h));
  const melhorPorConteudo = (frac: number[], excluir: number[]) => {
    let melhor = -1, best = 0.5; // exige > 50% das amostras para valer
    for (let c = 0; c < n; c++) {
      if (excluir.includes(c)) continue;
      if (frac[c] > best) { best = frac[c]; melhor = c; }
    }
    return melhor;
  };

  const motivos = { data: "", valor: "", descricao: "", documento: "" } as Record<keyof Mapeamento, string>;
  const pontos: number[] = [];

  // DATA: nome + conteúdo.
  const dataNome = acharPorNome(RE_DATA);
  const dataConteudo = melhorPorConteudo(fracData, []);
  let data = dataConteudo >= 0 ? dataConteudo : dataNome;
  if (dataNome >= 0 && dataNome === dataConteudo) { motivos.data = "cabeçalho e conteúdo concordam"; pontos.push(1); }
  else if (dataConteudo >= 0) { motivos.data = `${Math.round(fracData[dataConteudo] * 100)}% das amostras são datas`; pontos.push(0.7); }
  else if (dataNome >= 0) { motivos.data = "só pelo nome da coluna"; pontos.push(0.4); }
  else { data = 0; motivos.data = "não detectada — assumindo a 1ª coluna"; pontos.push(0); }

  // VALOR: nome + conteúdo, excluindo a coluna de data.
  const valorNome = acharPorNome(RE_VALOR);
  const valorConteudo = melhorPorConteudo(fracValor, [data]);
  let valor = valorConteudo >= 0 ? valorConteudo : valorNome;
  if (valorNome >= 0 && valorNome === valorConteudo) { motivos.valor = "cabeçalho e conteúdo concordam"; pontos.push(1); }
  else if (valorConteudo >= 0) { motivos.valor = `${Math.round(fracValor[valorConteudo] * 100)}% das amostras são números`; pontos.push(0.7); }
  else if (valorNome >= 0) { motivos.valor = "só pelo nome da coluna"; pontos.push(0.4); }
  else { valor = data === 1 ? 2 : 1; motivos.valor = "não detectada — assumindo por posição"; pontos.push(0); }

  // DESCRIÇÃO: por nome, ou a coluna de texto mais LARGA que sobra.
  const descNome = acharPorNome(RE_DESC);
  let descricao = descNome;
  if (descNome < 0) {
    // a coluna com o texto mais longo, que não é data nem valor
    let melhor = -1, maiorLen = 0;
    for (let c = 0; c < n; c++) {
      if (c === data || c === valor) continue;
      const len = Math.max(...amostras.map((a) => (a[c] ?? "").length), 0);
      if (len > maiorLen) { maiorLen = len; melhor = c; }
    }
    descricao = melhor;
    motivos.descricao = melhor >= 0 ? "coluna de texto mais longa" : "não detectada";
    pontos.push(melhor >= 0 ? 0.5 : 0);
  } else {
    motivos.descricao = "pelo nome da coluna";
    pontos.push(0.8);
  }
  if (descricao < 0) descricao = Math.max(0, n - 1);

  // DOCUMENTO: opcional, só por nome. Não conta contra a confiança.
  const documento = acharPorNome(RE_DOC);
  motivos.documento = documento >= 0 ? "pelo nome da coluna" : "ausente (opcional)";

  const confianca = Math.round((pontos.reduce((s, p) => s + p, 0) / pontos.length) * 100);
  return {
    mapeamento: { data, valor, descricao, documento },
    confianca,
    // ⚠️ Abaixo de 70 a tela pede confirmação. Acima, entra direto, mas o
    // mapeamento fica salvo para o usuário poder corrigir depois.
    precisaConfirmar: confianca < 70 || data === valor,
    motivos,
  };
}

/**
 * A ASSINATURA do layout — o cabeçalho normalizado, para casar o próximo
 * arquivo do MESMO banco com o mapeamento já confirmado. Só o cabeçalho, não o
 * conteúdo: dois extratos do mesmo banco têm o mesmo cabeçalho e linhas
 * diferentes.
 *
 * ⚠️ Cabeçalho VAZIO (arquivo posicional, sem header) devolve `""` — e o
 * chamador não deve salvar mapeamento sob chave vazia, senão o primeiro
 * posicional confirmado responderia por TODOS os posicionais de bancos
 * diferentes.
 */
export function assinaturaLayout(cabecalho: string[]): string {
  const cols = cabecalho.map(norm).filter(Boolean);
  if (cols.length === 0) return "";
  return cols.join("|");
}

/**
 * Valida um mapeamento (proposto OU salvo) contra as amostras: a coluna de valor
 * tem número? a de data tem data? Devolve os papéis que NÃO batem — se vier
 * vazio, o mapeamento serve.
 *
 * ⚠️ É o que impede um mapeamento salvo de um banco de ser aplicado cegamente a
 * um arquivo com layout parecido mas colunas trocadas: antes de reusar, confere.
 */
export function validarMapeamento(m: Mapeamento, amostras: string[][]): (keyof Mapeamento)[] {
  const problemas: (keyof Mapeamento)[] = [];
  const fracao = (col: number, teste: (s: string) => boolean) => {
    if (col < 0) return 1;
    const vals = amostras.map((a) => a[col] ?? "").filter((x) => x !== "");
    if (vals.length === 0) return 0;
    return vals.filter(teste).length / vals.length;
  };
  if (fracao(m.data, pareceData) < 0.5) problemas.push("data");
  if (fracao(m.valor, pareceValor) < 0.5) problemas.push("valor");
  if (m.descricao < 0) problemas.push("descricao");
  return problemas;
}
