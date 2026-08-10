"use client";

import * as React from "react";
import { usePeriod } from "./PeriodContext";

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/**
 * O MÊS CORRENTE, escrito — não um seletor.
 *
 * ⚠️ A Home passou a responder SEMPRE pelo mês corrente. Antes havia duas
 * pílulas ("Essa semana" e o mês navegável), e a janela ficava salva por
 * usuário: quem abrisse em abril continuava vendo abril em agosto, com as
 * leituras zeradas e um aviso pedindo para voltar. Um seletor que precisa de
 * um aviso para consertar o próprio estado é um seletor que custa mais do que
 * entrega numa tela de abertura.
 *
 * O período segue existindo no `PeriodContext` — quem quer outra janela tem o
 * fluxo de caixa e os relatórios, que são as telas de análise. Aqui ele é
 * FIXADO no mês corrente a cada montagem, para nenhuma janela antiga
 * sobreviver no armazenamento e voltar a assombrar a Home.
 */
export function MesAtual() {
  const period = usePeriod();
  const hoje = new Date();
  const rotulo = `${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;

  React.useEffect(() => {
    period.setMonth?.(hoje.getFullYear(), hoje.getMonth());
    // Só na montagem: fixar o mês a cada render brigaria com qualquer
    // navegação legítima de outra tela que compartilhe o contexto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <span className="text-h2 text-muted">{rotulo}</span>;
}
