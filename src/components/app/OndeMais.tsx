"use client";

/**
 * "ONDE MAIS ISTO APARECE" — a faixa que liga telas que falam do mesmo assunto.
 *
 * ⚠️ Dois achados da auditoria têm a mesma forma: **o mesmo assunto em três
 * telas, nenhuma citando as outras.**
 *
 *  - **Assinaturas**: um Dashboard de Assinaturas, uma lista em Vendas e NFs e
 *    uma aba em Receber. Nenhuma referencia as demais, e nenhuma explica por que
 *    o MRR delas difere do que a tela de investidores mostra.
 *  - **Inteligência artificial**: o chat de `/all4pay-ai`, as abas do
 *    `/copiloto` e o botão flutuante. Não havia resposta para "onde eu falo com
 *    a IA".
 *
 * Telas irmãs sem link entre si obrigam o usuário a descobrir sozinho que
 * existem — e, quando os números diferem, a supor que uma delas está errada.
 * Esta faixa diz o que ESTA tela faz e para onde ir para o resto.
 */
import * as React from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";

export interface Irma {
  rota: string;
  nome: string;
  /** O que ELA responde — não o que ela é. */
  responde: string;
}

export function OndeMais({
  estaTela,
  irmas,
  nota,
}: {
  /** O que ESTA tela responde. */
  estaTela: string;
  irmas: Irma[];
  /** Explicação de divergência, quando os números legitimamente diferem. */
  nota?: string;
}) {
  if (irmas.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 px-4 py-3 rounded-card bg-surface-1 border border-border-soft">
      <span className="text-[11px] font-medium tracking-[0.08em] text-faint">
        Esta tela responde
      </span>
      <span className="text-[15px] text-ink">{estaTela}</span>
      <div className="flex flex-col gap-1 pt-1 border-t border-border-soft">
        <span className="text-[11px] font-medium tracking-[0.08em] text-faint pt-1">
          O mesmo assunto, em outro recorte
        </span>
        {irmas.map((i) => (
          <Link
            key={i.rota}
            href={i.rota}
            className="flex items-baseline gap-2 text-caption group"
          >
            <span className="font-medium text-ink group-hover:underline">{i.nome}</span>
            <Icon name="arrow-up-right" size={11} color="var(--color-text-tertiary)" />
            <span className="text-faint truncate">{i.responde}</span>
          </Link>
        ))}
      </div>
      {nota && <span className="text-caption text-faint max-w-[74ch] pt-1">{nota}</span>}
    </div>
  );
}

/* ========================================================================== */
/* Os conjuntos conhecidos                                                     */
/* ========================================================================== */

/**
 * As telas de assinatura.
 *
 * ⚠️ Eram TRÊS. O painel de assinaturas (`/dashboard/dashboards/subscriptions`)
 * saiu no corte de 05/08/2026 — ele lia o MESMO motor da lista e a diferença
 * era só a forma de mostrar, então o que restava era um segundo lugar onde o
 * MRR aparecia e podia parecer discordar. Sobraram duas, que respondem
 * perguntas de verdade diferentes: os CONTRATOS e as FATURAS que eles geram.
 */
export const IRMAS_ASSINATURAS: Record<string, Irma[]> = {
  lista: [
    { rota: "/recebimentos?aba=recorrencias", nome: "Recorrências em Receber", responde: "as faturas que elas geram no caixa" },
  ],
  recorrencias: [
    { rota: "/dashboard/sales-invoices/subscriptions", nome: "Assinaturas em Vendas", responde: "a lista dos contratos, um a um" },
  ],
};

/**
 * ⚠️ A nota que faltava. O MRR do painel de assinaturas e o do Investor Update
 * podem diferir por ORDENS DE GRANDEZA, e a razão não é defeito: um mede
 * contratos cadastrados, o outro estima a receita recorrente dos lançamentos.
 * Desde a ONDA 1 os dois saem da MESMA função (`core/indicadores.mrr`), que
 * usa contratos quando existem e estima quando não existem — e a procedência
 * do número diz qual dos dois caminhos foi usado.
 */
export const NOTA_MRR =
  "O MRR daqui sai dos contratos cadastrados. Quando não há contrato, o Investor Update estima a receita recorrente a partir dos lançamentos — por isso os dois números podem diferir muito enquanto o cadastro de assinaturas estiver incompleto. Os dois usam a mesma função de cálculo; o que muda é a fonte.";

/** As duas casas da IA. */
export const IRMAS_IA: Record<string, Irma[]> = {
  chat: [
    { rota: "/all4pay-ai", nome: "Copiloto e motores", responde: "quant, decisão, risco e operação autônoma" },
  ],
  copiloto: [
    { rota: "/all4pay-ai", nome: "All 4 Pay AI", responde: "conversa livre sobre os seus números" },
  ],
};
