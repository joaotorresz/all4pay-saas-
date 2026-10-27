"use client";

import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { Secoes, type Secao } from "@/components/app/Secoes";
import { CaixaEntradaView, useContadorCaixa } from "@/components/contas-pagar/CaixaEntradaView";
import { NFsRecebidasView, BoletosView } from "@/components/compras/RecebidosViews";

/**
 * CAIXA DE ENTRADA — as TRÊS portas por onde uma conta a pagar chega antes de
 * existir: o documento lido (OCR/e-mail), a NF da SEFAZ e o boleto do DDA.
 *
 * ⚠️ Era a segunda aba de Títulos a pagar, com três abas dentro dela (abas
 * dentro de aba). Desde 27/10/2026 é uma tela com as três fontes empilhadas:
 * o que chegou por qualquer porta fica à vista de uma vez. Os links antigos
 * (`?caixa=nfs`, `?caixa=boletos`) rolam até a seção.
 */
const SECOES: Secao[] = [
  { id: "documentos", titulo: "Documentos lidos", desc: "Boletos, notas e comprovantes enviados ou recebidos por e-mail", conteudo: <CaixaEntradaView /> },
  { id: "nfs", titulo: "NFs da SEFAZ", desc: "Notas emitidas contra o seu CNPJ", conteudo: <NFsRecebidasView /> },
  { id: "boletos", titulo: "Boletos do DDA", desc: "Boletos registrados no seu nome", conteudo: <BoletosView /> },
];

export default function CaixaDeEntradaPage() {
  // O contador que ia no rótulo da aba ("Caixa de entrada (3)") sobe para o
  // topo da tela: é a primeira coisa que quem abre a caixa quer saber.
  const n = useContadorCaixa();
  return (
    <AppShell
      title="Caixa de entrada"
      crumb="Central de despesas"
      actions={<span className="text-label text-muted" data-contador-caixa={n}>{n} esperando decisão</span>}
    >
      <Suspense fallback={null}>
        <Secoes secoes={SECOES} param="caixa" />
      </Suspense>
    </AppShell>
  );
}
