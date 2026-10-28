/**
 * O CADASTRO PELA CONVERSA — as perguntas, em ordem, e o que cada resposta grava.
 *
 * ⚠️ **Por que existe (decisão do dono, 16/10/2026).** A conversa da Quattro AI
 * pedia só três coisas (nome, e-mail, senha) e a pessoa entrava no sistema sem
 * CNPJ, sem regime, sem representante, sem perfil e sem estrutura — tudo o que
 * o cadastro de sete passos (`/comecar`) pedia. Agora a conversa pede CADA campo
 * do cadastro antigo, um de cada vez, e a conta só é criada quando
 * `faltandoParaCriar` volta vazio.
 *
 * Puro, sem rede e sem tela: a tela pergunta, a pessoa responde, e esta camada
 * diz qual é a próxima pergunta e o que a resposta grava. As listas de opções
 * são as MESMAS do wizard (que as importa daqui) — duas listas divergiriam no
 * primeiro ajuste, e aí a mesma empresa responderia coisas diferentes conforme
 * a porta.
 */
import { FAIXAS_ALCADA } from "@/core/seguranca/alcada";
import type { Estrutura, Participante, PerfilEmpresa } from "@/core/onboarding";
import { MIN_SENHA } from "@/core/recuperacao";
import { PEDIDO_VAZIO, type PedidoMaquininha } from "@/core/maquininha/oferta";

export const CADASTRO_CONVERSA_VERSION = "cadastro-conversa/2.0.0";

/* ─── as opções (as mesmas do cadastro de sete passos) ───────────────────── */
export const SETORES = ["Aviação", "Serviços", "Indústria", "Construção", "Tecnologia", "E-commerce", "Saúde", "Educação", "Financeiro", "Agronegócio", "Imobiliário", "Logística", "Outro"];
export const MODELOS = ["B2B", "B2C", "Marketplace", "Assinatura", "Projeto", "Recorrência", "Financeira", "Holding", "SaaS"];
export const RECEITAS = ["Venda de produto", "Venda de serviço", "Mensalidade", "Aluguel", "Intermediação", "Taxa", "Comissão", "Juros", "Receita financeira"];
export const FREQ = ["Diária", "Semanal", "Mensal", "Sazonal", "Projeto"];
export const FUNC = ["1-10", "11-50", "51-100", "101-500", "500+"];
export const FAT = ["até R$360 mil", "R$360 mil – 4,8 mi", "R$4,8 – 20 mi", "R$20 – 50 mi", "R$50 mi+"];
export const BANCOS = ["Itaú", "Bradesco", "Santander", "Banco do Brasil", "Caixa", "Nubank", "Inter", "C6 Bank", "BTG Pactual", "Sicoob", "Sicredi", "Mercado Pago", "PagBank", "Stone", "Safra", "Banrisul", "Cora"];
export const MEIOS = ["PIX", "Boleto", "Cartão", "TED", "Dinheiro", "Link de pagamento", "Marketplace", "Internacional"];
export const DESPESAS = ["Folha", "Impostos", "Aluguel", "Marketing", "Combustível", "Fornecedores", "Software", "Logística"];
export const PORTES = ["MEI", "ME", "EPP", "LTDA", "SA", "Holding", "SPE", "Outro"];
export const REGIMES = ["Simples Nacional", "Lucro Presumido", "Lucro Real", "Outro"];
/**
 * ⚠️ Na conversa o regime NÃO tem "Outro": `regimeDoCadastro("Outro")` é
 * `nao_declarado`, que é exatamente o item faltando que esta conversa existe
 * para fechar. O MEI entra porque a Receita o informa e o motor fiscal o apura.
 */
export const REGIMES_DA_CONVERSA = ["MEI", "Simples Nacional", "Lucro Presumido", "Lucro Real"];
export const FUNCOES = ["Administrador", "CEO", "CFO", "Financeiro", "Tesouraria", "Controller", "Contador", "Jurídico", "Operador", "Auditor", "Conselheiro", "Investidor"];
export const LIMITES = FAIXAS_ALCADA.map((f) => f.rotulo);
export const NAO_APROVO = "Não aprovo pagamentos";
export const TIPOS_CONTA = ["Operacional", "Folha", "Reserva", "Investimento"];
export const CENTROS = ["Comercial", "Operações", "Administrativo", "Financeiro", "Marketing", "Logística"];
export const UNIDADES = ["Matriz", "Filial", "Projeto", "Online", "Operação"];
export const DRE_OPTS = ["Gerencial", "Financeiro", "Por centro de custo", "Por produto", "Por cliente", "Consolidado (holding)"];
export const FLUXO_OPTS = ["Operacional", "Projetado", "Competência", "Híbrido"];
export const CARTEIRAS = ["Conta corrente", "Poupança", "Carteira / Dinheiro", "Nubank", "Inter", "Cartão de crédito", "Vale-refeição", "Investimentos"];
export const CATEGORIAS_PF = ["Moradia", "Mercado", "Alimentação", "Transporte", "Contas (água/luz/internet)", "Saúde", "Educação", "Lazer", "Assinaturas", "Compras", "Pets", "Outros"];
export const SIM_NAO = ["Sim", "Não"];

/* ─── máscaras e validação (o que a pessoa digita no chat) ───────────────── */
const digitos = (s: string) => (s || "").replace(/\D/g, "");

/** 00.000.000/0000-00, enquanto a pessoa digita. */
export function mascararCNPJ(s: string): string {
  const d = digitos(s).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
/** 000.000.000-00. */
export function mascararCPF(s: string): string {
  const d = digitos(s).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}
/** (11) 91234-5678 ou (11) 1234-5678. */
export function mascararTelefone(s: string): string {
  const d = digitos(s).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const meio = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, meio)}-${resto.slice(meio)}`;
}
/** 00000-000. */
export function mascararCEP(s: string): string {
  return digitos(s).slice(0, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}

function dvMod11(base: string, pesos: number[]): number {
  const soma = base.split("").reduce((t, c, i) => t + Number(c) * pesos[i], 0);
  const r = soma % 11;
  return r < 2 ? 0 : 11 - r;
}
/** CNPJ com os dois dígitos verificadores certos (e não uma repetição como 11.111.111/1111-11). */
export function cnpjConfere(s: string): boolean {
  const d = digitos(s);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const p2 = [6, ...p1];
  return dvMod11(d.slice(0, 12), p1) === Number(d[12]) && dvMod11(d.slice(0, 13), p2) === Number(d[13]);
}
export function cpfConfere(s: string): boolean {
  const d = digitos(s);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n: number) => {
    const soma = d.slice(0, n).split("").reduce((t, c, i) => t + Number(c) * (n + 1 - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}
export function telefoneConfere(s: string): boolean {
  const d = digitos(s);
  return d.length === 10 || d.length === 11;
}
export const EMAIL_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "3.500,00", "3500", "R$ 3.500" → 3500. Ilegível → null. */
export function lerValor(s: string): number | null {
  const t = (s || "").replace(/[R$\s]/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/\.(?=\d{3}(\D|$))/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

/* ─── o estado da conversa ───────────────────────────────────────────────── */
export interface PessoaExtra { nome: string; email: string; funcao: string; limite: string }

export interface Cadastro {
  tipo: "pf" | "pj" | null;
  /* empresa — o que a Receita devolve é conferido pela pessoa no cartão */
  cnpj: string;
  razaoSocial: string;
  fantasia: string;
  fundacao: string;
  porte: string;
  cep: string;
  rua: string;
  numero: string;
  bairro: string;
  cidade: string;
  estado: string;
  /** O que a Receita disse do Simples/MEI — só SUGERE o regime, quem declara é a pessoa. */
  receitaSimples: boolean | null;
  receitaMei: boolean | null;
  regime: string;
  contribuinteIcms: boolean | null;
  ie: string;
  im: string;
  exportadora: boolean | null;
  repNome: string;
  repCargo: string;
  repTelefone: string;
  repEmail: string;
  limite: string;
  extras: PessoaExtra[];
  setor: string;
  modelo: string;
  receitaPrincipal: string;
  frequencia: string;
  funcionarios: string;
  faturamento: string;
  bancos: string[];
  meiosRecebimento: string[];
  despesas: string[];
  descricao: string;
  contaTipos: string[];
  centrosCusto: string[];
  unidades: string[];
  dre: string[];
  fluxoCaixa: string;
  /* pessoa física */
  cpf: string;
  nome: string;
  rendaMensal: number | null;
  saldoInicial: number | null;
  carteiras: string[];
  categorias: string[];
  orcamento: number | null;
  /* acesso */
  email: string;
  /* a abertura de conta (o roteiro dos prints de 20/10/2026) */
  /** O banco escolhido para o Open Finance ("" = preencheu à mão). A conexão só acontece com a conta criada. */
  openFinanceBanco: string;
  /** Quando a pessoa marcou "Li e aceito os termos" (ISO). Vazio = não aceitou. */
  aceiteTermos: string;
  /** A faixa da renda do representante (PJ). */
  rendaRepresentante: string;
  /**
   * O reconhecimento facial: `capturada` = a foto foi tirada; `pendente` = o
   * aparelho não deu acesso à câmera e a validação fica para depois. A
   * verificação contra a base biométrica ainda não existe (não há provedor).
   */
  biometria: "" | "capturada" | "pendente";
  /** O documento de identidade escolhido na validação (RG ou CNH). */
  docTipo: "" | "rg" | "cnh";
  /**
   * O envio do documento: `conferido` = a leitura no navegador achou o CPF ou o
   * nome do cadastro; `enviado` = a foto entrou mas a leitura não confirmou
   * (fica para conferência); `pendente` = a pessoa deixou para depois. A foto
   * NÃO sai do aparelho: não há provedor de validação documental ainda.
   */
  documento: "" | "conferido" | "enviado" | "pendente";
  /**
   * O contrato social ou o comprovante de endereço (OPCIONAL). `depois` = a
   * pessoa pulou. ⚠️ A foto ainda NÃO sai do aparelho: não há onde guardá-la
   * com segurança, e a tela diz isso.
   */
  docEmpresa: "" | "contrato" | "comprovante" | "depois";
  /**
   * A senha de ACESSO (a do login): só a marca. A senha mesma nunca entra no
   * cadastro — a tela a guarda numa referência até o `signUp`. `google` = entrou
   * pelo Google e não tem senha.
   */
  senhaAcesso: "" | "definida" | "google";
  /** A maquininha da Quattro: vincular a que já tem, pedir uma, ou agora não. */
  maquininha: "" | "vincular" | "pedir" | "nao";
  maquininhaEC: string;
  maquininhaQtd: number;
  maquininhaEndereco: string;
}

export const CADASTRO_VAZIO: Cadastro = {
  tipo: null,
  cnpj: "", razaoSocial: "", fantasia: "", fundacao: "", porte: "",
  cep: "", rua: "", numero: "", bairro: "", cidade: "", estado: "",
  receitaSimples: null, receitaMei: null,
  regime: "", contribuinteIcms: null, ie: "", im: "", exportadora: null,
  repNome: "", repCargo: "", repTelefone: "", repEmail: "", limite: "", extras: [],
  setor: "", modelo: "", receitaPrincipal: "", frequencia: "", funcionarios: "", faturamento: "",
  bancos: [], meiosRecebimento: [], despesas: [], descricao: "",
  contaTipos: [], centrosCusto: [], unidades: [], dre: [], fluxoCaixa: "",
  cpf: "", nome: "", rendaMensal: null, saldoInicial: null, carteiras: [], categorias: [], orcamento: null,
  email: "",
  openFinanceBanco: "", aceiteTermos: "", rendaRepresentante: "", biometria: "",
  docTipo: "", documento: "", docEmpresa: "", senhaAcesso: "",
  maquininha: "", maquininhaEC: "", maquininhaQtd: 1, maquininhaEndereco: "",
};

/** O que a Receita devolve (o subconjunto de `lib/cnpj.DadosCNPJ` que o cadastro usa). */
export interface DadosReceita {
  razaoSocial: string;
  nomeFantasia?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  telefone?: string;
  email?: string;
  dataAbertura?: string;
  porte?: string;
  simples?: boolean;
  mei?: boolean;
}

/** Leva os dados da Receita ao cadastro — só depois de a pessoa CONFIRMAR o cartão. */
export function aplicarReceita(c: Cadastro, r: DadosReceita): Cadastro {
  const v = (x?: string) => (x ?? "").trim();
  return {
    ...c,
    razaoSocial: v(r.razaoSocial) || c.razaoSocial,
    fantasia: v(r.nomeFantasia) || c.fantasia,
    cep: r.cep ? mascararCEP(r.cep) : c.cep,
    rua: v(r.logradouro) || c.rua,
    numero: v(r.numero) || c.numero,
    bairro: v(r.bairro) || c.bairro,
    cidade: v(r.municipio) || c.cidade,
    estado: v(r.uf) || c.estado,
    fundacao: v(r.dataAbertura) || c.fundacao,
    porte: v(r.porte) || c.porte,
    repTelefone: c.repTelefone || (r.telefone ? mascararTelefone(r.telefone) : ""),
    receitaSimples: r.simples ?? null,
    receitaMei: r.mei ?? null,
  };
}

/** O regime que a Receita indica (só para destacar a opção; nunca grava sozinho). */
export function regimeSugerido(c: Cadastro): string | null {
  if (c.receitaMei) return "MEI";
  if (c.receitaSimples) return "Simples Nacional";
  return null;
}

/* ─── as perguntas ───────────────────────────────────────────────────────── */
export type TipoPergunta = "texto" | "email" | "telefone" | "cep" | "moeda" | "data" | "escolha" | "multi";

export interface Pergunta {
  id: string;
  tipo: TipoPergunta;
  /** O que a IA diz (uma fala por item; a última é a pergunta). */
  falas: (c: Cadastro) => string[];
  /** Rótulo acessível do campo e o placeholder. */
  rotulo: string;
  placeholder?: string;
  opcoes?: (c: Cadastro) => string[];
  /** A opção que a IA destaca (a da Receita, por exemplo). */
  destaque?: (c: Cadastro) => string | null;
  /** Escolhas pré-marcadas numa pergunta múltipla. */
  inicial?: (c: Cadastro) => string[];
  /** Pode ficar sem resposta (a conversa oferece "Pular"). */
  opcional?: boolean;
  quando?: (c: Cadastro) => boolean;
  /** Recusa com a frase que a IA diz; `null` = aceita. */
  validar?: (valor: string, c: Cadastro) => string | null;
  /** Grava a resposta (texto, ou a lista unida por "\n" na múltipla). */
  aplicar: (c: Cadastro, valor: string) => Cadastro;
  /** A resposta como aparece no balão da pessoa. */
  eco?: (valor: string) => string;
  /** Em qual grupo do resumo ela aparece. */
  grupo: string;
  /** Na múltipla: cada opção leva a marca do banco (`BancoLogo marca`). */
  logos?: boolean;
  /** Na múltipla: "Meu banco não está na lista" abre um campo para digitar o que falta. */
  outro?: boolean;
}

const lista = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
const pj = (c: Cadastro) => c.tipo === "pj";
const pf = (c: Cadastro) => c.tipo === "pf";
const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";
const exigir = (msg: string) => (v: string) => (v.trim() ? null : msg);

export const OPCOES_MAQUININHA = { vincular: "Sim, quero vincular a minha", pedir: "Não, quero pedir uma", nao: "Agora não" } as const;
export const ENTREGA_OUTRO = "Em outro endereço";

/** O endereço da empresa em uma linha ("" = ainda não há rua e cidade). */
export function enderecoDaEmpresa(c: Cadastro): string {
  if (!c.rua || !c.cidade) return "";
  return `${c.rua}, ${c.numero || "S/N"}${c.bairro ? ` · ${c.bairro}` : ""} · ${c.cidade}${c.estado ? ` / ${c.estado}` : ""}`;
}

/*
 * ⚠️ O texto livre "me conte sobre a sua empresa" no lugar das duas escolhas
 * (modelo e receita). A leitura é por palavra ANCORADA, sem acento, e só
 * PREENCHE: o que ela não acha a conversa pergunta (receita) ou deixa em branco
 * (modelo) — nunca um palpite com cara de resposta.
 */
const RECEITA_POR_PALAVRA: [RegExp, string][] = [
  [/\b(mensalidade|assinatura|assinante|recorrente)s?\b/, "Mensalidade"],
  [/\b(aluguel|aluga|locacao|locamos)\b/, "Aluguel"],
  [/\b(comissao|comissoes)\b/, "Comissão"],
  [/\b(marketplace|intermedia\w*)\b/, "Intermediação"],
  [/\b(servico|servicos|consultoria|assessoria|manutencao|prestamos|prestacao)\b/, "Venda de serviço"],
  [/\b(produto|produtos|loja|revenda|revendemos|vendemos|fabricamos|mercadoria|mercadorias)\b/, "Venda de produto"],
];
const MODELO_POR_PALAVRA: [RegExp, string][] = [
  [/\b(saas|software|aplicativo|plataforma)\b/, "SaaS"],
  [/\b(assinatura|assinante|mensalidade)s?\b/, "Assinatura"],
  [/\bmarketplace\b/, "Marketplace"],
  [/\bholding\b/, "Holding"],
  [/\b(b2b|para empresas|outras empresas|industrias|clientes corporativos)\b/, "B2B"],
  [/\b(b2c|varejo|consumidor|consumidores|pessoas fisicas|cliente final)\b/, "B2C"],
  [/\b(projeto|projetos|obra|obras)\b/, "Projeto"],
];

export function lerSobreAEmpresa(texto: string): { modelo: string | null; receitaPrincipal: string | null } {
  const t = texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const primeiroQueCasa = (regras: [RegExp, string][]) => {
    let melhor: { pos: number; valor: string } | null = null;
    for (const [re, valor] of regras) {
      const m = re.exec(t);
      if (m && (!melhor || m.index < melhor.pos)) melhor = { pos: m.index, valor };
    }
    return melhor?.valor ?? null;
  };
  return { modelo: primeiroQueCasa(MODELO_POR_PALAVRA), receitaPrincipal: primeiroQueCasa(RECEITA_POR_PALAVRA) };
}

export const PERGUNTAS: Pergunta[] = [
  /* ── o roteiro da abertura: quem é você e como falar com você ─────────── */
  {
    id: "repNome", tipo: "texto", grupo: "Representante", rotulo: "Seu nome", placeholder: "Seu nome completo",
    quando: pj,
    falas: () => ["Agora sobre você, que vai representar a empresa.", "Qual é o seu nome completo?"],
    validar: (v) => (v.trim().split(/\s+/).length >= 2 ? null : "Me passa o nome e o sobrenome, por favor."),
    aplicar: (c, v) => ({ ...c, repNome: v.trim().replace(/\s+/g, " ") }),
  },
  {
    id: "nome", tipo: "texto", grupo: "Você", rotulo: "Seu nome", placeholder: "Seu nome completo",
    quando: pf,
    falas: () => ["E qual é o seu nome completo?"],
    validar: (v) => (v.trim().split(/\s+/).length >= 2 ? null : "Me passa o nome e o sobrenome, por favor."),
    aplicar: (c, v) => ({ ...c, nome: v.trim().replace(/\s+/g, " ") }),
  },
  {
    id: "repTelefone", tipo: "telefone", grupo: "Contato", rotulo: "WhatsApp", placeholder: "(00) 00000-0000",
    quando: (c) => !!c.tipo,
    falas: (c) => [`Prazer, ${primeiro(c.tipo === "pf" ? c.nome : c.repNome)}!`, "Qual número de telefone você usa no **Whatsapp**?"],
    validar: (v) => (telefoneConfere(v) ? null : "O número tem DDD e 8 ou 9 dígitos. Confere pra mim?"),
    aplicar: (c, v) => ({ ...c, repTelefone: mascararTelefone(v) }),
    eco: mascararTelefone,
  },
  {
    id: "repEmail", tipo: "email", grupo: "Contato", rotulo: "E-mail", placeholder: "voce@suaempresa.com.br",
    quando: pj,
    falas: () => ["Qual é o seu e-mail?", "É com ele que você entra no sistema, e é por ele que mandamos os avisos importantes da conta."],
    validar: (v) => (EMAIL_VALIDO.test(v.trim()) ? null : "Esse e-mail parece incompleto. Algo como voce@suaempresa.com.br."),
    aplicar: (c, v) => ({ ...c, repEmail: v.trim(), email: v.trim() }),
  },
  {
    id: "emailPf", tipo: "email", grupo: "Contato", rotulo: "E-mail", placeholder: "voce@email.com",
    quando: pf,
    falas: () => ["Qual é o seu e-mail?", "É com ele que você entra no sistema."],
    validar: (v) => (EMAIL_VALIDO.test(v.trim()) ? null : "Esse e-mail parece incompleto. Algo como voce@email.com."),
    aplicar: (c, v) => ({ ...c, email: v.trim() }),
  },
  /* ── PJ · quando a Receita não respondeu ──────────────────────────────── */
  {
    id: "razaoSocial", tipo: "texto", grupo: "Empresa", rotulo: "Razão social", placeholder: "Razão social da empresa",
    quando: (c) => pj(c) && !c.razaoSocial,
    falas: () => ["Não consegui buscar os dados na Receita agora, então vou te pedir.", "Qual é a razão social da empresa?"],
    validar: exigir("Preciso da razão social: é o nome que sai nos relatórios e nas notas."),
    aplicar: (c, v) => ({ ...c, razaoSocial: v.trim() }),
  },
  {
    id: "fantasia", tipo: "texto", grupo: "Empresa", rotulo: "Nome fantasia", placeholder: "Nome fantasia", opcional: true,
    quando: (c) => pj(c) && !c.fantasia,
    falas: () => ["Ela tem um nome fantasia, aquele que o cliente conhece?"],
    aplicar: (c, v) => ({ ...c, fantasia: v.trim() }),
  },
  {
    id: "cep", tipo: "cep", grupo: "Endereço", rotulo: "CEP", placeholder: "00000-000",
    quando: (c) => pj(c) && !c.cidade,
    falas: () => ["Qual é o CEP da empresa?"],
    validar: (v) => (v.replace(/\D/g, "").length === 8 ? null : "O CEP tem 8 números. Confere pra mim?"),
    aplicar: (c, v) => ({ ...c, cep: mascararCEP(v) }),
    eco: mascararCEP,
  },
  {
    id: "cidade", tipo: "texto", grupo: "Endereço", rotulo: "Cidade e UF", placeholder: "Cidade / UF",
    quando: (c) => pj(c) && !c.cidade,
    falas: () => ["Não achei esse CEP. Em qual cidade e estado fica a empresa?"],
    validar: (v) => (/\/\s*[A-Za-z]{2}\s*$/.test(v) ? null : "Escreve assim, por favor: Cidade / UF (por exemplo, Campinas / SP)."),
    aplicar: (c, v) => {
      const [cid, uf] = v.split("/").map((x) => x.trim());
      return { ...c, cidade: cid, estado: (uf ?? "").toUpperCase() };
    },
  },
  {
    id: "numero", tipo: "texto", grupo: "Endereço", rotulo: "Número", placeholder: "Número e complemento",
    quando: (c) => pj(c) && !c.numero,
    falas: (c) => [c.rua ? `É na ${c.rua}. Qual é o número?` : "E o endereço, com rua e número?"],
    validar: exigir("Preciso do número do endereço (pode escrever S/N se não tiver)."),
    aplicar: (c, v) => ({ ...c, numero: c.rua ? v.trim() : c.numero || "S/N", rua: c.rua || v.trim() }),
  },
  /* ── PJ · o regime (o único item fiscal que fica na abertura) ─────────── */
  {
    id: "regime", tipo: "escolha", grupo: "Fiscal", rotulo: "Regime tributário",
    quando: pj,
    opcoes: () => REGIMES_DA_CONVERSA,
    destaque: regimeSugerido,
    falas: (c) => {
      const s = regimeSugerido(c);
      return [
        "Agora o regime tributário, que é o que muda as contas do sistema.",
        s ? `A Receita indica que a empresa é ${s === "MEI" ? "MEI" : "optante do Simples Nacional"}. Qual é o regime tributário?`
          : "Qual é o regime tributário da empresa? Se tiver dúvida, é o que o seu contador usa na apuração.",
      ];
    },
    validar: (v) => (REGIMES_DA_CONVERSA.includes(v) ? null : "Escolhe uma das opções, por favor."),
    aplicar: (c, v) => ({ ...c, regime: v }),
  },
  /* ── o negócio ────────────────────────────────────────────────────────── */
  {
    id: "setor", tipo: "escolha", grupo: "Perfil", rotulo: "Setor", quando: pj, opcoes: () => SETORES,
    falas: () => ["Agora quero entender o negócio, que é o que mais me ajuda a te ajudar.", "Em que setor a empresa atua?"],
    aplicar: (c, v) => ({ ...c, setor: v }),
  },
  {
    id: "sobre", tipo: "texto", grupo: "Perfil", rotulo: "Sobre a empresa", placeholder: "O que a empresa vende, para quem e como cobra",
    quando: pj,
    falas: () => ["Me conte mais sobre a sua empresa: o que vocês vendem, para quem e como cobram."],
    validar: (v) => (v.trim().length < 10 ? "Me conta um pouco mais, com uma ou duas frases."
      : v.length > 500 ? "Cabe até 500 letras. Dá pra resumir?" : null),
    aplicar: (c, v) => {
      const lido = lerSobreAEmpresa(v);
      return { ...c, descricao: v.trim(), modelo: lido.modelo ?? "", receitaPrincipal: lido.receitaPrincipal ?? "" };
    },
  },
  {
    // ⚠️ Só quando o texto livre não disse de onde vem a receita (`lerSobreAEmpresa`).
    id: "receitaPrincipal", tipo: "escolha", grupo: "Perfil", rotulo: "Receita principal",
    quando: (c) => pj(c) && !c.receitaPrincipal, opcoes: () => RECEITAS,
    falas: () => ["E de onde vem a maior parte da receita?"],
    aplicar: (c, v) => ({ ...c, receitaPrincipal: v }),
  },
  {
    id: "funcionarios", tipo: "escolha", grupo: "Perfil", rotulo: "Funcionários", quando: pj, opcoes: () => FUNC,
    falas: () => ["Quantas pessoas trabalham na empresa?"],
    aplicar: (c, v) => ({ ...c, funcionarios: v }),
  },
  {
    id: "faturamento", tipo: "escolha", grupo: "Perfil", rotulo: "Faturamento anual", quando: pj,
    opcoes: () => FAIXAS_FATURAMENTO.map((f) => f.rotulo),
    falas: () => ["E o faturamento anual, mais ou menos?"],
    aplicar: (c, v) => ({ ...c, faturamento: v }),
  },
  {
    id: "sobrePf", tipo: "texto", grupo: "Você", rotulo: "O que você quer controlar", placeholder: "Gastos, contas, metas…",
    quando: pf,
    falas: () => ["Me conte o que você mais quer controlar no seu dinheiro."],
    validar: (v) => (v.trim().length < 3 ? "Me conta em poucas palavras, por favor." : v.length > 500 ? "Cabe até 500 letras. Dá pra resumir?" : null),
    aplicar: (c, v) => ({ ...c, descricao: v.trim() }),
  },
  {
    id: "rendaMensal", tipo: "moeda", grupo: "Você", rotulo: "Renda mensal", placeholder: "R$ 0,00",
    quando: pf,
    falas: () => ["Quanto você recebe por mês, mais ou menos?"],
    validar: (v) => (lerValor(v) != null ? null : "Escreve só o valor, por exemplo 4.500,00."),
    aplicar: (c, v) => ({ ...c, rendaMensal: lerValor(v) }),
  },
  {
    /*
     * ⚠️ Os bancos com a MARCA (`logos`) e o "Meu banco não está na lista"
     * (`outro`): o banco digitado entra na mesma lista dos marcados.
     */
    id: "bancos", tipo: "multi", grupo: "Bancos", rotulo: "Bancos", quando: (c) => !!c.tipo, opcoes: () => BANCOS,
    logos: true, outro: true,
    falas: (c) => [c.tipo === "pf"
      ? "Em quais bancos você tem conta? Pode marcar mais de um."
      : "Em quais bancos a empresa tem conta? Pode marcar mais de um."],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos um banco, ou escreve o seu em \"Meu banco não está na lista\"."),
    aplicar: (c, v) => ({ ...c, bancos: lista(v), ...(c.tipo === "pf" ? { carteiras: lista(v) } : {}) }),
    eco: (v) => lista(v).join(", "),
  },
  /* ── PJ · a maquininha da Quattro ─────────────────────────────────────── */
  {
    id: "maquininha", tipo: "escolha", grupo: "Maquininha", rotulo: "Maquininha da Quattro", quando: pj,
    opcoes: () => Object.values(OPCOES_MAQUININHA),
    falas: () => ["Você já tem a **maquininha** **da** **Quattro**?", "Com ela, as vendas no cartão e no Pix entram sozinhas no caixa."],
    aplicar: (c, v) => {
      const m = (Object.keys(OPCOES_MAQUININHA) as (keyof typeof OPCOES_MAQUININHA)[]).find((k) => OPCOES_MAQUININHA[k] === v) ?? "nao";
      return { ...c, maquininha: m, maquininhaEC: m === "vincular" ? c.maquininhaEC : "", maquininhaEndereco: m === "pedir" ? c.maquininhaEndereco : "" };
    },
  },
  {
    id: "maquininhaEC", tipo: "texto", grupo: "Maquininha", rotulo: "Número do estabelecimento", placeholder: "Só números", opcional: true,
    quando: (c) => pj(c) && c.maquininha === "vincular",
    falas: () => ["Qual é o número do estabelecimento (EC) da sua maquininha?", "Ele aparece no comprovante de venda. Se não tiver agora, pode pular: você vincula depois, em Maquininha."],
    validar: (v) => (/^\d{3,15}$/.test(v.trim()) ? null : "O número do estabelecimento tem só números, de 3 a 15."),
    aplicar: (c, v) => ({ ...c, maquininhaEC: v.trim() }),
  },
  {
    id: "maquininhaQtd", tipo: "escolha", grupo: "Maquininha", rotulo: "Quantas maquininhas",
    quando: (c) => pj(c) && c.maquininha === "pedir", opcoes: () => ["1", "2", "3", "4", "5"],
    falas: () => ["Quantas maquininhas você quer?"],
    aplicar: (c, v) => ({ ...c, maquininhaQtd: Math.max(1, Math.min(5, Number(v) || 1)) }),
  },
  {
    id: "maquininhaEntrega", tipo: "escolha", grupo: "Maquininha", rotulo: "Onde entregar",
    quando: (c) => pj(c) && c.maquininha === "pedir" && !!enderecoDaEmpresa(c),
    opcoes: (c) => [`No endereço da empresa (${enderecoDaEmpresa(c)})`, ENTREGA_OUTRO],
    falas: () => ["Onde entregamos?"],
    aplicar: (c, v) => ({ ...c, maquininhaEndereco: v === ENTREGA_OUTRO ? "" : enderecoDaEmpresa(c) }),
    eco: (v) => (v === ENTREGA_OUTRO ? v : "No endereço da empresa"),
  },
  {
    id: "maquininhaEndereco", tipo: "texto", grupo: "Maquininha", rotulo: "Endereço de entrega", placeholder: "Rua, número, bairro, cidade / UF",
    quando: (c) => pj(c) && c.maquininha === "pedir" && !c.maquininhaEndereco,
    falas: () => ["Qual é o endereço de entrega, com rua, número e cidade?"],
    validar: (v) => (v.trim().length >= 8 ? null : "Preciso da rua, do número e da cidade para entregar."),
    aplicar: (c, v) => ({ ...c, maquininhaEndereco: v.trim().replace(/\s+/g, " ") }),
  },
];

/* ─── o roteiro da abertura de conta ─────────────────────────────────────── */
/** As faixas do cartão "Informações da empresa" (o porte entre parênteses é o da lei). */
export const FAIXAS_FATURAMENTO: { rotulo: string; porte: string }[] = [
  { rotulo: "Até R$ 81.000", porte: "MEI" },
  { rotulo: "R$ 81.001 - R$ 360.000", porte: "Microempresa" },
  { rotulo: "R$ 360.001 - R$ 4.800.000", porte: "EPP" },
  { rotulo: "R$ 4.800.001 - R$ 78.000.000", porte: "Média Empresa" },
  { rotulo: "Acima de R$ 78.000.000", porte: "Grande Empresa" },
];
export const FAIXAS_RENDA = ["Até R$ 5.000", "R$ 5.001 - R$ 10.000", "R$ 10.001 - R$ 30.000", "R$ 30.001 - R$ 100.000", "Acima de R$ 100.000"];

/** A `ilustracao` é o nome do ícone 3D (`public/icones-3d/<icone>.png`, 3dicons CC0). */
export type IconeDica = "sun" | "picture" | "boy" | "bulb" | "copy" | "file-new";

export const DICAS_FACIAL: { titulo: string; ilustracao: IconeDica }[] = [
  { titulo: "Procure um lugar iluminado", ilustracao: "sun" },
  { titulo: "Retire acessórios como óculos e bonés", ilustracao: "picture" },
  { titulo: "Posicione o rosto no centro da tela", ilustracao: "boy" },
];

export const DICAS_DOCUMENTO: { titulo: string; ilustracao: IconeDica }[] = [
  { titulo: "Procure um lugar iluminado", ilustracao: "bulb" },
  { titulo: "Retire o documento do plástico", ilustracao: "copy" },
  { titulo: "Posicione seu documento em uma mesa plana", ilustracao: "file-new" },
];

export const TIPOS_DOCUMENTO: Record<"rg" | "cnh", string> = { rg: "RG", cnh: "CNH" };

export interface LeituraDocumento {
  /** O texto parece de um RG ou de uma CNH? */
  reconhecido: boolean;
  /** O CPF do cadastro aparece no documento (`null` = o cadastro não tem CPF para comparar). */
  cpfConfere: boolean | null;
  /** O nome do cadastro aparece no documento (`null` = sem nome para comparar). */
  nomeConfere: boolean | null;
  /** Conferido = achou o CPF, ou o nome inteiro num documento reconhecido. */
  conferido: boolean;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/**
 * Lê o texto (do OCR) de um RG ou de uma CNH contra o cadastro. ⚠️ É uma
 * CONFERÊNCIA local, não uma validação documental: nenhuma base oficial é
 * consultada. Por isso o que ela não confirma não reprova — o documento segue
 * como "enviado", para conferência depois.
 *
 * O CPF é comparado pelos 11 dígitos em QUALQUER formatação (o RG imprime
 * "123.456.789-09", a CNH às vezes sem pontuação). O nome casa quando TODAS as
 * palavras de 3+ letras do cadastro aparecem no texto, sem acento — o OCR
 * troca "Ç" e perde acentos com frequência.
 */
export function lerDocumentoIdentidade(texto: string, c: Pick<Cadastro, "tipo" | "cpf" | "nome" | "repNome">): LeituraDocumento {
  const t = semAcento(texto);
  const digitos = texto.replace(/\D/g, "");
  const reconhecido = /(carteira de identidade|registro geral|identidade|habilitacao|cnh|renach|secretaria de seguranca|detran|documento de identificacao)/.test(t);
  const cpf = c.tipo === "pf" ? c.cpf.replace(/\D/g, "") : "";
  const cpfConfere = cpf.length === 11 ? digitos.includes(cpf) : null;
  const nome = (c.tipo === "pf" ? c.nome : c.repNome).trim();
  const palavras = semAcento(nome).split(/\s+/).filter((w) => w.length >= 3);
  const nomeConfere = palavras.length ? palavras.every((w) => t.includes(w)) : null;
  const conferido = cpfConfere === true || (reconhecido && nomeConfere === true);
  return { reconhecido, cpfConfere, nomeConfere, conferido };
}

/** Os passos que não são pergunta de campo: cada um tem o seu cartão. */
export type PassoEspecial = "termos" | "facial" | "docIdentidade" | "docEmpresa" | "senha";
export type Passo = { especial: PassoEspecial } | { pergunta: Pergunta };

/**
 * ⚠️ **A ORDEM DA ABERTURA (27/10/2026, decisão do dono).** Depois do documento
 * (CNPJ ou CPF): nome → WhatsApp → e-mail → termos → reconhecimento facial →
 * documento de identidade → contrato social ou comprovante de endereço
 * (opcional) → senha de acesso. Só então o resto, na ordem de `PERGUNTAS`.
 * Open Finance, "Informações financeiras" e a senha transacional SAÍRAM; o que
 * a abertura deixou de pedir mora em `PARA_COMPLETAR_DEPOIS`.
 *
 * Quem entra pelo Google não digita e-mail nem senha: a tela marca os dois
 * como feitos (`senhaAcesso: "google"`).
 */
export function proximoPasso(c: Cadastro, feitos: ReadonlySet<string>): Passo | null {
  const roteiro = c.tipo === "pj"
    ? ["repNome", "repTelefone", "repEmail", "termos", "facial", "docIdentidade", "docEmpresa", "senha"]
    : c.tipo === "pf" ? ["nome", "repTelefone", "emailPf", "termos", "facial", "docIdentidade", "docEmpresa", "senha"] : [];
  for (const id of roteiro) {
    if (feitos.has(id)) continue;
    const p = PERGUNTAS.find((x) => x.id === id);
    return p ? { pergunta: p } : { especial: id as PassoEspecial };
  }
  const p = proximaPergunta(c, feitos);
  return p ? { pergunta: p } : null;
}

/** Quantos passos especiais valem para este cadastro (para o "x de y"; o Google pula a senha). */
export function passosEspeciais(c: Cadastro): number {
  if (!c.tipo) return 0;
  return c.senhaAcesso === "google" ? 4 : 5;
}

/**
 * A próxima pergunta: a primeira que vale para este cadastro e ainda não foi
 * respondida. `null` = acabaram (a conta pode ser criada).
 */
export function proximaPergunta(c: Cadastro, respondidas: ReadonlySet<string>): Pergunta | null {
  return PERGUNTAS.find((p) => (p.quando ? p.quando(c) : true) && !respondidas.has(p.id)) ?? null;
}

/** Quantas perguntas valem para este cadastro (para o "x de y"). */
export function perguntasDoCadastro(c: Cadastro): Pergunta[] {
  return PERGUNTAS.filter((p) => (p.quando ? p.quando(c) : true));
}

/**
 * A senha de ACESSO ao sistema (a do login). O mínimo é o `MIN_SENHA` da
 * recuperação de senha — duas regras de tamanho divergiriam na primeira troca.
 * `null` = pode seguir.
 */
export function problemaDaSenha(senha: string, confirmar: string): string | null {
  if (senha.length < MIN_SENHA) return `A senha precisa de pelo menos ${MIN_SENHA} caracteres.`;
  if (senha !== confirmar) return "As duas senhas não são iguais.";
  return null;
}

/**
 * ⚠️ **O PORTÃO DA CRIAÇÃO.** A conta só nasce com isto vazio. Cada item diz em
 * português o que falta, para a tela poder voltar à pergunta certa. O que a
 * abertura deixou para depois (ICMS, função, estrutura…) NÃO entra aqui.
 */
export function faltandoParaCriar(c: Cadastro): string[] {
  const f: string[] = [];
  const vazio = (s: string) => !s.trim();
  if (!EMAIL_VALIDO.test(c.email.trim())) f.push("e-mail de acesso");
  if (c.tipo && !c.aceiteTermos) f.push("aceite dos termos de uso");
  if (c.tipo && !c.biometria) f.push("reconhecimento facial");
  if (c.tipo && !c.documento) f.push("documento de identidade");
  if (c.tipo && !c.senhaAcesso) f.push("senha de acesso");
  if (c.tipo && !telefoneConfere(c.repTelefone)) f.push("WhatsApp");
  if (c.tipo && !c.bancos.length) f.push("bancos");
  if (c.tipo === "pj") {
    if (!cnpjConfere(c.cnpj)) f.push("CNPJ");
    if (vazio(c.razaoSocial)) f.push("razão social");
    if (vazio(c.cidade) || vazio(c.estado)) f.push("cidade e UF");
    if (c.cep.replace(/\D/g, "").length !== 8 || vazio(c.numero)) f.push("endereço (CEP e número)");
    if (!REGIMES_DA_CONVERSA.includes(c.regime)) f.push("regime tributário");
    if (vazio(c.repNome)) f.push("nome do representante");
    for (const [k, rot] of [["setor", "setor"], ["descricao", "como a empresa funciona"], ["receitaPrincipal", "receita principal"], ["funcionarios", "número de funcionários"], ["faturamento", "faturamento anual"]] as const) {
      if (vazio(c[k])) f.push(rot);
    }
    if (!c.maquininha) f.push("se tem a maquininha da Quattro");
    if (c.maquininha === "pedir" && c.maquininhaEndereco.trim().length < 8) f.push("endereço de entrega da maquininha");
  } else if (c.tipo === "pf") {
    if (!cpfConfere(c.cpf)) f.push("CPF");
    if (vazio(c.nome)) f.push("nome");
    if (vazio(c.descricao)) f.push("o que você quer controlar");
    if (c.rendaMensal == null) f.push("renda mensal");
  } else {
    f.push("tipo de conta");
  }
  return f;
}

/**
 * ⚠️ **O QUE A ABERTURA DEIXOU PARA DEPOIS** (decisão do dono, 27/10/2026). A
 * conversa "Vamos completar seu cadastro", depois da primeira entrada, pede
 * isto — e a lista é dado, não lembrança: um item que sai da abertura sem
 * entrar aqui some do produto.
 */
export const PARA_COMPLETAR_DEPOIS: { pj: string[]; pf: string[]; segundaFase: string[] } = {
  pj: [
    "Contribuinte de ICMS e inscrição estadual", "Inscrição municipal", "Se exporta",
    "Sua função na empresa", "Limite de aprovação de pagamentos", "Outras pessoas da equipe",
    "Frequência da receita", "Meios de recebimento", "Principais despesas",
    "Tipos de conta", "Centros de custo", "Unidades de negócio", "Visão do DRE", "Visão do fluxo de caixa",
  ],
  pf: ["Saldo atual", "Categorias de gasto", "Orçamento mensal"],
  segundaFase: ["Conectar o banco pelo Open Finance", "Enviar o extrato do banco", "O retrato financeiro da empresa"],
};

/** O nome da organização no `signUp`: a razão social (é o que sai na nota) ou o nome da pessoa. */
export function nomeDaOrganizacao(c: Cadastro): string {
  return c.tipo === "pf" ? c.nome.trim() : (c.razaoSocial.trim() || c.fantasia.trim());
}

/**
 * O pedido da maquininha que a conversa montou — o MESMO formato da página
 * Maquininha (`core/maquininha/oferta`), validado pela mesma `validarPedido`.
 * `null` = a pessoa não pediu nem quer vincular. ⚠️ Só sai DEPOIS de a conta
 * existir: o pedido é da empresa, e a empresa nasce com a conta.
 */
export function pedidoDaMaquininha(c: Cadastro): PedidoMaquininha | null {
  if (c.tipo !== "pj" || (c.maquininha !== "pedir" && c.maquininha !== "vincular")) return null;
  if (c.maquininha === "vincular" && !c.maquininhaEC) return null;
  return {
    ...PEDIDO_VAZIO,
    tipo: c.maquininha,
    quantidade: c.maquininha === "pedir" ? c.maquininhaQtd || 1 : 1,
    segmento: c.setor,
    codigoEstabelecimento: c.maquininha === "vincular" ? c.maquininhaEC : "",
    contatoNome: c.repNome.trim(),
    contatoTelefone: c.repTelefone,
    contatoEmail: c.email.trim(),
    endereco: c.maquininha === "pedir" ? c.maquininhaEndereco.trim() : "",
    observacao: "Pedido feito na abertura da conta.",
  };
}

/* ─── o que vai para o sistema (o MESMO formato do cadastro de sete passos) ─ */
export interface CadastroMontado {
  db: Record<string, string | boolean>;
  perfil: PerfilEmpresa;
  participantes: Participante[];
  estrutura: Estrutura;
  pessoal?: {
    nome: string; rendaMensal: number; saldoInicial: number; orcamentoMensal: number;
    carteiras: string[]; categoriasGasto: string[];
  };
}

export function montarCadastro(c: Cadastro): CadastroMontado {
  const docEmpresa: Record<string, string> = c.docEmpresa ? { documentoEmpresa: c.docEmpresa } : {};
  if (c.tipo === "pf") {
    const nome = c.nome.trim();
    return {
      db: {
        tipoConta: "pessoal", tipoPessoa: "fisica", cpf: mascararCPF(c.cpf), repNome: nome, repEmail: c.email.trim(), razaoSocial: nome, fantasia: nome,
        repTelefone: c.repTelefone, aceiteTermos: c.aceiteTermos, biometria: c.biometria,
        documentoIdentidade: c.documento, ...(c.docTipo ? { documentoTipo: c.docTipo } : {}), ...docEmpresa,
      },
      perfil: {
        setor: "Pessoal", modelo: "B2C", receitaPrincipal: "Salário", frequencia: "Mensal",
        funcionarios: "1-10", faturamento: "", bancos: c.carteiras, meiosRecebimento: ["PIX"], despesas: c.categorias,
        ...(c.descricao.trim() ? { descricao: c.descricao.trim() } : {}),
      },
      participantes: [],
      estrutura: {
        contas: c.carteiras.map((b, k) => ({ banco: b, tipo: "Operacional", ...(k === 0 && c.saldoInicial ? { saldo: c.saldoInicial } : {}) })),
        centrosCusto: [], unidades: [], dre: ["Gerencial"], fluxoCaixa: "Operacional",
      },
      pessoal: {
        nome, rendaMensal: c.rendaMensal ?? 0, saldoInicial: c.saldoInicial ?? 0, orcamentoMensal: c.orcamento ?? 0,
        carteiras: c.carteiras, categoriasGasto: c.categorias,
      },
    };
  }
  const aprova = c.limite !== NAO_APROVO && !!c.limite;
  const participantes: Participante[] = [
    { nome: c.repNome.trim(), funcao: c.repCargo, email: c.repEmail.trim(), aprovaPagamentos: aprova, ...(aprova ? { limite: c.limite } : {}) },
    ...c.extras.map((p) => {
      const ap = p.limite !== NAO_APROVO && !!p.limite;
      return { nome: p.nome, funcao: p.funcao, email: p.email, aprovaPagamentos: ap, ...(ap ? { limite: p.limite } : {}) };
    }),
  ];
  /*
   * ⚠️ ICMS, IE, IM e exportadora só entram quando RESPONDIDOS: a abertura não
   * os pergunta mais, e gravar `false` afirmaria "não é contribuinte" sobre uma
   * pergunta que ninguém fez.
   */
  const fiscal: Record<string, string | boolean> = {
    ...(c.contribuinteIcms != null ? { contribuinteIcms: c.contribuinteIcms } : {}),
    ...(c.ie ? { ie: c.ie } : {}), ...(c.im ? { im: c.im } : {}),
    ...(c.exportadora != null ? { exportadora: c.exportadora } : {}),
  };
  return {
    db: {
      tipoConta: "empresa", tipoPessoa: "juridica",
      cnpj: mascararCNPJ(c.cnpj), razaoSocial: c.razaoSocial.trim(), fantasia: c.fantasia.trim(),
      fundacao: c.fundacao, porte: c.porte,
      cep: c.cep, rua: c.rua, numero: c.numero, bairro: c.bairro, cidade: c.cidade, estado: c.estado, pais: "Brasil",
      regime: c.regime, ...fiscal,
      repNome: c.repNome.trim(), ...(c.repCargo ? { repCargo: c.repCargo } : {}), repTelefone: c.repTelefone, repEmail: c.repEmail.trim(),
      aceiteTermos: c.aceiteTermos, biometria: c.biometria,
      documentoIdentidade: c.documento, ...(c.docTipo ? { documentoTipo: c.docTipo } : {}), ...docEmpresa,
      ...(c.maquininha ? { maquininha: c.maquininha as string } : {}),
    },
    perfil: {
      setor: c.setor, modelo: c.modelo, receitaPrincipal: c.receitaPrincipal, frequencia: c.frequencia,
      funcionarios: c.funcionarios, faturamento: c.faturamento,
      bancos: c.bancos, meiosRecebimento: c.meiosRecebimento, despesas: c.despesas,
      ...(c.descricao.trim() ? { descricao: c.descricao.trim() } : {}),
    },
    participantes,
    estrutura: {
      // Os tipos de conta ficaram para depois: cada banco marcado nasce como conta operacional.
      contas: (c.contaTipos.length ? c.contaTipos.map((t) => ({ banco: c.bancos[0] ?? "—", tipo: t })) : c.bancos.map((b) => ({ banco: b, tipo: "Operacional" }))),
      centrosCusto: c.centrosCusto,
      unidades: c.unidades.length ? c.unidades : ["Matriz"],
      dre: c.dre.length ? c.dre : ["Gerencial"],
      fluxoCaixa: c.fluxoCaixa || "Híbrido",
    },
  };
}
