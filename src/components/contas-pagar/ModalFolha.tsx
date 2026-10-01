"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FÉRIAS e RESCISÃO — os dois modais que criam títulos com data.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ **Salvar aqui MOVE DINHEIRO no sistema**, e por isso os dois modais
 * mostram a conta inteira antes do botão. Férias vencem dois dias antes do
 * início; rescisão, dez dias corridos depois do desligamento. As duas datas
 * são legais, as duas antecipam quando caem em dia não útil, e as duas são
 * cravadas no título que vai para o contas a pagar — que é o que a pergunta
 * "as datas de pagamento refletem no sistema" quer dizer.
 *
 * A tela não calcula nada: `core/folha/ferias` e `core/folha/rescisao` fazem a
 * conta, e daqui sai só o título.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { Card, Button, Icon, Input, Select, DateField, CurrencyInput, Checkbox, BRL } from "@/components/ui";
import { dataBR, pct, formatBRL } from "@/lib/format";
import type { Regime, Anexo } from "@/core/fiscal/perfil";
import {
  calcularFerias, FERIAS_PADRAO, diasPorFaltas, maximoAbono,
  calcularRescisao, ROTULO_MODALIDADE, EXPLICACAO_MODALIDADE,
  titulosDaRescisao, titulosDasFerias, titulosSubstituidosNaRescisao,
  primeiraParcelaSubstituida, salariosDoPeriodoDeFerias, decimoJaPagoNoAno,
  type Colaborador, type EntradaFerias, type EntradaRescisao, type Modalidade,
  type LinhaMemoria, type TabelasLegais, type TituloFolha, type LancamentoDaFolha,
} from "@/core/folha";

const hoje = () => new Date().toISOString().slice(0, 10);

/**
 * O título que sai de um modal — o MESMO tipo que o motor produz. Era uma
 * interface própria, sem competência: a tela montava o título à mão e a data do
 * DRE caía no vencimento.
 */
export type TituloGerado = TituloFolha;

/** Os títulos, lado a lado: o que entra e o que sai do contas a pagar. */
function ListaTitulos({
  titulo, itens, vazio,
}: { titulo: string; itens: { descricao: string; vencimento: string; valor: number }[]; vazio?: string }) {
  if (itens.length === 0 && !vazio) return null;
  return (
    <div className="rounded-card border border-border-soft p-4 flex flex-col gap-2">
      <span className="text-label text-ink">{titulo}</span>
      {itens.length === 0 ? (
        <span className="text-caption text-muted">{vazio}</span>
      ) : itens.map((t, k) => (
        <div key={k} className="flex items-center justify-between gap-3 text-caption">
          <span className="min-w-0">
            <span className="block text-ink truncate">{t.descricao}</span>
            <span className="block text-faint">vence {dataBR(t.vencimento)}</span>
          </span>
          <span className="a4p-num text-ink shrink-0"><BRL value={t.valor} /></span>
        </div>
      ))}
    </div>
  );
}

/* ========================================================================== */
/* A moldura                                                                   */
/* ========================================================================== */

/**
 * ⚠️ `createPortal` no `<body>`: o `Card` do DS tem `transform`, e um ancestral
 * transformado vira o bloco de contenção de qualquer `position: fixed` — sem o
 * portal o modal nasce do tamanho do card e cai centrado fora da dobra. É a
 * mesma armadilha já registrada no modal de baixa.
 */
function Moldura({
  titulo, subtitulo, onFechar, children, rodape,
}: {
  titulo: string; subtitulo: string; onFechar: () => void;
  children: React.ReactNode; rodape: React.ReactNode;
}) {
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => { setMontado(true); }, []);
  React.useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onFechar]);
  if (!montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/30 p-4 sm:p-8">
      <div role="dialog" aria-modal="true" aria-label={titulo}
        className="w-full max-w-[820px] rounded-card bg-white shadow-popover">
        <div className="flex items-start justify-between gap-3 p-6 border-b border-border-soft">
          <div className="min-w-0">
            <span className="block text-h3 text-ink">{titulo}</span>
            <span className="block text-caption text-muted mt-1">{subtitulo}</span>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md text-muted hover:text-ink hover:bg-surface-2 shrink-0">
            <Icon name="x" size={16} color="currentColor" />
          </button>
        </div>
        <div className="p-6 flex flex-col gap-5">{children}</div>
        <div className="p-6 border-t border-border-soft flex items-center justify-end gap-2">{rodape}</div>
      </div>
    </div>,
    document.body,
  );
}

function Memoria({ linhas }: { linhas: LinhaMemoria[] }) {
  return (
    <div className="rounded-card bg-surface-2 p-4 flex flex-col gap-2">
      {linhas.map((l) => (
        <div key={l.passo} className="flex items-start justify-between gap-3 text-caption">
          <span className="min-w-0">
            <span className="block text-ink">{l.descricao}</span>
            <span className="block text-faint">{l.formula}</span>
          </span>
          <span className="a4p-num text-ink shrink-0"><BRL value={l.valor} /></span>
        </div>
      ))}
    </div>
  );
}

function Problemas({ lista }: { lista: string[] }) {
  if (lista.length === 0) return null;
  return (
    <div className="rounded-card border border-negative/40 p-4 flex flex-col gap-1">
      {lista.map((p, k) => (
        <span key={k} className="text-caption text-negative">{p}</span>
      ))}
    </div>
  );
}

function Alertas({ lista }: { lista: string[] }) {
  if (lista.length === 0) return null;
  return (
    <div className="rounded-card border border-warning/40 p-4 flex flex-col gap-2">
      {lista.map((a, k) => (
        <span key={k} className="flex items-start gap-2 text-caption text-muted">
          <Icon name="triangle-alert" size={13} color="var(--color-warning)" />
          {a}
        </span>
      ))}
    </div>
  );
}

/** O selo do vencimento — a data é a razão de o modal existir. */
function Vencimento({ data, regra }: { data: string; regra: string }) {
  if (!data) return null;
  return (
    <div className="rounded-card bg-ink text-white p-4 flex items-center gap-3">
      <Icon name="calendar" size={18} color="currentColor" />
      <div className="min-w-0">
        <span className="block text-label">Vence em {dataBR(data)}</span>
        <span className="block text-caption text-white/70">{regra}</span>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* FÉRIAS                                                                      */
/* ========================================================================== */

export function ModalFerias({
  colaborador, regime, anexo, tabelas, lancamentos = [], onFechar, onConfirmar,
}: {
  colaborador: Colaborador;
  regime: Regime;
  anexo: Anexo | null;
  onFechar: () => void;
  tabelas?: TabelasLegais;
  /** Os lançamentos do caixa — para achar a 1ª parcela do 13º que o adiantamento substitui. */
  lancamentos?: readonly LancamentoDaFolha[];
  onConfirmar: (titulos: TituloGerado[], retirar: LancamentoDaFolha[]) => void | Promise<void>;
}) {
  const [e, setE] = React.useState<EntradaFerias>({ ...FERIAS_PADRAO, inicio: hoje() });
  const set = <K extends keyof EntradaFerias>(k: K, v: EntradaFerias[K]) => setE((s) => ({ ...s, [k]: v }));

  const calc = React.useMemo(
    () => calcularFerias(colaborador, e, regime, anexo, tabelas),
    [colaborador, e, regime, anexo, tabelas],
  );
  const direito = diasPorFaltas(e.faltas);
  const ok = calc.problemas.length === 0 && calc.liquido > 0;
  const titulos = React.useMemo(
    () => titulosDasFerias(colaborador, e.inicio, e.diasGozados, calc),
    [colaborador, e.inicio, e.diasGozados, calc],
  );
  /*
   * ⚠️ O ADIANTAMENTO DO 13º É A MESMA 1ª PARCELA. Ela já está agendada para
   * 30/11 desde o cadastro; pagá-la junto com as férias sem retirar a de
   * novembro fazia o caixa pagar a mesma metade do 13º duas vezes.
   */
  const retirar = React.useMemo(
    () => (e.adiantar13 && calc.vencimento ? primeiraParcelaSubstituida(lancamentos, colaborador.nome, calc.vencimento) : []),
    [e.adiantar13, calc.vencimento, lancamentos, colaborador.nome],
  );
  const salarios = React.useMemo(
    () => salariosDoPeriodoDeFerias(lancamentos, colaborador.nome, e.inicio, calc.retorno),
    [lancamentos, colaborador.nome, e.inicio, calc.retorno],
  );

  return (
    <Moldura
      titulo={`Férias de ${colaborador.nome}`}
      subtitulo={`Direito de ${direito} dias · pode vender até ${maximoAbono(direito)}`}
      onFechar={onFechar}
      rodape={
        <>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button
            variant="primary" disabled={!ok || titulos.length === 0}
            onClick={() => onConfirmar(titulos, retirar)}
          >
            <Icon name="check" size={15} color="currentColor" />
            Agendar <BRL value={calc.liquido} />
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Campo label="Início das férias">
          <DateField value={e.inicio} onChange={(v) => set("inicio", v)} />
        </Campo>
        <Campo label="Faltas injustificadas no período" ajuda="Reduzem o direito em degraus (art. 130).">
          <Input type="number" min={0} max={40} value={String(e.faltas)}
            onChange={(ev) => set("faltas", Number(ev.target.value) || 0)} />
        </Campo>
        <Campo label="Dias gozados">
          <Input type="number" min={0} max={30} value={String(e.diasGozados)}
            onChange={(ev) => set("diasGozados", Number(ev.target.value) || 0)} />
        </Campo>
        <Campo
          label="Dias vendidos (abono)"
          ajuda="Verba indenizatória: sem INSS, sem IRRF e sem FGTS."
        >
          <Input type="number" min={0} max={maximoAbono(direito)} value={String(e.diasAbono)}
            onChange={(ev) => set("diasAbono", Number(ev.target.value) || 0)} />
        </Campo>
      </div>
      <Checkbox
        checked={e.adiantar13}
        onChange={(ev) => set("adiantar13", ev.target.checked)}
        label="Adiantar a 1ª parcela do 13º junto com as férias"
      />

      <Problemas lista={calc.problemas} />
      {ok && (
        <>
          <Vencimento
            data={calc.vencimento}
            regra="Até dois dias antes do início (art. 145). Pagar no dia do início já é atraso, e o atraso dobra a remuneração."
          />
          <Memoria linhas={calc.memoria} />
          <p className="m-0 text-caption text-muted">
            Retorna ao trabalho em <b className="text-ink">{dataBR(calc.retorno)}</b>.
            Custo para a empresa: <b className="text-ink"><BRL value={calc.custoTotal} /></b>.
          </p>
          {e.adiantar13 && (
            <ListaTitulos
              titulo="Sai de Títulos a pagar — o adiantamento vai junto com as férias"
              itens={retirar.map((m) => ({ descricao: m.descricao ?? "", vencimento: m.due_date, valor: m.amount }))}
              vazio="Nenhuma 1ª parcela do 13º prevista neste ano. Se ela já foi paga, não adiante de novo — seria a mesma metade do 13º paga duas vezes."
            />
          )}
          {salarios.length > 0 && (
            <Alertas lista={[
              `As férias pagam ADIANTADO os dias de descanso. ${salarios.length === 1 ? "O salário" : "Os salários"} `
              + `${salarios.map((m) => m.descricao?.split(" · ")[0]).join(" e ")} já agendado${salarios.length === 1 ? "" : "s"} `
              + "cobrem o mês inteiro: ajuste-os em Títulos a pagar para os dias efetivamente trabalhados.",
            ]} />
          )}
        </>
      )}
    </Moldura>
  );
}

/* ========================================================================== */
/* RESCISÃO                                                                    */
/* ========================================================================== */

const MODALIDADES: Modalidade[] = [
  "sem_justa_causa", "pedido_demissao", "acordo", "fim_experiencia", "justa_causa",
];

export function ModalRescisao({
  colaborador, regime, anexo, tabelas, lancamentos = [], pagos = [], onFechar, onConfirmar,
}: {
  colaborador: Colaborador;
  regime: Regime;
  anexo: Anexo | null;
  onFechar: () => void;
  tabelas?: TabelasLegais;
  /** Os lançamentos do caixa — para achar os títulos que a rescisão substitui. */
  lancamentos?: readonly LancamentoDaFolha[];
  /**
   * Os lançamentos JÁ PAGOS — para achar a 1ª parcela do 13º que saiu do caixa
   * e que a rescisão tem de descontar.
   */
  pagos?: readonly LancamentoDaFolha[];
  onConfirmar: (titulos: TituloGerado[], desligadoEm: string, retirar: LancamentoDaFolha[]) => void | Promise<void>;
}) {
  const [e, setE] = React.useState<EntradaRescisao>({
    modalidade: "sem_justa_causa",
    desligamento: hoje(),
    admissao: `${colaborador.desde}-01`,
    avisoTrabalhado: false,
    diasFeriasVencidas: 0,
    saldoFGTS: 0,
    estimarSaldo: true,
  });
  const set = <K extends keyof EntradaRescisao>(k: K, v: EntradaRescisao[K]) => setE((s) => ({ ...s, [k]: v }));

  /*
   * ⚠️ O 13º JÁ PAGO NO ANO DO DESLIGAMENTO. Desligado em dezembro, depois da
   * 1ª parcela de 30/11, o funcionário recebia o 13º proporcional INTEIRO na
   * rescisão — a mesma metade duas vezes. O valor sai das 1ªs parcelas baixadas
   * e fica EDITÁVEL: o adiantamento pago junto com as férias vem somado no
   * título das férias, e só quem fez a folha sabe separá-lo.
   */
  const detectado = React.useMemo(
    () => (e.desligamento ? decimoJaPagoNoAno(pagos, colaborador.nome, e.desligamento.slice(0, 4)) : 0),
    [pagos, colaborador.nome, e.desligamento],
  );
  const [adiantadoEditado, setAdiantadoEditado] = React.useState(false);
  React.useEffect(() => {
    if (!adiantadoEditado) setE((s) => (s.decimoAdiantado === detectado ? s : { ...s, decimoAdiantado: detectado }));
  }, [detectado, adiantadoEditado]);

  const calc = React.useMemo(
    () => calcularRescisao(colaborador, e, regime, anexo, tabelas),
    [colaborador, e, regime, anexo, tabelas],
  );
  const ok = calc.problemas.length === 0 && calc.liquido > 0;
  const titulos = React.useMemo(
    () => titulosDaRescisao(colaborador, e, calc, ROTULO_MODALIDADE[e.modalidade]),
    [colaborador, e, calc],
  );
  /*
   * ⚠️ A RESCISÃO SUBSTITUI O QUE O CADASTRO AGENDOU. O cadastro criou até doze
   * competências de salário, FGTS e DARF, mais o 13º. Encerrar a vigência do
   * colaborador (`ate`) só mudava o PAINEL — os títulos seguiam no contas a
   * pagar, e o caixa carregava meses de salário de quem já saiu, além do 13º
   * pago duas vezes (na rescisão e em novembro).
   */
  const retirar = React.useMemo(
    () => (e.desligamento ? titulosSubstituidosNaRescisao(lancamentos, colaborador.nome, e.desligamento) : []),
    [lancamentos, colaborador.nome, e.desligamento],
  );
  const totalAgendar = titulos.reduce((s, t) => s + t.valor, 0);
  const totalRetirar = retirar.reduce((s, m) => s + m.amount, 0);

  return (
    <Moldura
      titulo={`Rescisão de ${colaborador.nome}`}
      subtitulo={`${calc.mesesTrabalhados} meses de casa · ${calc.anosCompletos} anos completos`}
      onFechar={onFechar}
      rodape={
        <>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button
            variant="primary" disabled={!ok || titulos.length === 0}
            onClick={() => onConfirmar(titulos, e.desligamento, retirar)}
          >
            <Icon name="check" size={15} color="currentColor" />
            Agendar <BRL value={totalAgendar} />
          </Button>
        </>
      }
    >
      {/* ⚠️ A MODALIDADE É A PRIMEIRA PERGUNTA: ela decide quais verbas
          existem, e as mesmas cinco aparecem ou somem conforme ela. */}
      <Campo label="Como o contrato terminou" ajuda={EXPLICACAO_MODALIDADE[e.modalidade]}>
        <Select
          value={e.modalidade}
          onChange={(v) => set("modalidade", v as Modalidade)}
          options={MODALIDADES.map((m) => ({ value: m, label: ROTULO_MODALIDADE[m] }))}
        />
      </Campo>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Campo label="Data de admissão">
          <DateField value={e.admissao} onChange={(v) => set("admissao", v)} />
        </Campo>
        <Campo label="Último dia de trabalho">
          <DateField value={e.desligamento} onChange={(v) => set("desligamento", v)} />
        </Campo>
        <Campo label="Dias de férias vencidas" ajuda="Devidas em TODAS as modalidades, inclusive na justa causa.">
          <Input type="number" min={0} max={60} value={String(e.diasFeriasVencidas)}
            onChange={(ev) => set("diasFeriasVencidas", Number(ev.target.value) || 0)} />
        </Campo>
        <Campo label="Saldo do FGTS" ajuda={e.estimarSaldo ? "Estimado. Informe o extrato para a multa sair certa." : "Do extrato do FGTS."}>
          <CurrencyInput value={e.estimarSaldo ? calc.saldoFGTS : e.saldoFGTS}
            onValueChange={(v) => { set("saldoFGTS", v); set("estimarSaldo", false); }} />
        </Campo>
        <Campo
          label="13º já pago neste ano"
          ajuda={detectado > 0 && !adiantadoEditado
            ? "A 1ª parcela já baixada em Títulos a pagar. Ela é descontada do 13º proporcional."
            : "A 1ª parcela ou o adiantamento pago com as férias. É descontado do 13º proporcional."}
        >
          <CurrencyInput value={e.decimoAdiantado ?? 0}
            onValueChange={(v) => { setAdiantadoEditado(true); set("decimoAdiantado", v); }} />
        </Campo>
      </div>
      <Checkbox
        checked={e.avisoTrabalhado}
        onChange={(ev) => set("avisoTrabalhado", ev.target.checked)}
        label="O aviso prévio foi trabalhado"
      />

      <Problemas lista={calc.problemas} />
      <Alertas lista={calc.alertas} />
      {ok && (
        <>
          <Vencimento
            data={calc.vencimento}
            regra="Dez dias corridos do desligamento (art. 477 §6º). Pagar depois custa um salário de multa ao empregado."
          />
          <Memoria linhas={calc.memoria} />
          <p className="m-0 text-caption text-muted">
            Custo total da rescisão: <b className="text-ink"><BRL value={calc.custoTotal} /></b>
            {calc.multaFGTS > 0 && (
              <> — dos quais <b className="text-ink"><BRL value={calc.multaFGTS} /></b> vão para a conta
                vinculada do FGTS ({pct(calc.regra.multaFGTS)} do saldo), não para o funcionário.</>
            )}
          </p>
          <ListaTitulos titulo="Entra em Títulos a pagar" itens={titulos} />
          <ListaTitulos
            titulo={retirar.length > 0
              ? `Sai de Títulos a pagar — ${retirar.length} ${retirar.length === 1 ? "título" : "títulos"} que a rescisão substitui (${formatBRL(totalRetirar)})`
              : "Sai de Títulos a pagar"}
            itens={retirar.map((m) => ({ descricao: m.descricao ?? "", vencimento: m.due_date, valor: m.amount }))}
            vazio="Nenhum salário, encargo ou 13º previsto deste colaborador a partir do mês do desligamento."
          />
        </>
      )}
    </Moldura>
  );
}

/* --------------------------------- peças --------------------------------- */

function Campo({ label, ajuda, children }: { label: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-[6px]">
      <label className="text-caption font-medium text-muted">{label}</label>
      {children}
      {ajuda && <span className="text-caption text-faint">{ajuda}</span>}
    </div>
  );
}
