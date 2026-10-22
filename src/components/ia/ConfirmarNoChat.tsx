"use client";

/**
 * O CARTÃO DE CONFIRMAÇÃO da conversa: o lançamento que a Quattro AI propôs
 * (de uma frase dita ou de uma foto lida), com o que ela entendeu à vista e
 * editável — o que fazer, valor, data e categoria — e os botões Confirmar e
 * Cancelar. Nada é gravado antes do clique; depois dele, o cartão vira o
 * desfecho ("Feito: …"), que fica salvo na conversa.
 */
import * as React from "react";
import { Icon, Select, DateField, CurrencyInput, Checkbox } from "@/components/ui";
import { categoriasDoLado } from "@/core/assistant/lancamento-falado";
import { ACAO_MAP, type AcaoFinal } from "@/lib/upload-doc";
import type { PropostaChat } from "@/lib/ia-registro";

const ACOES: Exclude<AcaoFinal, "Transferência">[] = ["Vou pagar", "Paguei", "Vou receber", "Recebi"];
const ROTULO_ACAO: Record<Exclude<AcaoFinal, "Transferência">, string> = {
  "Vou pagar": "Agendar pagamento", "Paguei": "Já paguei", "Vou receber": "Vou receber", "Recebi": "Já recebi",
};

export function ConfirmarNoChat({ pc, onAjustar, onConfirmar, onCancelar }: {
  pc: PropostaChat;
  onAjustar: (patch: Partial<PropostaChat>) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const editavel = pc.estado === "aberta" || pc.estado === "falhou";
  const acao = (pc.acao === "Transferência" ? "Paguei" : pc.acao) as Exclude<AcaoFinal, "Transferência">;
  const lado = ACAO_MAP[acao].tipoMov;
  const pago = ACAO_MAP[acao].pago;
  const categorias = React.useMemo(() => {
    const lista = categoriasDoLado(lado);
    return lista.includes(pc.categoria) ? lista : [pc.categoria, ...lista];
  }, [lado, pc.categoria]);

  if (!editavel) {
    return (
      <div data-ia="proposta" className="flex items-center gap-2 text-[14px] text-muted" role="status">
        <Icon name={pc.estado === "gravada" ? "check" : pc.estado === "gravando" ? "rotate-ccw" : "x"} size={16} strokeWidth={1.5} />
        <span>{pc.estado === "gravando" ? "Gravando…" : pc.desfecho}</span>
      </div>
    );
  }

  return (
    <div data-ia="proposta" className="flex flex-col gap-4 p-5 rounded-card bg-surface-2">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="O que fazer">
        {ACOES.map((a) => (
          <button
            key={a}
            type="button"
            role="radio"
            aria-checked={acao === a}
            onClick={() => {
              // Trocar de lado (pagar ↔ receber) troca a lista de categorias.
              const mudouLado = ACAO_MAP[a].tipoMov !== lado;
              onAjustar({ acao: a, ...(mudouLado ? { categoria: ACAO_MAP[a].tipoMov === "entrada" ? "Outras receitas" : "Outras despesas" } : {}) });
            }}
            className={`h-9 px-4 rounded-pill text-[14px] ${acao === a ? "bg-ink text-white" : "a4p-pilula"}`}
          >
            {ROTULO_ACAO[a]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <CurrencyInput label="Valor" value={pc.valor} onValueChange={(v) => onAjustar({ valor: v })} />
        <DateField label={pago ? "Data" : "Vencimento"} value={pc.data} onChange={(v) => onAjustar({ data: v })} />
        <Select label="Categoria" value={pc.categoria} onChange={(v) => onAjustar({ categoria: v })} options={categorias.map((c) => ({ value: c, label: c }))} />
      </div>
      {pc.analise.sugerirCadastro && pc.analise.contraparte && (
        <Checkbox
          checked={pc.criarContato}
          onChange={(e) => onAjustar({ criarContato: e.target.checked })}
          label={`Cadastrar ${pc.analise.contraparte} nos contatos`}
        />
      )}
      {pc.arquivo && (
        <span className="inline-flex items-center gap-2 text-[13px] text-muted">
          <Icon name="paperclip" size={14} strokeWidth={1.5} /> {pc.arquivo} será anexado ao lançamento
        </span>
      )}
      {pc.desfecho && <p className="m-0 text-[14px] text-negative" role="alert">{pc.desfecho}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onConfirmar} className="inline-flex items-center gap-2 h-10 px-5 rounded-pill text-[14px] bg-ink text-white hover:bg-ink-soft">
          <Icon name="check" size={16} strokeWidth={1.5} /> Confirmar
        </button>
        <button type="button" onClick={onCancelar} className="inline-flex items-center gap-2 h-10 px-5 rounded-pill text-[14px] bg-surface-1 text-ink">
          Cancelar
        </button>
      </div>
    </div>
  );
}
