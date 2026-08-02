/**
 * ADMINISTRAÇÃO — assinatura, cadastro da empresa, usuários, logs, integrações
 * e a fila de exportações.
 *
 * É a camada de CONFIGURAÇÃO: nada aqui apura dinheiro. O que ela faz é
 * governar quem entra, o que se conecta e o que sai — e por isso as regras que
 * valem a pena estão todas do lado de negar: não remover o último admin, não
 * mostrar um segredo de volta, não fingir que um log fora da janela de retenção
 * simplesmente não existe.
 *
 * Puro, tipado, demo-safe. Versão administracao/1.0.0.
 */

export const ADMINISTRACAO_VERSION = "administracao/1.0.0";

const DIA = 86_400_000;

/**
 * Diferença em dias de CALENDÁRIO, não em 24h corridas.
 *
 * ⚠️ Fatiado da string e comparado em UTC: `new Date("2026-08-10")` é meia-noite
 * UTC e, lido em UTC-3, `getDate()` devolve o dia 9. Um "expira em 8 dias" que
 * vira 7 depois das 21h é o tipo de erro que ninguém reporta e todo mundo
 * desconfia.
 */
export function diasEntre(deISO: string, ateISO: string): number {
  const d = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);
  return Math.round((d(ateISO) - d(deISO)) / DIA);
}

/* ================================ assinatura ================================ */

export interface ContaBancariaPanorama {
  id: string;
  nome: string;
  /** Conectada via Open Finance. */
  conectada: boolean;
  /** O banco tem conector homologado — dá para conectar. */
  elegivel: boolean;
}

export interface PanoramaAssinatura {
  plano: string;
  empresaId: string;
  planoContratado: string;
  expiracao: string | null;
  diasRestantes: number | null;
  expirado: boolean;
  usuariosAtivos: number;
  donoAtivo: boolean;
  contasCadastradas: number;
  contasConectadas: number;
  /** Bancos com conector disponível que ninguém ligou — o trabalho a fazer. */
  elegiveisSemConexao: number;
  receberNFs: boolean;
  emitirNFs: boolean;
  plataformasConectadas: number;
}

export interface EntradaAssinatura {
  hoje: string;
  plano: string;
  empresaId: string;
  planoContratado: string | null;
  expiracao: string | null;
  usuariosAtivos: number;
  donoAtivo: boolean;
  contas: ContaBancariaPanorama[];
  receberNFs: boolean;
  emitirNFs: boolean;
  plataformasConectadas: number;
}

export function panoramaAssinatura(e: EntradaAssinatura): PanoramaAssinatura {
  const dias = e.expiracao ? diasEntre(e.hoje, e.expiracao) : null;
  return {
    plano: e.plano,
    empresaId: e.empresaId,
    // "Não informado" é mais honesto que repetir o nome do plano: o campo vem
    // do contrato, e inventá-lo esconderia que ninguém o preencheu.
    planoContratado: e.planoContratado || "Não informado",
    expiracao: e.expiracao,
    diasRestantes: dias,
    expirado: dias != null && dias < 0,
    usuariosAtivos: e.usuariosAtivos,
    donoAtivo: e.donoAtivo,
    contasCadastradas: e.contas.length,
    contasConectadas: e.contas.filter((c) => c.conectada).length,
    elegiveisSemConexao: e.contas.filter((c) => c.elegivel && !c.conectada).length,
    receberNFs: e.receberNFs,
    emitirNFs: e.emitirNFs,
    plataformasConectadas: e.plataformasConectadas,
  };
}

/* ============================= dados da empresa ============================= */

export type TipoPessoa = "juridica" | "fisica";
export type StatusEmpresa = "ativa" | "inativa";

export const SEGMENTOS = [
  "Serviços", "Comércio", "Indústria", "Tecnologia", "Educação", "Saúde",
  "Alimentação", "Construção", "Transporte", "Agronegócio", "Outro",
];

export type RegimeTributario = "simples" | "presumido" | "real" | "mei";

export const REGIMES: { id: RegimeTributario; label: string }[] = [
  { id: "simples", label: "Simples Nacional" },
  { id: "presumido", label: "Lucro Presumido" },
  { id: "real", label: "Lucro Real" },
  { id: "mei", label: "MEI" },
];

/**
 * O regime DECIDE se a empresa é optante pelo Simples — não é uma segunda
 * caixinha para marcar. Dois campos independentes acabariam divergindo, e a
 * divergência vira imposto calculado errado.
 */
export const optantePeloSimples = (r: RegimeTributario): boolean =>
  r === "simples" || r === "mei";

export interface DadosEmpresa {
  tipoPessoa: TipoPessoa;
  documento: string;
  razaoSocial: string;
  nomeFantasia: string;
  dataFundacao: string;
  segmento: string;
  faturamentoMensal: number;
  identificadorEstrangeiro: string;
  status: StatusEmpresa;
  inscricaoEstadual: string;
  inscricaoMunicipal: string;
  contribuinteICMS: boolean;
  regime: RegimeTributario;
  regimeEspecialNFSe: string;
  pais: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  estado: string;
  cidade: string;
  email: string;
  site: string;
  ddi: string;
  telefone: string;
  notificacoesEmail: boolean;
  observacaoInterna: string;
  logo: string | null;
}

export interface ContatoEmpresa {
  nome: string;
  email: string;
  ddi: string;
  telefone: string;
  whatsapp: string;
}

export const LIMITE_LOGO = 5 * 1024 * 1024;
export const FORMATOS_LOGO = [".png", ".jpg", ".jpeg", ".webp"];
/** Abaixo disso o logo aparece borrado em qualquer relatório impresso. */
export const LADO_MINIMO_LOGO = 200;

export function logoAceito(nome: string, tamanho: number): string | null {
  const ext = `.${(nome.split(".").pop() ?? "").toLowerCase()}`;
  if (!FORMATOS_LOGO.includes(ext)) return `Formato ${ext} não aceito — use PNG, JPG ou WebP.`;
  if (tamanho > LIMITE_LOGO) return "Arquivo acima de 5 MB.";
  return null;
}

const soDigitos = (s: string) => (s ?? "").replace(/\D/g, "");

export function validarDadosEmpresa(d: Partial<DadosEmpresa>): Record<string, string> {
  const e: Record<string, string> = {};
  const doc = soDigitos(d.documento ?? "");
  if (!doc) e.documento = d.tipoPessoa === "fisica" ? "Informe o CPF." : "Informe o CNPJ.";
  else if (d.tipoPessoa === "fisica" ? doc.length !== 11 : doc.length !== 14) {
    e.documento = d.tipoPessoa === "fisica" ? "CPF deve ter 11 dígitos." : "CNPJ deve ter 14 dígitos.";
  }
  if (!(d.razaoSocial ?? "").trim()) e.razaoSocial = "Informe a razão social.";
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = "E-mail inválido.";
  if (d.site && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}/i.test(d.site)) e.site = "Site inválido.";
  const cep = soDigitos(d.cep ?? "");
  if (cep && cep.length !== 8) e.cep = "CEP deve ter 8 dígitos.";
  if ((d.faturamentoMensal ?? 0) < 0) e.faturamentoMensal = "Faturamento não pode ser negativo.";
  return e;
}

/* ================================= usuários ================================= */

export type PerfilUsuario = "admin" | "financeiro" | "operacional" | "leitura";

export const PERFIS: { id: PerfilUsuario; label: string; descricao: string }[] = [
  { id: "admin", label: "Admin", descricao: "Acesso total, inclusive configurações e usuários." },
  { id: "financeiro", label: "Financeiro", descricao: "Lança, baixa e concilia; não mexe em usuários." },
  { id: "operacional", label: "Operacional", descricao: "Cadastra e lança; não vê relatórios executivos." },
  { id: "leitura", label: "Leitura", descricao: "Só consulta — não altera nada." },
];

export interface UsuarioEmpresa {
  id: string;
  nome: string;
  email: string;
  perfil: PerfilUsuario;
  dono: boolean;
}

/**
 * ⚠️ Não se remove o último admin.
 *
 * Uma organização sem administrador não tem quem convide outro — e nenhuma tela
 * do sistema conseguiria desfazer, porque desfazer exige o papel que acabou de
 * sumir. O dono também não sai por aqui: a titularidade da conta se transfere,
 * não se apaga.
 */
export function podeRemover(usuarios: UsuarioEmpresa[], id: string): string | null {
  const alvo = usuarios.find((u) => u.id === id);
  if (!alvo) return "Usuário não encontrado.";
  if (alvo.dono) return "O dono da conta não pode ser removido — transfira a titularidade antes.";
  const admins = usuarios.filter((u) => u.perfil === "admin");
  if (alvo.perfil === "admin" && admins.length <= 1) {
    return "Este é o único administrador. Promova outro usuário antes de remover.";
  }
  return null;
}

/** Rebaixar o último admin tem exatamente o mesmo efeito de removê-lo. */
export function podeTrocarPerfil(
  usuarios: UsuarioEmpresa[],
  id: string,
  novo: PerfilUsuario,
): string | null {
  const alvo = usuarios.find((u) => u.id === id);
  if (!alvo) return "Usuário não encontrado.";
  if (alvo.perfil === "admin" && novo !== "admin") {
    const admins = usuarios.filter((u) => u.perfil === "admin");
    if (admins.length <= 1) return "Este é o único administrador — promova outro antes de rebaixá-lo.";
  }
  return null;
}

const semAcento = (s: string) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function filtrarUsuarios(usuarios: UsuarioEmpresa[], busca: string): UsuarioEmpresa[] {
  const q = semAcento(busca).trim();
  if (!q) return usuarios;
  return usuarios.filter((u) => semAcento(`${u.nome} ${u.email}`).includes(q));
}

/* =================================== logs =================================== */

/** A retenção do histórico. Ver `periodoForaDaJanela`. */
export const JANELA_LOGS_DIAS = 30;

export type AcaoLog = "criou" | "alterou" | "removeu" | "importou" | "exportou" | "acessou";

export const ACOES_LOG: { id: AcaoLog; label: string }[] = [
  { id: "criou", label: "Criou" },
  { id: "alterou", label: "Alterou" },
  { id: "removeu", label: "Removeu" },
  { id: "importou", label: "Importou" },
  { id: "exportou", label: "Exportou" },
  { id: "acessou", label: "Acessou" },
];

export const ORIGENS_LOG = ["Web", "API", "Importação", "Automação", "Integração"];

export const TIPOS_ENTIDADE = [
  "Lançamento", "Conta bancária", "Cliente", "Fornecedor", "Produto",
  "Venda", "Compra", "Nota fiscal", "Usuário", "Configuração",
];

export interface RegistroLog {
  id: string;
  quando: string;
  acao: AcaoLog;
  usuario: string;
  origem: string;
  tipoEntidade: string;
  entidadeId: string;
  entidade: string;
  resumo: string;
}

export interface FiltroLogs {
  de?: string | null;
  ate?: string | null;
  usuario?: string | "todos";
  busca?: string;
  acao?: AcaoLog | "todas";
  origem?: string | "todas";
  tipoEntidade?: string | "todos";
  entidadeId?: string | "todas";
}

/**
 * ⚠️ Pedir um período fora da janela de retenção precisa AVISAR.
 *
 * Devolver lista vazia diria "nada aconteceu naquele mês" quando a verdade é
 * "isso já foi descartado" — e é justamente numa auditoria que a diferença
 * entre as duas frases importa.
 */
export function periodoForaDaJanela(hojeISO: string, deISO?: string | null): boolean {
  if (!deISO) return false;
  return diasEntre(deISO, hojeISO) > JANELA_LOGS_DIAS;
}

export function filtrarLogs(logs: RegistroLog[], f: FiltroLogs = {}): RegistroLog[] {
  const q = semAcento(f.busca ?? "").trim();
  return logs.filter((l) => {
    const dia = l.quando.slice(0, 10);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;
    if (f.usuario && f.usuario !== "todos" && l.usuario !== f.usuario) return false;
    if (f.acao && f.acao !== "todas" && l.acao !== f.acao) return false;
    if (f.origem && f.origem !== "todas" && l.origem !== f.origem) return false;
    if (f.tipoEntidade && f.tipoEntidade !== "todos" && l.tipoEntidade !== f.tipoEntidade) return false;
    if (f.entidadeId && f.entidadeId !== "todas" && l.entidadeId !== f.entidadeId) return false;
    // A busca varre o RESUMO, que é onde mora o "de X para Y" — filtrar só pelo
    // nome da entidade não acharia "mudou o valor de 1.000 para 10.000".
    if (q && !semAcento(`${l.resumo} ${l.entidade} ${l.usuario}`).includes(q)) return false;
    return true;
  });
}

/* ============================== integrações ============================== */

export type StatusIntegracao = "ativa" | "inativa" | "atencao";

export interface CartaoIntegracao {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
}

export const CATALOGO_INTEGRACOES: CartaoIntegracao[] = [
  {
    id: "plataformas", titulo: "Plataformas de vendas", icone: "link",
    descricao: "Conexões com Hotmart, Kiwify, Eduzz, Asaas, Stripe e demais gateways para importar vendas automaticamente.",
  },
  {
    id: "emissao-nf", titulo: "Emissão de notas fiscais", icone: "file-text",
    descricao: "Emissão de NFS-e e NF-e direto pela plataforma — certificado digital, série, RPS e padrões tributários.",
  },
  {
    id: "receber-nf", titulo: "Receber NFs de fornecedores", icone: "receipt",
    descricao: "Captura automática de XMLs (NF-e, NFS-e, CT-e) a cada madrugada via certificado digital da empresa.",
  },
  {
    id: "contabil", titulo: "Integração contábil (Domínio)", icone: "layers",
    descricao: "Envio automático de NFs emitidas/recebidas e de extratos bancários para o sistema do seu contador.",
  },
  {
    id: "dda", titulo: "DDA boletos", icone: "credit-card",
    descricao: "Débito Direto Autorizado: receba na plataforma todos os boletos emitidos contra o seu CNPJ via CIP.",
  },
  {
    id: "open-finance", titulo: "Open Finance", icone: "building",
    descricao: "Sincronização automática de extratos e saldos bancários das contas conectadas via Open Finance.",
  },
  {
    id: "apis", titulo: "APIs da plataforma", icone: "workflow",
    descricao: "Tokens e endpoints da API pública para exportar dados e automatizar os seus processos.",
  },
  {
    id: "mcp", titulo: "MCP", icone: "cpu",
    descricao: "Permita que IAs consultem os dados financeiros da empresa via Model Context Protocol — tokens com escopo controlado.",
  },
];

export const PLATAFORMAS_VENDAS = [
  "Conta all4pay", "Asaas", "Hotmart", "Digital Guru", "Eduzz", "Ticto",
  "Kiwify", "Stripe", "TMB", "Hubla", "Visage", "B4you", "BassPago",
  "OnProfit", "Greenn", "Pagar.me", "TikTok Shop", "Bling",
];

export const BANCOS_OPEN_FINANCE = [
  "Banco do Brasil", "Banco do Nordeste", "Santander", "Inter", "XP", "Caixa",
  "Unicred", "Itaú BBA", "Stone", "BTG", "Bradesco", "Nubank", "C6",
  "Itaú Unibanco", "Rabobank", "Sicredi", "Bancoob", "Mercado Pago",
  "Conta Simples",
];

/** O consentimento do Open Finance vale 12 meses — é regra do Banco Central. */
export const CONSENTIMENTO_MESES = 12;

/** Avisar a partir daqui: renovar depois de vencer significa extrato parado. */
export const AVISAR_CONSENTIMENTO_DIAS = 30;

export interface Consentimento {
  vence: string;
  diasRestantes: number;
  vencido: boolean;
  /** Entrou na janela de aviso — a sincronização ainda roda, mas vai parar. */
  aVencer: boolean;
}

export function consentimentoOpenFinance(concedidoISO: string, hojeISO: string): Consentimento {
  const [a, m, d] = concedidoISO.slice(0, 10).split("-").map(Number);
  const venc = new Date(Date.UTC(a + 1, m - 1, d));
  const vence = venc.toISOString().slice(0, 10);
  const dias = diasEntre(hojeISO, vence);
  return { vence, diasRestantes: dias, vencido: dias < 0, aVencer: dias >= 0 && dias <= AVISAR_CONSENTIMENTO_DIAS };
}

/**
 * ⚠️ Um segredo NUNCA volta na tela.
 *
 * Chave de API, token e senha de certificado se mostram UMA vez, no momento em
 * que nascem. Reexibi-los transforma qualquer sessão aberta, print de tela ou
 * acesso de leitura num vazamento — e o dono do dado não tem como saber que
 * vazou. Depois disso resta o prefixo (para reconhecer QUAL chave é) e os
 * quatro últimos dígitos.
 */
export function mascararSegredo(segredo: string): string {
  const s = (segredo ?? "").trim();
  if (!s) return "";
  if (s.length <= 8) return "••••";
  const prefixo = s.includes("_") ? s.slice(0, s.indexOf("_") + 1) : s.slice(0, 4);
  return `${prefixo}••••${s.slice(-4)}`;
}

/** Certificado A1 vencido = captura de NF parada. A tela precisa dizer isso. */
export function certificadoValido(validadeISO: string | null, hojeISO: string): boolean {
  return validadeISO != null && diasEntre(hojeISO, validadeISO) >= 0;
}

/* ========================= relatórios exportados ========================= */

export type FormatoExport = "pdf" | "xlsx";

/**
 * Os limiares que jogam a exportação para a fila.
 *
 * Abaixo deles o arquivo baixa na hora, direto da tela de origem, e NÃO entra
 * nesta lista — registrar toda exportação transformaria a fila num log inútil,
 * onde o relatório de 40 mil linhas que a pessoa está esperando se perde entre
 * cinquenta downloads instantâneos.
 */
export const LIMITE_PDF_LINHAS = 300;
export const LIMITE_XLSX_LINHAS = 5_000;

export const precisaFila = (formato: FormatoExport, linhas: number): boolean =>
  formato === "pdf" ? linhas > LIMITE_PDF_LINHAS : linhas > LIMITE_XLSX_LINHAS;

/** O arquivo fica disponível por 15 dias. */
export const DIAS_RETENCAO_EXPORT = 15;

export type StatusExport = "processando" | "pronto" | "erro" | "expirado";

export interface Exportacao {
  id: string;
  relatorio: string;
  nomeArquivo: string;
  formato: FormatoExport;
  linhas: number;
  exportadoEm: string;
  status: Exclude<StatusExport, "expirado">;
}

export const expiraEm = (exportadoEmISO: string): string => {
  const t = Date.parse(`${exportadoEmISO.slice(0, 10)}T00:00:00Z`) + DIAS_RETENCAO_EXPORT * DIA;
  return new Date(t).toISOString().slice(0, 10);
};

/**
 * ⚠️ Exportação expirada continua NA LISTA, marcada como expirada.
 *
 * Sumir com ela faria parecer que a exportação nunca aconteceu — e quem está
 * procurando o arquivo que recebeu por e-mail há vinte dias precisa entender
 * que ele existiu e caducou, não que se enganou.
 */
export function statusExportacao(e: Exportacao, hojeISO: string): StatusExport {
  if (e.status !== "pronto") return e.status;
  return diasEntre(hojeISO, expiraEm(e.exportadoEm)) < 0 ? "expirado" : "pronto";
}

export interface FiltroExportacoes {
  de?: string | null;
  ate?: string | null;
  formato?: FormatoExport | "todos";
  relatorio?: string | "todos";
}

export function filtrarExportacoes(lista: Exportacao[], f: FiltroExportacoes = {}): Exportacao[] {
  return lista.filter((e) => {
    const dia = e.exportadoEm.slice(0, 10);
    if (f.de && dia < f.de) return false;
    if (f.ate && dia > f.ate) return false;
    if (f.formato && f.formato !== "todos" && e.formato !== f.formato) return false;
    if (f.relatorio && f.relatorio !== "todos" && e.relatorio !== f.relatorio) return false;
    return true;
  });
}
