"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Icon } from "./Icon";

/**
 * all4pay DS — SelectBusca
 *
 * O select que se BUSCA — e que, quando a busca não acha nada, oferece criar o
 * que falta sem tirar a pessoa do formulário.
 *
 * ⚠️ **Por que ele existe ao lado do `Select` nativo, e não no lugar dele.** O
 * nativo é a escolha certa para listas curtas e fechadas (conta, regime,
 * frequência): ele é acessível de graça, abre o seletor do sistema no telefone
 * e não custa uma linha de JavaScript. Ele deixa de servir quando a lista é
 * LONGA e ABERTA — um plano de contas com sessenta categorias obriga a rolar
 * procurando um nome que a pessoa já sabe, e quando o nome não está lá o
 * caminho é abandonar o lançamento, ir ao cadastro, criar, e voltar do começo.
 *
 * O que ele NÃO faz, de propósito:
 *  · não substitui o nativo em lista curta (o custo de acessibilidade não se
 *    paga);
 *  · não cria nada sozinho — devolve o texto digitado em `onCriar` e quem
 *    decide o que fazer com ele é a tela, porque criar uma categoria exige
 *    dados que este componente não tem como conhecer.
 *
 * Teclado: ↑/↓ andam, Enter escolhe (ou cria, quando o realce está na criação),
 * Esc fecha sem mexer no valor, Tab fecha. O campo é `role="combobox"` com
 * `aria-expanded`/`aria-activedescendant`, e a lista é `role="listbox"`.
 */
export interface OpcaoBusca {
  value: string;
  label: string;
  /** Texto secundário à direita (grupo, código, natureza…). */
  hint?: string;
}

export interface SelectBuscaProps {
  label?: React.ReactNode;
  required?: boolean;
  invalid?: boolean;
  options: OpcaoBusca[];
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Oferece "Criar «o que foi digitado»" quando a busca não casa com nada.
   * Ausente ⇒ a lista vazia diz só que não achou.
   */
  onCriar?: (texto: string) => void;
  /** O rótulo da ação de criar. Padrão: `Criar "<texto>"`. */
  rotuloCriar?: (texto: string) => string;
  disabled?: boolean;
  id?: string;
  containerClassName?: string;
  /** Mensagem quando a lista está vazia por completo (nada cadastrado ainda). */
  vazio?: string;
}

const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function SelectBusca({
  label, required, invalid, options, placeholder, value, onChange,
  onCriar, rotuloCriar, disabled, id, containerClassName, vazio,
}: SelectBuscaProps) {
  const gerado = React.useId();
  const campoId = id || `sb-${gerado}`;
  const listaId = `${campoId}-lista`;

  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [realce, setRealce] = React.useState(0);
  const caixa = React.useRef<HTMLDivElement>(null);
  const campo = React.useRef<HTMLInputElement>(null);

  const escolhida = options.find((o) => o.value === value) ?? null;

  const filtradas = React.useMemo(() => {
    const q = semAcento(busca);
    if (!q) return options;
    return options.filter((o) => semAcento(o.label).includes(q) || semAcento(o.hint ?? "").includes(q));
  }, [options, busca]);

  // A criação só aparece quando há texto E ele não casa EXATAMENTE com uma
  // opção — oferecer "Criar Aluguel" com "Aluguel" na lista convida à
  // duplicata, que é justamente o que um plano de contas não pode ter.
  const podeCriar = !!onCriar && busca.trim().length > 0
    && !options.some((o) => semAcento(o.label) === semAcento(busca));
  const totalItens = filtradas.length + (podeCriar ? 1 : 0);

  React.useEffect(() => { setRealce(0); }, [busca, aberto]);

  // Fechar ao clicar fora: sem isto a lista fica aberta por cima do resto do
  // formulário e o próximo clique é engolido por ela.
  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const abrir = () => {
    if (disabled) return;
    setAberto(true);
    setBusca("");
    requestAnimationFrame(() => campo.current?.focus());
  };

  const escolher = (i: number) => {
    if (podeCriar && i === filtradas.length) {
      onCriar?.(busca.trim());
      setAberto(false);
      return;
    }
    const o = filtradas[i];
    if (!o) return;
    onChange(o.value);
    setAberto(false);
  };

  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (totalItens === 0) return;
      setRealce((r) => (r + (e.key === "ArrowDown" ? 1 : -1) + totalItens) % totalItens);
    } else if (e.key === "Enter") {
      e.preventDefault();
      escolher(realce);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setAberto(false);
    } else if (e.key === "Tab") {
      setAberto(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-[6px]", containerClassName)} ref={caixa}>
      {label && (
        <label htmlFor={campoId} className="text-label font-medium text-muted">
          {label}
          {required && <span className="text-negative"> *</span>}
        </label>
      )}
      <div className="relative">
        {aberto ? (
          <input
            ref={campo}
            id={campoId}
            role="combobox"
            aria-expanded
            aria-controls={listaId}
            aria-autocomplete="list"
            aria-activedescendant={totalItens > 0 ? `${listaId}-${realce}` : undefined}
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={tecla}
            placeholder="Digite para buscar…"
            className={cn(
              "w-full h-10 pl-3 pr-9 rounded-md bg-surface-2 border text-body text-ink",
              "outline-none focus:border-faint",
              invalid ? "border-negative" : "border-transparent",
            )}
          />
        ) : (
          <button
            type="button"
            id={campoId}
            role="combobox"
            aria-expanded={false}
            aria-controls={listaId}
            disabled={disabled}
            onClick={abrir}
            className={cn(
              "w-full h-10 pl-3 pr-9 rounded-md bg-surface-2 border text-body text-left",
              "outline-none focus:border-faint disabled:opacity-45 disabled:cursor-not-allowed",
              escolhida ? "text-ink" : "text-placeholder",
              invalid ? "border-negative" : "border-transparent",
            )}
          >
            <span className="block truncate">{escolhida?.label ?? placeholder ?? "Selecione"}</span>
          </button>
        )}
        <Icon
          name="chevron-down"
          size={14}
          color="var(--color-text-tertiary)"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
        />
        {aberto && (
          <ul
            id={listaId}
            role="listbox"
            className="absolute z-30 left-0 right-0 top-[calc(100%+4px)] max-h-64 overflow-y-auto rounded-md bg-white border border-border shadow-popover py-1"
          >
            {filtradas.map((o, i) => (
              <li
                key={o.value}
                id={`${listaId}-${i}`}
                role="option"
                aria-selected={o.value === value}
                onMouseEnter={() => setRealce(i)}
                onMouseDown={(e) => { e.preventDefault(); escolher(i); }}
                className={cn(
                  "flex items-center justify-between gap-3 px-3 py-2 text-body cursor-pointer",
                  i === realce ? "bg-surface-2 text-ink" : "text-ink",
                )}
              >
                <span className="truncate">{o.label}</span>
                {o.hint && <span className="text-caption text-faint shrink-0">{o.hint}</span>}
              </li>
            ))}
            {podeCriar && (
              <li
                id={`${listaId}-${filtradas.length}`}
                role="option"
                aria-selected={false}
                onMouseEnter={() => setRealce(filtradas.length)}
                onMouseDown={(e) => { e.preventDefault(); escolher(filtradas.length); }}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 text-body cursor-pointer border-t border-border-soft",
                  realce === filtradas.length ? "bg-surface-2 text-ink" : "text-ink",
                )}
              >
                <Icon name="plus" size={14} color="currentColor" />
                <span className="truncate">
                  {rotuloCriar ? rotuloCriar(busca.trim()) : `Criar "${busca.trim()}"`}
                </span>
              </li>
            )}
            {filtradas.length === 0 && !podeCriar && (
              <li className="px-3 py-2 text-body text-muted">
                {options.length === 0 ? (vazio ?? "Nada cadastrado ainda.") : "Nenhum resultado."}
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
