"use client";

/**
 * SEM CONTA PINBANK, NA BAIXA DO TÍTULO — quem ainda não tem a conta Quattro
 * para cobrar por Pix e boleto pede ali mesmo (decisão do dono, 28/10/2026:
 * "Pedido ao comercial"). O pedido entra no MESMO funil Comercial da
 * plataforma que a maquininha usa (`maquininha_pedidos`, tipo `conta_pix`).
 *
 * ⚠️ Pedir não abre conta nem liga nada: quem abre a conta e põe o código no
 * vínculo é a plataforma; quem liga a cobrança é a empresa, em Integrações. A
 * tela diz isso, para ninguém esperar o Pix logo depois de enviar.
 *
 * Três estados, decididos pelo servidor (`/api/pinbank/cobranca`):
 * · pedido em aberto → "em análise", sem formulário (o teto é de 5 em aberto);
 * · conta pronta e cobrança desligada → o caminho para ligar;
 * · nenhum dos dois → o convite e o formulário.
 */
import * as React from "react";
import Link from "next/link";
import { Button, Input, Textarea } from "@/components/ui";
import { dataBR } from "@/lib/format";
import { loadCompany } from "@/lib/company";
import { enviarPedido } from "@/lib/maquininha-oferta";
import { PEDIDO_VAZIO, validarPedido, type PedidoMaquininha } from "@/core/maquininha/oferta";

export const ROTA_LIGAR_COBRANCA = "/dashboard/administration/integrations?cartao=maquininha-pinbank";

export type PedidoConta = { criado_em: string; situacao: string } | null;

export function PedirContaQuattro({
  contaPronta, pedido, show, aoPedir,
}: {
  contaPronta: boolean;
  pedido: PedidoConta;
  show: (m: string) => void;
  aoPedir: () => void;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [p, setP] = React.useState<PedidoMaquininha>(() => {
    const db = loadCompany()?.db ?? {};
    const texto = (k: string) => (typeof db[k] === "string" ? (db[k] as string) : "");
    return {
      ...PEDIDO_VAZIO, tipo: "conta_pix", origem: "cobranca",
      contatoNome: texto("repNome"), contatoTelefone: texto("repTelefone"), contatoEmail: texto("repEmail"),
    };
  });
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [enviando, setEnviando] = React.useState(false);

  if (contaPronta) {
    return (
      <Caixa titulo="Sua conta Quattro já está pronta">
        <span className="text-caption text-muted leading-[1.5]">
          Falta ligar a cobrança por Pix e boleto. Quem administra a empresa liga em Integrações, no cartão da conta Pinbank.
        </span>
        <div className="flex justify-end">
          <Link href={ROTA_LIGAR_COBRANCA} className="text-label text-ink underline underline-offset-2">Ligar a cobrança ↗</Link>
        </div>
      </Caixa>
    );
  }

  if (pedido) {
    return (
      <Caixa titulo="Pedido de conta Quattro em análise">
        <span className="text-caption text-muted leading-[1.5]">
          Recebemos o seu pedido em <span className="tabular-nums">{dataBR(pedido.criado_em.slice(0, 10))}</span>. A equipe Quattro
          entra em contato para abrir a conta. Depois disso, o Pix e o boleto aparecem aqui.
        </span>
      </Caixa>
    );
  }

  const set = <K extends keyof PedidoMaquininha>(k: K, v: PedidoMaquininha[K]) => setP((x) => ({ ...x, [k]: v }));

  const enviar = async () => {
    const e = validarPedido(p);
    setErros(e);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      await enviarPedido(p);
      show("Pedido enviado. A equipe Quattro entra em contato para abrir a conta.");
      setAberto(false);
      aoPedir();
    } catch (err) {
      const msg = err instanceof Error ? err.message.replace(/^A4P-MAQUININHA:\s*/, "").replace("pedir a maquininha", "pedir a conta Quattro") : "";
      show(msg || "Não foi possível enviar o pedido agora.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Caixa titulo="Receba por Pix e boleto com a conta Quattro" formulario={aberto}>
      <span className="text-caption text-muted leading-[1.5]">
        Com a conta Quattro você gera o Pix e o boleto deste título aqui mesmo, e o dinheiro cai na conta da empresa.
        Peça a abertura e a equipe Quattro entra em contato.
      </span>
      {!aberto ? (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={() => setAberto(true)}>Pedir a conta</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Input label="Nome de quem vamos procurar" value={p.contatoNome} onChange={(e) => set("contatoNome", e.target.value)} invalid={!!erros.contatoNome} />
          {erros.contatoNome && <Erro>{erros.contatoNome}</Erro>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Input label="Telefone com DDD" inputMode="tel" value={p.contatoTelefone} onChange={(e) => set("contatoTelefone", e.target.value)} invalid={!!erros.contatoTelefone} />
              {erros.contatoTelefone && <Erro>{erros.contatoTelefone}</Erro>}
            </div>
            <div className="flex flex-col gap-1">
              <Input label="E-mail" type="email" value={p.contatoEmail} onChange={(e) => set("contatoEmail", e.target.value)} invalid={!!erros.contatoEmail} />
              {erros.contatoEmail && <Erro>{erros.contatoEmail}</Erro>}
            </div>
          </div>
          <Textarea label="Observação (opcional)" value={p.observacao} onChange={(e) => set("observacao", e.target.value)} rows={2} />
          {erros.observacao && <Erro>{erros.observacao}</Erro>}
          <span className="text-caption text-muted leading-[1.5]">
            Só quem administra a empresa pode enviar o pedido.
          </span>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAberto(false)} disabled={enviando}>Cancelar</Button>
            <Button onClick={() => void enviar()} disabled={enviando}>{enviando ? "Enviando…" : "Enviar pedido"}</Button>
          </div>
        </div>
      )}
    </Caixa>
  );
}

function Caixa({ titulo, formulario = false, children }: { titulo: string; formulario?: boolean; children: React.ReactNode }) {
  // Com o formulário aberto a caixa perde o fundo: campo cinza sobre fundo cinza some.
  return (
    <div className={formulario ? "flex flex-col gap-3 rounded-md border border-border p-4" : "flex flex-col gap-3 rounded-md bg-surface-1 p-4"}>
      <span className="text-label text-ink">{titulo}</span>
      {children}
    </div>
  );
}

function Erro({ children }: { children: React.ReactNode }) {
  return <span className="text-caption text-negative">{children}</span>;
}
