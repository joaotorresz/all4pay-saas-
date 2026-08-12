"use client";

/**
 * O chrome comum das telas de cadastro.
 *
 * Todas as oito telas repetem a mesma anatomia — subtítulo, "Novo X",
 * "Exportar XLSX", uma faixa de filtros (busca + selects), uma tabela com ID
 * copiável e ações por linha, um vazio. Centralizar isso é o que faz as telas
 * parecerem UM sistema em vez de oito formulários parecidos.
 */
import * as React from "react";
import { Card, Button, Icon, Input, Select, Switch } from "@/components/ui";
import { baixarXLSX, type CelulaXLSX } from "@/lib/xlsx";
import type { FiltroStatus } from "@/core/registros";

/* ------------------------------- cabeçalho ------------------------------- */

export function CabecalhoRegistro({
  subtitulo, acaoNova, exportar,
}: {
  subtitulo: string;
  acaoNova?: { label: string; onClick: () => void };
  exportar?: { nomeArquivo: string; aba: string; linhas: CelulaXLSX[][] };
}) {
  // Sem linha nenhuma o botão não tem o que exportar — desabilitado é mais
  // honesto que baixar uma planilha só com cabeçalho.
  const temDados = (exportar?.linhas.length ?? 0) > 1;
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <p className="m-0 text-label text-muted">{subtitulo}</p>
      <div className="flex items-center gap-2 shrink-0">
        {acaoNova && (
          <Button variant="primary" onClick={acaoNova.onClick}>
            <Icon name="plus" size={15} color="currentColor" />
            {acaoNova.label}
          </Button>
        )}
        {exportar && (
          <Button
            variant="outline"
            disabled={!temDados}
            onClick={() => baixarXLSX(exportar.nomeArquivo, [{ nome: exportar.aba, linhas: exportar.linhas }])}
          >
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar XLSX
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- filtros -------------------------------- */

export interface CampoFiltro {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

export const OPCOES_STATUS: { value: FiltroStatus; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "ativos", label: "Ativo" },
  { value: "inativos", label: "Inativo" },
];

export function FiltrosRegistro({
  busca, onBusca, placeholder, campos = [],
}: {
  busca: string;
  onBusca: (v: string) => void;
  placeholder: string;
  campos?: CampoFiltro[];
}) {
  // Classe ESTÁTICA por contagem: o Tailwind varre o código-fonte, então uma
  // classe interpolada (`lg:grid-cols-${n}`) simplesmente não é gerada.
  const colunas = ["lg:grid-cols-1", "lg:grid-cols-2", "lg:grid-cols-3", "lg:grid-cols-4"][
    Math.min(3, campos.length)
  ];
  return (
    <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${colunas}`}>
      <div className="flex flex-col gap-[6px]">
        <label className="text-caption font-medium text-muted">Buscar</label>
        <Input value={busca} onChange={(e) => onBusca(e.target.value)} placeholder={placeholder} />
      </div>
      {campos.map((c) => (
        <div key={c.label} className="flex flex-col gap-[6px]">
          <label className="text-caption font-medium text-muted">{c.label}</label>
          <Select value={c.value} onChange={c.onChange} options={c.options} />
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- tabela --------------------------------- */

export interface ColunaRegistro<T> {
  chave: string;
  label: string;
  alinhar?: "esquerda" | "direita";
  largura?: string;
  render: (item: T) => React.ReactNode;
}

export function TabelaRegistro<T extends { id: string }>({
  itens, colunas, vazio, acoes,
}: {
  itens: T[];
  colunas: ColunaRegistro<T>[];
  vazio: React.ReactNode;
  acoes?: (item: T) => React.ReactNode;
}) {
  if (itens.length === 0) return <Card>{vazio}</Card>;
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border-soft">
              <Th>ID</Th>
              {colunas.map((c) => <Th key={c.chave} direita={c.alinhar === "direita"}>{c.label}</Th>)}
              {acoes && <Th direita>Ações</Th>}
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2/60 transition-colors">
                <td className="px-6 py-3 align-middle"><IdCopiavel id={i.id} /></td>
                {colunas.map((c) => (
                  <td key={c.chave} className={`px-6 py-3 align-middle text-label text-ink ${c.alinhar === "direita" ? "text-right tabular-nums" : ""}`}>
                    {c.render(i)}
                  </td>
                ))}
                {acoes && <td className="px-6 py-3 align-middle"><div className="flex items-center justify-end gap-1">{acoes(i)}</div></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Th({ children, direita }: { children: React.ReactNode; direita?: boolean }) {
  return (
    <th className={`px-6 py-3 text-[11px] font-medium tracking-[0.08em] text-faint ${direita ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

/** O ID do print: visível, discreto e copiável com um clique. */
export function IdCopiavel({ id }: { id: string }) {
  const [copiado, setCopiado] = React.useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(id).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1400);
        }).catch(() => { /* clipboard bloqueado — o id continua legível */ });
      }}
      title="Copiar ID"
      className="inline-flex items-center gap-[6px] text-caption text-faint hover:text-ink transition-colors tabular-nums"
    >
      {id}
      <Icon name={copiado ? "check" : "layers"} size={12} color="currentColor" />
    </button>
  );
}

/* --------------------------------- ações --------------------------------- */

export function AcaoLinha({
  label, icone, onClick, perigo,
}: { label: string; icone: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`p-[6px] rounded-md text-muted transition-colors hover:bg-surface-2 ${perigo ? "hover:text-negative" : "hover:text-ink"}`}
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}

export function EtiquetaStatus({ ativo }: { ativo: boolean }) {
  return (
    <span className="inline-flex items-center gap-[6px] text-caption text-muted">
      <span className="w-[7px] h-[7px] rounded-pill" style={{ background: ativo ? "var(--color-positive)" : "var(--color-placeholder)" }} />
      {ativo ? "Ativo" : "Inativo"}
    </span>
  );
}

/* --------------------------------- vazio --------------------------------- */

export function VazioRegistro({ texto, acao }: { texto: string; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
      <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
        <Icon name="inbox" size={20} color="var(--color-text-tertiary)" />
      </span>
      <p className="m-0 text-label text-muted max-w-[44ch]">{texto}</p>
      {acao}
    </div>
  );
}

/* -------------------------------- formulário -------------------------------- */

/** Campo com rótulo, obrigatoriedade e a mensagem de erro embaixo. */
export function Campo({
  label, obrigatorio, erro, ajuda, children, className,
}: {
  label: string; obrigatorio?: boolean; erro?: string; ajuda?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`flex flex-col gap-[6px] ${className ?? ""}`}>
      <label className="text-caption font-medium text-muted">
        {label}{obrigatorio && <span className="text-negative"> *</span>}
      </label>
      {children}
      {erro ? <span className="text-caption text-negative">{erro}</span>
        : ajuda ? <span className="text-caption text-faint">{ajuda}</span> : null}
    </div>
  );
}

export function BlocoForm({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-h3 font-semibold text-ink">{titulo}</span>
      {children}
    </div>
  );
}

export function SwitchAtivo({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <Switch checked={checked} onChange={onChange} label={label} />;
}

/** Input numérico de dia (1–31) — o único formato que uma fatura aceita. */
export function InputDia({
  value, onChange, placeholder,
}: { value: number | null; onChange: (v: number | null) => void; placeholder?: string }) {
  return (
    <Input
      type="number"
      min={1}
      max={31}
      value={value == null ? "" : String(value)}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value.trim();
        onChange(v === "" ? null : Number(v));
      }}
    />
  );
}
