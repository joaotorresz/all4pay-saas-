"use client";

/**
 * Boletos Recebidos (DDA) e NFs Recebidas (SEFAZ).
 *
 * As duas telas dependem de integração que ainda não existe aqui — DDA pede
 * adesão bancária, a captura de XML pede certificado digital. O que NÃO depende
 * de ninguém é o documento em si: a linha digitável carrega banco, valor e
 * vencimento com quatro dígitos verificadores, e a chave de acesso carrega UF,
 * mês, CNPJ do emitente, modelo, série e número com o seu.
 *
 * Por isso as telas nascem operáveis: enquanto a integração não liga, o
 * operador cola o número e o sistema LÊ. Quando ligar, é a mesma lista — só
 * muda quem preenche.
 */
import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { Card, Button, Icon, Input, Select, BRL } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { baixarXLSX } from "@/lib/xlsx";
import { getAccountsList, getCategories } from "@/lib/data";
import {
  lerBoleto, formatarLinha, lerChaveNFe, formatarChave,
  resumoBoletos, filtrarBoletos, statusBoleto,
  resumoNFs, filtrarNFs, valorDigitado,
  STATUS_NF_RECEBIDA, AVALIACOES_NF, TIPOS_NF,
  type BoletoRecebido, type StatusBoleto,
  type NFRecebida, type FiltroNFs, type TipoNF,
  type StatusNFRecebida, type AvaliacaoNF,
} from "@/core/compras";
import {
  listarBoletos, salvarBoleto, removerBoleto, lancarBoleto,
  listarNFs, salvarNF, removerNF, novoId,
} from "@/lib/compras-store";

const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtDia = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

/* ================================= boletos ================================= */

const ROTULO_BOLETO: Record<StatusBoleto, string> = {
  a_vencer: "A vencer", vencido: "Vencido", pago: "Pago",
};
const COR_BOLETO: Record<StatusBoleto, string> = {
  a_vencer: "var(--color-warning)",
  vencido: "var(--color-negative)",
  pago: "var(--color-positive)",
};

export function BoletosView() {
  const qc = useQueryClient();
  const { show: toast, node } = useToast();
  const contas = useQuery({ queryKey: ["accounts-list"], queryFn: getAccountsList });
  const categorias = useQuery({ queryKey: ["categories", "despesa"], queryFn: () => getCategories("despesa") });

  const [lista, setLista] = React.useState<BoletoRecebido[]>([]);
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<StatusBoleto | "todos">("todos");
  const [linha, setLinha] = React.useState("");
  const [beneficiario, setBeneficiario] = React.useState("");
  const hoje = hojeISO();

  React.useEffect(() => { setLista(listarBoletos()); }, []);

  const leitura = React.useMemo(() => (linha.replace(/\D/g, "").length >= 44 ? lerBoleto(linha, hoje) : null), [linha, hoje]);
  const filtrada = React.useMemo(() => filtrarBoletos(lista, busca, status, hoje), [lista, busca, status, hoje]);
  const resumo = React.useMemo(() => resumoBoletos(filtrada, hoje), [filtrada, hoje]);

  function adicionar() {
    if (!leitura) return;
    setLista(salvarBoleto({
      id: novoId("boleto"),
      origem: "manual",
      // ⚠️ O beneficiário NÃO está no código de barras — o campo livre é
      // específico de cada banco e costuma trazer o convênio, não o nome.
      // Preencher com o banco emissor diria que o Itaú é quem está cobrando,
      // quando ele é só o agente de arrecadação.
      beneficiario: beneficiario || "Beneficiário não informado",
      pagador: "Sua empresa",
      leitura,
      pago: false,
      dataPagamento: null,
      recebidoEm: hoje,
      movimentoId: null,
    }));
    setLinha("");
    setBeneficiario("");
    toast("Boleto adicionado.");
  }

  function lancar(b: BoletoRecebido) {
    const conta = contas.data?.[0]?.id ?? "";
    const cat = categorias.data?.[0]?.name ?? "Fornecedores";
    setLista(lancarBoleto(b, conta, cat));
    qc.invalidateQueries();
    toast("Boleto lançado em contas a pagar.");
  }

  const linhasXLSX = [
    ["Beneficiário", "Banco", "Vencimento", "Valor", "Status", "Linha digitável"],
    ...filtrada.map((b) => [
      b.beneficiario, b.leitura.bancoNome ?? b.leitura.banco,
      fmtDia(b.leitura.vencimento), b.leitura.valor,
      ROTULO_BOLETO[statusBoleto(b, hoje)], b.leitura.linhaDigitavel,
    ]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Boletos capturados via DDA para pagamento pela plataforma.</p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" onClick={() => { setLista(listarBoletos()); toast("Lista recarregada."); }}>
            <Icon name="rotate-ccw" size={15} color="currentColor" />
            Recarregar
          </Button>
          <Button
            variant="ghost" disabled={filtrada.length === 0}
            onClick={() => baixarXLSX("boletos-recebidos", [{ nome: "Boletos", linhas: linhasXLSX }])}
          >
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar XLSX
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Kpi rotulo="Boletos" icone="file-text" valor={String(resumo.quantidade)} />
        <Kpi rotulo="Valor total" icone="receipt" node={<BRL value={resumo.valorTotal} />} />
        <Kpi rotulo="A vencer" icone="calendar" valor={String(resumo.aVencer)} />
        <Kpi rotulo="Vencidos" icone="triangle-alert" valor={String(resumo.vencidos)} cor="var(--color-negative)" />
        <Kpi rotulo="Pagos" icone="check" valor={String(resumo.pagos)} cor="var(--color-positive)" />
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Buscar</label>
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Beneficiário, pagador ou código de barras…" />
          </div>
          <Select
            label="Status" value={status} onChange={(v) => setStatus(v as StatusBoleto | "todos")}
            options={[
              { value: "todos", label: "Todos" },
              { value: "a_vencer", label: "A vencer" },
              { value: "vencido", label: "Vencido" },
              { value: "pago", label: "Pago" },
            ]}
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Icon name="scan-line" size={16} color="var(--color-text-secondary)" />
            <span className="text-h3 font-semibold text-ink">Adicionar boleto pelo número</span>
          </div>
          <p className="m-0 text-caption text-faint max-w-[80ch]">
            O DDA ainda não está ativo, mas o boleto não depende dele: cole a linha digitável
            (47 dígitos) ou o código de barras (44) e o sistema lê banco, valor e vencimento —
            e confere os dígitos verificadores.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] gap-3">
            <Input
              value={linha} onChange={(e) => setLinha(e.target.value)}
              placeholder="00000.00000 00000.000000 00000.000000 0 00000000000000"
            />
            <Input value={beneficiario} onChange={(e) => setBeneficiario(e.target.value)} placeholder="Beneficiário (opcional)" />
            <Button variant="primary" onClick={adicionar} disabled={!leitura}>Adicionar</Button>
          </div>
          {leitura && (
            <div className="rounded-md bg-surface-2 px-4 py-3 flex flex-wrap gap-x-8 gap-y-2">
              <Leitura rotulo="Banco" valor={leitura.bancoNome ? `${leitura.banco} · ${leitura.bancoNome}` : leitura.banco} />
              <Leitura rotulo="Valor" node={<BRL value={leitura.valor} />} />
              <Leitura rotulo="Vencimento" valor={fmtDia(leitura.vencimento)} />
              <Leitura
                rotulo="Verificação"
                valor={leitura.valido ? "Dígitos conferem" : leitura.problemas.join(" ")}
                cor={leitura.valido ? "var(--color-positive)" : "var(--color-negative)"}
              />
            </div>
          )}
        </div>
      </Card>

      {filtrada.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="file-text" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[48ch]">
              Nenhum boleto recebido. Ative o DDA em Administração › Integrações — ou cole a
              linha digitável acima para lançar um boleto agora.
            </p>
          </div>
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th>Beneficiário</Th>
                  <Th>Banco</Th>
                  <Th>Linha digitável</Th>
                  <Th>Vencimento</Th>
                  <Th>Status</Th>
                  <Th direita>Valor</Th>
                  <Th direita>Ações</Th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map((b) => {
                  const st = statusBoleto(b, hoje);
                  return (
                    <tr key={b.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2/60 transition-colors">
                      <td className="px-6 py-3 text-label text-ink">{b.beneficiario}</td>
                      <td className="px-6 py-3 text-label text-muted">{b.leitura.bancoNome ?? b.leitura.banco}</td>
                      <td className="px-6 py-3 text-caption text-faint tabular-nums">{formatarLinha(b.leitura.linhaDigitavel)}</td>
                      <td className="px-6 py-3 text-label text-muted tabular-nums">{fmtDia(b.leitura.vencimento)}</td>
                      <td className="px-6 py-3">
                        <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                          <span className="w-[7px] h-[7px] rounded-pill" style={{ background: COR_BOLETO[st] }} />
                          {ROTULO_BOLETO[st]}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right text-label text-ink tabular-nums"><BRL value={b.leitura.valor} /></td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {!b.movimentoId && (
                            <Acao label="Lançar em contas a pagar" icone="arrow-up-right" onClick={() => lancar(b)} />
                          )}
                          <Acao label="Remover" icone="trash-2" onClick={() => { setLista(removerBoleto(b.id)); toast("Boleto removido."); }} perigo />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="m-0 text-caption text-faint">
        Agendamento e pagamento de boletos com integração bancária seguem no fluxo de Contas a Pagar.
      </p>
      {node}
    </div>
  );
}

/* ================================== NFs ================================== */

const COR_NF: Record<StatusNFRecebida, string> = {
  recebida: "var(--color-warning)",
  processada: "var(--color-positive)",
  duplicada: "var(--color-placeholder)",
  erro: "var(--color-negative)",
  cancelada: "var(--color-muted)",
};

const FILTRO_VAZIO: FiltroNFs = {
  de: null, ate: null, valor: null, tipo: "todos",
  status: "todos", fornecedor: "", categoria: "todos", avaliacao: "todos",
};

export function NFsRecebidasView() {
  const { show: toast, node } = useToast();
  const [lista, setLista] = React.useState<NFRecebida[]>([]);
  // Filtros em DUAS camadas: o que se edita e o que está aplicado. É o que o
  // print pede com "Aplicar Filtros" — e é honesto com volume de SEFAZ, onde
  // refiltrar a cada tecla custa caro.
  const [rascunho, setRascunho] = React.useState<FiltroNFs>(FILTRO_VAZIO);
  const [aplicado, setAplicado] = React.useState<FiltroNFs>(FILTRO_VAZIO);
  const [valorTxt, setValorTxt] = React.useState("");
  const [chave, setChave] = React.useState("");
  const [fornecedorNovo, setFornecedorNovo] = React.useState("");
  const [valorNovo, setValorNovo] = React.useState("");

  React.useEffect(() => { setLista(listarNFs()); }, []);

  const leitura = React.useMemo(() => lerChaveNFe(chave), [chave]);
  const filtrada = React.useMemo(() => filtrarNFs(lista, aplicado), [lista, aplicado]);
  const resumo = React.useMemo(() => resumoNFs(filtrada), [filtrada]);
  const categorias = React.useMemo(
    () => Array.from(new Set(lista.map((n) => n.categoria).filter(Boolean))),
    [lista],
  );

  function adicionar() {
    if (!leitura) return;
    const valor = valorDigitado(valorNovo) ?? 0;
    setLista(salvarNF({
      id: novoId("nf"),
      chave: leitura,
      numero: leitura.numero,
      // O modelo da chave decide o tipo — não o que o operador escolheria.
      tipo: (leitura.modelo === "65" ? "NFCE" : leitura.modelo === "57" ? "CTE" : "NFE") as TipoNF,
      fornecedorId: null,
      fornecedor: fornecedorNovo || `CNPJ ${leitura.cnpj}`,
      cnpj: leitura.cnpj,
      emissao: `${leitura.emissao}-01`,
      valor,
      categoria: "",
      status: leitura.valido ? "recebida" : "erro",
      avaliacao: "pendente",
      origem: "manual",
    }));
    setChave(""); setFornecedorNovo(""); setValorNovo("");
    toast(leitura.valido ? "Nota adicionada." : "Nota adicionada com erro: o dígito da chave não confere.");
  }

  function avaliar(n: NFRecebida, a: AvaliacaoNF) {
    setLista(salvarNF({ ...n, avaliacao: a, status: a === "aprovada" ? "processada" : n.status }));
    toast(a === "aprovada" ? "Nota aprovada." : "Nota recusada.");
  }

  const linhasXLSX = [
    ["Número", "Tipo", "Fornecedor", "CNPJ", "Emissão", "Status", "Avaliação", "Valor"],
    ...filtrada.map((n) => [
      n.numero, n.tipo, n.fornecedor, n.cnpj, fmtDia(n.emissao),
      STATUS_NF_RECEBIDA.find((s) => s.id === n.status)?.label ?? n.status,
      AVALIACOES_NF.find((a) => a.id === n.avaliacao)?.label ?? n.avaliacao,
      n.valor,
    ]),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted max-w-[70ch]">
          Notas fiscais recebidas de fornecedores — atualizadas a cada madrugada via integração com a SEFAZ.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="ghost" onClick={() => { setLista(listarNFs()); toast("Lista recarregada."); }}>
            <Icon name="rotate-ccw" size={15} color="currentColor" />
            Recarregar
          </Button>
          <Button
            variant="ghost" disabled={filtrada.length === 0}
            onClick={() => baixarXLSX("nfs-recebidas", [{ nome: "NFs recebidas", linhas: linhasXLSX }])}
          >
            <Icon name="arrow-down-to-line" size={15} color="currentColor" />
            Exportar XLSX
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Kpi rotulo="NFs no filtro" icone="file-text" valor={String(resumo.quantidade)} />
        <Kpi rotulo="Valor total" icone="receipt" node={<BRL value={resumo.valorTotal} />} />
        <Kpi rotulo="Pendentes de validação" icone="triangle-alert" valor={String(resumo.pendentes)} cor="var(--color-warning)" />
      </div>

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-h3 font-semibold text-ink">Filtros</span>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex flex-col gap-[6px]">
              <label className="text-label font-medium text-muted">Data de emissão</label>
              <div className="flex items-center gap-2">
                <Input type="date" value={rascunho.de ?? ""} onChange={(e) => setRascunho({ ...rascunho, de: e.target.value || null })} />
                <Icon name="chevron-right" size={14} color="var(--color-text-tertiary)" />
                <Input type="date" value={rascunho.ate ?? ""} onChange={(e) => setRascunho({ ...rascunho, ate: e.target.value || null })} />
              </div>
            </div>
            <div className="flex flex-col gap-[6px]">
              <label className="text-label font-medium text-muted">Valor</label>
              <Input value={valorTxt} onChange={(e) => setValorTxt(e.target.value)} placeholder="Ex: 1300 ou 1.300,00" />
            </div>
            <Select
              label="Tipo" value={rascunho.tipo ?? "todos"} onChange={(v) => setRascunho({ ...rascunho, tipo: v as TipoNF | "todos" })}
              options={[{ value: "todos", label: "Todos" }, ...TIPOS_NF.map((t) => ({ value: t, label: t }))]}
            />
            <Select
              label="Status da NF" value={rascunho.status ?? "todos"} onChange={(v) => setRascunho({ ...rascunho, status: v as StatusNFRecebida | "todos" })}
              options={[{ value: "todos", label: "Todos" }, ...STATUS_NF_RECEBIDA.map((s) => ({ value: s.id, label: s.label }))]}
            />
            <div className="flex flex-col gap-[6px]">
              <label className="text-label font-medium text-muted">Fornecedor</label>
              <Input value={rascunho.fornecedor ?? ""} onChange={(e) => setRascunho({ ...rascunho, fornecedor: e.target.value })} placeholder="Buscar fornecedor…" />
            </div>
            <Select
              label="Categoria" value={rascunho.categoria ?? "todos"} onChange={(v) => setRascunho({ ...rascunho, categoria: v })}
              options={[{ value: "todos", label: "Todos" }, ...categorias.map((c) => ({ value: c, label: c }))]}
            />
            <Select
              label="Avaliação do usuário" value={rascunho.avaliacao ?? "todos"} onChange={(v) => setRascunho({ ...rascunho, avaliacao: v as AvaliacaoNF | "todos" })}
              options={[{ value: "todos", label: "Todos" }, ...AVALIACOES_NF.map((a) => ({ value: a.id, label: a.label }))]}
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => { setRascunho(FILTRO_VAZIO); setValorTxt(""); setAplicado(FILTRO_VAZIO); }}>
              Limpar filtros
            </Button>
            <Button variant="primary" onClick={() => setAplicado({ ...rascunho, valor: valorDigitado(valorTxt) })}>
              Aplicar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Icon name="scan-line" size={16} color="var(--color-text-secondary)" />
            <span className="text-h3 font-semibold text-ink">Lançar nota pela chave de acesso</span>
          </div>
          <p className="m-0 text-caption text-faint max-w-[80ch]">
            A captura automática exige certificado digital. A chave impressa no DANFE, não: os 44
            dígitos dizem UF, mês de emissão, CNPJ do emitente, modelo, série e número — e o último
            prova que os outros 43 estão certos.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_140px_auto] gap-3">
            <Input value={chave} onChange={(e) => setChave(e.target.value)} placeholder="Chave de acesso (44 dígitos)" />
            <Input value={fornecedorNovo} onChange={(e) => setFornecedorNovo(e.target.value)} placeholder="Fornecedor (opcional)" />
            <Input value={valorNovo} onChange={(e) => setValorNovo(e.target.value)} placeholder="Valor" />
            <Button variant="primary" onClick={adicionar} disabled={!leitura}>Adicionar</Button>
          </div>
          {leitura && (
            <div className="rounded-md bg-surface-2 px-4 py-3 flex flex-wrap gap-x-8 gap-y-2">
              <Leitura rotulo="UF" valor={leitura.uf ?? leitura.codigoUF} />
              <Leitura rotulo="Emissão" valor={leitura.emissao.split("-").reverse().join("/")} />
              <Leitura rotulo="CNPJ do emitente" valor={leitura.cnpj} />
              <Leitura rotulo="Documento" valor={`${leitura.modeloLabel} · série ${leitura.serie} · nº ${leitura.numero}`} />
              <Leitura
                rotulo="Verificação"
                valor={leitura.valido ? "Dígito confere" : "Dígito verificador não confere"}
                cor={leitura.valido ? "var(--color-positive)" : "var(--color-negative)"}
              />
            </div>
          )}
        </div>
      </Card>

      {filtrada.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-pill bg-surface-2">
              <Icon name="receipt" size={20} color="var(--color-text-tertiary)" />
            </span>
            <p className="m-0 text-label text-muted max-w-[48ch]">
              {lista.length === 0
                ? "Nenhuma nota recebida. A captura via SEFAZ roda de madrugada — ou cole a chave de acesso acima."
                : "Nenhuma nota no filtro aplicado."}
            </p>
          </div>
        </Card>
      ) : (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Tabela rolável">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-border-soft">
                  <Th>Número</Th>
                  <Th>Tipo</Th>
                  <Th>Fornecedor</Th>
                  <Th>Chave</Th>
                  <Th>Emissão</Th>
                  <Th>Status</Th>
                  <Th direita>Valor</Th>
                  <Th direita>Avaliação</Th>
                </tr>
              </thead>
              <tbody>
                {filtrada.map((n) => (
                  <tr key={n.id} className="border-b border-border-soft last:border-0 hover:bg-surface-2/60 transition-colors">
                    <td className="px-6 py-3 text-label text-ink tabular-nums">{n.numero}</td>
                    <td className="px-6 py-3 text-label text-muted">{n.tipo}</td>
                    <td className="px-6 py-3 text-label text-ink">{n.fornecedor}</td>
                    <td className="px-6 py-3 text-caption text-faint tabular-nums">
                      {n.chave ? formatarChave(n.chave.chave) : "—"}
                    </td>
                    <td className="px-6 py-3 text-label text-muted tabular-nums">{fmtDia(n.emissao)}</td>
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                        <span className="w-[7px] h-[7px] rounded-pill" style={{ background: COR_NF[n.status] }} />
                        {STATUS_NF_RECEBIDA.find((s) => s.id === n.status)?.label}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right text-label text-ink tabular-nums"><BRL value={n.valor} /></td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {n.avaliacao === "pendente" ? (
                          <>
                            <Acao label="Aprovar nota" icone="check" onClick={() => avaliar(n, "aprovada")} />
                            <Acao label="Recusar nota" icone="x" onClick={() => avaliar(n, "recusada")} perigo />
                          </>
                        ) : (
                          <span className="text-caption text-muted">
                            {AVALIACOES_NF.find((a) => a.id === n.avaliacao)?.label}
                          </span>
                        )}
                        <Acao label="Remover" icone="trash-2" onClick={() => { setLista(removerNF(n.id)); toast("Nota removida."); }} perigo />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Kpi({
  rotulo, icone, valor, node, cor,
}: { rotulo: string; icone: string; valor?: string; node?: React.ReactNode; cor?: string }) {
  return (
    <Card>
      <div className="flex flex-col gap-2">
        <span className="inline-flex items-center gap-[6px] text-[11px] font-medium uppercase tracking-[0.08em] text-faint">
          <Icon name={icone} size={13} color="currentColor" />
          {rotulo}
        </span>
        <span className="text-[22px] leading-none font-semibold tabular-nums" style={{ color: cor ?? "var(--color-ink)" }}>
          {node ?? valor}
        </span>
      </div>
    </Card>
  );
}

function Leitura({ rotulo, valor, node, cor }: { rotulo: string; valor?: string; node?: React.ReactNode; cor?: string }) {
  return (
    <span className="flex flex-col gap-[2px]">
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{rotulo}</span>
      <span className="text-label tabular-nums" style={{ color: cor ?? "var(--color-ink)" }}>{node ?? valor}</span>
    </span>
  );
}

function Th({ children, direita }: { children: React.ReactNode; direita?: boolean }) {
  return (
    <th className={`px-6 py-3 text-[11px] font-medium uppercase tracking-[0.08em] text-faint ${direita ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}

function Acao({ label, icone, onClick, perigo }: { label: string; icone: string; onClick: () => void; perigo?: boolean }) {
  return (
    <button
      onClick={onClick} aria-label={label} title={label}
      className={`p-[6px] rounded-md text-muted transition-colors hover:bg-surface-2 ${perigo ? "hover:text-negative" : "hover:text-positive"}`}
    >
      <Icon name={icone} size={15} color="currentColor" />
    </button>
  );
}
