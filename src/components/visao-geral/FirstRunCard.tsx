"use client";

import { useRouter } from "next/navigation";
import { Card, Button, Icon } from "@/components/ui";
import { useFirstRun } from "./hooks";

/**
 * Estado de primeiro acesso (live, organização ainda sem lançamentos).
 * Em vez de widgets vazios, orienta o usuário a popular o sistema:
 * importar um extrato (caminho mais rápido), criar a empresa ou lançar
 * manualmente. Some sozinho quando o primeiro dado entra (não há o que
 * dispensar). Nunca aparece em demonstração.
 */
export function FirstRunCard() {
  const { vazio } = useFirstRun();
  const router = useRouter();
  if (!vazio) return null;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <span className="w-[34px] h-[34px] rounded-md bg-lime inline-flex items-center justify-center shrink-0">
          <Icon name="sparkles" size={18} color="var(--color-on-lime)" />
        </span>
        <div className="min-w-0">
          <h2 className="m-0 text-h3 font-medium text-ink">Vamos dar vida ao seu painel</h2>
          <p className="m-0 mt-1 text-body text-muted leading-[1.5]">
            Sua organização ainda não tem lançamentos.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <Button variant="primary" leftIcon={<Icon name="upload" size={15} />} onClick={() => router.push("/upload")}>
          Upload de dados
        </Button>
        {/* ⚠️ O rótulo era "Configurar empresa" e levava ao wizard de sete
            etapas — que deixou de ser a porta de entrada. Quem chega aqui já
            criou a conta e o nome da empresa; o que resta é o cadastro
            COMPLETO, e o nome do botão passou a dizer isso. Um botão que
            promete "configurar" e abre sete etapas de inscrição municipal faz a
            pessoa desistir no meio — foi assim que o defeito do passo 7 ficou
            dois meses sem ser visto. */}
        <Button variant="secondary" onClick={() => router.push("/comecar")}>
          Cadastrar a empresa inteira
        </Button>
      </div>
    </Card>
  );
}
