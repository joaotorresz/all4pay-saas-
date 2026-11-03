/**
 * Os interruptores da plataforma, só leitura (ver `core/interruptores`).
 * Recebe o estado pronto do servidor: nenhuma variável chega ao navegador,
 * só "ligado" ou o motivo de não estar.
 */
import { Card, StatusBadge } from "@/components/ui";
import {
  GRUPOS_INTERRUPTOR, ROTULO_MOTIVO, resumoInterruptores, type LinhaInterruptor,
} from "@/core/interruptores";

export function InterruptoresView({ linhas }: { linhas: LinhaInterruptor[] }) {
  const r = resumoInterruptores(linhas);
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="text-body text-ink">
          <span className="a4p-num" data-num>{r.ligados}</span> de <span className="a4p-num" data-num>{r.total}</span> ligados
          {r.pendentes > 0 && <>, e {r.pendentes} {r.pendentes === 1 ? "ligado espera" : "ligados esperam"} configuração</>}.
        </p>
        <p className="text-caption text-muted mt-1">
          Ligar e desligar é na Vercel (variável de Production + novo deploy). Os nomes das variáveis estão no
          arquivo de exemplo do ambiente, ao lado do que cada uma faz. Esta tela só mostra o estado.
        </p>
      </Card>
      {GRUPOS_INTERRUPTOR.map((g) => {
        const doGrupo = linhas.filter((l) => l.grupo === g);
        return (
          <Card key={g}>
            <h2 className="text-h3 text-ink mb-3">{g}</h2>
            <ul className="divide-y divide-border-soft">
              {doGrupo.map((l) => (
                <li key={l.id} className="py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-6">
                  <div className="flex-1 min-w-0">
                    <p className="text-body text-ink font-medium">{l.nome}</p>
                    <p className="text-caption text-muted">{l.oQueFaz}</p>
                    {l.exige.length > 0 && <p className="text-caption text-muted">Precisa também de: {l.exige.join(", ")}.</p>}
                  </div>
                  <div className="shrink-0">
                    {l.estado.ligado
                      ? <StatusBadge tone="positive">Ligado</StatusBadge>
                      : <StatusBadge tone={l.estado.motivo === "desligado" ? "neutral" : "warning"}>{ROTULO_MOTIVO[l.estado.motivo]}</StatusBadge>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
