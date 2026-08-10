"use client";

/**
 * PROJEÇÃO DA CARGA TRIBUTÁRIA — quanto vou pagar de imposto daqui para frente.
 *
 * ⚠️ PORTE de `/impostos` (mapa de consolidação, item 5). A tela canônica de
 * provisionamento olha para TRÁS — apura o que já foi vendido e gera a conta a
 * pagar. A projeção olha para FRENTE, e é ela que responde "quanto vou pagar de
 * imposto no trimestre". Aposentar `/impostos` sem trazer isto perderia a única
 * leitura prospectiva de tributo do produto.
 *
 * ⚠️ E a correção que faz o porte valer: **o regime vem da CONFIGURAÇÃO da
 * empresa**, não de um array cravado no topo do arquivo. `/impostos` assumia
 * Lucro Presumido serviços para todo mundo — uma empresa do Simples via uma
 * projeção que não tinha relação com o que ela paga, e a tela não dizia isso.
 */
import * as React from "react";
import { Card, BRL, Icon, StatusBadge, Select } from "@/components/ui";
import { useRiscoInput } from "@/components/visao-geral/hooks";
import { loadCompany } from "@/lib/company";
import { perfilTributario, regimeDaEmpresa } from "@/core/tax/regime";
import { REGIMES, type RegimeTributario } from "@/core/administracao";
import { receitaTributavel, janelaMes, janelaUltimosDias, parseLocal } from "@/core/indicadores";

const MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function ProjecaoCarga() {
  const { data: input } = useRiscoInput();
  // O regime salvo no cadastro da empresa. O select existe para SIMULAR outro
  // regime — não para substituir a configuração, que é onde a decisão mora.
  const [regime, setRegime] = React.useState<RegimeTributario>("presumido");
  const [salvo, setSalvo] = React.useState<RegimeTributario | null>(null);

  React.useEffect(() => {
    // localStorage só depois de montar (hidratação).
    // ⚠️ Pelo RESOLVEDOR, não por `db.regime` cru. Esta tela importava
    // `regimeDaEmpresa` e mesmo assim lia a chave direto: uma empresa que
    // preencheu o regime no onboarding (que grava `regimeTributario`) caía no
    // padrão aqui e via a carga de um regime que não é o dela.
    const db = loadCompany()?.db as Record<string, unknown> | undefined;
    if (db && (db.regime || db.regimeTributario)) {
      const r = regimeDaEmpresa(db);
      setRegime(r); setSalvo(r);
    }
  }, []);

  const perfil = perfilTributario(regime);

  const calc = React.useMemo(() => {
    if (!input) return null;
    const hoje = parseLocal(input.hoje);
    // A base é a RECEITA TRIBUTÁVEL do indicador canônico — que já exclui
    // transferência, resgate, empréstimo e receita financeira. Projetar sobre
    // "todas as entradas" inflaria a base e, com ela, o imposto.
    const meses: { label: string; receita: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
      meses.push({
        label: `${MES_ABBR[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`,
        receita: receitaTributavel(input, janelaMes(d.getFullYear(), d.getMonth())).valor,
      });
    }
    const comReceita = meses.filter((m) => m.receita > 0);
    const media = comReceita.length ? comReceita.reduce((s, m) => s + m.receita, 0) / comReceita.length : 0;
    const base12 = receitaTributavel(input, janelaUltimosDias(365, input.hoje)).valor;
    return { meses, media, base12 };
  }, [input]);

  if (!calc) return null;

  const projecao = [
    { rotulo: "Próximo mês", receita: calc.media },
    { rotulo: "Próximo trimestre", receita: calc.media * 3 },
    { rotulo: "Próximos 12 meses", receita: calc.media * 12 },
  ];

  return (
    <Card className="flex flex-col gap-4"
      info={{
        titulo: "Projeção da carga tributária",
        oQue: "Quanto de imposto a sua receita deve gerar daqui para frente, no regime da empresa.",
        comoCalcula:
          "Projeta a média mensal da RECEITA TRIBUTÁVEL dos últimos 12 meses (que já exclui transferência, resgate, empréstimo e receita financeira) e aplica as alíquotas efetivas do regime configurado. É uma projeção sobre a média, não uma apuração — a apuração real, por venda, está na tabela abaixo.",
      }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-h3 text-ink">Projeção da carga</span>
        <StatusBadge tone={salvo === regime ? "positive" : "warning"}>
          {salvo === regime ? `Regime da empresa: ${perfil.rotulo}` : `Simulando ${perfil.rotulo}`}
        </StatusBadge>
      </div>

      {/* ⚠️ O regime é CONFIGURAÇÃO, não constante. O select simula; a decisão
          mora no cadastro da empresa, e a tela diz de onde o valor veio. */}
      <div className="flex items-end gap-3 flex-wrap">
        <Select
          label="Regime tributário"
          value={regime}
          onChange={(v) => setRegime(v as RegimeTributario)}
          options={REGIMES.map((r) => ({ value: r.id, label: r.label }))}
          containerClassName="min-w-[220px]"
        />
        {salvo && salvo !== regime && (
          <button onClick={() => setRegime(salvo)} className="text-caption font-medium text-ink hover:underline pb-2">
            Voltar ao regime da empresa
          </button>
        )}
        {!salvo && (
          <span className="text-caption text-faint pb-2 max-w-[46ch]">
            A empresa ainda não tem regime salvo — defina em Dados da empresa para a
            projeção parar de assumir um.
          </span>
        )}
      </div>

      {perfil.tributos ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {projecao.map((p) => (
              <div key={p.rotulo} className="flex flex-col gap-[2px]">
                <span className="text-caption text-faint">{p.rotulo}</span>
                <span className="text-[20px] font-semibold tabular-nums text-ink">
                  <BRL value={p.receita * perfil.cargaTotal} />
                </span>
                <span className="text-caption text-placeholder">
                  sobre <BRL value={p.receita} /> de receita
                </span>
              </div>
            ))}
          </div>

          <div className="flex flex-col border-t border-border-soft pt-2">
            {perfil.tributos.map((t) => (
              <div key={t.nome} className="flex items-baseline gap-3 py-[6px] border-b border-border-soft last:border-0">
                <span className="w-[74px] shrink-0 text-[15px] text-ink">{t.nome}</span>
                <span className="w-[64px] shrink-0 text-caption tabular-nums text-muted">
                  {(t.aliquota * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
                </span>
                <span className="flex-1 text-caption text-faint truncate">{t.origem}</span>
                <span className="tabular-nums text-ink shrink-0">
                  <BRL value={calc.media * 12 * t.aliquota} />
                </span>
              </div>
            ))}
            <div className="flex items-baseline gap-3 pt-2">
              <span className="flex-1 text-[15px] font-medium text-ink">
                Carga total · {(perfil.cargaTotal * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
              </span>
              <span className="text-[18px] font-semibold tabular-nums text-ink">
                <BRL value={calc.media * 12 * perfil.cargaTotal} />
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-surface-1">
          <Icon name="info" size={15} color="var(--color-text-tertiary)" />
          <span className="text-caption text-muted max-w-[70ch]">{perfil.observacao}</span>
        </div>
      )}

      {perfil.tributos && (
        <span className="text-caption text-faint max-w-[80ch]">{perfil.observacao}</span>
      )}
    </Card>
  );
}
