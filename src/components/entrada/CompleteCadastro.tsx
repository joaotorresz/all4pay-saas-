"use client";

/**
 * COMPLETE SEU CADASTRO — o que o cadastro de três campos deixou para depois.
 *
 * ⚠️ **A ordem não é arbitrária, e é a única parte que não pode ser mexida sem
 * pensar: o REGIME TRIBUTÁRIO vem primeiro porque é o único item que MUDA
 * CÁLCULO.** Sem ele, a provisão de imposto não sabe qual tabela usar e o custo
 * da folha sai pelo cenário mais caro — a mesma empresa aparece 1,29× no
 * Simples Anexo III e 1,62× no Lucro Presumido. CNPJ, inscrições e porte são
 * identificação: aparecem em documento, não em conta.
 *
 * ⚠️ **E ele SOME quando não há o que completar.** Um cartão de pendência que
 * fica na tela depois de resolvido ensina a pessoa a ignorar cartões — e o
 * próximo, que importa, ela também ignora.
 */

import * as React from "react";
import Link from "next/link";
import { Card, Button, Icon, Select } from "@/components/ui";
import { loadCompany, saveCompany, persistCompany, type StoredCompany } from "@/lib/company";
import { isDemo } from "@/lib/demo";
import { useFirstRun } from "@/components/visao-geral/hooks";
import { regimeDaEmpresa } from "@/core/tax/regime";

const REGIMES = [
  { value: "Simples Nacional", label: "Simples Nacional" },
  { value: "Lucro Presumido", label: "Lucro Presumido" },
  { value: "Lucro Real", label: "Lucro Real" },
  { value: "MEI", label: "MEI" },
];

type Pendencia = { chave: string; titulo: string; porque: string; onde?: string };

/** O que falta, em ordem de CONSEQUÊNCIA — não de formulário. */
function pendencias(c: StoredCompany | null): Pendencia[] {
  const db = (c?.db ?? {}) as Record<string, unknown>;
  const vazio = (k: string) => !String(db[k] ?? "").trim();
  const fora: Pendencia[] = [];
  // 1º, sempre: é o único que muda número.
  //
  // ⚠️ **Quem lê as duas chaves é `regimeDaEmpresa`, nunca esta tela.** A guarda
  // da ONDA 13 pegou exatamente isso na primeira versão deste arquivo: o regime
  // já morou em três lugares, e cada tela que reescreve a precedência cria a
  // quarta morada.
  //
  // O resolvedor sempre devolve um dos quatro regimes — não existe "não
  // declarado" no tipo. Então a pergunta "existe regime?" se faz PERGUNTANDO
  // DUAS VEZES, com padrões diferentes: se a resposta muda, foi o padrão que
  // respondeu, e portanto não há nada declarado. Nenhuma chave é lida aqui.
  if (regimeDaEmpresa(db, "simples") !== regimeDaEmpresa(db, "presumido")) {
    fora.push({
      chave: "regime",
      titulo: "Regime tributário",
      porque: "É o que decide a tabela de imposto e o custo real da sua folha. Sem ele, o sistema calcula pelo cenário mais caro.",
    });
  }
  if (vazio("cnpj")) fora.push({ chave: "cnpj", titulo: "CNPJ", porque: "Aparece nos relatórios e no que você manda ao contador.", onde: "/dashboard/administration/company-data" });
  if (vazio("razaoSocial")) fora.push({ chave: "razaoSocial", titulo: "Razão social", porque: "O nome jurídico, como sai em documento.", onde: "/dashboard/administration/company-data" });
  return fora;
}

export function CompleteCadastro() {
  const [c, setC] = React.useState<StoredCompany | null>(null);
  const [montado, setMontado] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const [regime, setRegime] = React.useState("");

  // ⚠️ Ler o armazenamento local DURANTE o render quebra a hidratação — a
  // mesma armadilha que o painel de integrações já documenta.
  React.useEffect(() => { setC(loadCompany()); setMontado(true); }, []);
  const { vazio } = useFirstRun();

  const faltando = React.useMemo(() => pendencias(c), [c]);
  /**
   * ⚠️ **ORGANIZAÇÃO SEM LANÇAMENTO NÃO VÊ ESTE CARTÃO — e a razão é
   * sequenciamento, não estética.** Numa organização recém-criada o
   * `FirstRunCard` já ocupa a tela pedindo a importação do extrato, que é o que
   * faz o produto mostrar QUALQUER coisa. Dois cartões pedindo cadastro ao
   * mesmo tempo dividem a atenção e nenhum é feito.
   *
   * E há uma razão de mérito: o regime tributário decide o CÁLCULO, e antes do
   * primeiro lançamento não há cálculo nenhum para decidir. Ele passa a
   * importar no instante em que os números existem — que é exatamente quando
   * este cartão aparece.
   */
  if (!montado || vazio || faltando.length === 0) return null;

  const primeira = faltando[0];
  const ehRegime = primeira.chave === "regime";

  const salvarRegime = async () => {
    if (!regime || salvando) return;
    setSalvando(true);
    try {
      const atual = loadCompany() ?? {};
      const novo: StoredCompany = { ...atual, db: { ...(atual.db ?? {}), regime, regimeTributario: regime } };
      saveCompany(novo);
      if (!isDemo) { try { await persistCompany(novo); } catch { /* o local já vale */ } }
      setC(novo);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="w-8 h-8 rounded-pill bg-surface-2 inline-flex items-center justify-center shrink-0">
          <Icon name="user" size={16} color="var(--color-text-secondary)" />
        </span>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <span className="text-h3 text-ink">Complete seu cadastro</span>
          <p className="m-0 text-body text-muted max-w-[60ch]">
            {faltando.length === 1
              ? "Falta um item, e é o que mais muda os seus números."
              : `Faltam ${faltando.length} itens. Comece por este — é o único que muda cálculo.`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-1 border-t border-border-soft">
        <span className="text-label font-medium text-ink pt-2">{primeira.titulo}</span>
        <p className="m-0 text-caption text-muted max-w-[60ch]">{primeira.porque}</p>

        {ehRegime ? (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <div className="min-w-[220px]">
              <Select label="Escolha o regime" value={regime} onChange={setRegime} options={REGIMES} placeholder="Selecione" />
            </div>
            <Button variant="primary" onClick={salvarRegime} disabled={!regime || salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        ) : (
          <div className="pt-1">
            <Link href={primeira.onde ?? "/dashboard/administration/company-data"}>
              <Button variant="secondary">Preencher agora</Button>
            </Link>
          </div>
        )}
      </div>

      {faltando.length > 1 && (
        <span className="text-caption text-faint">
          Depois: {faltando.slice(1).map((p) => p.titulo).join(" · ")} — em Configurações, quando quiser.
        </span>
      )}
    </Card>
  );
}
