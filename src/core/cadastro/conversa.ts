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

export const CADASTRO_CONVERSA_VERSION = "cadastro-conversa/1.0.0";

/* ─── as opções (as mesmas do cadastro de sete passos) ───────────────────── */
export const SETORES = ["Aviação", "Serviços", "Indústria", "Construção", "Tecnologia", "E-commerce", "Saúde", "Educação", "Financeiro", "Agronegócio", "Imobiliário", "Logística", "Outro"];
export const MODELOS = ["B2B", "B2C", "Marketplace", "Assinatura", "Projeto", "Recorrência", "Financeira", "Holding", "SaaS"];
export const RECEITAS = ["Venda de produto", "Venda de serviço", "Mensalidade", "Aluguel", "Intermediação", "Taxa", "Comissão", "Juros", "Receita financeira"];
export const FREQ = ["Diária", "Semanal", "Mensal", "Sazonal", "Projeto"];
export const FUNC = ["1-10", "11-50", "51-100", "101-500", "500+"];
export const FAT = ["até R$360 mil", "R$360 mil – 4,8 mi", "R$4,8 – 20 mi", "R$20 – 50 mi", "R$50 mi+"];
export const BANCOS = ["Itaú", "Bradesco", "Santander", "Banco do Brasil", "Caixa", "Nubank", "Inter", "C6", "BTG", "Sicoob", "Sicredi", "Mercado Pago"];
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
   * A senha transacional de 6 dígitos. ⚠️ Só a MARCA de que foi definida: o
   * número não é guardado em lugar nenhum (um PIN de 6 dígitos no perfil ou no
   * navegador se quebra em segundos), e Pix e pagamentos ainda não a pedem.
   */
  senhaTransacional: "" | "definida";
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
  docTipo: "", documento: "", senhaTransacional: "",
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
}

const lista = (v: string) => v.split("\n").map((x) => x.trim()).filter(Boolean);
const pj = (c: Cadastro) => c.tipo === "pj";
const pf = (c: Cadastro) => c.tipo === "pf";
const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] ?? "";
const exigir = (msg: string) => (v: string) => (v.trim() ? null : msg);

export const PERGUNTAS: Pergunta[] = [
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
  /* ── PJ · fiscal ──────────────────────────────────────────────────────── */
  {
    id: "regime", tipo: "escolha", grupo: "Fiscal", rotulo: "Regime tributário",
    quando: pj,
    opcoes: () => REGIMES_DA_CONVERSA,
    destaque: regimeSugerido,
    falas: (c) => {
      const s = regimeSugerido(c);
      return [
        "Agora a parte fiscal, que é a que muda as contas do sistema.",
        s ? `A Receita indica que a empresa é ${s === "MEI" ? "MEI" : "optante do Simples Nacional"}. Qual é o regime tributário?`
          : "Qual é o regime tributário da empresa? Se tiver dúvida, é o que o seu contador usa na apuração.",
      ];
    },
    validar: (v) => (REGIMES_DA_CONVERSA.includes(v) ? null : "Escolhe uma das opções, por favor."),
    aplicar: (c, v) => ({ ...c, regime: v }),
  },
  {
    id: "icms", tipo: "escolha", grupo: "Fiscal", rotulo: "Contribuinte de ICMS",
    quando: pj, opcoes: () => SIM_NAO,
    falas: () => ["A empresa é contribuinte de ICMS? Normalmente é quem vende mercadoria."],
    aplicar: (c, v) => ({ ...c, contribuinteIcms: v === "Sim", ie: v === "Sim" ? c.ie : "" }),
  },
  {
    id: "ie", tipo: "texto", grupo: "Fiscal", rotulo: "Inscrição estadual", placeholder: "Inscrição estadual",
    quando: (c) => pj(c) && c.contribuinteIcms === true,
    falas: () => ["Qual é a inscrição estadual?"],
    validar: exigir("Quem recolhe ICMS tem inscrição estadual. Qual é a sua?"),
    aplicar: (c, v) => ({ ...c, ie: v.trim() }),
  },
  {
    id: "im", tipo: "texto", grupo: "Fiscal", rotulo: "Inscrição municipal", placeholder: "Inscrição municipal", opcional: true,
    quando: pj,
    falas: () => ["E a inscrição municipal? Quem presta serviço costuma ter."],
    aplicar: (c, v) => ({ ...c, im: v.trim() }),
  },
  {
    id: "exportadora", tipo: "escolha", grupo: "Fiscal", rotulo: "Exportadora",
    quando: pj, opcoes: () => SIM_NAO,
    falas: () => ["A empresa exporta?"],
    aplicar: (c, v) => ({ ...c, exportadora: v === "Sim" }),
  },
  /* ── PJ · representante ───────────────────────────────────────────────── */
  {
    id: "repNome", tipo: "texto", grupo: "Representante", rotulo: "Seu nome", placeholder: "Seu nome completo",
    quando: pj,
    falas: () => ["Agora sobre você.", "Qual é o seu nome completo?"],
    validar: (v) => (v.trim().split(/\s+/).length >= 2 ? null : "Me passa o nome e o sobrenome, por favor."),
    aplicar: (c, v) => ({ ...c, repNome: v.trim().replace(/\s+/g, " ") }),
  },
  {
    id: "repCargo", tipo: "escolha", grupo: "Representante", rotulo: "Sua função",
    quando: pj, opcoes: () => FUNCOES,
    falas: (c) => [`Prazer, ${primeiro(c.repNome)}! Qual é a sua função na empresa?`],
    aplicar: (c, v) => ({ ...c, repCargo: v }),
  },
  {
    id: "repTelefone", tipo: "telefone", grupo: "Representante", rotulo: "WhatsApp", placeholder: "(00) 00000-0000",
    quando: pj,
    falas: () => ["Qual número de telefone você usa no **Whatsapp**?"],
    validar: (v) => (telefoneConfere(v) ? null : "O número tem DDD e 8 ou 9 dígitos. Confere pra mim?"),
    aplicar: (c, v) => ({ ...c, repTelefone: mascararTelefone(v) }),
    eco: mascararTelefone,
  },
  {
    id: "repEmail", tipo: "email", grupo: "Representante", rotulo: "E-mail", placeholder: "voce@suaempresa.com.br",
    quando: pj,
    falas: () => ["Qual é o seu e-mail?", "Usaremos para enviar notificações importantes sobre sua conta."],
    validar: (v) => (EMAIL_VALIDO.test(v.trim()) ? null : "Esse e-mail parece incompleto. Algo como voce@suaempresa.com.br."),
    aplicar: (c, v) => ({ ...c, repEmail: v.trim(), email: v.trim() }),
  },
  {
    id: "limite", tipo: "escolha", grupo: "Governança", rotulo: "Limite de aprovação",
    quando: pj, opcoes: () => [...LIMITES, NAO_APROVO],
    falas: () => ["Você aprova pagamentos? Se sim, até quanto por pagamento?"],
    aplicar: (c, v) => ({ ...c, limite: v }),
  },
  /* ── PJ · perfil ──────────────────────────────────────────────────────── */
  {
    id: "setor", tipo: "escolha", grupo: "Perfil", rotulo: "Setor", quando: pj, opcoes: () => SETORES,
    falas: () => ["Agora quero entender o negócio, que é o que mais me ajuda a te ajudar.", "Em que setor a empresa atua?"],
    aplicar: (c, v) => ({ ...c, setor: v }),
  },
  {
    id: "modelo", tipo: "escolha", grupo: "Perfil", rotulo: "Modelo de negócio", quando: pj, opcoes: () => MODELOS,
    falas: () => ["Qual é o modelo de negócio?"],
    aplicar: (c, v) => ({ ...c, modelo: v }),
  },
  {
    id: "receitaPrincipal", tipo: "escolha", grupo: "Perfil", rotulo: "Receita principal", quando: pj, opcoes: () => RECEITAS,
    falas: () => ["De onde vem a maior parte da receita?"],
    aplicar: (c, v) => ({ ...c, receitaPrincipal: v }),
  },
  {
    id: "frequencia", tipo: "escolha", grupo: "Perfil", rotulo: "Frequência da receita", quando: pj, opcoes: () => FREQ,
    falas: () => ["Com que frequência o dinheiro entra?"],
    aplicar: (c, v) => ({ ...c, frequencia: v }),
  },
  {
    id: "funcionarios", tipo: "escolha", grupo: "Perfil", rotulo: "Funcionários", quando: pj, opcoes: () => FUNC,
    falas: () => ["Quantas pessoas trabalham na empresa?"],
    aplicar: (c, v) => ({ ...c, funcionarios: v }),
  },
  {
    id: "faturamento", tipo: "escolha", grupo: "Perfil", rotulo: "Faturamento anual", quando: (c) => pj(c) && !c.faturamento, opcoes: () => FAT,
    falas: () => ["E o faturamento anual, mais ou menos?"],
    aplicar: (c, v) => ({ ...c, faturamento: v }),
  },
  {
    id: "bancos", tipo: "multi", grupo: "Perfil", rotulo: "Bancos", quando: pj, opcoes: () => BANCOS,
    falas: () => ["Em quais bancos a empresa tem conta? Pode marcar mais de um."],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos um banco."),
    aplicar: (c, v) => ({ ...c, bancos: lista(v) }),
  },
  {
    id: "meios", tipo: "multi", grupo: "Perfil", rotulo: "Meios de recebimento", quando: pj, opcoes: () => MEIOS,
    falas: () => ["Como os clientes pagam vocês?"],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos um meio de recebimento."),
    aplicar: (c, v) => ({ ...c, meiosRecebimento: lista(v) }),
  },
  {
    id: "despesas", tipo: "multi", grupo: "Perfil", rotulo: "Principais despesas", quando: pj, opcoes: () => DESPESAS,
    falas: () => ["Quais são as principais despesas?"],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos uma despesa."),
    aplicar: (c, v) => ({ ...c, despesas: lista(v) }),
  },
  {
    id: "descricao", tipo: "texto", grupo: "Perfil", rotulo: "Conte com suas palavras", placeholder: "O que a empresa faz e o que você quer acompanhar", opcional: true,
    quando: pj,
    falas: () => ["Quer me contar com as suas palavras o que a empresa faz e o que você mais quer acompanhar?"],
    validar: (v) => (v.length <= 500 ? null : "Cabe até 500 letras. Dá pra resumir?"),
    aplicar: (c, v) => ({ ...c, descricao: v.trim() }),
  },
  /* ── PJ · estrutura financeira ────────────────────────────────────────── */
  {
    id: "contaTipos", tipo: "multi", grupo: "Estrutura", rotulo: "Tipos de conta", quando: pj, opcoes: () => TIPOS_CONTA,
    inicial: () => ["Operacional"],
    falas: () => ["Falta pouco: vamos montar a estrutura financeira.", "Que tipos de conta a empresa usa?"],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos um tipo de conta."),
    aplicar: (c, v) => ({ ...c, contaTipos: lista(v) }),
  },
  {
    id: "centrosCusto", tipo: "multi", grupo: "Estrutura", rotulo: "Centros de custo", quando: pj, opcoes: () => CENTROS,
    falas: () => ["Quais centros de custo fazem sentido para vocês?"],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos um centro de custo."),
    aplicar: (c, v) => ({ ...c, centrosCusto: lista(v) }),
  },
  {
    id: "unidades", tipo: "multi", grupo: "Estrutura", rotulo: "Unidades de negócio", quando: pj, opcoes: () => UNIDADES,
    inicial: () => ["Matriz"],
    falas: () => ["E as unidades de negócio?"],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos uma unidade."),
    aplicar: (c, v) => ({ ...c, unidades: lista(v) }),
  },
  {
    id: "dre", tipo: "multi", grupo: "Estrutura", rotulo: "DRE desejado", quando: pj, opcoes: () => DRE_OPTS,
    inicial: () => ["Gerencial", "Por centro de custo"],
    falas: () => ["Como você quer ver o resultado (DRE)?"],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos uma visão do DRE."),
    aplicar: (c, v) => ({ ...c, dre: lista(v) }),
  },
  {
    id: "fluxoCaixa", tipo: "escolha", grupo: "Estrutura", rotulo: "Fluxo de caixa", quando: pj, opcoes: () => FLUXO_OPTS,
    destaque: () => "Híbrido",
    falas: () => ["E o fluxo de caixa, em qual visão?"],
    aplicar: (c, v) => ({ ...c, fluxoCaixa: v }),
  },
  /* ── PF ───────────────────────────────────────────────────────────────── */
  {
    id: "nome", tipo: "texto", grupo: "Você", rotulo: "Seu nome", placeholder: "Seu nome completo",
    quando: pf,
    falas: () => ["E qual é o seu nome completo?"],
    validar: (v) => (v.trim().split(/\s+/).length >= 2 ? null : "Me passa o nome e o sobrenome, por favor."),
    aplicar: (c, v) => ({ ...c, nome: v.trim().replace(/\s+/g, " ") }),
  },
  {
    id: "rendaMensal", tipo: "moeda", grupo: "Contas e renda", rotulo: "Renda mensal", placeholder: "R$ 0,00",
    quando: pf,
    falas: (c) => [`Prazer, ${primeiro(c.nome)}!`, "Quanto você recebe por mês, mais ou menos?"],
    validar: (v) => (lerValor(v) != null ? null : "Escreve só o valor, por exemplo 4.500,00."),
    aplicar: (c, v) => ({ ...c, rendaMensal: lerValor(v) }),
  },
  {
    id: "saldoInicial", tipo: "moeda", grupo: "Contas e renda", rotulo: "Saldo atual", placeholder: "R$ 0,00",
    quando: pf,
    falas: () => ["E quanto você tem hoje na conta principal?"],
    validar: (v) => (lerValor(v) != null ? null : "Escreve só o valor, por exemplo 1.200,00."),
    aplicar: (c, v) => ({ ...c, saldoInicial: lerValor(v) }),
  },
  {
    id: "carteiras", tipo: "multi", grupo: "Contas e renda", rotulo: "Contas e carteiras", quando: pf, opcoes: () => CARTEIRAS,
    inicial: () => ["Conta corrente"],
    falas: () => ["Onde fica o seu dinheiro? Pode marcar mais de uma."],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos uma conta."),
    aplicar: (c, v) => ({ ...c, carteiras: lista(v) }),
  },
  {
    id: "categorias", tipo: "multi", grupo: "Gastos", rotulo: "Categorias de gasto", quando: pf, opcoes: () => CATEGORIAS_PF,
    inicial: () => ["Moradia", "Mercado", "Transporte", "Lazer"],
    falas: () => ["Com o que você mais gasta no dia a dia?"],
    validar: (v) => (lista(v).length ? null : "Marca pelo menos uma categoria."),
    aplicar: (c, v) => ({ ...c, categorias: lista(v) }),
  },
  {
    id: "orcamento", tipo: "moeda", grupo: "Gastos", rotulo: "Orçamento mensal", placeholder: "R$ 0,00",
    quando: pf,
    falas: () => ["Quanto você quer gastar no máximo por mês?"],
    validar: (v) => (lerValor(v) != null ? null : "Escreve só o valor, por exemplo 3.000,00."),
    aplicar: (c, v) => ({ ...c, orcamento: lerValor(v) }),
  },
  {
    id: "descricaoPf", tipo: "texto", grupo: "Gastos", rotulo: "Conte com suas palavras", placeholder: "O que você quer controlar", opcional: true,
    quando: pf,
    falas: () => ["Quer me contar com as suas palavras o que você mais quer controlar?"],
    validar: (v) => (v.length <= 500 ? null : "Cabe até 500 letras. Dá pra resumir?"),
    aplicar: (c, v) => ({ ...c, descricao: v.trim() }),
  },
  {
    id: "emailPf", tipo: "email", grupo: "Acesso", rotulo: "E-mail", placeholder: "voce@email.com",
    quando: pf,
    falas: () => ["Qual e-mail você quer usar para entrar?"],
    validar: (v) => (EMAIL_VALIDO.test(v.trim()) ? null : "Esse e-mail parece incompleto. Algo como voce@email.com."),
    aplicar: (c, v) => ({ ...c, email: v.trim() }),
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

/** Os bancos da lista do Open Finance (nome como aparece na tela; o logo sai de `BancoLogo`). */
export const BANCOS_OPEN_FINANCE = [
  "Banco do Brasil", "Banco Inter PJ", "Banrisul", "Bradesco PJ", "BTG Pactual", "C6 Bank", "Caixa", "InfinitePay",
  "Itaú Empresas", "Mercado Pago", "Nubank PJ", "PagBank", "Santander Empresas", "Sicoob", "Sicredi", "Stone",
];

export const DUVIDAS_OPEN_FINANCE: { pergunta: string; resposta: string }[] = [
  {
    pergunta: "É seguro conectar meu banco?",
    resposta: "Sim. O Open Finance é regulado pelo Banco Central, e os seus dados viajam protegidos por medidas de segurança robustas. Com ele você tem uma visão mais ampla das suas finanças, num lugar só, e fica mais fácil acompanhar e comparar os seus serviços.",
  },
  {
    pergunta: "Como faço pra conectar meu banco?",
    resposta: "Você escolhe o banco, é levado ao aplicativo dele e autoriza o compartilhamento por lá. Leva cerca de um minuto, e você pode cancelar a autorização quando quiser, no próprio banco.",
  },
  {
    pergunta: "Ao conectar meu banco, vocês poderão mexer no dinheiro da minha conta?",
    resposta: "Não. A autorização é só de leitura: saldo, extrato e lançamentos. Nenhum pagamento ou transferência sai da sua conta por esta conexão.",
  },
  {
    pergunta: "O que fazer se der erro ao ser redirecionado do outro banco pra cá?",
    resposta: "Volte para esta tela e tente de novo. Se o erro continuar, siga preenchendo à mão: você conecta o banco depois, em Contas e bancos, sem perder nada do que já respondeu.",
  },
];

export const DICAS_FACIAL: { titulo: string; icone: string }[] = [
  { titulo: "Procure um lugar iluminado", icone: "sun" },
  { titulo: "Retire acessórios como óculos e bonés", icone: "glasses" },
  { titulo: "Posicione o rosto no centro da tela", icone: "scan-face" },
];

export const DICAS_DOCUMENTO: { titulo: string; icone: string }[] = [
  { titulo: "Procure um lugar iluminado", icone: "lightbulb" },
  { titulo: "Retire o documento do plástico", icone: "id-card" },
  { titulo: "Posicione seu documento em uma mesa plana", icone: "table" },
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

/**
 * A senha transacional: exatamente 6 dígitos, as duas iguais, e nada trivial
 * (todos iguais, ou sequência como 123456 / 654321) — é a primeira tentativa
 * de quem rouba o celular. `null` = pode salvar.
 */
export function problemaDaSenhaTransacional(senha: string, confirmar: string): string | null {
  if (!/^\d{6}$/.test(senha)) return "A senha tem 6 dígitos, só números.";
  if (/^(\d)\1{5}$/.test(senha)) return "Evite repetir o mesmo número.";
  const d = senha.split("").map(Number);
  const passo = d[1] - d[0];
  if ((passo === 1 || passo === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === passo)) return "Evite sequências como 123456.";
  if (senha !== confirmar) return "As duas senhas não são iguais.";
  return null;
}

/** Os passos que não são pergunta de campo: cada um tem o seu cartão. */
export type PassoEspecial = "openfinance" | "termos" | "infos" | "facial" | "docIdentidade" | "senhaTransacional";
export type Passo = { especial: PassoEspecial } | { pergunta: Pergunta };

/**
 * ⚠️ **A ORDEM DOS PRINTS vem primeiro**: depois do documento, Open Finance →
 * termos → WhatsApp → e-mail → faturamento e renda → reconhecimento facial
 * → documento de identidade (RG ou CNH) → senha transacional (na PF: Open
 * Finance → termos → facial → documento → senha transacional). Só então o resto do
 * cadastro, na ordem de `PERGUNTAS`. O portão (`faltandoParaCriar`) continua
 * o mesmo, e cobra os passos novos também.
 */
export function proximoPasso(c: Cadastro, feitos: ReadonlySet<string>): Passo | null {
  const roteiro = c.tipo === "pj"
    ? ["openfinance", "termos", "repTelefone", "repEmail", "infos", "facial", "docIdentidade", "senhaTransacional"]
    : c.tipo === "pf" ? ["openfinance", "termos", "facial", "docIdentidade", "senhaTransacional"] : [];
  for (const id of roteiro) {
    if (feitos.has(id)) continue;
    const p = PERGUNTAS.find((x) => x.id === id);
    return p ? { pergunta: p } : { especial: id as PassoEspecial };
  }
  const p = proximaPergunta(c, feitos);
  return p ? { pergunta: p } : null;
}

/** Quantos passos especiais valem para este cadastro (para o "x de y"). */
export function passosEspeciais(c: Cadastro): number {
  return c.tipo === "pj" ? 6 : c.tipo === "pf" ? 5 : 0;
}

/**
 * A próxima pergunta: a primeira que vale para este cadastro e ainda não foi
 * respondida. `null` = acabaram (falta só a senha).
 */
export function proximaPergunta(c: Cadastro, respondidas: ReadonlySet<string>): Pergunta | null {
  return PERGUNTAS.find((p) => (p.quando ? p.quando(c) : true) && !respondidas.has(p.id)) ?? null;
}

/** Quantas perguntas valem para este cadastro (para o "x de y"). */
export function perguntasDoCadastro(c: Cadastro): Pergunta[] {
  return PERGUNTAS.filter((p) => (p.quando ? p.quando(c) : true));
}

/**
 * ⚠️ **O PORTÃO DA CRIAÇÃO.** A conta só nasce com isto vazio — é a regra que
 * a conversa de três perguntas não tinha. Cada item diz em português o que
 * falta, para a tela poder voltar à pergunta certa.
 */
export function faltandoParaCriar(c: Cadastro): string[] {
  const f: string[] = [];
  const vazio = (s: string) => !s.trim();
  if (!EMAIL_VALIDO.test(c.email.trim())) f.push("e-mail de acesso");
  if (c.tipo && !c.aceiteTermos) f.push("aceite dos termos de uso");
  if (c.tipo && !c.biometria) f.push("reconhecimento facial");
  if (c.tipo && !c.documento) f.push("documento de identidade");
  if (c.tipo && !c.senhaTransacional) f.push("senha transacional");
  if (c.tipo === "pj") {
    if (!cnpjConfere(c.cnpj)) f.push("CNPJ");
    if (vazio(c.razaoSocial)) f.push("razão social");
    if (vazio(c.cidade) || vazio(c.estado)) f.push("cidade e UF");
    if (c.cep.replace(/\D/g, "").length !== 8 || vazio(c.numero)) f.push("endereço (CEP e número)");
    if (!REGIMES_DA_CONVERSA.includes(c.regime)) f.push("regime tributário");
    if (c.contribuinteIcms == null) f.push("contribuinte de ICMS");
    if (c.contribuinteIcms && vazio(c.ie)) f.push("inscrição estadual");
    if (c.exportadora == null) f.push("se exporta");
    if (vazio(c.repNome)) f.push("nome do representante");
    if (vazio(c.repCargo)) f.push("função do representante");
    if (!telefoneConfere(c.repTelefone)) f.push("WhatsApp");
    if (vazio(c.limite)) f.push("limite de aprovação");
    if (vazio(c.rendaRepresentante)) f.push("renda do representante");
    for (const [k, rot] of [["setor", "setor"], ["modelo", "modelo de negócio"], ["receitaPrincipal", "receita principal"], ["frequencia", "frequência da receita"], ["funcionarios", "número de funcionários"], ["faturamento", "faturamento anual"], ["fluxoCaixa", "visão do fluxo de caixa"]] as const) {
      if (vazio(c[k])) f.push(rot);
    }
    for (const [k, rot] of [["bancos", "bancos"], ["meiosRecebimento", "meios de recebimento"], ["despesas", "principais despesas"], ["contaTipos", "tipos de conta"], ["centrosCusto", "centros de custo"], ["unidades", "unidades de negócio"], ["dre", "visão do DRE"]] as const) {
      if (!c[k].length) f.push(rot);
    }
  } else if (c.tipo === "pf") {
    if (!cpfConfere(c.cpf)) f.push("CPF");
    if (vazio(c.nome)) f.push("nome");
    if (c.rendaMensal == null) f.push("renda mensal");
    if (c.saldoInicial == null) f.push("saldo atual");
    if (!c.carteiras.length) f.push("contas e carteiras");
    if (!c.categorias.length) f.push("categorias de gasto");
    if (c.orcamento == null) f.push("orçamento mensal");
  } else {
    f.push("tipo de conta");
  }
  return f;
}

/** O nome da organização no `signUp`: a razão social (é o que sai na nota) ou o nome da pessoa. */
export function nomeDaOrganizacao(c: Cadastro): string {
  return c.tipo === "pf" ? c.nome.trim() : (c.razaoSocial.trim() || c.fantasia.trim());
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
  if (c.tipo === "pf") {
    const nome = c.nome.trim();
    return {
      db: {
        tipoConta: "pessoal", tipoPessoa: "fisica", cpf: mascararCPF(c.cpf), repNome: nome, repEmail: c.email.trim(), razaoSocial: nome, fantasia: nome,
        aceiteTermos: c.aceiteTermos, biometria: c.biometria,
        documentoIdentidade: c.documento, ...(c.docTipo ? { documentoTipo: c.docTipo } : {}), senhaTransacional: c.senhaTransacional,
        ...(c.openFinanceBanco ? { openFinanceBanco: c.openFinanceBanco } : {}),
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
  return {
    db: {
      tipoConta: "empresa", tipoPessoa: "juridica",
      cnpj: mascararCNPJ(c.cnpj), razaoSocial: c.razaoSocial.trim(), fantasia: c.fantasia.trim(),
      fundacao: c.fundacao, porte: c.porte,
      cep: c.cep, rua: c.rua, numero: c.numero, bairro: c.bairro, cidade: c.cidade, estado: c.estado, pais: "Brasil",
      regime: c.regime, contribuinteIcms: !!c.contribuinteIcms, ie: c.ie, im: c.im, exportadora: !!c.exportadora,
      repNome: c.repNome.trim(), repCargo: c.repCargo, repTelefone: c.repTelefone, repEmail: c.repEmail.trim(),
      repRenda: c.rendaRepresentante, aceiteTermos: c.aceiteTermos, biometria: c.biometria,
      documentoIdentidade: c.documento, ...(c.docTipo ? { documentoTipo: c.docTipo } : {}), senhaTransacional: c.senhaTransacional,
      ...(c.openFinanceBanco ? { openFinanceBanco: c.openFinanceBanco } : {}),
    },
    perfil: {
      setor: c.setor, modelo: c.modelo, receitaPrincipal: c.receitaPrincipal, frequencia: c.frequencia,
      funcionarios: c.funcionarios, faturamento: c.faturamento,
      bancos: c.bancos, meiosRecebimento: c.meiosRecebimento, despesas: c.despesas,
      ...(c.descricao.trim() ? { descricao: c.descricao.trim() } : {}),
    },
    participantes,
    estrutura: {
      contas: c.contaTipos.map((t) => ({ banco: c.bancos[0] ?? "—", tipo: t })),
      centrosCusto: c.centrosCusto, unidades: c.unidades, dre: c.dre, fluxoCaixa: c.fluxoCaixa,
    },
  };
}
