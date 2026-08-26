"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRAL FINANCEIRA — a esteira, e quem pode empurrar cada título nela
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **A máquina de estados existia no banco e NENHUMA tela a alcançava.** A
 * versão anterior derivava a fila do `RiskInput` e confirmava em estado local,
 * otimista — uma regra que só o banco conhece e nenhuma tela exercita é uma
 * regra que ninguém usa, e a primeira vez que alguém a encontra é quando ela
 * recusa. Medido antes de escrever esta tela: `central_transicoes` com **ZERO**
 * linhas e nenhum título em `confirmado`. A máquina nunca rodou.
 *
 * ⚠️ **O SERVIDOR É A AUTORIDADE.** Esconder o botão não é controle de acesso:
 * a recusa vem do gatilho mesmo que alguém chame a rota na mão. O que a tela
 * faz é EXPLICAR antes do clique — e as três razões para não poder confirmar
 * (papel, teto, R1) se resolvem de jeitos opostos, então cada uma tem a sua
 * frase.
 *
 * ⚠️ **A situação é mostrada como ESTADO numa esteira, não como texto solto.**
 * "previsto" numa coluna não diz a ninguém em que ponto do caminho a linha
 * está; a esteira diz, e diz também o que vem depois.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, Card, BRL, Icon, Skeleton, Input, Select, CurrencyInput, DateField } from "@/components/ui";
import { moverTituloAction, lancarTituloAction } from "@/app/central/acoes";
import { isDemo } from "@/lib/demo";
import {
  getFilaCentral, getContextoCentral, getTransicoes, porQueNaoConfirma,
  type TituloDaFila, type ContextoCentral, type Transicao, type RecusaCentral,
} from "@/lib/central";
import { rotuloSituacao, type Situacao } from "@/core/central";

/** A procedência em português. ⚠️ A ausência tem entrada própria, não um padrão. */
const ORIGEM: Record<string, string> = {
  manual: "lançamento manual",
  importacao: "importação",
  extrato: "extrato bancário",
  venda: "venda",
  contrato: "contrato",
  conciliacao: "conciliação",
};
import { formatBRL } from "@/lib/format";

/** A esteira, na ordem em que o dinheiro anda. */
const ESTEIRA: { estado: Situacao; rotulo: string; oQue: string }[] = [
  { estado: "previsto", rotulo: "Previsto", oQue: "entrou no sistema e ainda não foi autorizado" },
  { estado: "confirmado", rotulo: "Confirmado", oQue: "alguém com alçada autorizou — vira compromisso firme" },
  { estado: "baixado", rotulo: "Baixado", oQue: "o dinheiro se moveu de verdade" },
];

function PassoDaEsteira({ atual }: { atual: Situacao }) {
  const i = ESTEIRA.findIndex((e) => e.estado === atual);
  return (
    <div className="flex items-center gap-1" role="img" aria-label={`Situação: ${ESTEIRA[i]?.rotulo ?? atual}`}>
      {ESTEIRA.map((e, k) => {
        const passou = k <= i;
        return (
          <React.Fragment key={e.estado}>
            {k > 0 && (
              <span aria-hidden className="w-4 h-px" style={{ background: k <= i ? "var(--color-ink)" : "var(--color-border)" }} />
            )}
            <span
              title={`${e.rotulo} — ${e.oQue}`}
              className="text-[11px] font-medium px-2 py-[2px] rounded-pill whitespace-nowrap"
              style={{
                background: passou ? "var(--color-ink)" : "var(--color-surface-2)",
                color: passou ? "var(--color-white)" : "var(--color-faint)",
              }}
            >
              {e.rotulo}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

/** A trilha do título — quem, quando, de onde para onde, e o carimbo. */
function Trilha({ id }: { id: string }) {
  const { data, isLoading } = useQuery({ queryKey: ["central", "trilha", id], queryFn: () => getTransicoes(id) });
  if (isLoading) return <Skeleton className="h-12 w-full" />;
  const linhas = (data ?? []) as Transicao[];
  if (linhas.length === 0) {
    return <p className="m-0 text-caption text-faint">Sem movimentação registrada — este título ainda não andou na esteira.</p>;
  }
  return (
    <ul className="m-0 p-0 list-none flex flex-col gap-2">
      {linhas.map((t) => (
        <li key={t.id} className="text-caption text-muted flex flex-wrap items-baseline gap-x-2">
          <span className="tabular-nums text-faint">{new Date(t.quando).toLocaleString("pt-BR")}</span>
          <span className="text-ink">{rotuloSituacao(t.de as Situacao)} → {rotuloSituacao(t.para as Situacao)}</span>
          {t.autoaprovacao && (
            /* ⚠️ O carimbo é a linha que o auditor lê — nunca escondido. */
            <span
              className="text-[11px] font-medium px-2 py-[1px] rounded-pill"
              style={{ background: "color-mix(in srgb, var(--color-warning) 16%, var(--color-white))", color: "var(--color-warning)" }}
              title={t.motivo ?? undefined}
            >
              autoaprovação · {t.motivo ?? "org com um único membro habilitado a aprovar"}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}


/**
 * LANÇAR — o começo da esteira.
 *
 * ⚠️ **Sem ele a Central é uma tela de leitura.** O caminho ouro é lançar →
 * confirmar → baixar; sem a primeira ação, a organização nova abre a Central,
 * vê "nada aguardando" e não tem como fazer nada aparecer.
 *
 * Mínimo de propósito: descrição, valor, vencimento, categoria e tipo. Tudo o
 * mais que um título pode ter (rateio, centro, projeto, parcelas) já tem tela
 * própria — repetir aqui criaria um segundo formulário de lançamento, e dois
 * caminhos de criação divergem no dia em que um campo mudar.
 */
function FormLancar({ onPronto, onCancelar }: { onPronto: () => void; onCancelar: () => void }) {
  const [descricao, setDescricao] = React.useState("");
  const [valor, setValor] = React.useState(0);
  const [vencimento, setVencimento] = React.useState(new Date().toISOString().slice(0, 10));
  const [categoria, setCategoria] = React.useState("");
  const [tipo, setTipo] = React.useState<"entrada" | "saida">("saida");
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState<RecusaCentral | null>(null);

  const podeEnviar = descricao.trim().length > 0 && valor > 0 && !!vencimento;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!podeEnviar || enviando) return;
    setEnviando(true); setErro(null);
    try {
      const r = await lancarTituloAction({ descricao, valor, vencimento, categoria, tipo });
      if (!r.ok) { setErro(r.recusa); return; }
      onPronto();
    } finally { setEnviando(false); }
  };

  return (
    <Card className="flex flex-col gap-4">
      <span className="text-h3 text-ink">Novo título</span>
      <form onSubmit={enviar} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input label="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)}
          placeholder="O que é este título" containerClassName="sm:col-span-2" required />
        <CurrencyInput label="Valor" value={valor} onValueChange={setValor} />
        <DateField label="Vencimento" value={vencimento} onChange={setVencimento} />
        <Input label="Categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)}
          placeholder="Opcional" />
        <Select label="Tipo" value={tipo} onChange={(v) => setTipo(v as "entrada" | "saida")}
          options={[{ value: "saida", label: "Saída (a pagar)" }, { value: "entrada", label: "Entrada (a receber)" }]} />
        {erro && (
          <div role="alert" className="sm:col-span-2 rounded-md p-3 flex flex-col gap-[2px]"
            style={{ background: "var(--color-surface-2)", borderLeft: "3px solid var(--color-negative)" }}>
            <span className="text-caption font-medium text-ink">{erro.motivo}</span>
            <span className="text-caption text-muted">{erro.comoResolver}</span>
          </div>
        )}
        <div className="sm:col-span-2 flex items-center gap-2">
          <Button type="submit" variant="primary" disabled={!podeEnviar || enviando}>
            {enviando ? "Lançando…" : "Lançar como previsto"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancelar}>Cancelar</Button>
          {/* ⚠️ Dizer o que vai acontecer ANTES: o título nasce previsto e
              precisa de confirmação — é o passo seguinte da esteira. */}
          <span className="text-caption text-faint">Nasce como <b className="text-muted font-medium">previsto</b> e entra na fila de confirmação.</span>
        </div>
      </form>
    </Card>
  );
}

export function CentralView() {
  const qc = useQueryClient();
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [recusa, setRecusa] = React.useState<{ id: string; r: RecusaCentral } | null>(null);
  const [ocupado, setOcupado] = React.useState<string | null>(null);
  const [filtro, setFiltro] = React.useState<"todos" | Situacao>("todos");
  const [lancando, setLancando] = React.useState(false);
  /* ⚠️ Sem paginação sofisticada: 100 linhas e um "carregar mais". Teto que
     se explica é melhor que rolagem infinita que esconde o corte. */
  const [teto, setTeto] = React.useState(100);

  const fila = useQuery({ queryKey: ["central", "fila"], queryFn: getFilaCentral });
  const ctxQ = useQuery({ queryKey: ["central", "contexto"], queryFn: getContextoCentral });

  const mover = async (t: TituloDaFila, para: Situacao) => {
    setOcupado(t.id); setRecusa(null);
    try {
      /* ⚠️ Server action: quem fala com a máquina é o servidor. */
      const r = await moverTituloAction(t.id, para);
      if (!r.ok) { setRecusa({ id: t.id, r: r.recusa }); return; }
      await qc.invalidateQueries({ queryKey: ["central"] });
    } finally { setOcupado(null); }
  };

  if (fila.isLoading || ctxQ.isLoading) return <Skeleton className="h-64 w-full" />;

  const ctx = (ctxQ.data ?? {
    usuarioId: null, papel: null, teto: 0, podeAprovar: false, podeBaixar: false, temOutroAprovador: false,
  }) as ContextoCentral;
  const itens = (fila.data ?? []) as TituloDaFila[];
  const filtrados = filtro === "todos" ? itens : itens.filter((t) => t.situacao === filtro);
  const visiveis = filtrados.slice(0, teto);

  /* ⚠️ Vazio com CONTEXTO: uma tabela vazia sem explicação faz a organização
     nova concluir que o sistema não funciona. O vazio aqui é uma resposta —
     "nada aguardando" — e diz de onde os títulos vêm. */
  if (itens.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <span className="text-h3 text-ink">Nada aguardando confirmação</span>
        <p className="m-0 text-body text-muted max-w-[68ch]">
          A Central é onde um título deixa de ser previsão e vira compromisso: alguém com alçada
          confirma, e só então ele pode ser baixado. Os títulos chegam aqui sozinhos, vindos de
          Contas a pagar, Contas a receber e da entrada de dados.
        </p>
        <p className="m-0 text-caption text-faint max-w-[68ch]">
          {isDemo
            ? "Na demonstração a fila não é ligada ao banco — a máquina de estados roda em produção."
            : "Assim que o primeiro título for lançado, ele aparece aqui como Previsto."}
        </p>
        {/* ⚠️ Vazio que OFERECE O BOTÃO que o preenche. Um vazio que só explica
            deixa a pessoa sem o próximo passo — e é o próximo passo que falta
            numa organização nova. */}
        {lancando
          ? <FormLancar onPronto={() => { setLancando(false); void qc.invalidateQueries({ queryKey: ["central"] }); }}
                        onCancelar={() => setLancando(false)} />
          : <div><Button variant="primary" onClick={() => setLancando(true)}>Lançar o primeiro título</Button></div>}
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <p className="m-0 text-caption text-faint max-w-[80ch]">
        Quem autoriza é o servidor: a recusa vem da máquina de estados mesmo que a ação seja
        chamada por fora desta tela. O que está abaixo explica, antes do clique, o que cada
        título permite a <b className="text-muted font-medium">você</b>
        {ctx.papel ? ` (papel ${ctx.papel}${ctx.teto === null ? ", sem teto" : `, teto ${formatBRL(ctx.teto)}`})` : ""}.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-pill bg-surface-2 p-[3px]" role="group" aria-label="Filtrar por situação">
          {([["todos", "Todos"], ["previsto", "Previsto"], ["confirmado", "Confirmado"]] as const).map(([v, r]) => (
            <button key={v} type="button" onClick={() => setFiltro(v as "todos" | Situacao)}
              aria-pressed={filtro === v}
              className={`text-caption font-medium px-3 h-7 rounded-pill transition-colors ${
                filtro === v ? "bg-white text-ink" : "text-muted hover:text-ink"}`}>
              {r}
            </button>
          ))}
        </div>
        <span className="text-caption text-faint">{visiveis.length} de {itens.length}</span>
        <div className="ml-auto">
          {!lancando && <Button variant="primary" onClick={() => setLancando(true)}>Lançar título</Button>}
        </div>
      </div>

      {lancando && (
        <FormLancar onPronto={() => { setLancando(false); void qc.invalidateQueries({ queryKey: ["central"] }); }}
                    onCancelar={() => setLancando(false)} />
      )}

      <Card padded={false}>
        <ul className="m-0 p-0 list-none">
          {visiveis.map((t) => {
            const impedimento = t.situacao === "previsto" ? porQueNaoConfirma(t, ctx) : null;
            const podeBaixar = t.situacao === "confirmado" && ctx.podeBaixar;
            const estaAberto = aberto === t.id;
            return (
              <li key={t.id} className="border-b border-border-soft last:border-0">
                <div className="flex items-center gap-3 px-5 py-3 flex-wrap">
                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-[10px] shrink-0"
                    style={{ background: t.direcao === "entrada" ? "color-mix(in srgb, var(--color-positive) 14%, var(--color-white))" : "color-mix(in srgb, var(--color-negative) 14%, var(--color-white))" }}>
                    <Icon name={t.direcao === "entrada" ? "arrow-down" : "arrow-up"} size={14}
                      color={t.direcao === "entrada" ? "var(--color-positive)" : "var(--color-negative)"} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-caption text-ink truncate">{t.descricao}</div>
                    <div className="text-[11px] text-faint">
                      {t.contraparte ?? "—"} · vence {t.vencimento.split("-").reverse().join("/")}
                      {/* ⚠️ **ORIGEM NULA NÃO É "IMPORTAÇÃO".** Este ternário afirmava
                          `importação` para tudo que não fosse `manual` — inclusive para
                          o acervo anterior às colunas de procedência, onde `origem` é
                          NULL. Medido em produção: o título do topo da Central dizia
                          "origem: importação" e a coluna estava vazia. Inventar
                          procedência num título é a mesma doença de inventar autoria —
                          e aqui é pior, porque ninguém abre chamado por uma origem
                          plausível. Ausência sai como ausência. */}
                      {" · "}
                      {t.lancadoPor
                        ? "lançado por membro da equipe"
                        : t.origem
                          ? `origem: ${ORIGEM[t.origem] ?? t.origem}`
                          : "origem não registrada"}
                      {t.diasParado > 0 && (
                        <>
                          {" · "}
                          <span className="text-warning">
                            parado há {t.diasParado} dias — foi para o fim da fila
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <PassoDaEsteira atual={t.situacao} />
                  <span className="text-caption tabular-nums text-ink shrink-0"><BRL value={t.valor} /></span>

                  {t.situacao === "previsto" && (
                    impedimento
                      /* ⚠️ Não some e não fica cinza sem explicação: diz o motivo. */
                      ? <span className="text-[11px] text-warning max-w-[280px] text-right">{impedimento}</span>
                      : <Button variant="secondary" disabled={ocupado === t.id} onClick={() => mover(t, "confirmado")}>
                          {ocupado === t.id ? "Confirmando…" : "Confirmar"}
                        </Button>
                  )}
                  {t.situacao === "confirmado" && (
                    podeBaixar
                      ? <Button variant="secondary" disabled={ocupado === t.id} onClick={() => mover(t, "baixado")}>
                          {ocupado === t.id ? "Baixando…" : "Dar baixa"}
                        </Button>
                      : <span className="text-[11px] text-warning">O papel {ctx.papel ?? "atual"} não dá baixa.</span>
                  )}

                  <button type="button" onClick={() => setAberto(estaAberto ? null : t.id)}
                    className="text-caption text-muted hover:text-ink underline underline-offset-2 shrink-0">
                    {estaAberto ? "ocultar histórico" : "histórico"}
                  </button>
                </div>

                {recusa?.id === t.id && (
                  /* ⚠️ O erro da máquina vira frase em português com o que fazer —
                     nunca código nem stack. As quatro recusas se resolvem de
                     jeitos diferentes, então cada uma traz a sua saída. */
                  <div role="alert" className="mx-5 mb-3 rounded-md p-3 flex flex-col gap-[2px]"
                    style={{ background: "var(--color-surface-2)", borderLeft: "3px solid var(--color-negative)" }}>
                    <span className="text-caption font-medium text-ink">{recusa.r.motivo}</span>
                    <span className="text-caption text-muted">{recusa.r.comoResolver}</span>
                  </div>
                )}

                {estaAberto && <div className="px-5 pb-4"><Trilha id={t.id} /></div>}
              </li>
            );
          })}
        </ul>
      </Card>

      {/* ⚠️ O corte é DITO. Uma lista que para em 100 sem avisar faz quem
          procura um título concluir que ele sumiu. */}
      {filtrados.length > visiveis.length && (
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={() => setTeto((n) => n + 100)}>Carregar mais</Button>
          <span className="text-caption text-faint">
            mostrando {visiveis.length} de {filtrados.length}
          </span>
        </div>
      )}
    </div>
  );
}
