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

  /*
   * ⚠️ **O TOM ESCALA EM TRÊS, não em dois.** Antes eram só duas cores —
   * `warning` durante o teste inteiro e `negative` depois. O efeito é que um
   * teste de 14 dias mostrava alarme desde o primeiro, e um aviso que grita
   * todo dia deixa de ser lido justamente na semana em que ele importa.
   *
   *   calmo   → informação: o prazo existe e está longe
   *   atenção → a última semana; agora é para agir
   *   parado  → a escrita suspendeu; diz o que AINDA funciona
   */
  const COR = {
    calmo: "var(--color-muted)",
    atencao: "var(--color-warning)",
    parado: "var(--color-negative)",
  } as const;
  const cor = COR[data.tom];
  const parado = data.tom === "parado";

  return (
    <div
      role="status"
      className="flex items-center gap-3 flex-wrap px-5 py-3 border-b border-border-soft"
      style={{ background: `color-mix(in srgb, ${cor} ${parado ? 12 : 8}%, var(--color-white))` }}
    >
      <Icon name={parado ? "triangle-alert" : "calendar"} size={16} color={cor} />
      <span className="text-caption text-ink flex-1 min-w-[240px]">
        <strong className="font-medium">{data.aviso}</strong>
        {!parado && data.emTeste && (
          <span className="text-muted"> Você pode continuar usando tudo até lá.</span>
        )}
        {parado && (
          /*
           * ⚠️ **O BLOQUEIO É SUAVE, e dizer isso é metade do trabalho.** Quem
           * está vencido já sabe que atrasou; o que ele NÃO sabe é se perdeu o
           * arquivo. Ler, filtrar, imprimir e exportar continuam inteiros —
           * só registrar coisa nova parou. O dado é da empresa, e esconder o
           * arquivo de quem atrasou transforma cobrança em sequestro.
           */
          <span className="text-muted">
            {" "}Consultar, imprimir e exportar continuam liberados — só o registro de
            lançamentos novos está pausado, e ele volta no mesmo instante em que a
            assinatura for regularizada.
          </span>
        )}
      </span>
      {/*
        ⚠️ Não há tela de pagamento, e o botão não finge que há: ele leva a uma
        conversa. Um "Assinar agora" que abre um formulário quebrado é pior que
        um convite honesto para falar com alguém.
      */}
      <Link
        href="/dashboard/help"
        className="text-caption font-medium text-ink underline underline-offset-2 shrink-0"
      >
        {parado ? "Falar com a gente para reativar" : "Falar sobre planos"}
      </Link>
    </div>
  );
}
