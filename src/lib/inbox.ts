/**
 * Caixa de Entrada Financeira — dataset de demonstração.
 * Modela o que a "Inbox Financeira" recebe e o que o Document Intelligence
 * extrai/cruza. Demo-safe; em produção os documentos chegam por upload, e-mail,
 * WhatsApp, Open Finance, OCR, etc. e são processados pela IA.
 */
export type DocStatus = "novo" | "analise" | "pronto" | "revisao" | "lancado" | "processado" | "arquivado";

export const STATUS_META: Record<DocStatus, { label: string; dot: string }> = {
  novo: { label: "Novo", dot: "#E8821E" },
  analise: { label: "Em análise", dot: "#4F86C6" },
  pronto: { label: "Pronto para lançar", dot: "#3F8F5B" },
  revisao: { label: "Não identificado", dot: "#C2473D" },
  lancado: { label: "Lançado", dot: "#DCFF00" },
  processado: { label: "Lançado", dot: "#DCFF00" },
  arquivado: { label: "Arquivado", dot: "#959595" },
};

/** Abas da fila (estados macro). Cada aba agrupa um conjunto de status. */
export type AbaId = "pendentes" | "nao_identificados" | "lancados" | "arquivo";
export const ABAS: { id: AbaId; label: string }[] = [
  { id: "pendentes", label: "Pendentes" },
  { id: "nao_identificados", label: "Não identificados" },
  { id: "lancados", label: "Lançados" },
  { id: "arquivo", label: "Arquivo" },
];
export function abaDe(status: DocStatus): AbaId {
  if (status === "arquivado") return "arquivo";
  if (status === "lancado" || status === "processado") return "lancados";
  if (status === "revisao") return "nao_identificados";
  return "pendentes"; // novo · analise · pronto
}

export interface ConfRow { campo: string; confianca: number }

export interface InboxDoc {
  id: string;
  tipo: string; // Boleto, PIX, Nota, DARF, Folha…
  canal: string; // Upload, E-mail, WhatsApp, Open Finance, OCR…
  beneficiario: string;
  valor: number;
  data: string; // ISO recebido/emitido
  vencimento?: string;
  status: DocStatus;
  confianca: number; // 0..1 agregada
  acao: string; // ação financeira detectada
  acaoTipo: "a_pagar" | "a_receber" | "entrada" | "baixa" | "transferencia" | "imposto";
  categoria?: string;
  centroCusto?: string;
  recorrencia?: string;
  conta?: string;
  crossCheck?: string; // resultado do cruzamento
  novoBeneficiario?: boolean;
  matriz: ConfRow[];
  // Digital Twin / contexto recorrente
  contexto?: string;
}

const hoje = new Date();
const iso = (d: number) => {
  const x = new Date(hoje);
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

export const DEMO_INBOX: InboxDoc[] = [
  {
    id: "doc-vivo",
    tipo: "Boleto",
    canal: "E-mail",
    beneficiario: "Vivo S.A.",
    valor: 590,
    data: iso(-1),
    vencimento: iso(2),
    status: "pronto",
    confianca: 0.99,
    acao: "Agendar pagamento",
    acaoTipo: "a_pagar",
    categoria: "Internet / telecom",
    centroCusto: "Administrativo",
    recorrencia: "Mensal",
    conta: "BTG",
    crossCheck: "Fornecedor Vivo já cadastrado · recorrência detectada (8 pagamentos) · média R$ 588 — este está 0,3% acima.",
    matriz: [
      { campo: "Documento", confianca: 1 },
      { campo: "Beneficiário", confianca: 0.99 },
      { campo: "Valor", confianca: 1 },
      { campo: "Vencimento", confianca: 1 },
      { campo: "Categoria", confianca: 0.94 },
      { campo: "Centro de custo", confianca: 0.88 },
      { campo: "Recorrência", confianca: 0.97 },
      { campo: "Conta bancária", confianca: 0.99 },
      { campo: "Ação financeira", confianca: 0.98 },
    ],
    contexto: "Despesa recorrente de internet · todo dia ~10 · unidade Campinas.",
  },
  {
    id: "doc-pix-cliente",
    tipo: "Comprovante PIX",
    canal: "WhatsApp",
    beneficiario: "Northwind Logística",
    valor: 18990,
    data: iso(0),
    status: "pronto",
    confianca: 0.97,
    acao: "Confirmar recebimento",
    acaoTipo: "entrada",
    categoria: "Venda de produtos",
    conta: "Itaú",
    crossCheck: "Bate com a venda VD-1041 e a NF emitida · recebimento confirmado.",
    matriz: [
      { campo: "Documento", confianca: 1 },
      { campo: "Pagador", confianca: 0.98 },
      { campo: "Valor", confianca: 1 },
      { campo: "Chave PIX", confianca: 0.95 },
      { campo: "Nota fiscal", confianca: 0.96 },
      { campo: "Ação financeira", confianca: 0.97 },
    ],
  },
  {
    id: "doc-folha",
    tipo: "Folha de pagamento",
    canal: "Upload",
    beneficiario: "Folha · junho",
    valor: 62625.61,
    data: iso(-2),
    vencimento: iso(-1),
    status: "processado",
    confianca: 0.96,
    acao: "Baixa registrada",
    acaoTipo: "baixa",
    categoria: "Folha de pagamento",
    centroCusto: "RH",
    recorrencia: "Mensal",
    conta: "Bradesco",
    crossCheck: "Recorrência mensal · todo dia 5 · dentro da média.",
    matriz: [
      { campo: "Documento", confianca: 1 },
      { campo: "Valor", confianca: 0.97 },
      { campo: "Competência", confianca: 0.95 },
      { campo: "Categoria", confianca: 0.99 },
    ],
    contexto: "Folha recorrente · todo dia 5.",
  },
  {
    id: "doc-darf",
    tipo: "DARF",
    canal: "Open Finance",
    beneficiario: "Receita Federal",
    valor: 8936.08,
    data: iso(0),
    vencimento: iso(6),
    status: "analise",
    confianca: 0.91,
    acao: "Agendar pagamento",
    acaoTipo: "imposto",
    categoria: "Impostos e taxas",
    centroCusto: "Financeiro",
    conta: "Itaú",
    crossCheck: "Código de barras lido · tributo federal · sem recorrência fixa.",
    matriz: [
      { campo: "Documento", confianca: 0.99 },
      { campo: "Código de barras", confianca: 0.97 },
      { campo: "Valor", confianca: 1 },
      { campo: "Vencimento", confianca: 1 },
      { campo: "Categoria", confianca: 0.9 },
      { campo: "Ação financeira", confianca: 0.86 },
    ],
  },
  {
    id: "doc-padaria",
    tipo: "Comprovante TED",
    canal: "OCR · foto",
    beneficiario: "PADARIA123",
    valor: 1240,
    data: iso(0),
    status: "revisao",
    confianca: 0.62,
    acao: "Classificar despesa",
    acaoTipo: "a_pagar",
    novoBeneficiario: true,
    crossCheck: "Beneficiário não cadastrado. Encontramos 'Padaria123 LTDA' com mesmo CNPJ/PIX no histórico — vincular?",
    matriz: [
      { campo: "Documento", confianca: 0.92 },
      { campo: "Beneficiário", confianca: 0.6 },
      { campo: "Valor", confianca: 0.98 },
      { campo: "Categoria", confianca: 0.55 },
      { campo: "Ação financeira", confianca: 0.7 },
    ],
  },
];

/** Canais de entrada da Inbox. */
export const INBOX_CANAIS: { icon: string; titulo: string; desc: string; pronto: boolean }[] = [
  { icon: "upload", titulo: "Upload / arrastar", desc: "PDF, PNG, JPG, OFX, Excel, CSV, XML, DANFE, NFS-e…", pronto: true },
  { icon: "mail", titulo: "E-mail", desc: "financeiro@suaempresa.all4pay.com — tudo cai aqui", pronto: true },
  { icon: "sparkles", titulo: "WhatsApp", desc: "Envie o documento para a IA", pronto: false },
  { icon: "network", titulo: "Open Finance", desc: "Busca automática nas contas conectadas", pronto: false },
  { icon: "layers", titulo: "API / ERP / banco", desc: "Integrações e marketplaces", pronto: false },
  { icon: "scan-line", titulo: "OCR / scanner", desc: "Foto ou PDF do documento — lê valor, vencimento e dados", pronto: false },
  { icon: "database", titulo: "Monitoramento", desc: "Pasta no Drive, Dropbox, OneDrive", pronto: false },
];
