"use client";
/**
 * ALÇADA DE APROVAÇÃO — a única morada do teto, editável por organização.
 *
 * ⚠️ Esta tela existe porque o número precisava de UM lugar. Ele morava em três
 * (`central_alcada` por papel, `organization_members.approval_limit` por pessoa,
 * `a4p_company.participantes[].limite` por pessoa) e só o primeiro decidia
 * alguma coisa — os outros dois eram escritos por telas e lidos por ninguém.
 *
 * ⚠️ Quem AUTORIZA é o banco: a política restritiva de `central_alcada` exige
 * `tem_permissao('administrar')`, e o gatilho da Central lê daqui. A tela só
 * apresenta — confiar nela para liberar repetiria o Modo Pro cortina.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Select, Button, InfoHint } from "@/components/ui";
import { BRL } from "@/components/ui";
import { listarAlcada, salvarAlcada, type LinhaAlcada } from "@/lib/alcada";
import { FAIXAS_ALCADA, faixaDoTeto, tetoDaFaixa } from "@/core/seguranca/alcada";
import { PAPEIS, nomeDoPapel } from "@/core/seguranca";
import { usePermissoes } from "@/components/app/usePermissoes";

export function AlcadaCard({ onToast }: { onToast: (m: string) => void }) {
  const qc = useQueryClient();
  const { pode } = usePermissoes();
  const podeEditar = pode("administrar");
  const { data, isLoading, error } = useQuery({ queryKey: ["alcada"], queryFn: listarAlcada });
  const [salvando, setSalvando] = React.useState<string | null>(null);

  const trocar = async (papel: LinhaAlcada["papel"], rotulo: string) => {
    setSalvando(papel);
    try {
      await salvarAlcada(papel, tetoDaFaixa(rotulo));
      await qc.invalidateQueries({ queryKey: ["alcada"] });
      onToast(`Alçada de ${nomeDoPapel(papel)} atualizada.`);
    } catch (e) {
      // ⚠️ Não engole: a recusa vem do banco (política restritiva), e uma falha
      // silenciosa mostraria um teto que o servidor não aceitou.
      onToast(e instanceof Error ? e.message : "Não foi possível salvar a alçada.");
    } finally {
      setSalvando(null);
    }
  };

  const podeAprovar = (papel: string) =>
    // Espelha `role_permissions`: só estes três têm a ação `aprovar`.
    papel === "owner" || papel === "admin" || papel === "aprovador";

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-h2 m-0">Alçada de aprovação</h2>
          <p className="m-0 text-caption text-muted">
            Quanto cada papel confirma sozinho na Central. Quem <em>pode</em> aprovar vem do
            papel; aqui você define <em>quanto</em>.
          </p>
        </div>
        <InfoHint
          align="left"
          oQue="O teto que cada papel confirma sozinho, sem escalar para alguém acima."
          comoCalcula="Vem de central_alcada, por papel e por empresa. O gatilho da Central compara o valor do título com o teto do papel de quem confirma — e antes disso confere se o papel tem a ação aprovar."
        />
      </div>

      {error ? (
        <p className="m-0 text-caption text-muted">Não foi possível carregar a alçada.</p>
      ) : isLoading ? (
        <p className="m-0 text-caption text-muted">Carregando…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {(data ?? []).map((l) => {
            const aprova = podeAprovar(l.papel);
            return (
              <div key={l.papel} className="flex items-center justify-between gap-3 py-2 border-b border-border-soft last:border-0">
                <div className="min-w-0">
                  <p className="m-0 text-label text-ink">{nomeDoPapel(l.papel)}</p>
                  <p className="m-0 text-caption text-muted">
                    {aprova
                      ? l.teto === null
                        ? "Sem teto — confirma qualquer valor."
                        : <>Confirma até <BRL value={l.teto} /> sozinho.</>
                      : /* ⚠️ Dizer POR QUE o teto é 0 evita o chamado de suporte: o
                           problema é o papel, não o número. */
                        "Este papel não confirma títulos — mude o papel, não o teto."}
                  </p>
                </div>
                <Select
                  aria-label={`Alçada de ${nomeDoPapel(l.papel)}`}
                  value={faixaDoTeto(l.teto)}
                  disabled={!podeEditar || !aprova || salvando === l.papel}
                  onChange={(v) => trocar(l.papel, v)}
                  options={FAIXAS_ALCADA.map((f) => ({ value: f.rotulo, label: f.rotulo }))}
                  placeholder={aprova ? "Selecione" : "—"}
                />
              </div>
            );
          })}
        </div>
      )}

      {!podeEditar && (
        <p className="m-0 text-caption text-muted">
          Só quem administra a empresa altera a alçada.
        </p>
      )}
    </Card>
  );
}
