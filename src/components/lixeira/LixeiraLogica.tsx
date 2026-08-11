"use client";

/**
 * A LIXEIRA DE VERDADE — tudo que foi excluído, de qualquer entidade.
 *
 * ⚠️ Ela fica ao lado da lista de lançamentos CANCELADOS, e as duas não se
 * misturam de propósito: "cancelei este pagamento" é estado de negócio (o
 * título existe e não vai acontecer) e "excluí este registro" é outra coisa
 * (ele saiu do sistema). Fundi-las faria a pessoa restaurar um cancelamento
 * achando que estava desfazendo uma exclusão.
 *
 * ⚠️ A restauração diz QUANTOS registros voltaram, e não só "pronto": excluir
 * um cliente esconde o cliente, e restaurar pode reerguer junto os filhos que
 * caíram no mesmo instante. Um "restaurado" mudo esconderia justamente o que a
 * pessoa precisa conferir.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Button, Icon, Badge } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { usePermissoes } from "@/components/app/usePermissoes";
import {
  listarLixeira, restaurarLogico, expurgar, nomeDaEntidade,
  type ItemDaLixeira,
} from "@/lib/exclusao";
import { semServidor } from "@/lib/seguranca";

const RETENCOES = [30, 90, 180, 365];

export function LixeiraLogica() {
  const qc = useQueryClient();
  const { show, node } = useToast();
  const { pode } = usePermissoes();
  const [dias, setDias] = React.useState(90);
  const [busy, setBusy] = React.useState<string | null>(null);

  const lixo = useQuery({
    queryKey: ["lixeira-logica", dias],
    queryFn: () => listarLixeira(dias),
  });

  const chave = (i: ItemDaLixeira) => `${i.entidade}:${i.id}`;

  async function restaurar(i: ItemDaLixeira) {
    setBusy(chave(i));
    try {
      const n = await restaurarLogico(i.entidade, i.id);
      show(n > 1 ? `Restaurado — ${n} registros voltaram junto.` : "Restaurado.");
      await qc.invalidateQueries();
    } catch (e) {
      show(e instanceof Error ? e.message : "Não foi possível restaurar");
    } finally { setBusy(null); }
  }

  async function apagar(i: ItemDaLixeira) {
    // ⚠️ O motivo é pedido AQUI e cobrado pelo BANCO (10 caracteres). Pedir só
    // na tela deixaria a regra do lado que qualquer chamada direta contorna.
    const motivo = window.prompt(
      `Apagar "${i.resumo}" em definitivo. Isto não tem volta.\n\nPor quê?`,
    );
    if (!motivo) return;
    setBusy(chave(i));
    try {
      await expurgar(i.entidade, i.id, motivo);
      show("Apagado em definitivo.");
      await qc.invalidateQueries();
    } catch (e) {
      show(e instanceof Error ? e.message : "Não foi possível apagar");
    } finally { setBusy(null); }
  }

  if (semServidor()) {
    return (
      <Card className="flex flex-col gap-2">
        <span className="text-h3 text-ink">Excluídos</span>
        <p className="m-0 text-caption text-faint max-w-[72ch]">
          Em demonstração os dados vivem neste navegador e não há lixeira no servidor
          para consultar.
        </p>
      </Card>
    );
  }

  const itens = lixo.data ?? [];

  return (
    <Card padded={false} className="flex flex-col">
      <div className="px-5 py-3 border-b border-border-soft flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <span className="text-h3 text-ink">Excluídos</span>
          <p className="m-0 mt-1 text-caption text-faint max-w-[72ch]">
            Tudo que foi excluído continua aqui e volta com um clique. Apagar em
            definitivo é o segundo ato — exige motivo escrito e o papel de quem
            administra.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {itens.length > 0 && <Badge variant="count">{itens.length}</Badge>}
          {/* ⚠️ A retenção é do que se VÊ, não do que se guarda: nada é apagado
              ao trocar este seletor. Uma lixeira que esvazia sozinha ao abrir é
              uma lixeira que perde o que se foi buscar. */}
          <div className="flex items-center gap-1">
            {RETENCOES.map((d) => (
              <button
                key={d}
                onClick={() => setDias(d)}
                className={`text-caption px-2 py-1 rounded-pill ${
                  d === dias ? "bg-surface-2 text-ink" : "text-muted hover:text-ink"
                }`}
              >
                {d} dias
              </button>
            ))}
          </div>
        </div>
      </div>

      {lixo.isLoading ? (
        <div className="px-5 py-6 text-caption text-faint">Carregando…</div>
      ) : itens.length === 0 ? (
        <div className="px-5 py-6 text-caption text-faint">
          Nada excluído nos últimos {dias} dias.
        </div>
      ) : (
        itens.map((i, n) => (
          <div
            key={chave(i)}
            className={`flex items-center gap-3 px-5 py-3 flex-wrap ${n ? "border-t border-border-soft" : ""}`}
          >
            <Icon name="trash-2" size={15} color="var(--color-faint)" />
            <div className="flex-1 min-w-0">
              <span className="block truncate text-[15px] text-ink">{i.resumo}</span>
              <span className="block text-caption text-faint">
                {nomeDaEntidade(i.entidade)} · {i.excluidoEm.slice(0, 10)}
                {i.excluidoPorEmail ? ` · por ${i.excluidoPorEmail}` : ""}
                {i.motivo ? ` · ${i.motivo}` : ""}
              </span>
            </div>
            <Button variant="ghost" onClick={() => restaurar(i)} disabled={busy === chave(i)}>
              {busy === chave(i) ? "…" : "Restaurar"}
            </Button>
            {pode("administrar") && (
              <button
                onClick={() => apagar(i)}
                disabled={busy === chave(i)}
                className="text-caption px-2 py-1 rounded-sm hover:bg-surface-2 disabled:opacity-45"
                style={{ color: "var(--color-negative)" }}
              >
                Apagar de vez
              </button>
            )}
          </div>
        ))
      )}
      {node}
    </Card>
  );
}
