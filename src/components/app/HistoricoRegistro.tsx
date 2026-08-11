"use client";

/**
 * A ABA DE HISTÓRICO — uma só, montada em qualquer tela que mostre um registro.
 *
 * ⚠️ É um componente e não uma tela porque a pergunta "quem mexeu nisto?" é
 * feita ONDE o registro está, não numa página à parte. Uma tela de auditoria
 * separada obriga a pessoa a sair do título, procurar o mesmo título de novo
 * numa lista de milhares e voltar — e por isso ninguém consulta.
 *
 * ⚠️ A ordem é do mais RECENTE para o mais antigo. Quem abre isto está quase
 * sempre perguntando "o que aconteceu agora que este número mudou", e não
 * lendo a biografia do registro desde o começo.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/ui";
import {
  historicoDoRegistro, verboDoEvento, mudancasDoEvento,
  type EventoDoRegistro,
} from "@/lib/historico";
import { isDemo } from "@/lib/demo";

function quando(iso: string): string {
  // ⚠️ Fatiar a string, nunca `new Date().getDate()`: em UTC−3 um evento da
  // madrugada apareceria no dia anterior — que é o tipo de erro que numa
  // auditoria muda a resposta de "quem mexeu naquele dia".
  const d = iso.slice(8, 10), m = iso.slice(5, 7), a = iso.slice(0, 4);
  const h = iso.slice(11, 16);
  return `${d}/${m}/${a} ${h}`;
}

export function HistoricoRegistro({
  entidade, id, titulo = "Histórico",
}: {
  entidade: string;
  id: string;
  titulo?: string;
}) {
  const q = useQuery({
    queryKey: ["historico", entidade, id],
    queryFn: () => historicoDoRegistro(entidade, id),
    enabled: !!id,
  });

  if (isDemo) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-label font-medium text-muted">{titulo}</span>
        <p className="m-0 text-caption text-faint max-w-[60ch]">
          Em demonstração os dados vivem neste navegador e não há trilha no servidor
          para consultar.
        </p>
      </div>
    );
  }

  // ⚠️ `null` e `[]` dizem coisas DIFERENTES e ganham frases diferentes: não
  // consegui perguntar × perguntei e ninguém mexeu. Um vazio mudo faria a
  // falha de rede parecer um registro intocado — que é o pior engano possível
  // numa tela de auditoria.
  const eventos: EventoDoRegistro[] | null = q.data ?? null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-label font-medium text-muted">{titulo}</span>

      {q.isLoading ? (
        <span className="text-caption text-faint">Carregando…</span>
      ) : eventos === null ? (
        <p className="m-0 text-caption text-faint max-w-[60ch]">
          Não foi possível consultar a trilha agora. Isto não quer dizer que nada
          aconteceu com este registro — quer dizer que não deu para perguntar.
        </p>
      ) : eventos.length === 0 ? (
        <p className="m-0 text-caption text-faint max-w-[60ch]">
          Nenhuma alteração registrada. A trilha começou a gravar em agosto de 2026;
          o que é anterior a isso não está aqui.
        </p>
      ) : (
        <div className="flex flex-col">
          {eventos.map((e, i) => {
            const mudancas = mudancasDoEvento(e);
            return (
              <div
                key={e.id}
                className={`flex gap-3 py-[10px] ${i ? "border-t border-border-soft" : ""}`}
              >
                <Icon name="rotate-ccw" size={14} color="var(--color-faint)" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[14px] text-ink">{verboDoEvento(e.acao)}</span>
                    <span className="text-caption text-faint">
                      {quando(e.quando)} · {e.usuario === "sistema" ? "sistema" : e.usuario}
                      {e.origem && e.origem !== "aplicativo" ? ` · ${e.origem}` : ""}
                    </span>
                  </div>

                  {mudancas.length > 0 && (
                    <div className="mt-1 flex flex-col gap-[2px]">
                      {mudancas.map((m) => (
                        <div key={m.campo} className="flex items-baseline gap-2 flex-wrap text-caption">
                          <span className="text-faint">{m.rotulo}</span>
                          {/* ⚠️ Antes → depois na MESMA linha. Duas colunas
                              separadas obrigam o olho a atravessar a tela para
                              comparar dois números que só fazem sentido juntos. */}
                          <span className="text-muted tabular-nums line-through decoration-1">
                            {m.antes}
                          </span>
                          <span className="text-faint">→</span>
                          <span className="text-ink tabular-nums">{m.depois}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
