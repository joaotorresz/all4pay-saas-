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

/**
 * Nome legível de cada tabela — o banner não fala `movement_splits`.
 *
 * ⚠️ **SINGULAR E PLURAL, porque a contagem pode ser 1.** O mapa só tinha o
 * plural e a frase era montada como `${n} ${NOME[t]}` + "já **estão** fora": com
 * um registro numa tabela a tela escrevia **"1 lançamentos já estão fora"** —
 * dois erros de concordância na mesma linha, no aviso que existe para ser levado
 * a sério. Um aviso que erra português é um aviso que se lê como rascunho.
 */
const NOME: Record<string, { um: string; muitos: string }> = {
  movements: { um: "lançamento", muitos: "lançamentos" },
  movement_splits: { um: "rateio", muitos: "rateios" },
  sales_docs: { um: "venda", muitos: "vendas" },
  sale_items: { um: "item de venda", muitos: "itens de venda" },
  recurrences: { um: "contrato recorrente", muitos: "contratos recorrentes" },
};

/** `1 lançamento` · `3 rateios` · e o nome cru quando a tabela é desconhecida. */
const contado = (tabela: string, n: number): string => {
  const nome = NOME[tabela];
  if (!nome) return `${n} ${tabela}`;
  return `${n} ${n === 1 ? nome.um : nome.muitos}`;
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

  const entradas = Object.entries(data?.porTabela ?? {});
  const detalhe = entradas.map(([t, n]) => contado(t, Number(n))).join(" · ");
  /*
   * ⚠️ O VERBO concorda com o que a frase tem na frente: uma tabela com um
   * registro pede "está", qualquer outra combinação pede "estão". Deixar o
   * plural fixo era o outro metade do defeito.
   */
  const umSo = entradas.length === 1 && Number(entradas[0]?.[1] ?? 0) === 1;
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
          {detalhe} já {umSo ? "está" : "estão"} fora dos relatórios, mas {umSo ? "segue" : "seguem"} gravado{umSo ? "" : "s"}.
          {preservadas > 0 && (
            <>
              {" "}Destes, <b className="text-ink tabular-nums">{purgaveis}</b>{" "}
              {purgaveis === 1 ? "veio" : "vieram"} do botão de amostra e o botão ao lado remove;{" "}
              <b className="text-ink tabular-nums">{preservadas}</b>{" "}
              {preservadas === 1 ? "foi marcado" : "foram marcados"} à mão e{" "}
              <b className="text-ink">{preservadas === 1 ? "fica" : "ficam"}</b> —{" "}
              {preservadas === 1 ? "ele existiu" : "eles existiram"} na operação e{" "}
              {preservadas === 1 ? "sai" : "saem"} por decisão própria, com trilha.
            </>
          )}
        </span>
      </span>
      <AcaoDestrutiva
        rotulo="Remover dados de demonstração"
        titulo="Remover dados de demonstração"
        descricao={
          `${purgaveis === 1 ? "Será apagado" : "Serão apagados"} ${purgaveis} de ${total} registro${total === 1 ? "" : "s"} marcado${total === 1 ? "" : "s"} — só ${purgaveis === 1 ? "o que veio" : "os que vieram"} do botão de amostra. `
          + (preservadas > 0
            ? `${preservadas === 1 ? `O outro ${preservadas} foi marcado` : `Os outros ${preservadas} foram marcados`} à mão e ${preservadas === 1 ? "permanece" : "permanecem"}. `
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
