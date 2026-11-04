"use client";

/**
 * "Declare o plano de contas" — o passo da entrada que faltava (Fase 4.1).
 *
 * Aparece na importação e em Primeiros passos enquanto houver categoria com
 * lançamento e sem linha do DRE declarada. A Quattro AI sugere a linha de cada
 * uma (`planoParaDeclarar`, a regra única) e a pessoa confirma tudo de uma
 * vez. Sem isto, o DRE de todo cliente novo era montado por palpite e tinha a
 * mesma cara de um DRE conferido.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { linhasDeclaradasDasCategorias } from "@/lib/data";
import { planoParaDeclarar } from "@/core/registros/sugestao";
import { DeclararPalpite } from "@/components/relatorios/DeclararPalpite";

export const CHAVE_LINHAS_DECLARADAS = ["linhas-declaradas"] as const;

export function useLinhasDeclaradas() {
  return useQuery({ queryKey: CHAVE_LINHAS_DECLARADAS, queryFn: linhasDeclaradasDasCategorias });
}

export function DeclararPlanoCard() {
  const { data: input } = useRiscoInput();
  const { data: declaradas } = useLinhasDeclaradas();
  const qc = useQueryClient();
  const [aberto, setAberto] = React.useState(false);
  const pendentes = React.useMemo(
    () => (input && declaradas ? planoParaDeclarar(input, declaradas) : []),
    [input, declaradas],
  );
  if (!pendentes.length) return null;
  const mudam = pendentes.filter((c) => c.sugestao.linha && c.sugestao.linha !== c.palpite).length;

  return (
    <Card className="flex flex-col gap-3" id="plano-de-contas" data-declarar-plano={pendentes.length}>
      <div className="flex items-center gap-2">
        <Icon name="list-checks" size={16} color="var(--color-text-secondary)" />
        <h3 className="m-0 text-h3 text-ink">Declare o plano de contas</h3>
      </div>
      <p className="m-0 text-body text-muted">
        <b className="text-ink tabular-nums">{pendentes.length}</b>{" "}
        {pendentes.length === 1 ? "categoria ainda não tem" : "categorias ainda não têm"} linha do DRE declarada, e o resultado
        delas sai por palpite. A Quattro AI já sugeriu a linha de cada uma: confira e confirme.
        {mudam > 0 && <> Em <b className="text-ink tabular-nums">{mudam}</b> a sugestão corrige o palpite e muda o DRE.</>}
      </p>
      <Button variant="primary" className="self-start" onClick={() => setAberto(true)}>Revisar e confirmar</Button>
      {aberto && (
        <DeclararPalpite
          titulo="Declarar o plano de contas"
          categorias={pendentes.map((c) => ({ nome: c.nome, valor: c.valor, linha: c.palpite, natureza: c.natureza }))}
          onFechar={() => setAberto(false)}
          onDeclarado={() => { void qc.invalidateQueries({ queryKey: CHAVE_LINHAS_DECLARADAS }); }}
        />
      )}
    </Card>
  );
}
