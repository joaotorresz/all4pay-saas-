"use client";

/**
 * Plano de Contas — a "espinha dorsal contábil" no modelo IULI: hierarquia em
 * dois níveis (Grupo → Categoria) codificada por cor (verde = Receita · vermelho
 * = Despesa), usada em lançamentos, relatórios e na ordem/totalizadores do DRE.
 * A aba "Uso padrão" é o dicionário de AUTO-CLASSIFICAÇÃO: cada função do motor
 * (taxas, comissões, estornos, chargeback…) aponta para uma categoria padrão.
 * Plano padrão opinativo (negócios digitais), demo-safe. Reconstrução fiel.
 */
import * as React from "react";
import { Card, Icon } from "@/components/ui";
import { AppShell } from "@/components/app/AppShell";

type Tipo = "receita" | "despesa" | "resultado";
interface Grupo { nome: string; tipo: Tipo; categorias: string[] }

// Plano de contas padrão (negócios digitais) — estrutura do IULI.
const PLANO: Grupo[] = [
  { nome: "Receitas de Produtos", tipo: "receita", categorias: ["Produto Físico", "Produto Online", "Outros Produtos"] },
  { nome: "Receitas de Serviços", tipo: "receita", categorias: ["Mentoria", "Treinamento", "Treinamento Presencial", "Consultoria", "Royalties", "Outros Serviços"] },
  { nome: "Descontos e Devoluções", tipo: "despesa", categorias: ["Descontos", "Devolução ao Cliente", "Reembolsado", "Chargeback", "Reclamado"] },
  { nome: "Impostos Sobre Vendas", tipo: "despesa", categorias: ["ICMS", "PIS", "COFINS", "IPI", "Simples", "IRPJ", "CSLL", "ISS", "INSS"] },
  { nome: "Custos de Equipe", tipo: "despesa", categorias: ["Custos de Equipe"] },
  { nome: "Custos Extras", tipo: "despesa", categorias: ["Ferramentas", "Lançamentos", "Eventos"] },
  { nome: "Ads", tipo: "despesa", categorias: ["Facebook Ads", "Google Ads"] },
  { nome: "Tarifa da Plataforma", tipo: "despesa", categorias: ["Taxa Plataforma", "Taxa de Antecipação", "Taxa Comissão Coprodutor", "Taxa Comissão Afiliado", "Tarifa De Streaming", "Tarifas Bancárias"] },
  { nome: "Despesas Administrativas", tipo: "despesa", categorias: ["Despesas Administrativas"] },
  { nome: "Despesas com Pessoal", tipo: "despesa", categorias: ["Folha de pagamento", "Pró-labore", "Encargos", "Benefícios"] },
  { nome: "Despesas com Marketing", tipo: "despesa", categorias: ["Marketing"] },
  { nome: "Ferramentas e Softwares", tipo: "despesa", categorias: ["Ferramentas e Softwares"] },
  { nome: "Despesas com Veículos", tipo: "despesa", categorias: ["Veículos"] },
  { nome: "Despesas Financeiras", tipo: "despesa", categorias: ["Juros", "Tarifas", "IOF"] },
  { nome: "Receitas Financeiras", tipo: "receita", categorias: ["Rendimentos", "Juros Recebidos"] },
  { nome: "Impostos sobre o Lucro", tipo: "resultado", categorias: ["IRPJ", "CSLL"] },
  { nome: "Não Operacionais", tipo: "resultado", categorias: ["Receitas não Operacionais", "Despesas não Operacionais", "Amortização", "Investimentos", "Participações de Sócios"] },
];

// "Uso padrão" — dicionário de auto-classificação (função do motor → categoria).
const USO_PADRAO: { funcao: string; categoria: string; quando: string }[] = [
  { funcao: "Receita padrão", categoria: "Outros Produtos", quando: "Vendas importadas sem categoria informada" },
  { funcao: "Taxa de plataforma", categoria: "Taxa Plataforma", quando: "Abatida em vendas de plataformas externas" },
  { funcao: "Taxa de antecipação", categoria: "Taxa de Antecipação", quando: "Recebimento antecipado pela plataforma" },
  { funcao: "Comissão de coprodutor", categoria: "Taxa Comissão Coprodutor", quando: "Repasse para coprodução" },
  { funcao: "Comissão de vendedor/afiliado", categoria: "Taxa Comissão Afiliado", quando: "Repasse a afiliados/vendedores" },
  { funcao: "Streaming", categoria: "Tarifa De Streaming", quando: "Repasse de streaming/transmissão" },
  { funcao: "Taxa bancária", categoria: "Tarifas Bancárias", quando: "Taxas em recebimento/repasse" },
  { funcao: "Estorno de receita / despesa", categoria: "Reembolso / Reembolsado", quando: "Estornos em vendas / pagamentos" },
  { funcao: "Chargeback", categoria: "Devolução de Estorno / Chargeback", quando: "Estorno de receita / taxa do adquirente" },
  { funcao: "Juros", categoria: "Juros de parcelamento / mora", quando: "Configurável" },
];

const tipoMeta: Record<Tipo, { cor: string; label: string }> = {
  receita: { cor: "var(--color-positive)", label: "Receita" },
  despesa: { cor: "var(--color-negative)", label: "Despesa" },
  resultado: { cor: "var(--color-text-secondary)", label: "Resultado / Não operacional" },
};

export function PlanoDeContasView() {
  const [aba, setAba] = React.useState<"plano" | "uso">("plano");
  return (
    <AppShell title="Plano de Contas">
      <div className="flex flex-col gap-5 pb-6">
        {/* Abas */}
        <div className="flex p-1 gap-1 rounded-pill bg-surface-2 self-start" role="tablist">
          {([["plano", "Plano de contas"], ["uso", "Uso padrão"]] as const).map(([v, l]) => {
            const on = aba === v;
            return (
              <button key={v} role="tab" aria-selected={on} onClick={() => setAba(v)}
                className={`text-caption font-medium rounded-pill px-4 py-[7px] transition-colors ${on ? "bg-white text-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                {l}
              </button>
            );
          })}
        </div>

        {aba === "plano" ? (
          <>
            <Card className="flex items-center gap-5 flex-wrap" info={{ titulo: "Plano de contas", oQue: "A espinha dorsal contábil: organiza receitas e despesas em grupos e categorias para lançar, relatar e montar o DRE.", comoCalcula: "Hierarquia fixa Grupo então Categoria, codificada por cor (verde receita, vermelho despesa), que define a ordem e os totalizadores do DRE." }}>
              <Legenda cor="var(--color-positive)" label="Receita (Contas a Receber)" />
              <Legenda cor="var(--color-negative)" label="Despesa (Contas a Pagar)" />
              <Legenda cor="var(--color-text-secondary)" label="Resultado / não operacional" />
              <span className="text-caption text-faint ml-auto">Hierarquia Grupo → Categoria · define a ordem e os totalizadores do DRE.</span>
            </Card>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              {PLANO.map((g) => (
                <Card key={g.nome} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-[10px] h-[10px] rounded-sm shrink-0" style={{ background: tipoMeta[g.tipo].cor }} />
                    <span className="text-[16px] font-semibold text-ink flex-1">{g.nome}</span>
                    <span className="text-caption text-faint">{tipoMeta[g.tipo].label}</span>
                  </div>
                  <div className="flex flex-col">
                    {g.categorias.map((c, i) => (
                      <div key={c} className={`flex items-center gap-2 py-[6px] ${i ? "border-t border-border-soft" : ""}`}>
                        <span className="w-[6px] h-[6px] rounded-pill shrink-0" style={{ background: tipoMeta[g.tipo].cor }} />
                        <span className="text-[15px] text-ink">{c}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <>
            <Card className="flex items-start gap-3" info={{ titulo: "Uso padrão", oQue: "O dicionário que ensina o motor a classificar cada lançamento sozinho, sem categorização manual a cada importação." }}>
              <Icon name="sparkles" size={18} color="var(--color-lime)" />
              <p className="m-0 text-caption text-muted">
                O <b className="text-ink font-medium">Uso padrão</b> é o dicionário que permite ao motor classificar
                lançamentos automaticamente: cada função (taxas, comissões, estornos, chargeback…) aponta para uma
                categoria do plano. É o coração da automação fiscal-contábil — sem ele, cada importação exigiria
                categorização manual.
              </p>
            </Card>
            <Card padded={false} info={{ titulo: "Mapa de auto-classificação", oQue: "Mostra para onde cada função do motor (taxas, comissões, estornos, chargeback) é lançada por padrão.", comoCalcula: "Tabela fixa que liga função do motor então categoria do plano então situação em que a regra é aplicada." }}>
              <div className="hidden sm:grid grid-cols-[1.2fr_1.2fr_1.6fr] gap-3 px-5 py-3 border-b border-border-soft text-caption font-medium text-muted">
                <span>Função do motor</span><span>Categoria padrão</span><span>Quando é usada</span>
              </div>
              {USO_PADRAO.map((u, i) => (
                <div key={u.funcao} className={`grid grid-cols-1 sm:grid-cols-[1.2fr_1.2fr_1.6fr] gap-1 sm:gap-3 px-5 py-3 ${i ? "border-t border-border-soft" : ""}`}>
                  <span className="text-[15px] text-ink font-medium">{u.funcao}</span>
                  <span className="text-[15px] text-ink inline-flex items-center gap-2">
                    <span className="w-[6px] h-[6px] rounded-pill bg-lime shrink-0" />{u.categoria}
                  </span>
                  <span className="text-caption text-muted">{u.quando}</span>
                </div>
              ))}
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Legenda({ cor, label }: { cor: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-caption text-muted">
      <span className="w-[10px] h-[10px] rounded-sm" style={{ background: cor }} />{label}
    </span>
  );
}
