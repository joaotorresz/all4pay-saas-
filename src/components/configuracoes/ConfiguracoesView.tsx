"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card, Input, Button, Icon, Badge } from "@/components/ui";
import { loadCompany, saveCompany, getOrganizationName, type StoredCompany } from "@/lib/company";

/** Campos de identidade editáveis (rótulo + chave em db). */
const IDENTIDADE: { key: string; label: string }[] = [
  { key: "razaoSocial", label: "Razão social" },
  { key: "fantasia", label: "Nome fantasia" },
  { key: "cnpj", label: "CNPJ" },
  { key: "regime", label: "Regime tributário" },
  { key: "repNome", label: "Representante" },
  { key: "repEmail", label: "E-mail" },
  { key: "repTelefone", label: "Telefone / WhatsApp" },
  { key: "cidade", label: "Cidade" },
  { key: "estado", label: "UF" },
];

export function ConfiguracoesView({ onToast }: { onToast: (m: string) => void }) {
  const router = useRouter();
  const { data: orgName } = useQuery({ queryKey: ["org-name"], queryFn: getOrganizationName });
  const [company, setCompany] = React.useState<StoredCompany | null>(null);
  const [editando, setEditando] = React.useState(false);
  const [form, setForm] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    const c = loadCompany();
    setCompany(c);
  }, []);

  const db = (company?.db ?? {}) as Record<string, string | boolean>;
  const perfil = company?.perfil;
  const participantes = company?.participantes ?? [];
  const estrutura = company?.estrutura;

  const abrirEdicao = () => {
    const f: Record<string, string> = {};
    for (const { key } of IDENTIDADE) f[key] = String(db[key] ?? "");
    setForm(f);
    setEditando(true);
  };
  const salvar = () => {
    const novo: StoredCompany = { ...company, db: { ...db, ...form } };
    saveCompany(novo);
    setCompany(novo);
    setEditando(false);
    onToast("Dados da empresa atualizados");
  };

  const semDados = !company || (!company.db && !company.perfil);

  return (
    <div className="flex flex-col gap-5 pb-4 max-w-4xl">
      {/* Organização */}
      <Card className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="w-[34px] h-[34px] rounded-md bg-ink inline-flex items-center justify-center">
            <Icon name="building" size={18} color="white" />
          </span>
          <div>
            <div className="text-label font-medium text-muted">Organização</div>
            <div className="text-h3 font-medium text-ink">
              {orgName ?? (db.fantasia as string) ?? (db.razaoSocial as string) ?? "Minha empresa"}
            </div>
          </div>
        </div>
        <Badge variant="neutral">Plano único</Badge>
      </Card>

      {semDados ? (
        <Card className="flex flex-col items-start gap-3">
          <span className="text-h3 font-medium text-ink">Complete o cadastro da empresa</span>
          <p className="m-0 text-muted max-w-[60ch]">
            Ainda não há um perfil de empresa salvo neste dispositivo. Use o fluxo guiado
            para informar dados jurídicos, perfil, governança e estrutura financeira.
          </p>
          <Button variant="primary" leftIcon={<Icon name="sparkles" size={15} />} onClick={() => router.push("/comecar")}>
            Configurar empresa
          </Button>
        </Card>
      ) : (
        <>
          {/* Identidade (editável) */}
          <Card className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-label font-medium text-muted">Dados da empresa</span>
              {!editando ? (
                <Button variant="ghost" size="sm" leftIcon={<Icon name="edit" size={14} />} onClick={abrirEdicao}>Editar</Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditando(false)}>Cancelar</Button>
                  <Button variant="primary" size="sm" onClick={salvar}>Salvar</Button>
                </div>
              )}
            </div>
            {editando ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {IDENTIDADE.map(({ key, label }) => (
                  <Input key={key} label={label} value={form[key] ?? ""} onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                {IDENTIDADE.map(({ key, label }) => (
                  <Linha key={key} label={label} value={(db[key] as string) || "—"} />
                ))}
              </div>
            )}
          </Card>

          {/* Perfil empresarial */}
          {perfil && (
            <Card className="flex flex-col gap-4">
              <span className="text-label font-medium text-muted">Perfil empresarial</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <Linha label="Setor" value={perfil.setor || "—"} />
                <Linha label="Modelo de negócio" value={perfil.modelo || "—"} />
                <Linha label="Receita principal" value={perfil.receitaPrincipal || "—"} />
                <Linha label="Frequência" value={perfil.frequencia || "—"} />
                <Linha label="Funcionários" value={perfil.funcionarios || "—"} />
                <Linha label="Faturamento" value={perfil.faturamento || "—"} />
              </div>
              <Chips label="Bancos" items={perfil.bancos} />
              <Chips label="Meios de recebimento" items={perfil.meiosRecebimento} />
              <Chips label="Principais despesas" items={perfil.despesas} />
            </Card>
          )}

          {/* Governança */}
          {participantes.length > 0 && (
            <Card className="flex flex-col gap-3">
              <span className="text-label font-medium text-muted">Governança · participantes</span>
              {participantes.map((p, i) => (
                <div key={i} className="flex items-center gap-3 py-2 border-t border-border-soft first:border-t-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-[17px] font-medium text-ink truncate">{p.nome || "—"}</div>
                    {p.email && <div className="text-caption text-faint truncate">{p.email}</div>}
                  </div>
                  <Badge variant="neutral">{p.funcao}</Badge>
                  <span className="text-caption text-muted w-[110px] text-right truncate">
                    {p.aprovaPagamentos ? `aprova até ${p.limite}` : "não aprova"}
                  </span>
                </div>
              ))}
              <span className="text-caption text-faint">
                Aprovação e limites são informativos por ora — o controle por papel vive em /governanca.
              </span>
            </Card>
          )}

          {/* Estrutura financeira */}
          {estrutura && (
            <Card className="flex flex-col gap-4">
              <span className="text-label font-medium text-muted">Estrutura financeira</span>
              <Chips label="Contas" items={estrutura.contas.map((c) => `${c.banco} · ${c.tipo}`)} />
              <Chips label="Centros de custo" items={estrutura.centrosCusto} />
              <Chips label="Unidades" items={estrutura.unidades} />
              <Chips label="Visões de DRE" items={estrutura.dre} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                <Linha label="Fluxo de caixa" value={estrutura.fluxoCaixa || "—"} />
              </div>
              <span className="text-caption text-faint">
                Contas, centros e unidades foram criados no seu cadastro ao concluir o onboarding.
              </span>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Linha({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-caption text-faint">{label}</span>
      <span className="text-[17px] text-ink">{value}</span>
    </div>
  );
}

function Chips({ label, items }: { label: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-caption text-faint">{label}</span>
      <div className="flex flex-wrap gap-2">
        {items.map((it, i) => (
          <span key={i} className="text-caption text-ink bg-surface-2 rounded-pill px-[10px] py-[3px]">{it}</span>
        ))}
      </div>
    </div>
  );
}
