"use client";

/**
 * A TELA DE QUALIDADE DE DADOS — o que está sujo, e o botão que limpa.
 *
 * ⚠️ **Ela mora em Configurações e não num painel de engenharia.** Quem
 * consegue decidir que "Teste telesena" e "Teste telesena" são o mesmo produto
 * é quem cadastrou os dois — não quem administra a plataforma. Uma tela de
 * higiene escondida atrás de um papel técnico é uma tela que ninguém abre, e a
 * sujeira que ela mostraria continua contaminando relatório, IA e decisão.
 *
 * ⚠️ **O contador vem PRIMEIRO, a lista depois.** "Há dados sujos" não se
 * prioriza; "190 títulos sem origem, 8 contas fora da árvore" se prioriza. E o
 * número tem de cair depois da correção — um painel cujo número não se move é
 * um painel que ensina que a correção não funciona.
 *
 * ⚠️ **A correção em massa é `AcaoDestrutiva`**: confirmação E desfazer. As duas
 * metades resolvem coisas diferentes — a confirmação impede o acidente, e o
 * desfazer protege quem clicou por reflexo, que é exatamente quem erra. Corrigir
 * 190 títulos de uma vez sem volta é a operação mais cara desta tela.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Icon, Badge, Skeleton, AcaoDestrutiva } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { corrigirEmMassa, temExecucao, fraseDoResultado } from "@/lib/qualidade-corrigir";
import { auditarOrganizacao } from "@/lib/qualidade";
import type { Achado, Gravidade } from "@/core/qualidade";

const COR: Record<Gravidade, string> = {
  critico: "var(--color-negative)",
  atencao: "var(--color-warning)",
};

const ROTULO_GRAVIDADE: Record<Gravidade, string> = {
  critico: "Crítico",
  atencao: "Atenção",
};

/** ⚠️ Só os 8 primeiros: uma lista de 1.277 itens não é lista, é rolagem. */
const AMOSTRA = 8;

function Bloco({ a, aoCorrigir }: { a: Achado; aoCorrigir: (msg: string) => void }) {
  const [aberto, setAberto] = React.useState(false);
  const mostrados = aberto ? a.itens : a.itens.slice(0, AMOSTRA);
  // ⚠️ `corrigivelEmMassa` diz que o achado ADMITE correção mecânica;
  // `temExecucao` diz que ela está IMPLEMENTADA. Os dois precisam ser
  // verdadeiros — um botão que promete e não escreve é pior que botão nenhum,
  // porque o contador não cai e a pessoa conclui que a correção não funciona.
  const executavel = a.corrigivelEmMassa && temExecucao(a.codigo);

  return (
    <div className="flex flex-col gap-2 py-4 border-t border-border-soft first:border-t-0">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="text-[11px] font-medium uppercase tracking-[0.08em]"
          style={{ color: COR[a.gravidade] }}
        >
          {ROTULO_GRAVIDADE[a.gravidade]}
        </span>
        <span className="text-[15px] text-ink flex-1 min-w-0">{a.titulo}</span>
        <Badge variant="count">{a.itens.length}</Badge>
      </div>

      {/* A CONSEQUÊNCIA, não o sintoma — é ela que faz alguém priorizar. */}
      <p className="m-0 text-caption text-muted max-w-[80ch]">{a.porQueImporta}</p>

      <ul className="m-0 mt-1 flex flex-col gap-[2px] list-none p-0">
        {mostrados.map((i) => (
          <li key={i.id} className="flex items-baseline gap-2 flex-wrap text-caption">
            <span className="text-ink truncate max-w-[46ch]">{i.rotulo}</span>
            {i.sugestao && <span className="text-faint">→ {i.sugestao}</span>}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-3 flex-wrap mt-1">
        {a.itens.length > AMOSTRA && (
          <button
            type="button"
            onClick={() => setAberto((v) => !v)}
            className="text-caption text-muted hover:text-ink underline underline-offset-2 decoration-border"
          >
            {aberto ? "Mostrar menos" : `Ver os outros ${a.itens.length - AMOSTRA}`}
          </button>
        )}
        {/* ⚠️ O botão só existe onde a correção é MECÂNICA. Onde ela exige
            julgamento — "este fornecedor é mesmo cliente?" — oferecer um botão
            de lote seria oferecer o erro em lote. */}
        {executavel && a.acao && (
          <AcaoDestrutiva
            rotulo={a.acao}
            titulo={a.acao}
            descricao={
              `${a.itens.length} ${a.itens.length === 1 ? "registro será alterado" : "registros serão alterados"}. `
              + "A alteração pode ser desfeita logo em seguida."
            }
            confirmarRotulo={`Corrigir ${a.itens.length}`}
            onConfirmar={async () => {
              const r = await corrigirEmMassa(a);
              aoCorrigir(fraseDoResultado(r));
              return r.desfazer;
            }}
          />
        )}
        {a.corrigivelEmMassa && !executavel && (
          // ⚠️ Dizer que a execução não existe é melhor que esconder: quem lê
          // fica sabendo que a correção é manual, em vez de procurar um botão.
          <span className="text-caption text-faint">
            Correção em massa ainda não automatizada — corrija pela tela do registro.
          </span>
        )}
      </div>
    </div>
  );
}

export function QualidadeDeDados() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const q = useQuery({
    queryKey: ["qualidade-de-dados"],
    queryFn: auditarOrganizacao,
  });

  if (q.isLoading) {
    return (
      <Card className="flex flex-col gap-3">
        <span className="text-h3 text-ink">Qualidade dos dados</span>
        <Skeleton className="h-24" />
      </Card>
    );
  }

  // ⚠️ Falha NÃO vira "está tudo limpo". Um painel de higiene que mostra zero
  // por não ter conseguido perguntar é a pior leitura possível: ele afirma
  // exatamente o contrário do que sabe.
  if (q.isError || !q.data) {
    return (
      <Card className="flex flex-col gap-2">
        <span className="text-h3 text-ink">Qualidade dos dados</span>
        <p className="m-0 text-caption text-faint max-w-[72ch]">
          Não foi possível auditar agora. Isto não quer dizer que os dados estão
          limpos — quer dizer que não deu para perguntar.
        </p>
      </Card>
    );
  }

  const r = q.data;

  // ⚠️ Depois de corrigir, a auditoria RODA DE NOVO. Um contador que não cai
  // depois da correção ensina que a correção não funciona — e é a queda do
  // número que fecha o ciclo entre ver o problema e acreditar que ele saiu.
  const aoCorrigir = (msg: string) => {
    show(msg);
    qc.invalidateQueries({ queryKey: ["qualidade-de-dados"] });
  };

  return (
    <Card padded={false} className="flex flex-col">
      <div className="px-5 py-4 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <span className="text-h3 text-ink">Qualidade dos dados</span>
          <p className="m-0 mt-1 text-caption text-faint max-w-[76ch]">
            Dado sujo não avisa: ele não derruba a tela, contamina o relatório. Aqui
            estão os problemas que mudam número, com a razão de cada um.
          </p>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          <div className="flex flex-col items-end">
            <span
              className="text-h2 tabular-nums"
              style={{ color: r.criticos ? COR.critico : "var(--color-positive)" }}
            >
              {r.criticos}
            </span>
            <span className="text-caption text-faint">críticos</span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-h2 tabular-nums text-muted">{r.atencao}</span>
            <span className="text-caption text-faint">atenção</span>
          </div>
        </div>
      </div>

      {r.limpo ? (
        <div className="px-5 pb-5 flex items-center gap-2">
          <Icon name="check" size={15} color="var(--color-positive)" />
          <span className="text-caption text-muted">
            Nenhum item crítico. Os itens de atenção não tornam número nenhum errado —
            eles empobrecem a análise.
          </span>
        </div>
      ) : null}

      <div className="px-5 pb-2">
        {r.achados.map((a) => <Bloco key={a.codigo} a={a} aoCorrigir={aoCorrigir} />)}
      </div>
      {node}
    </Card>
  );
}
