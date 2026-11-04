import { lerBancoConectavel, type BancoConectavel, type DevedorCobranca, type PedidoCobrancaBanco, type TipoCobrancaBanco } from "@/core/cobranca-banco";

/**
 * A CONTA BANCÁRIA CONECTADA e a RESERVA genérica (`cobranca-banco-conexao/1.0.0`),
 * etapa 3 de `docs/rodada-11/cobranca-bancos.md`. Puro: lê o que o banco de
 * dados devolve (`cobranca_banco_reservar`, `cobranca_banco_credencial`) e
 * confere o formulário de conexão. Quem cifra é `lib/cobranca-banco/cofre`;
 * quem fala com o banco é `lib/cobranca-banco/inter-api`.
 *
 * ⚠️ **A forma errada LANÇA.** Uma reserva ou uma credencial que não fecha não
 * vira pedido ao banco: um campo trocado em silêncio é uma cobrança errada no
 * nome da empresa.
 */

export const VERSAO_CONEXAO_BANCO = "cobranca-banco-conexao/1.1.0";

export type AmbienteConexao = "sandbox" | "producao";

/** O que a reserva devolve. */
export type ReservaBanco =
  | { forma: "existente"; id: string }
  | {
      /** Uma cobrança viva que ainda não tem o que pagar: CONFERIR no banco, nunca pedir outra. */
      forma: "pendente";
      id: string;
      situacao: "processando" | "incerta";
      conexaoId: string;
      idProvedor: string | null;
      seuNumero: string;
      vencimento: string;
    }
  | {
      forma: "nova";
      id: string;
      conexaoId: string;
      ambiente: AmbienteConexao;
      pedido: PedidoCobrancaBanco;
    };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATA = /^\d{4}-\d{2}-\d{2}$/;
const SEU_NUMERO = /^[0-9a-f]{15}$/;

const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const texto = (v: unknown, max: number): string | null =>
  typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
const uuid = (v: unknown): string | null => (typeof v === "string" && UUID.test(v) ? v : null);
const data = (v: unknown): string | null => (typeof v === "string" && DATA.test(v) ? v : null);

function devedor(d: unknown): DevedorCobranca | null {
  if (!obj(d)) return null;
  return {
    nome: texto(d.nome, 100),
    documento: texto(d.documento, 20),
    email: texto(d.email, 120),
    telefone: texto(d.telefone, 30),
    cep: texto(d.cep, 12),
    logradouro: texto(d.logradouro, 120),
    numero: texto(d.numero, 20),
    complemento: texto(d.complemento, 60),
    bairro: texto(d.bairro, 60),
    cidade: texto(d.cidade, 60),
    uf: texto(d.uf, 2),
  } as DevedorCobranca;
}

/** Lê a reserva. ⚠️ O nosso número tem de ser o do id — senão a busca da `incerta` procuraria outra coisa. */
export function lerReservaBanco(v: unknown): ReservaBanco {
  if (!obj(v) || !uuid(v.id)) throw new Error("Reserva de cobrança ilegível.");
  const id = v.id as string;
  if (v.existente === true) return { forma: "existente", id };
  const esperado = id.toLowerCase().replace(/-/g, "").slice(0, 15);
  const seuNumero = typeof v.seuNumero === "string" ? v.seuNumero : "";
  if (!SEU_NUMERO.test(seuNumero) || seuNumero !== esperado) throw new Error("Reserva de cobrança com número que não é o do id.");
  const conexaoId = uuid(v.conexaoId);
  const vencimento = data(v.vencimento);
  if (!conexaoId || !vencimento) throw new Error("Reserva de cobrança incompleta.");

  if (v.pendente === true) {
    const situacao = v.situacao === "processando" || v.situacao === "incerta" ? v.situacao : null;
    if (!situacao) throw new Error("Reserva pendente sem situação.");
    const idProvedor = texto(v.idProvedor, 100);
    if (situacao === "processando" && !idProvedor) throw new Error("Cobrança processando sem o id do banco.");
    return { forma: "pendente", id, situacao, conexaoId, idProvedor, seuNumero, vencimento };
  }

  const tipo: TipoCobrancaBanco | null = v.tipo === "pix" || v.tipo === "boleto" || v.tipo === "boleto_pix" ? v.tipo : null;
  const ambiente = v.ambiente === "sandbox" || v.ambiente === "producao" ? v.ambiente : null;
  const valor = typeof v.valor === "number" ? v.valor : Number(v.valor);
  if (!tipo || !ambiente || !(valor > 0)) throw new Error("Reserva de cobrança incompleta.");
  return {
    forma: "nova",
    id,
    conexaoId,
    ambiente,
    pedido: {
      tipo,
      seuNumero,
      valor: Math.round(valor * 100) / 100,
      vencimento,
      descricao: texto(v.descricao, 140),
      devedor: devedor(v.devedor),
    },
  };
}

/** O que `cobranca_banco_credencial` devolve (o segredo ainda cifrado). */
export interface CredencialGuardada {
  id: string;
  orgId: string;
  provedor: BancoConectavel;
  ambiente: AmbienteConexao;
  clientId: string;
  contaCorrente: string | null;
  cifrado: string;
}

export function lerCredencialGuardada(v: unknown): CredencialGuardada {
  if (!obj(v)) throw new Error("Credencial ilegível.");
  const id = uuid(v.id);
  const orgId = uuid(v.orgId);
  const clientId = texto(v.clientId, 200);
  const cifrado = typeof v.cifrado === "string" && v.cifrado.startsWith("v1.") ? v.cifrado : null;
  const provedor = lerBancoConectavel(v.provedor);
  if (!id || !orgId || !provedor || (v.ambiente !== "sandbox" && v.ambiente !== "producao") || !clientId || !cifrado) {
    throw new Error("Credencial incompleta.");
  }
  const conta = typeof v.contaCorrente === "string" && /^\d{1,20}$/.test(v.contaCorrente) ? v.contaCorrente : null;
  return { id, orgId, provedor, ambiente: v.ambiente, clientId, contaCorrente: conta, cifrado };
}

/** O formulário "Conectar o Banco Inter", já lido como texto. */
export interface FormularioConexao {
  ambiente: string;
  clientId: string;
  clientSecret: string;
  certificado: string;
  chave: string;
  contaCorrente: string;
}

/**
 * O que impede conectar, em frase (vazio = pode testar). Confere só a FORMA;
 * se a credencial abre, quem diz é o token do banco. ⚠️ Nenhuma frase repete o
 * valor digitado: elas vão para a tela e para o log.
 */
export function problemasDaConexao(f: FormularioConexao): string[] {
  const out: string[] = [];
  if (f.ambiente !== "sandbox" && f.ambiente !== "producao") out.push("Escolha se a credencial é de teste (sandbox) ou de produção.");
  if (!f.clientId.trim() || f.clientId.trim().length > 200) out.push("Informe o Client ID da integração.");
  if (!f.clientSecret.trim() || f.clientSecret.trim().length > 500) out.push("Informe o Client Secret da integração.");
  if (!/-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/.test(f.certificado)) {
    out.push("O certificado tem de ser o arquivo .crt da integração (começa por -----BEGIN CERTIFICATE-----).");
  }
  if (!/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]+-----END (?:RSA |EC )?PRIVATE KEY-----/.test(f.chave)) {
    out.push("A chave tem de ser o arquivo .key da integração (começa por -----BEGIN PRIVATE KEY-----).");
  }
  if (f.certificado.length + f.chave.length > 20000) out.push("O certificado e a chave são grandes demais; confira se são os arquivos da integração.");
  const conta = f.contaCorrente.replace(/\D/g, "");
  if (f.contaCorrente.trim() && (!conta || conta.length > 20)) out.push("A conta corrente tem de ter só números.");
  return out;
}

/**
 * O interruptor. Nasce DESLIGADO: com `COBRANCA_BANCO=ligado`, a empresa
 * conecta e cobra; sem ele, a tela explica e nada fala com o banco.
 */
export function cobrancaBancoLigada(env: Record<string, string | undefined>): boolean {
  return (env.COBRANCA_BANCO ?? "").trim().toLowerCase() === "ligado";
}

/** Faltam N dias para o certificado vencer (null = sem data). Negativo = vencido. */
export function diasParaVencer(ate: string | null, hoje: string): number | null {
  if (!ate || !DATA.test(ate) || !DATA.test(hoje)) return null;
  const a = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10));
  const h = Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7) - 1, +hoje.slice(8, 10));
  return Math.round((a - h) / 86_400_000);
}
