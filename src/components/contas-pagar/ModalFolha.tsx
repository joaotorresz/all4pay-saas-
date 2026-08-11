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
import { formatBRL, dataBR, pct } from "@/lib/format";
import type { Regime, Anexo } from "@/core/fiscal/perfil";
import {
  calcularFerias, FERIAS_PADRAO, diasPorFaltas, maximoAbono,
  calcularRescisao, ROTULO_MODALIDADE, EXPLICACAO_MODALIDADE,
  type Colaborador, type EntradaFerias, type EntradaRescisao, type Modalidade,
  type LinhaMemoria, type TabelasLegais,
} from "@/core/folha";

const hoje = () => new Date().toISOString().slice(0, 10);

export interface TituloGerado {
  descricao: string;
  valor: number;
  vencimento: string;
  categoria: string;
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
  colaborador, regime, anexo, tabelas, onFechar, onConfirmar,
}: {
  colaborador: Colaborador;
  regime: Regime;
  anexo: Anexo | null;
  onFechar: () => void;
  tabelas?: TabelasLegais;
  onConfirmar: (titulos: TituloGerado[]) => void | Promise<void>;
}) {
  const [e, setE] = React.useState<EntradaFerias>({ ...FERIAS_PADRAO, inicio: hoje() });
  const set = <K extends keyof EntradaFerias>(k: K, v: EntradaFerias[K]) => setE((s) => ({ ...s, [k]: v }));

  const calc = React.useMemo(
    () => calcularFerias(colaborador, e, regime, anexo, tabelas),
    [colaborador, e, regime, anexo, tabelas],
  );
  const direito = diasPorFaltas(e.faltas);
  const ok = calc.problemas.length === 0 && calc.liquido > 0;

  return (
    <Moldura
      titulo={`Férias de ${colaborador.nome}`}
      subtitulo={`Direito de ${direito} dias · pode vender até ${maximoAbono(direito)}`}
      onFechar={onFechar}
      rodape={
        <>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button
            variant="primary" disabled={!ok}
            onClick={() => onConfirmar([{
              descricao: `Férias · ${colaborador.nome} · ${e.diasGozados} dias`,
              valor: calc.liquido,
              vencimento: calc.vencimento,
              categoria: "Folha de pagamento",
            }])}
          >
            <Icon name="check" size={15} color="currentColor" />
            Agendar {formatBRL(calc.liquido)}
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
            Custo para a empresa: <b className="text-ink">{formatBRL(calc.custoTotal)}</b>.
          </p>
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
  colaborador, regime, anexo, tabelas, onFechar, onConfirmar,
}: {
  colaborador: Colaborador;
  regime: Regime;
  anexo: Anexo | null;
  onFechar: () => void;
  tabelas?: TabelasLegais;
  onConfirmar: (titulos: TituloGerado[], desligadoEm: string) => void | Promise<void>;
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

  const calc = React.useMemo(
    () => calcularRescisao(colaborador, e, regime, anexo, tabelas),
    [colaborador, e, regime, anexo, tabelas],
  );
  const ok = calc.problemas.length === 0 && calc.liquido > 0;

  return (
    <Moldura
      titulo={`Rescisão de ${colaborador.nome}`}
      subtitulo={`${calc.mesesTrabalhados} meses de casa · ${calc.anosCompletos} anos completos`}
      onFechar={onFechar}
      rodape={
        <>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
          <Button
            variant="primary" disabled={!ok}
            onClick={() => {
              const titulos: TituloGerado[] = [{
                descricao: `Rescisão · ${colaborador.nome} · ${ROTULO_MODALIDADE[e.modalidade]}`,
                valor: calc.liquido,
                vencimento: calc.vencimento,
                categoria: "Folha de pagamento",
              }];
              // ⚠️ A MULTA É UM TÍTULO SEPARADO. Ela não vai para o empregado —
              // é depositada na conta vinculada do FGTS — e somá-la ao líquido
              // faria o sistema pagar ao funcionário dinheiro que é do fundo.
              if (calc.multaFGTS > 0) {
                titulos.push({
                  // ⚠️ O percentual sai por `pct`, como todo percentual do produto
                  // (regra da ONDA 11: um formato por grandeza).
                  descricao: `Multa do FGTS · ${colaborador.nome} · ${pct(calc.regra.multaFGTS)}`,
                  valor: calc.multaFGTS,
                  vencimento: calc.vencimento,
                  categoria: "Encargos sobre a folha",
                });
              }
              onConfirmar(titulos, e.desligamento);
            }}
          >
            <Icon name="check" size={15} color="currentColor" />
            Agendar {formatBRL(calc.liquido + calc.multaFGTS)}
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
            Custo total da rescisão: <b className="text-ink">{formatBRL(calc.custoTotal)}</b>
            {calc.multaFGTS > 0 && (
              <> — dos quais <b className="text-ink">{formatBRL(calc.multaFGTS)}</b> vão para a conta
                vinculada do FGTS, não para o funcionário.</>
            )}
          </p>
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
