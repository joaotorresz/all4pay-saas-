"use client";

/**
 * A autorização de WhatsApp na tela de Clientes (etapa 5 das automações).
 *
 * Cliente sem autorização registrada não recebe WhatsApp: a cobrança dele
 * segue por e-mail. Registrar pede a EVIDÊNCIA (como o cliente autorizou) —
 * é ela que responde, numa reclamação, por que a mensagem saiu. Quem
 * respondeu SAIR só volta respondendo VOLTAR: a empresa não desfaz o pedido.
 */
import * as React from "react";
import { Button, Checkbox, StatusBadge, Textarea } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { dataBR } from "@/lib/format";
import {
  useAutorizarWhatsapp, fraseDoResultado, type SituacaoWhatsappContato,
} from "@/lib/whatsapp-autorizacao";

interface ClienteBase { id: string; name: string; phone?: string | null; ativo: boolean }

export function SeloWhatsapp({ telefone, situacao }: { telefone?: string | null; situacao?: SituacaoWhatsappContato }) {
  if (!telefone) return <span className="text-muted">—</span>;
  if (situacao?.saiu) return <StatusBadge tone="warning">Pediu para sair</StatusBadge>;
  if (situacao?.autorizado) {
    return (
      <span className="flex flex-col items-start gap-[2px]" title={situacao.evidencia ?? undefined}>
        <StatusBadge tone="positive">Autorizado</StatusBadge>
        <span className="text-caption text-faint tabular-nums">
          {situacao.forma === "resposta" ? "pelo próprio WhatsApp" : "registrado"} em {dataBR(situacao.autorizadoEm?.slice(0, 10))}
        </span>
      </span>
    );
  }
  return <StatusBadge tone="neutral">Sem autorização</StatusBadge>;
}

export function ModalAutorizarWhatsapp({
  clientes, situacao, inicial, onClose, onFeito,
}: {
  clientes: ClienteBase[];
  situacao: Record<string, SituacaoWhatsappContato>;
  inicial?: string[];
  onClose: () => void;
  onFeito: (mensagem: string) => void;
}) {
  // Só quem PODE ser autorizado: ativo, com telefone, ainda sem autorização e
  // que não pediu para sair.
  const elegiveis = React.useMemo(
    () => clientes.filter((c) => c.ativo && !!c.phone && !situacao[c.id]?.autorizado && !situacao[c.id]?.saiu),
    [clientes, situacao],
  );
  const [marcados, setMarcados] = React.useState<Set<string>>(() => new Set((inicial ?? []).filter((id) => elegiveis.some((c) => c.id === id))));
  const [evidencia, setEvidencia] = React.useState("");
  const [tentou, setTentou] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const autorizar = useAutorizarWhatsapp();

  const todos = elegiveis.length > 0 && marcados.size === elegiveis.length;
  const alternar = (id: string) => setMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const erroEvidencia = evidencia.trim().length < 10 ? "Diga como o cliente autorizou (ex.: \"assinou o contrato com a cláusula de WhatsApp em 10/10\")." : "";
  const erroSelecao = marcados.size === 0 ? "Marque ao menos um cliente." : "";

  async function salvar() {
    setTentou(true); setErro("");
    if (erroEvidencia || erroSelecao) return;
    try {
      const r = await autorizar.mutateAsync({ ids: Array.from(marcados), evidencia: evidencia.trim() });
      onFeito(fraseDoResultado(r));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível registrar a autorização.");
    }
  }

  return (
    <FormModal title="Registrar autorização de WhatsApp" size="medium" onClose={onClose} onSave={salvar} saving={autorizar.isPending}>
      <div className="flex flex-col gap-4">

        {elegiveis.length === 0 ? (
          <p className="text-label text-ink">Nenhum cliente ativo com telefone está esperando autorização.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <Checkbox
              checked={todos}
              onChange={() => setMarcados(todos ? new Set() : new Set(elegiveis.map((c) => c.id)))}
              label={`Marcar todos (${elegiveis.length})`}
            />
            <div className="max-h-[260px] overflow-y-auto flex flex-col gap-1 pl-1" tabIndex={0} role="region" aria-label="Clientes que podem ser autorizados">
              {elegiveis.map((c) => (
                <Checkbox
                  key={c.id}
                  checked={marcados.has(c.id)}
                  onChange={() => alternar(c.id)}
                  label={<span className="flex gap-2"><span className="text-ink">{c.name}</span><span className="text-faint tabular-nums">{c.phone}</span></span>}
                />
              ))}
            </div>
            {tentou && erroSelecao && <span className="text-caption text-negative">{erroSelecao}</span>}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Textarea
            label="Como os clientes autorizaram"
            value={evidencia}
            onChange={(e) => setEvidencia(e.target.value.slice(0, 500))}
            placeholder="Ex.: cláusula de comunicação por WhatsApp no contrato assinado"
            rows={3}
          />
          {tentou && erroEvidencia && <span className="text-caption text-negative">{erroEvidencia}</span>}
        </div>

        {erro && <p className="text-label text-negative">{erro}</p>}
      </div>
    </FormModal>
  );
}

export function BotaoAutorizarWhatsapp({ onClick, pendentes }: { onClick: () => void; pendentes: number }) {
  return (
    <Button variant="secondary" onClick={onClick}>
      Registrar autorização de WhatsApp{pendentes ? ` (${pendentes})` : ""}
    </Button>
  );
}
