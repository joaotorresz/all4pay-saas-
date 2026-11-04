"use client";

/**
 * "Revisar e declarar" — o aviso de palpite do DRE vira ação (Rodada 5).
 *
 * Cada categoria classificada pelo nome aparece com a SUGESTÃO da Quattro AI
 * já marcada (`sugerirLinhaDRE`, a regra única da Fase 4.1). Quase sempre ela
 * é a mesma linha do palpite, e confirmar sem mexer não muda número nenhum.
 * Onde ela difere (encargo de folha que o palpite punha na dedução da
 * receita), a linha diz o motivo e que o DRE vai mudar. Grava pelo MESMO
 * escritor do Plano de contas. Usado no DRE e na entrada (importação).
 */
import * as React from "react";
import { BRL, Select } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { linhasDREdaNatureza, linhaDREvalida } from "@/core/registros";
import { declararLinhas } from "@/lib/cadastros-hierarquia";
import { sugerirLinhaDRE } from "@/core/registros/sugestao";

export interface CategoriaPalpite {
  nome: string;
  valor: number;
  linha: string;
  natureza: "receita" | "despesa";
}

export function DeclararPalpite({
  categorias, onFechar, onDeclarado, titulo = "Declarar a linha do DRE",
}: {
  categorias: CategoriaPalpite[];
  titulo?: string;
  onFechar: () => void;
  onDeclarado: (gravadas: number) => void;
}) {
  // "Sem categoria" não tem nome para casar — fica fora da lista.
  const declaraveis = React.useMemo(
    () => categorias.filter((c) => c.nome.trim().toLowerCase() !== "sem categoria"),
    [categorias],
  );
  const sugestoes = React.useMemo(
    () => Object.fromEntries(declaraveis.map((c) => [c.nome, sugerirLinhaDRE(c.nome, c.natureza, c.linha)])),
    [declaraveis],
  );
  const [escolha, setEscolha] = React.useState<Record<string, string>>(
    // A sugestão só entra quando é escolhível para a natureza: uma restituição
    // de imposto cai em "deduções" como ESTORNO (entrada numa linha "-"), e
    // declarar isso para uma categoria de receita seria recusado pelo cadastro.
    () => Object.fromEntries(declaraveis.map((c) => {
      const s = sugestoes[c.nome]?.linha ?? "";
      return [c.nome, linhaDREvalida(s, c.natureza) ? s : ""];
    })),
  );
  const rotulo = (id: string) => linhasDREdaNatureza("despesa").concat(linhasDREdaNatureza("receita")).find((l) => l.id === id)?.label ?? id;
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
    <FormModal title={titulo} onClose={onFechar} onSave={salvar} saving={salvando}>
      {erro && <p className="m-0 text-caption text-negative" role="alert">{erro}</p>}
      <div className="flex flex-col gap-3" data-declarar="lista">
        {declaraveis.map((c) => (
          <div key={c.nome} className="grid grid-cols-[1fr_auto] items-center gap-3">
            <div className="min-w-0">
              <div className="text-body text-ink truncate">{c.nome}</div>
              <div className="text-caption text-muted tabular-nums"><BRL value={c.valor} /> no período</div>
              {sugestoes[c.nome]?.regra === "encargo-folha" && sugestoes[c.nome].linha !== c.linha && (
                <div className="text-caption text-muted" data-sugestao-muda>
                  Sugestão da Quattro AI: {sugestoes[c.nome].motivo} Hoje o DRE põe em {rotulo(c.linha)}; confirmar muda o resultado.
                </div>
              )}
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
    </FormModal>
  );
}
