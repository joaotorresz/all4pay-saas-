"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O BANNER DE DEMONSTRAÇÃO — enquanto houver amostra, a tela diz
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Ele NÃO fecha, e isso é a decisão inteira.** Um aviso com "x" é lido uma
 * vez, fechado por reflexo e nunca mais visto — e quem abre o DRE três semanas
 * depois não tem como saber que aqueles números têm dado de mentira dentro. É a
 * mesma regra do `EscopoDaTela` (as duas telas de "a receber"): aviso que se
 * fecha é aviso que some justamente quando alguém volta em dúvida.
 *
 * ⚠️ **Ele some sozinho quando a causa some.** Não há botão de dispensar porque
 * há um botão que RESOLVE: purgada a amostra, a contagem vai a zero e o banner
 * deixa de renderizar. Um aviso que só se cala por decreto ensina a ignorá-lo;
 * este só se cala quando o problema acabou.
 *
 * ⚠️ **Cor `warning`, nunca `negative`.** Ter dado de demonstração não é um erro
 * do usuário nem uma falha do sistema — é um estado que precisa de decisão. O
 * vermelho está reservado a vencido e prejuízo, e gastá-lo aqui o enfraquece lá.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon, AcaoDestrutiva } from "@/components/ui";
import { contarAmostra, purgarAmostra } from "@/lib/amostra";

/** Nome legível de cada tabela — o banner não fala `movement_splits`. */
const NOME: Record<string, string> = {
  movements: "lançamentos",
  movement_splits: "rateios",
  sales_docs: "vendas",
  sale_items: "itens de venda",
  recurrences: "contratos recorrentes",
};

export function BannerAmostra() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["amostra", "contagem"],
    queryFn: contarAmostra,
    // A contagem muda só quando alguém importa a amostra ou purga. Refazê-la a
    // cada foco de janela custaria cinco consultas por troca de aba.
    staleTime: 5 * 60_000,
  });

  const total = data?.total ?? 0;
  if (total === 0) return null;

  const detalhe = Object.entries(data?.porTabela ?? {})
    .map(([t, n]) => `${n} ${NOME[t] ?? t}`)
    .join(" · ");
  /**
   * ⚠️ **O QUE O BOTÃO APAGA E O QUE ELE DEIXA, separados.**
   *
   * `is_sample` marca duas coisas de destinos opostos. A purga passou a
   * remover só a amostra do onboarding; o lançamento marcado à mão fica, e
   * sai por decisão nomeada. O banner tem de dizer isso — um aviso que conta
   * 147 ao lado de um botão que apaga 146 ensina a não confiar no aviso.
   */
  const purgaveis = data?.purgaveis ?? 0;
  const preservadas = data?.preservadas ?? 0;

  return (
    <div
      role="status"
      className="flex items-center gap-3 flex-wrap px-5 py-3 border-b border-border-soft"
      style={{ background: "color-mix(in srgb, var(--color-warning) 10%, var(--color-white))" }}
    >
      <Icon name="triangle-alert" size={16} color="var(--color-warning)" />
      <span className="text-caption text-ink flex-1 min-w-[240px]">
        <strong className="font-medium">Esta organização contém dados de demonstração.</strong>{" "}
        {/* O número vem antes da explicação: quem já entendeu o aviso quer saber
            o tamanho, e quem não entendeu lê a frase inteira de qualquer forma. */}
        <span className="text-muted">
          {detalhe} já estão fora dos relatórios, mas seguem gravados.
          {preservadas > 0 && (
            <>
              {" "}Destes, <b className="text-ink tabular-nums">{purgaveis}</b> vieram do botão de
              amostra e o botão ao lado remove;{" "}
              <b className="text-ink tabular-nums">{preservadas}</b> foram marcados à mão e{" "}
              <b className="text-ink">ficam</b> — eles existiram na operação e saem por decisão
              própria, com trilha.
            </>
          )}
        </span>
      </span>
      <AcaoDestrutiva
        rotulo="Remover dados de demonstração"
        titulo="Remover dados de demonstração"
        descricao={
          `Serão apagados ${purgaveis} de ${total} registros marcados — só os que vieram do botão de amostra. `
          + (preservadas > 0
            ? `Os outros ${preservadas} foram marcados à mão e permanecem. `
            : "")
          + "Os relatórios não mudam — eles já ignoram estes registros. "
          + "Esta ação não pode ser desfeita."
        }
        confirmarRotulo="Remover"
        onConfirmar={async () => {
          await purgarAmostra();
          // Tudo é invalidado, não só a contagem: a purga muda o que cada
          // widget lê. Invalidar apenas o banner o faria sumir com os números
          // antigos ainda na tela.
          await qc.invalidateQueries();
        }}
      />
    </div>
  );
}
