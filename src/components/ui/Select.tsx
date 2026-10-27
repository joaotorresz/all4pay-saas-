import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Quattro DS — Select
 * A native <select> styled to match the DS (quiet bordered field, 10px
 * radius, chevron affordance). Native = fully accessible + mobile-friendly.
 */
export interface SelectOption {
  value: string;
  label: string;
}

/**
 * "+ Cadastrar novo X" no fim da lista (o cadastro rápido, 27/10/2026).
 * `abrir` recebe `escolher`: o item criado volta selecionado no campo.
 * O DS não sabe o que é um cliente — quem monta isto é `cadastroDe(tipo)`
 * (`components/app/criacao`).
 */
export interface CadastroNoCampo {
  rotulo: string;
  abrir: (escolher: (id: string) => void) => void;
}

/** O valor da opção "Cadastrar novo": nunca vira o valor do campo. */
export const VALOR_CADASTRAR = "__a4p_cadastrar__";

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange"> {
  label?: React.ReactNode;
  required?: boolean;
  invalid?: boolean;
  options: SelectOption[];
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  containerClassName?: string;
  /** Oferece cadastrar o que falta sem sair do formulário. */
  cadastrar?: CadastroNoCampo;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  function Select(
    { label, required, invalid, options, placeholder, value, onChange, id, className, containerClassName, cadastrar, ...rest },
    ref,
  ) {
    // ⚠️ O item criado volta DEPOIS de a lista recarregar: chamar o `onChange`
    // de quando a pessoa clicou leria a lista antiga (o nome do cliente sairia
    // vazio). A ref guarda sempre o da última renderização.
    const onChangeAtual = React.useRef(onChange);
    onChangeAtual.current = onChange;
    const vazia = options.length === 0;
    const gerado = React.useId();
    /**
     * ⚠️ SEMPRE há id — e o `<label>` sempre aponta para ele.
     *
     * Antes, o id só nascia quando o rótulo era uma STRING. Um `Select` com
     * rótulo em JSX (com um "i" ao lado, por exemplo) ficava com `htmlFor` e
     * `id` indefinidos, e o rótulo deixava de nomear o campo. A auditoria mediu
     * **7 selects sem nome só na tela do DRE** — os filtros de período, regime e
     * conta. Quem usa leitor de tela ouvia "lista, Agosto 2026" e não tinha como
     * saber que aquilo era o filtro de período.
     */
    const selectId =
      id ||
      (typeof label === "string"
        ? `sel-${label.replace(/\s+/g, "-").toLowerCase()}`
        : `sel-${gerado}`);
    return (
      <div className={cn("flex flex-col gap-[6px]", containerClassName)}>
        {label && (
          <label htmlFor={selectId} className="text-label font-medium text-muted">
            {label}
            {required && <span className="text-negative"> *</span>}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-label={typeof label === "string" ? undefined : (rest["aria-label"] ?? placeholder)}
            value={value}
            onChange={(e) => {
              if (e.target.value === VALOR_CADASTRAR) {
                cadastrar?.abrir((novo) => onChangeAtual.current(novo));
                return;
              }
              onChange(e.target.value);
            }}
            className={cn(
              "a4p-campo w-full appearance-none h-11 pl-4 pr-9 rounded-md bg-white border-campo text-body text-ink",
              "outline-none focus:border-ink",
              value === "" ? "text-placeholder" : "text-ink",
              invalid ? "border-negative" : "border-border",
              className,
            )}
            {...rest}
          >
            {placeholder !== undefined && (
              <option value="" disabled hidden>
                {cadastrar && vazia ? "Nenhum cadastrado ainda" : placeholder}
              </option>
            )}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {cadastrar && <option value={VALOR_CADASTRAR}>+ {cadastrar.rotulo}</option>}
          </select>
          <svg
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--color-text-tertiary)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
        {/* A lista vazia vira CONVITE: sem isto o campo obrigatório trava o
            formulário e a pessoa não sabe por onde começar. */}
        {cadastrar && vazia && (
          <button
            type="button"
            onClick={() => cadastrar.abrir((novo) => onChangeAtual.current(novo))}
            className="self-start inline-flex items-center gap-1 text-caption font-medium text-ink underline underline-offset-2 hover:no-underline"
          >
            + {cadastrar.rotulo.replace(/^Cadastrar novo |^Cadastrar nova /, (m) => m.trim() === "Cadastrar novo" ? "Cadastrar o primeiro " : "Cadastrar a primeira ")}
          </button>
        )}
      </div>
    );
  },
);
