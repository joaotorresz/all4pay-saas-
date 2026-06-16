"use client";

import * as React from "react";
import { Input, Select, Switch } from "@/components/ui";
import { FormModal, SectionTitle } from "@/components/lancamentos/FormModal";
import type { Participante, PapelUsuario, PermissoesUsuario } from "@/core/onboarding";

/** Papéis (hierarquia) + permissões padrão de cada um. O administrador manda:
 *  pode cancelar/excluir usuários. Os demais herdam o default, ajustável. */
export const PAPEIS: { id: PapelUsuario; label: string; descricao: string; perm: PermissoesUsuario }[] = [
  { id: "administrador", label: "Administrador", descricao: "Controle total — gerencia usuários, cancela e exclui.", perm: { visualizar: true, editar: true, autonomia: true } },
  { id: "gestor", label: "Gestor", descricao: "Visualiza e edita; aprova dentro do limite.", perm: { visualizar: true, editar: true, autonomia: false } },
  { id: "operador", label: "Operador", descricao: "Lança e edita o operacional, sem autonomia de aprovação.", perm: { visualizar: true, editar: true, autonomia: false } },
  { id: "visualizador", label: "Visualizador", descricao: "Somente leitura.", perm: { visualizar: true, editar: false, autonomia: false } },
];
const permDe = (papel: PapelUsuario) => PAPEIS.find((p) => p.id === papel)!.perm;

const FUNCOES = ["Administrador", "CEO", "CFO", "Financeiro", "Tesouraria", "Controller", "Contador", "Jurídico", "Operador", "Auditor", "Conselheiro", "Investidor"];

/** Adicionar/editar usuário (participante) — mesma lógica de form de criação.
 *  Define função, hierarquia (papel) e o que pode visualizar/editar/autonomia. */
export function ParticipanteModal({
  inicial,
  onClose,
  onSave,
}: {
  inicial?: Participante;
  onClose: () => void;
  onSave: (p: Participante) => void;
}) {
  const [nome, setNome] = React.useState(inicial?.nome ?? "");
  const [email, setEmail] = React.useState(inicial?.email ?? "");
  const [funcao, setFuncao] = React.useState(inicial?.funcao ?? "Financeiro");
  const [papel, setPapel] = React.useState<PapelUsuario>(inicial?.papel ?? "operador");
  const [perm, setPerm] = React.useState<PermissoesUsuario>(inicial?.permissoes ?? permDe(inicial?.papel ?? "operador"));
  const [aprova, setAprova] = React.useState(inicial?.aprovaPagamentos ?? false);
  const [limite, setLimite] = React.useState(inicial?.limite ?? "R$ 5 mil");

  // Trocar o papel reaplica as permissões-padrão dele (usuário pode ajustar depois).
  const trocarPapel = (p: PapelUsuario) => { setPapel(p); setPerm(permDe(p)); };
  const tog = (k: keyof PermissoesUsuario) => setPerm((s) => ({ ...s, [k]: !s[k] }));

  const salvar = () => {
    if (!nome.trim()) return;
    onSave({ nome: nome.trim(), email: email.trim(), funcao, papel, permissoes: perm, aprovaPagamentos: aprova, limite });
    onClose();
  };

  return (
    <FormModal title={inicial ? "Editar usuário" : "Adicionar usuário"} size="medium" onClose={onClose} onSave={salvar}>
      <SectionTitle>Identificação</SectionTitle>
      <Input label="Nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do usuário" />
      <Input label="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@empresa.com" />
      <Select label="Função" value={funcao} onChange={setFuncao} options={FUNCOES.map((f) => ({ value: f, label: f }))} />

      <SectionTitle>Hierarquia e permissões</SectionTitle>
      <Select label="Papel" value={papel} onChange={(v) => trocarPapel(v as PapelUsuario)} options={PAPEIS.map((p) => ({ value: p.id, label: p.label }))} />
      <span className="text-caption text-faint -mt-1">{PAPEIS.find((p) => p.id === papel)?.descricao}</span>

      <Linha rotulo="Visualizar" desc="Acessa e vê os dados">
        <Switch checked={perm.visualizar} onChange={() => tog("visualizar")} />
      </Linha>
      <Linha rotulo="Editar" desc="Cria e altera lançamentos/cadastros">
        <Switch checked={perm.editar} onChange={() => tog("editar")} />
      </Linha>
      <Linha rotulo="Autonomia" desc="Executa ações sem aprovação adicional">
        <Switch checked={perm.autonomia} onChange={() => tog("autonomia")} />
      </Linha>

      <SectionTitle>Aprovação</SectionTitle>
      <Linha rotulo="Pode aprovar pagamentos" desc="Participa do fluxo de alçada">
        <Switch checked={aprova} onChange={() => setAprova((v) => !v)} />
      </Linha>
      {aprova && <Input label="Limite de aprovação" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="Ex.: R$ 50 mil" />}
    </FormModal>
  );
}

function Linha({ rotulo, desc, children }: { rotulo: string; desc: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      <span className="flex flex-col">
        <span className="text-label text-ink">{rotulo}</span>
        <span className="text-caption text-faint">{desc}</span>
      </span>
      {children}
    </label>
  );
}
