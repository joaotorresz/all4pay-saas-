"use client";

/**
 * "Títulos a pagar" com a CAIXA DE ENTRADA como segunda aba.
 *
 * ⚠️ Aba, não item de menu: a pergunta "o que chegou e ainda não virou conta"
 * é vizinha da lista de contas — é a porta de entrada dela. Um item novo no
 * menu contrariaria a regra "uma pergunta, uma tela" e esconderia o contador
 * num lugar que ninguém abre. O contador vai no RÓTULO da aba, visível de
 * quem está olhando a lista.
 */
import * as React from "react";
import { HubShell, type AbaHub } from "@/components/app/HubShell";
import { TitulosView } from "@/components/movimentacoes/TitulosView";
import { CaixaEntradaView, useContadorCaixa } from "./CaixaEntradaView";
import { NFsRecebidasView, BoletosView } from "@/components/compras/RecebidosViews";

/**
 * A caixa de entrada reúne as TRÊS portas por onde uma conta a pagar chega
 * antes de existir: o documento lido (OCR/e-mail), a NF da SEFAZ e o boleto
 * do DDA. NFs e boletos eram rotas próprias a um atalho de Compras; o
 * parâmetro é `caixa` porque a aba de fora já usa `aba`.
 */
const CAIXAS: AbaHub[] = [
  { id: "documentos", label: "Documentos lidos", render: () => <CaixaEntradaView /> },
  { id: "nfs", label: "NFs da SEFAZ", render: () => <NFsRecebidasView /> },
  { id: "boletos", label: "Boletos do DDA", render: () => <BoletosView /> },
];

export function TitulosAPagarHub() {
  const n = useContadorCaixa();
  const abas: AbaHub[] = React.useMemo(() => [
    { id: "titulos", label: "Títulos", render: () => <TitulosView direcao="pagar" /> },
    { id: "caixa-de-entrada", label: `Caixa de entrada (${n})`, render: () => <HubShell abas={CAIXAS} param="caixa" /> },
  ], [n]);
  return <HubShell abas={abas} />;
}
