"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RELÓGIO DA ASSINATURA, NA TELA DE QUEM PAGA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **O prazo existia só no `/admin`.** Um prazo que o cliente não vê não é
 * prazo, é um corte que chega de surpresa — a pessoa lança normalmente na
 * terça e na quarta o botão de salvar devolve erro, sem nada antes que
 * explicasse. Medido em 18/08: 14 das 16 organizações não tinham nem linha de
 * assinatura, e as 2 que tinham estavam sem data de fim.
 *
 * ⚠️ **Ele NÃO fecha**, pela mesma razão do `BannerAmostra`: aviso com "x" é
 * fechado por reflexo e some justamente quando alguém volta em dúvida. Ele some
 * quando a CAUSA some — assinatura em dia não renderiza nada.
 *
 * ⚠️ **A voz é a do produto, não a do jurídico.** Sem "inadimplente", sem
 * "suspensão", sem "licença". A frase diz o que aconteceu, o que continua
 * funcionando (ver e exportar TUDO) e o que resolve. Quem está vencido já sabe
 * que atrasou; o que ele não sabe é se perdeu o arquivo.
 */
import * as React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui";
import { getAssinatura } from "@/lib/assinatura";

export function BannerAssinatura() {
  const { data } = useQuery({
    queryKey: ["assinatura", "estado"],
    queryFn: getAssinatura,
    // O relógio anda em DIAS. Reconsultar a cada foco de janela seria uma
    // chamada por troca de aba para ver o mesmo número.
    staleTime: 30 * 60_000,
  });

  if (!data || !data.aviso) return null;

  const bloqueado = data.bloqueado;
  /*
   * ⚠️ O tom ESCALA, e não é decoração: enquanto o teste corre, isto é
   * informação (`warning`); depois que venceu, é a razão pela qual salvar
   * parou de funcionar (`negative`). Gastar vermelho no primeiro dia de teste
   * o enfraquece no dia em que ele precisa ser lido.
   */
  const cor = bloqueado ? "var(--color-negative)" : "var(--color-warning)";

  return (
    <div
      role="status"
      className="flex items-center gap-3 flex-wrap px-5 py-3 border-b border-border-soft"
      style={{ background: `color-mix(in srgb, ${cor} 10%, var(--color-white))` }}
    >
      <Icon name={bloqueado ? "triangle-alert" : "calendar"} size={16} color={cor} />
      <span className="text-caption text-ink flex-1 min-w-[240px]">
        <strong className="font-medium">{data.aviso}</strong>
        {!bloqueado && data.emTeste && (
          <span className="text-muted">
            {" "}Você pode continuar usando tudo até lá.
          </span>
        )}
      </span>
      <Link
        href="/planos"
        className="text-caption font-medium text-ink underline underline-offset-2 shrink-0"
      >
        {bloqueado ? "Escolher um plano" : "Ver planos"}
      </Link>
    </div>
  );
}
