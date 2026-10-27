import https from "node:https";
import { BASES_INTER, caminhoPermitidoInter, type AmbienteInter } from "@/core/cobranca-banco/inter";

/**
 * A PORTA DO BANCO INTER — o ÚNICO lugar do app que abre conexão com o Inter.
 * SERVER-ONLY (node:https: nunca em edge nem no middleware).
 *
 * O Inter exige **mTLS**: toda chamada (inclusive o token) vai com o
 * certificado e a chave que a empresa baixa no Internet Banking. O `fetch`
 * do Node não aceita certificado de cliente sem `undici`, e o `undici` já foi
 * recusado aqui (ver `lib/pinbank/saida.ts`); por isso `node:https` direto,
 * numa porta só, como a da Pinbank.
 *
 * ⚠️ **Nunca repete.** Um POST que caiu depois de sair pode ter criado a
 * cobrança; quem decide o que fazer é a leitura (`lerCriacaoInter` → `incerta`),
 * nunca uma segunda tentativa automática aqui.
 *
 * ⚠️ **Só os caminhos de `CAMINHOS_INTER`** e só as duas bases de `BASES_INTER`.
 * Caminho fora da lista é recusado ANTES de abrir a conexão.
 *
 * ⚠️ O certificado, a chave e o token nunca aparecem em erro nem em log.
 */

export interface CredencialMtls {
  certificado: string;
  chave: string;
}

export interface RespostaInter {
  status: number;
  corpo: unknown;
}

export class ErroPortaInter extends Error {
  /** `antes_do_envio`: nada saiu, pode tentar de novo. `apos_envio`: pode ter chegado. */
  fase: "antes_do_envio" | "apos_envio";
  constructor(message: string, fase: "antes_do_envio" | "apos_envio") {
    super(message);
    this.fase = fase;
    this.name = "ErroPortaInter";
  }
}

export async function requisicaoInter(opts: {
  ambiente: AmbienteInter;
  metodo: "GET" | "POST";
  caminho: string;
  mtls: CredencialMtls;
  cabecalhos?: Record<string, string>;
  corpo?: string;
  timeoutMs?: number;
}): Promise<RespostaInter> {
  if (!caminhoPermitidoInter(opts.caminho)) throw new ErroPortaInter("Caminho do Inter fora da lista permitida.", "antes_do_envio");
  const base = new URL(BASES_INTER[opts.ambiente]);
  const timeout = opts.timeoutMs ?? 20_000;

  return new Promise<RespostaInter>((resolve, reject) => {
    let enviado = false;
    const req = https.request(
      {
        host: base.hostname,
        port: 443,
        path: opts.caminho,
        method: opts.metodo,
        cert: opts.mtls.certificado,
        key: opts.mtls.chave,
        agent: false,
        headers: {
          accept: "application/json",
          ...(opts.corpo != null ? { "content-length": Buffer.byteLength(opts.corpo).toString() } : {}),
          ...opts.cabecalhos,
        },
      },
      (res) => {
        const partes: Buffer[] = [];
        let tamanho = 0;
        res.on("data", (c: Buffer) => {
          tamanho += c.length;
          if (tamanho > 2_000_000) {
            req.destroy();
            reject(new ErroPortaInter("Resposta do Inter grande demais.", "apos_envio"));
            return;
          }
          partes.push(c);
        });
        res.on("end", () => {
          const bruto = Buffer.concat(partes).toString("utf8");
          let corpo: unknown = null;
          try {
            corpo = bruto ? JSON.parse(bruto) : null;
          } catch {
            corpo = null;
          }
          resolve({ status: res.statusCode ?? 0, corpo });
        });
        res.on("error", () => reject(new ErroPortaInter("A resposta do Inter caiu no meio.", "apos_envio")));
      },
    );
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new ErroPortaInter("O Inter não respondeu a tempo.", enviado ? "apos_envio" : "antes_do_envio"));
    });
    req.on("error", () => reject(new ErroPortaInter("Não foi possível falar com o Inter.", enviado ? "apos_envio" : "antes_do_envio")));
    // `secureConnect` = o TLS fechou com o certificado do cliente aceito: daqui em diante o pedido sai.
    req.on("socket", (s) => s.once("secureConnect", () => (enviado = true)));
    if (opts.corpo != null) req.write(opts.corpo);
    req.end();
  });
}
