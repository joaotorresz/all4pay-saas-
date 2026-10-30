import https from "node:https";
import { BASES_ITAU, caminhoPermitidoItau, type AmbienteItau } from "@/core/cobranca-banco/itau";
import type { CredencialMtls } from "@/lib/cobranca-banco/inter-saida";

/**
 * A PORTA DO ITAÚ — o ÚNICO lugar do app que abre conexão com o Itaú.
 * SERVER-ONLY (node:https: nunca em edge nem no middleware).
 *
 * Mesmo desenho da porta do Inter (`inter-saida.ts`), com duas diferenças:
 *
 * ⚠️ **Duas bases por ambiente.** O token sai do servidor de autenticação
 * (`BASES_ITAU[amb].token`) e a cobrança da API (`BASES_ITAU[amb].api`). Quem
 * chama diz QUAL das duas (`servidor`), nunca uma URL.
 *
 * ⚠️ **mTLS obrigatório em produção.** O certificado é o da integração da
 * empresa no Itaú. O sandbox do portal do desenvolvedor não pede certificado;
 * em produção, sem ele a chamada é recusada ANTES de sair.
 *
 * ⚠️ **Nunca repete.** Um POST que caiu depois de sair pode ter registrado o
 * boleto; quem decide é a leitura (`lerCriacaoItau` → `incerta`).
 *
 * ⚠️ O certificado, a chave e o token nunca aparecem em erro nem em log.
 */

export interface RespostaItau {
  status: number;
  corpo: unknown;
  /** O começo do corpo cru (até 500), para diagnóstico quando não é JSON. */
  bruto?: string;
}

export class ErroPortaItau extends Error {
  /** `antes_do_envio`: nada saiu, pode tentar de novo. `apos_envio`: pode ter chegado. */
  fase: "antes_do_envio" | "apos_envio";
  constructor(message: string, fase: "antes_do_envio" | "apos_envio") {
    super(message);
    this.fase = fase;
    this.name = "ErroPortaItau";
  }
}

export async function requisicaoItau(opts: {
  ambiente: AmbienteItau;
  servidor: "token" | "api";
  metodo: "GET" | "POST" | "PATCH";
  caminho: string;
  mtls: CredencialMtls | null;
  cabecalhos?: Record<string, string>;
  corpo?: string;
  timeoutMs?: number;
}): Promise<RespostaItau> {
  if (!caminhoPermitidoItau(opts.caminho)) throw new ErroPortaItau("Caminho do Itaú fora da lista permitida.", "antes_do_envio");
  if (opts.ambiente === "producao" && !opts.mtls) throw new ErroPortaItau("O Itaú exige o certificado da integração em produção.", "antes_do_envio");
  const base = new URL(BASES_ITAU[opts.ambiente][opts.servidor]);
  const timeout = opts.timeoutMs ?? 20_000;

  return new Promise<RespostaItau>((resolve, reject) => {
    let enviado = false;
    const req = https.request(
      {
        host: base.hostname,
        port: 443,
        path: opts.caminho,
        method: opts.metodo,
        ...(opts.mtls ? { cert: opts.mtls.certificado, key: opts.mtls.chave } : {}),
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
            reject(new ErroPortaItau("Resposta do Itaú grande demais.", "apos_envio"));
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
          resolve({ status: res.statusCode ?? 0, corpo, bruto: bruto.slice(0, 500) });
        });
        res.on("error", () => reject(new ErroPortaItau("A resposta do Itaú caiu no meio.", "apos_envio")));
      },
    );
    req.setTimeout(timeout, () => {
      req.destroy();
      reject(new ErroPortaItau("O Itaú não respondeu a tempo.", enviado ? "apos_envio" : "antes_do_envio"));
    });
    req.on("error", () => reject(new ErroPortaItau("Não foi possível falar com o Itaú.", enviado ? "apos_envio" : "antes_do_envio")));
    // `secureConnect` = o TLS fechou: daqui em diante o pedido sai.
    req.on("socket", (s) => s.once("secureConnect", () => (enviado = true)));
    if (opts.corpo != null) req.write(opts.corpo);
    req.end();
  });
}
