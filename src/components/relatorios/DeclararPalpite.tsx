"use client";

/**
 * "Revisar e declarar" — o aviso de palpite do DRE vira ação (Rodada 5).
 *
 * Cada categoria classificada pelo nome aparece com a linha que o palpite
 * escolheu JÁ marcada: confirmar sem mexer não muda número nenhum, só troca
 * adivinhação por declaração. Mudar a linha muda o DRE, e é a pessoa que sabe
 * onde a categoria entra. Grava pelo MESMO escritor do Plano de contas.
 */
import * as React from "react";
import { BRL, Select } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { linhasDREdaNatureza, linhaDREvalida } from "@/core/registros";
import { declararLinhas } from "@/lib/cadastros-hierarquia";

export interface CategoriaPalpite {
  nome: string;
  valor: number;
  linha: string;
  natureza: "receita" | "despesa";
}

export function DeclararPalpite({
  categorias, onFechar, onDeclarado,
}: {
  categorias: CategoriaPalpite[];
  onFechar: () => void;
  onDeclarado: (gravadas: number) => void;
}) {
  // "Sem categoria" não tem nome para casar — fica fora da lista e é dito.
  const declaraveis = categorias.filter((c) => c.nome.trim().toLowerCase() !== "sem categoria");
  const semNome = categorias.length - declaraveis.length;
  const [escolha, setEscolha] = React.useState<Record<string, string>>(
    // A sugestão só entra quando é escolhível para a natureza: uma restituição
    // de imposto cai em "deduções" como ESTORNO (entrada numa linha "-"), e
    // declarar isso para uma categoria de receita seria recusado pelo cadastro.
    () => Object.fromEntries(declaraveis.map((c) => [c.nome, linhaDREvalida(c.linha, c.natureza) ? c.linha : ""])),
  );
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  const salvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      const r = await declararLinhas(declaraveis.map((c) => ({
        nome: c.nome, natureza: c.natureza, linha: escolha[c.nome] ?? "",
      })));
      if (r.recusadas.length) {
        setErro(`${r.recusadas.length} não foi(ram) gravada(s): ${r.recusadas.map((x) => `${x.nome} — ${x.motivo}`).join("; ")}`);
      }
      onDeclarado(r.gravadas);
      if (!r.recusadas.length) onFechar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <FormModal title="Declarar a linha do DRE" onClose={onFechar} onSave={salvar} saving={salvando}>
      <p className="m-0 text-caption text-muted leading-snug">
        A linha marcada é a que o sistema adivinhou e está usando hoje — confirmar sem mudar não altera
        nenhum número. Troque onde a categoria entra de outro jeito.
      </p>
      {erro && <p className="m-0 text-caption text-negative" role="alert">{erro}</p>}
      <div className="flex flex-col gap-3" data-declarar="lista">
        {declaraveis.map((c) => (
          <div key={c.nome} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="text-body text-ink truncate">{c.nome}</div>
              <div className="text-caption text-muted tabular-nums"><BRL value={c.valor} /> no período</div>
            </div>
            <Select
              aria-label={`Linha do DRE de ${c.nome}`}
              value={escolha[c.nome] ?? ""}
              onChange={(v) => setEscolha((s) => ({ ...s, [c.nome]: v }))}
              options={[
                { value: "", label: "Deixar no palpite" },
                ...linhasDREdaNatureza(c.natureza).map((l) => ({ value: l.id, label: l.label })),
              ]}
            />
          </div>
        ))}
      </div>
      {semNome > 0 && (
        <p className="m-0 text-caption text-muted">
          Lançamentos sem categoria não entram aqui: classifique-os na lista de títulos.
        </p>
      )}
    </FormModal>
  );
}
