/**
 * SANEAMENTO DA CONTRAPARTE — separar NOME de DOCUMENTO, e recusar o que não é
 * nome.
 *
 * ⚠️ A lista de clientes nascia contaminada na primeira linha: um nome trazia o
 * CNPJ colado à razão social com os parênteses invertidos, outro era **apenas
 * um número de CPF**, e outro era **"ANUIDADE DIFERENCIADA"** — uma descrição
 * de cobrança, não uma pessoa. O importador aceitava qualquer coisa.
 *
 * A causa raiz do primeiro caso: a resolução de entidades escolhia o alias MAIS
 * LONGO como nome (`sort((a, b) => b.length - a.length)[0]`), e o alias mais
 * longo é justamente o que tem o documento grudado.
 *
 * Todo relatório por cliente nasce a partir daqui, então errar aqui contamina
 * DRE por cliente, cobrança, segmentação e score de crédito de uma vez.
 *
 * Puro, sem I/O.
 */
import { validateCPF, validateCNPJ } from "@/lib/validators";

export interface ContraparteSaneada {
  /** O nome limpo — sem documento, sem pontuação órfã, em caixa de título. */
  nome: string;
  /** O documento extraído do nome, quando havia um lá dentro. */
  documento: string | null;
  tipoDocumento: "cnpj" | "cpf" | null;
  /**
   * `false` quando o texto **não é nome de ninguém** (um número solto, uma
   * descrição de cobrança). Estes NÃO viram cadastro — viram descrição do
   * lançamento, e a revisão da importação os mostra separados.
   */
  ehPessoa: boolean;
  motivo?: string;
}

const so = (s: string) => s.replace(/\D/g, "");

/** CNPJ/CPF em qualquer formatação, inclusive grudado no nome. */
const RE_DOC = /(\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}|\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2})/g;

/**
 * Textos que descrevem uma COBRANÇA, não uma contraparte. São o que sobra
 * quando o extrato traz o histórico no lugar do favorecido.
 *
 * ⚠️ Ancorados em `\b` e exigindo que o texto seja SÓ isso (ou quase): uma
 * empresa pode legitimamente se chamar "Mensalidade Serviços Ltda", e recusar
 * um cliente real é pior do que aceitar um nome feio.
 */
const RE_DESCRICAO_DE_COBRANCA =
  /^(anuidade|mensalidade|parcela|presta[çc][ãa]o|taxa|tarifa|juros|multa|encargo|desconto|acr[ée]scimo|estorno|reembolso|cr[ée]dito|d[ée]bito|dep[óo]sito|saque|resgate|aplica[çc][ãa]o|rendimento|transfer[êe]ncia|pagamento|recebimento|cobran[çc]a|fatura|boleto|pix|ted|doc)\b[\w\s\-.,/]*$/i;

/**
 * ⚠️ O ANTÍDOTO CONTRA O FALSO POSITIVO — e ele é o que decide se este detector
 * presta.
 *
 * "Mensalidade Serviços Ltda" **é** uma empresa. Recusá-la porque começa com
 * uma palavra de cobrança joga fora um cliente real, e um cadastro perdido dói
 * mais que um nome feio aceito. Sufixo societário ou documento válido são
 * evidência positiva de que ali existe uma pessoa jurídica, e vencem a
 * heurística de descrição.
 */
const RE_SUFIXO_SOCIETARIO = /\b(ltda|s\/?a|eireli|epp|mei|me|cia|associa[çc][ãa]o|institut[oa]|funda[çc][ãa]o|coopera(tiva)?)\b/i;

const pareceEmpresa = (nome: string, documento: string | null): boolean =>
  !!documento || RE_SUFIXO_SOCIETARIO.test(nome);

/** Palavras que, sozinhas, não identificam ninguém. */
const RE_GENERICO = /^(cliente|fornecedor|diversos|outros|n[ãa]o identificado|sem nome|-+|\.+)$/i;

const TITULO_MINUSCULO = new Set(["de", "da", "do", "das", "dos", "e", "em", "a", "o"]);

/** Caixa de título pt-BR: "JOAO DA SILVA LTDA" → "Joao da Silva Ltda". */
function caixaDeTitulo(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((p, i) => {
      if (i > 0 && TITULO_MINUSCULO.has(p)) return p;
      // Siglas curtas ficam em caixa alta: "ME", "SA", "LTDA" é palavra.
      if (/^(me|epp|sa|mei|ltda|eireli)$/i.test(p)) return p.toUpperCase();
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
}

/**
 * Limpa o nome de uma contraparte e separa o documento.
 *
 * ⚠️ **Só extrai o documento se os dígitos verificadores baterem.** Sem essa
 * checagem, a linha digitável de um boleto vira "CNPJ" e o nome perde um pedaço
 * — o mesmo cuidado que `core/cnae` já toma.
 */
export function sanearContraparte(bruto: string | null | undefined): ContraparteSaneada {
  const original = String(bruto ?? "").trim();
  if (!original) {
    return { nome: "", documento: null, tipoDocumento: null, ehPessoa: false, motivo: "vazio" };
  }

  // 1. Documento — extraído, validado e REMOVIDO do nome.
  let documento: string | null = null;
  let tipoDocumento: ContraparteSaneada["tipoDocumento"] = null;
  let semDoc = original;
  for (const achado of original.match(RE_DOC) ?? []) {
    const d = so(achado);
    if (d.length === 14 && validateCNPJ(d)) { documento = d; tipoDocumento = "cnpj"; }
    else if (d.length === 11 && validateCPF(d)) { documento = d; tipoDocumento = "cpf"; }
    else continue;
    semDoc = semDoc.replace(achado, " ");
  }

  // 2. Pontuação órfã. ⚠️ O caso real tinha os PARÊNTESES INVERTIDOS — o
  // documento saiu do meio e sobrou ")" ou "(" solto. Limpar só um dos lados
  // deixaria a sujeira que motivou o achado.
  const nomeCru = semDoc
    .replace(/[()[\]{}]/g, " ")
    .replace(/\s*[-–—/|,;:]\s*$/g, "")
    .replace(/^\s*[-–—/|,;:]\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  // 3. É nome de alguém?
  const soDigitos = so(nomeCru);
  if (!nomeCru) {
    return {
      nome: "", documento, tipoDocumento, ehPessoa: false,
      motivo: documento ? "só o documento, sem razão social" : "sem texto após limpeza",
    };
  }
  if (soDigitos.length >= nomeCru.replace(/\s/g, "").length * 0.8) {
    // ⚠️ "apenas um número de CPF" — um documento não é nome. Vira descrição
    // do lançamento; cadastrar assim envenena todo relatório por cliente.
    return { nome: nomeCru, documento, tipoDocumento, ehPessoa: false, motivo: "o nome é só um número" };
  }
  if (RE_GENERICO.test(nomeCru)) {
    return { nome: caixaDeTitulo(nomeCru), documento, tipoDocumento, ehPessoa: false, motivo: "termo genérico, não identifica ninguém" };
  }
  if (RE_DESCRICAO_DE_COBRANCA.test(nomeCru) && !pareceEmpresa(nomeCru, documento)) {
    // "ANUIDADE DIFERENCIADA" é o histórico da cobrança que o extrato pôs no
    // lugar do favorecido.
    return { nome: caixaDeTitulo(nomeCru), documento, tipoDocumento, ehPessoa: false, motivo: "descrição de cobrança, não uma contraparte" };
  }
  if (nomeCru.replace(/\s/g, "").length < 3) {
    return { nome: caixaDeTitulo(nomeCru), documento, tipoDocumento, ehPessoa: false, motivo: "curto demais para identificar" };
  }

  return { nome: caixaDeTitulo(nomeCru), documento, tipoDocumento, ehPessoa: true };
}

/**
 * Escolhe o MELHOR nome entre os aliases de uma mesma contraparte.
 *
 * ⚠️ Era `sort((a, b) => b.length - a.length)[0]` — o mais LONGO vencia, e o
 * mais longo é justamente o que tem o documento grudado. Agora ganha o alias
 * que é nome de gente; entre eles, o mais **informativo** (mais palavras), e o
 * comprimento só desempata.
 */
export function melhorNome(aliases: string[]): ContraparteSaneada {
  const saneados = aliases.map(sanearContraparte);
  const pessoas = saneados.filter((s) => s.ehPessoa);
  const candidatos = pessoas.length > 0 ? pessoas : saneados;

  const escolhido = [...candidatos].sort((a, b) => {
    const palavras = b.nome.split(/\s+/).length - a.nome.split(/\s+/).length;
    if (palavras !== 0) return palavras;
    return a.nome.length - b.nome.length; // entre iguais, o mais enxuto
  })[0];

  // O documento pode estar em QUALQUER alias — aproveita o primeiro válido
  // mesmo que o nome escolhido tenha vindo de outro.
  const comDoc = saneados.find((s) => s.documento);
  return {
    ...escolhido,
    documento: escolhido.documento ?? comDoc?.documento ?? null,
    tipoDocumento: escolhido.tipoDocumento ?? comDoc?.tipoDocumento ?? null,
  };
}

/**
 * Chave de DEDUPLICAÇÃO de contraparte.
 *
 * Documento válido manda: "Alpha Ltda" e "ALPHA COMERCIO LTDA" com o mesmo CNPJ
 * são a mesma empresa. Sem documento, cai no nome normalizado — que é melhor
 * que nada e pior que o documento, e por isso vem depois.
 */
export function chaveContraparte(c: ContraparteSaneada): string {
  if (c.documento) return `doc:${c.documento}`;
  return `nome:${c.nome.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim()}`;
}

/** Junta contrapartes que são a mesma, pelo documento ou pelo nome normalizado. */
export function deduplicar(lista: ContraparteSaneada[]): ContraparteSaneada[] {
  const por = new Map<string, ContraparteSaneada>();
  for (const c of lista) {
    const k = chaveContraparte(c);
    const atual = por.get(k);
    if (!atual) { por.set(k, c); continue; }
    // Fica o que tem documento; entre iguais, o nome mais informativo.
    const melhor =
      (c.documento && !atual.documento) ||
      (!!c.documento === !!atual.documento && c.nome.split(/\s+/).length > atual.nome.split(/\s+/).length)
        ? c : atual;
    por.set(k, melhor);
  }
  return Array.from(por.values());
}
