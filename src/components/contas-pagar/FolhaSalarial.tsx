"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FOLHA SALARIAL — quem custa quanto, e o que vence quando.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A tela responde três perguntas que nenhuma outra respondia:
 *
 *  1. **Quanto a equipe custa de verdade** — não a soma dos salários, mas ela
 *     mais encargos e provisões. O multiplicador fica visível, porque é ele que
 *     ninguém tem na cabeça na hora de contratar.
 *  2. **Quem custa quanto** — pessoa a pessoa, com a conta aberta.
 *  3. **O que vence quando** — a agenda do mês, que para um CLT são três datas
 *     e não uma.
 *
 * ⚠️ A tela não calcula nada. Tudo vem de `core/folha`, e o REGIME vem da fonte
 * única do perfil fiscal — o mesmo que a tela de impostos lê.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Icon, BRL, Skeleton, AcaoDestrutiva } from "@/components/ui";
import { formatBRL, dataBR, pct } from "@/lib/format";
import { ROTULO_REGIME } from "@/core/fiscal/perfil";
import { conferirEncargos, encargosLancados } from "@/core/folha";
import { listColaboradores, regimeDaEmpresa, removeColaborador, restaurarColaboradores, saveColaborador } from "@/lib/folha";
import { useQueryClient } from "@tanstack/react-query";
import { useAccounts, useRiscoInput } from "@/components/visao-geral/hooks";
import { useToast } from "@/components/listas/ListChrome";
import { criarTitulos } from "@/lib/data";
import { reportar } from "@/lib/erros";
import { ModalFerias, ModalRescisao, type TituloGerado } from "./ModalFolha";
import { ModalTabelas } from "./ModalTabelas";
import { tabelasDaEmpresa } from "@/lib/folha-tabelas";
import {
  montarPainelFolha, custoAnual, ROTULO_VINCULO, ROTULO_TITULO,
  type PainelFolha, type LinhaFolha, type Colaborador,
} from "@/core/folha";

const mesAtual = () => new Date().toISOString().slice(0, 7);

const NOMES_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const rotuloMes = (m: string) => {
  const [a, mm] = m.split("-").map(Number);
  return `${NOMES_MES[mm - 1]} de ${a}`;
};
const deslocar = (m: string, n: number) => {
  const [a, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(a, mm - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export function FolhaSalarial() {
  const router = useRouter();
  const [colaboradores, setColaboradores] = React.useState<Colaborador[] | null>(null);
  const [mes, setMes] = React.useState(mesAtual);
  const [aberto, setAberto] = React.useState<string | null>(null);
  const [ferias, setFerias] = React.useState<Colaborador | null>(null);
  const [rescisao, setRescisao] = React.useState<Colaborador | null>(null);
  const [verTabelas, setVerTabelas] = React.useState(false);
  // A versão força o recálculo depois de o contador entrar com uma vigência.
  const [versaoTabelas, setVersaoTabelas] = React.useState(0);
  const qc = useQueryClient();
  const { data: contas } = useAccounts();
  const { show, node } = useToast();

  /**
   * ⚠️ É AQUI QUE A DATA VIRA DINHEIRO NO SISTEMA.
   *
   * O título entra por `criarTitulos`, o escritor único: em demonstração ele
   * anexa ao dataset, em produção ele GRAVA NO BANCO. A versão anterior chamava
   * `appendImported` direto, sem olhar para `isDemo` — em produção a linha ia
   * para um store que ninguém lê, e a tela dizia que tinha agendado.
   *
   * O vencimento vem do motor: dois dias antes das férias, dez dias depois do
   * desligamento, já antecipado quando cai em dia não útil.
   */
  const agendar = React.useCallback(async (titulos: TituloGerado[]): Promise<boolean> => {
    const conta = (contas?.accounts ?? [])[0]?.id ?? "";
    if (!conta) {
      show("Cadastre uma conta bancária antes: o título precisa dizer de qual conta o dinheiro sai.");
      return false;
    }
    try {
      await criarTitulos(titulos.map((t) => ({
        account_id: conta,
        type: "saida" as const,
        amount: t.valor,
        due_date: t.vencimento,
        competence_date: t.vencimento,
        category: t.categoria,
        description: t.descricao,
        origem: "manual" as const,
      })));
      qc.invalidateQueries();
      return true;
    } catch (err) {
      /**
       * ⚠️ A MENSAGEM DO BANCO VAI PARA A TELA, inteira.
       *
       * A lição da ONDA 5: "Não foi possível salvar. Tente novamente" é o único
       * conselho que não pode dar certo, porque repetir reproduz a mesma
       * recusa. O banco manda `message` e `hint` — os dois são a resposta.
       */
      const e = err as { message?: string; hint?: string };
      reportar("folha.agendar", err, "os títulos da folha não foram criados e o caixa não os enxerga");
      show(e?.message ? `Não foi possível agendar: ${e.message}${e.hint ? ` ${e.hint}` : ""}` : "Não foi possível agendar os títulos.");
      return false;
    }
  }, [contas, qc, show]);

  // ⚠️ Lido num efeito, não no render: `store-org` toca `localStorage`, e ler
  // durante o render quebra a hidratação (a tela remonta do zero).
  React.useEffect(() => { setColaboradores(listColaboradores()); }, []);

  const fiscal = React.useMemo(() => regimeDaEmpresa(), []);
  /**
   * ⚠️ As tabelas vêm da EMPRESA (as de fábrica + as que o contador entrou) e
   * entram por parâmetro em cada motor. Lidas num memo com `colaboradores` na
   * dependência para não tocarem `localStorage` durante o primeiro render.
   */
  const tabelas = React.useMemo(
    // `void versaoTabelas` é a dependência DE VERDADE: a leitura é do
    // localStorage, que o React não observa. Sem tocá-la aqui, o lint a remove
    // por "desnecessária" e a folha continua com a tabela velha depois de o
    // contador entrar com a nova.
    () => { void versaoTabelas; return colaboradores ? tabelasDaEmpresa() : undefined; },
    [colaboradores, versaoTabelas],
  );
  const painel: PainelFolha | null = React.useMemo(
    () => (colaboradores ? montarPainelFolha(colaboradores, mes, fiscal.regime, fiscal.anexo, tabelas) : null),
    [colaboradores, mes, fiscal, tabelas],
  );
  const anual = React.useMemo(
    () => (colaboradores?.length ? custoAnual(colaboradores, Number(mes.slice(0, 4)), fiscal.regime, fiscal.anexo, tabelas) : 0),
    [colaboradores, mes, fiscal, tabelas],
  );

  /*
   * ⚠️ O que foi EFETIVAMENTE lançado de encargo na competência, pelas
   * categorias com linha declarada no plano de contas. Comparado ao projetado,
   * é o que transforma "o sistema sabia" em "o sistema avisou".
   */
  const { data: risco } = useRiscoInput();
  const conf = React.useMemo(() => {
    const projetado = painel ? painel.custoTotal - painel.totalBruto : 0;
    return conferirEncargos(projetado, encargosLancados(risco?.movements ?? [], mes));
  }, [painel, risco, mes]);

  if (!painel) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-[150px]" />
        <Skeleton className="h-[300px]" />
      </div>
    );
  }

  const vazio = painel.linhas.length === 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ------------------------ o regime, dito ------------------------ */}
      {fiscal.regime === "nao_declarado" && (
        /* ⚠️ Sem regime declarado o custo NÃO é confiável: os 20% patronais
           entram ou não conforme ele, e a diferença é de 33 pontos sobre a
           mesma folha. Assumir um regime produziria um número com cara de
           certo — a mesma família de defeito da ONDA 6. */
        <Card className="border border-warning/40">
          <div className="flex items-start gap-3">
            <Icon name="triangle-alert" size={18} color="var(--color-warning)" />
            <div className="min-w-0">
              <p className="m-0 text-body text-ink">O regime tributário não está declarado.</p>
              <p className="m-0 mt-1 text-caption text-muted">
                Ele decide se a contribuição patronal de 20% entra no custo de cada funcionário —
                a diferença passa de 30% sobre a mesma folha. Sem ele, o cálculo usa o cenário mais
                caro: os números abaixo são um <b className="text-ink">teto</b>, e declarar o regime
                só pode reduzi-los.
              </p>
              <Button variant="ghost" onClick={() => router.push("/dashboard/administration/company-data")}>
                Declarar o regime
              </Button>
            </div>
          </div>
        </Card>
      )}
      {painel.tabelaDesatualizada && (
        <Card className="border border-warning/40">
          <div className="flex items-start gap-3">
            <Icon name="triangle-alert" size={18} color="var(--color-warning)" />
            <div className="min-w-0">
              <p className="m-0 text-body text-ink">A tabela legal usada não é a mais recente.</p>
              <p className="m-0 mt-1 text-caption text-muted">
                As faixas do INSS mudam por portaria todo janeiro, e o valor só existe quando ela sai —
                o sistema não tem como deduzi-lo. O cálculo segue com a última tabela conhecida; quando
                o seu contador mandar a do ano, entre com ela aqui.
              </p>
              <Button variant="ghost" onClick={() => setVerTabelas(true)}>
                Ver as tabelas em uso
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* ------------------------- o custo do mês ------------------------- */}
      <Card
        info={{
          titulo: "O custo da equipe",
          oQue: "Quanto a folha custa por mês, incluindo o que não aparece no salário.",
          comoCalcula:
            "Salário bruto + FGTS + encargos patronais (conforme o regime) + provisão de 13º e de férias com os encargos sobre elas. Descontos do funcionário (INSS, IRRF, VT, VR) saem do bruto e NÃO aumentam o custo.",
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pr-8">
          <span className="text-h3 text-ink">Folha de {rotuloMes(mes)}</span>
          <div className="flex items-center gap-1">
            {/* Um caminho permanente para as tabelas, não só pelo aviso: a
                pergunta "com que números isto foi calculado" é legítima também
                quando está tudo em dia. */}
            <Button variant="ghost" onClick={() => setVerTabelas(true)}>Tabelas legais</Button>
            <Seta label="Mês anterior" icone="chevron-left" onClick={() => setMes(deslocar(mes, -1))} />
            <span className="text-label text-ink tabular-nums px-2">{mes.split("-").reverse().join("/")}</span>
            <Seta label="Próximo mês" icone="chevron-right" onClick={() => setMes(deslocar(mes, 1))} />
          </div>
        </div>

        {vazio ? (
          <div className="py-10 flex flex-col items-center gap-3">
            <p className="m-0 text-body text-muted text-center">
              Nenhum colaborador cadastrado nesta competência.
            </p>
            <Button variant="primary" onClick={() => router.push("/dashboard/financial/payables/new")}>
              <Icon name="plus" size={15} color="currentColor" />
              Cadastrar colaborador
            </Button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Numero rotulo="Salários e notas (bruto)" valor={painel.totalBruto} forte
                detalhe={`${painel.quantosCLT} CLT · ${painel.quantosPJ} PJ`} />
              <Numero rotulo="A equipe recebe" valor={painel.totalLiquido}
                detalhe="líquido, depois dos descontos" />
              <Numero rotulo="Encargos e provisões" valor={painel.totalEncargos}
                detalhe="FGTS, patronal, 13º e férias" />
              {/* ⚠️ O CUSTO em destaque, com o multiplicador ao lado: é o número
                  que muda a decisão de contratar, e o único que não aparece em
                  nenhum contracheque. */}
              <Numero rotulo="Custo total da empresa" valor={painel.custoTotal}
                detalhe={`${painel.multiplicador.toFixed(2)}× o bruto — bruto + FGTS, patronal e provisões`} />
            </div>
            {/*
              * ⚠️ **O SISTEMA SABIA E NÃO AVISAVA** — a família do A4P-072. A
              * calculadora projeta o encargo pela lei e o extrato diz o que a
              * empresa recolheu; quando os dois discordam muito, uma das duas
              * está errada, e as duas são caras: recolher a menos gera passivo
              * com multa e juros; projetar errado faz planejar caixa sobre um
              * número que não vai acontecer.
              *
              * O aviso não acusa quem ainda não importou o extrato do mês (sem
              * lançamento não há o que comparar) nem grita por arredondamento —
              * ver o limiar de 20% em `conferirEncargos`.
              */}
            {conf.divergente && (
              <p className="m-0 mt-4 text-caption rounded-md px-3 py-2"
                 style={{ background: "color-mix(in srgb, var(--color-warning) 12%, transparent)" }}>
                <b className="text-ink font-medium">Encargos lançados divergem do projetado.</b>{" "}
                A calculadora projeta <b className="text-ink">{formatBRL(conf.projetado)}</b> de FGTS e INSS
                patronal nesta competência; o extrato traz <b className="text-ink">{formatBRL(conf.lancado)}</b>
                {" "}({conf.desvio > 0 ? "+" : ""}{Math.round(conf.desvio * 100)}%). Pode ser quadro de pessoal
                diferente do cadastrado, regime diferente do declarado, ou guia que não foi lançada —
                vale conferir com o contador.
              </p>
            )}
            <p className="m-0 mt-4 text-caption text-muted">
              Regime <b className="text-ink">{ROTULO_REGIME[painel.regime]}</b>
              {painel.anexo ? ` · Anexo ${painel.anexo}` : ""} — {painel.encargos.porque}
              {anual > 0 && (
                <> Ao longo de {mes.slice(0, 4)}, a folha custa{" "}
                  <b className="text-ink">{formatBRL(anual)}</b>.</>
              )}
            </p>
          </>
        )}
      </Card>

      {!vazio && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* ---------------------- quem custa quanto ---------------------- */}
          <Card
            info={{
              titulo: "Quem custa quanto",
              oQue: "O custo de cada colaborador, com a conta aberta.",
              comoCalcula: "Cada linha roda o mesmo motor: descontos do empregado saem do bruto, encargos e provisões entram por cima.",
            }}
          >
            <span className="text-h3 text-ink pr-8">A equipe</span>
            <div className="mt-3 flex flex-col">
              {painel.linhas.map((l) => (
                <LinhaColaborador
                  key={l.colaborador.id}
                  linha={l}
                  aberto={aberto === l.colaborador.id}
                  onAbrir={() => setAberto(aberto === l.colaborador.id ? null : l.colaborador.id)}
                  onRemover={() => {
                    const antes = removeColaborador(l.colaborador.id);
                    setColaboradores(listColaboradores());
                    return () => { restaurarColaboradores(antes); setColaboradores(antes); };
                  }}
                  onFerias={() => setFerias(l.colaborador)}
                  onRescindir={() => setRescisao(l.colaborador)}
                />
              ))}
            </div>
          </Card>

          {/* ----------------------- o que vence quando ----------------------- */}
          <Card
            info={{
              titulo: "A agenda do mês",
              oQue: "Em que dia cada obrigação da folha vence.",
              comoCalcula:
                "Salário no 5º dia útil do mês seguinte (art. 459 da CLT), FGTS e DARF no dia 20, antecipando quando cai em fim de semana ou feriado. O 5º dia útil considera os feriados nacionais, inclusive os móveis.",
            }}
          >
            <div className="flex items-baseline justify-between gap-3 pr-8">
              <span className="text-h3 text-ink">Vencimentos</span>
              <span className="text-caption text-faint">{painel.titulos.length} títulos</span>
            </div>
            {/* ⚠️ Agrupado por DATA, não por pessoa: a pergunta desta coluna é
                "o que sai do caixa no dia 20", e uma lista por pessoa obriga a
                somar de cabeça. */}
            <div className="mt-3 flex flex-col gap-3">
              {agruparPorData(painel.titulos).map((g) => (
                <div key={g.data} className="rounded-card bg-surface-2 p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-label text-ink">{dataBR(g.data)}</span>
                    <span className="a4p-num text-label text-ink"><BRL value={g.total} /></span>
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {g.itens.map((t, k) => (
                      <div key={k} className="flex items-center justify-between gap-3 text-caption">
                        <span className="text-muted truncate">
                          {ROTULO_TITULO[t.tipo]} · {t.colaborador}
                        </span>
                        <span className="a4p-num text-ink shrink-0">
                          <BRL value={t.valor} showDecimals={false} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {ferias && (
        <ModalFerias
          colaborador={ferias} regime={fiscal.regime} anexo={fiscal.anexo} tabelas={tabelas}
          onFechar={() => setFerias(null)}
          onConfirmar={async (titulos) => {
            // ⚠️ Só confirma o que DEU CERTO: anunciar o agendamento antes de
            // saber se o banco aceitou é como o defeito nasceu.
            if (!(await agendar(titulos))) return;
            show(`Férias de ${ferias.nome} agendadas para ${dataBR(titulos[0].vencimento)}.`);
            setFerias(null);
          }}
        />
      )}
      {rescisao && (
        <ModalRescisao
          colaborador={rescisao} regime={fiscal.regime} anexo={fiscal.anexo} tabelas={tabelas}
          onFechar={() => setRescisao(null)}
          onConfirmar={async (titulos, desligadoEm) => {
            if (!(await agendar(titulos))) return;
            /**
             * ⚠️ A RESCISÃO ENCERRA A VIGÊNCIA do colaborador, e é isso que
             * impede a folha de continuar cobrando salário de quem saiu. Sem
             * gravar o `ate`, o mês seguinte geraria salário, FGTS e DARF de um
             * contrato que não existe mais.
             */
            saveColaborador({ ...rescisao, ate: desligadoEm.slice(0, 7) });
            setColaboradores(listColaboradores());
            show(`Rescisão de ${rescisao.nome} agendada para ${dataBR(titulos[0].vencimento)}.`);
            setRescisao(null);
          }}
        />
      )}
      {verTabelas && (
        <ModalTabelas
          competencia={mes}
          onFechar={() => setVerTabelas(false)}
          onMudou={() => setVersaoTabelas((v) => v + 1)}
        />
      )}
      {node}
    </div>
  );
}

/* ========================================================================== */

function agruparPorData(titulos: PainelFolha["titulos"]) {
  const mapa = new Map<string, { data: string; total: number; itens: PainelFolha["titulos"] }>();
  for (const t of titulos) {
    const g = mapa.get(t.vencimento) ?? { data: t.vencimento, total: 0, itens: [] };
    g.total = Math.round((g.total + t.valor) * 100) / 100;
    g.itens.push(t);
    mapa.set(t.vencimento, g);
  }
  return Array.from(mapa.values()).sort((a, b) => a.data.localeCompare(b.data));
}

function LinhaColaborador({
  linha, aberto, onAbrir, onRemover, onFerias, onRescindir,
}: {
  linha: LinhaFolha;
  aberto: boolean;
  onAbrir: () => void;
  onRemover: () => () => void;
  onFerias: () => void;
  onRescindir: () => void;
}) {
  const c = linha.colaborador;
  const memoria = linha.clt?.memoria ?? linha.pj?.memoria ?? [];
  return (
    <div className="border-b border-border-soft last:border-b-0 py-3">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-label text-ink truncate">{c.nome}</span>
          <span className="block text-caption text-faint truncate">
            {ROTULO_VINCULO[c.vinculo]}{c.cargo ? ` · ${c.cargo}` : ""}
          </span>
        </span>
        {/*
          * ⚠️ **O NÚMERO GRANDE ERA O CUSTO, e o rótulo embaixo dizia "bruto".**
          * Quem passa o olho lê o valor em destaque e o rótulo mais próximo — e
          * concluía que o salário do colaborador é R$ 16.244,44 quando ele é
          * R$ 10.000,00. O custo é a informação certa para decidir contratar, e
          * continua na linha; o que estava errado era a HIERARQUIA, que
          * apresentava um número sob o nome de outro.
          */}
        <span className="text-right shrink-0">
          <span className="a4p-num block text-label text-ink"><BRL value={c.valor} /></span>
          <span className="block text-caption text-faint">
            custo <BRL value={linha.custoTotal} showDecimals={false} />
            {linha.clt && ` · ${linha.clt.multiplicador.toFixed(2)}×`}
          </span>
        </span>
        <button
          type="button"
          onClick={onAbrir}
          aria-expanded={aberto}
          aria-label={aberto ? `Ocultar a conta de ${c.nome}` : `Ver a conta de ${c.nome}`}
          className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-surface-2 text-muted hover:text-ink hover:bg-surface-3 transition-colors shrink-0"
        >
          <span className={"transition-transform " + (aberto ? "rotate-180" : "")}>
            <Icon name="chevron-down" size={15} color="currentColor" />
          </span>
        </button>
      </div>

      {aberto && (
        <div className="mt-3 flex flex-col gap-2 rounded-card bg-surface-2 p-3">
          {memoria.map((l) => (
            <div key={l.passo} className="flex items-start justify-between gap-3 text-caption">
              <span className="min-w-0">
                <span className="block text-ink">{l.descricao}</span>
                <span className="block text-faint">{l.formula}</span>
              </span>
              <span className="a4p-num text-ink shrink-0"><BRL value={l.valor} /></span>
            </div>
          ))}
          {/* ⚠️ Só para CLT: férias e rescisão são institutos da CLT. Oferecê-los
              a um prestador PJ seria um caminho que a lei não tem. */}
          {linha.colaborador.vinculo === "clt" && (
            <div className="pt-2 border-t border-border-soft flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onFerias}>
                <Icon name="calendar" size={14} color="currentColor" />
                Programar férias
              </Button>
              <Button variant="ghost" onClick={onRescindir}>
                <Icon name="arrow-up-right" size={14} color="currentColor" />
                Calcular rescisão
              </Button>
            </div>
          )}
          <div className="pt-2 border-t border-border-soft">
            {/* ⚠️ Remover um colaborador NÃO apaga os títulos já criados: eles
                são obrigações que existem no financeiro por conta própria. A
                frase diz isso, senão a pessoa remove esperando limpar o caixa
                e o caixa continua igual. */}
            <AcaoDestrutiva
              rotulo="Remover do cadastro"
              titulo={`Remover ${c.nome} da folha?`}
              descricao="Os títulos já agendados continuam no contas a pagar — remova-os lá se também quiser cancelá-los."
              onConfirmar={onRemover}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function Numero({
  rotulo, valor, detalhe, forte,
}: { rotulo: string; valor: number; detalhe: string; forte?: boolean }) {
  return (
    <div className={"rounded-card p-4 " + (forte ? "bg-ink text-white" : "bg-surface-2")}>
      <span className={"text-caption " + (forte ? "text-white/70" : "text-muted")}>{rotulo}</span>
      <span className={"a4p-num block text-[22px] leading-none mt-2 " + (forte ? "text-white" : "text-ink")}>
        <BRL value={valor} showDecimals={false} />
      </span>
      <span className={"block text-caption mt-2 " + (forte ? "text-white/70" : "text-faint")}>{detalhe}</span>
    </div>
  );
}

function Seta({ label, icone, onClick }: { label: string; icone: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-md text-muted hover:text-ink hover:bg-surface-2 transition-colors"
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}

export { pct };
