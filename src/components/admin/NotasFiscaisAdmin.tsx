"use client";
/**
 * Notas fiscais na área da plataforma: o cadastro fiscal de cada empresa
 * (`nfse_emitentes`) e o cadastro da empresa na Focus com o certificado A1.
 * A forma dos campos é a de `core/nfse/cadastro-fiscal`; quem grava é a rota.
 */
import * as React from "react";
import { Button, Card, Input, Select, StatusBadge } from "@/components/ui";
import { CAMPOS_FISCAIS, formularioDaConfig, type CampoFiscal } from "@/core/nfse/cadastro-fiscal";
import { REGIMES_FOCUS, type DadosEmpresaFocus } from "@/core/nfse/empresa-focus";

export interface EmpresaFiscal {
  id: string;
  nome: string;
  config: Record<string, unknown> | null;
  atualizadoPor: string | null;
  atualizadoEm: string | null;
}

const GRUPOS: CampoFiscal["grupo"][] = ["Empresa", "Serviço", "Reforma tributária", "Avançado"];
const SIM_NAO = [{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }];

type Aviso = { tom: "positive" | "warning"; linhas: string[] } | null;

function AvisoCard({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <div className="flex flex-col gap-1" role="status">
      <StatusBadge tone={aviso.tom}>{aviso.tom === "positive" ? "Pronto" : "Não deu certo"}</StatusBadge>
      {aviso.linhas.map((l) => <p key={l} className="text-caption text-muted">{l}</p>)}
    </div>
  );
}

export function NotasFiscaisAdmin({ empresas, cadastroFocusLigado }: { empresas: EmpresaFiscal[]; cadastroFocusLigado: boolean }) {
  const [orgId, setOrgId] = React.useState(empresas.find((e) => e.config)?.id ?? empresas[0]?.id ?? "");
  const empresa = empresas.find((e) => e.id === orgId) ?? null;
  const comCadastro = empresas.filter((e) => e.config).length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <p className="text-body text-ink">
          <span className="a4p-num" data-num>{comCadastro}</span> de <span className="a4p-num" data-num>{empresas.length}</span> empresas com cadastro fiscal.
        </p>
        <p className="text-caption text-muted mt-1">
          A nota sai sempre com o CNPJ e o certificado da empresa escolhida. Os códigos de serviço vêm do contador de cada empresa.
        </p>
        <div className="mt-4 max-w-md">
          <Select label="Empresa" value={orgId} onChange={setOrgId}
            options={empresas.map((e) => ({ value: e.id, label: e.config ? e.nome : `${e.nome} (sem cadastro)` }))} />
        </div>
      </Card>
      {empresa && <CadastroFiscal key={empresa.id} empresa={empresa} />}
      {empresa && <CadastroFocus key={`focus-${empresa.id}`} empresa={empresa} ligado={cadastroFocusLigado} />}
    </div>
  );
}

function CadastroFiscal({ empresa }: { empresa: EmpresaFiscal }) {
  const [valores, setValores] = React.useState(() => formularioDaConfig(empresa.config));
  const [salvando, setSalvando] = React.useState(false);
  const [aviso, setAviso] = React.useState<Aviso>(null);
  const muda = (k: string, v: string) => setValores((s) => ({ ...s, [k]: v }));

  async function salvar() {
    setSalvando(true); setAviso(null);
    try {
      const r = await fetch("/api/admin/nfse-emitentes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgId: empresa.id, valores }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) setAviso({ tom: "positive", linhas: ["Cadastro fiscal salvo. A próxima nota já sai com ele."] });
      else setAviso({ tom: "warning", linhas: j.problemas ?? [j.motivo ?? "Não foi possível salvar."] });
    } catch {
      setAviso({ tom: "warning", linhas: ["Sem conexão. Nada foi salvo."] });
    } finally { setSalvando(false); }
  }

  return (
    <Card>
      <h2 className="text-h3 text-ink">Cadastro fiscal</h2>
      <p className="text-caption text-muted mt-1">
        {empresa.atualizadoEm
          ? <>Última mudança em <span data-num>{new Date(empresa.atualizadoEm).toLocaleString("pt-BR")}</span>{empresa.atualizadoPor ? `, por ${empresa.atualizadoPor}` : ""}.</>
          : "Esta empresa ainda não emite nota."}
      </p>
      {GRUPOS.map((g) => (
        <section key={g} className="mt-5">
          <h3 className="text-label text-ink font-medium mb-2">{g}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {CAMPOS_FISCAIS.filter((c) => c.grupo === g).map((c) => (
              <div key={c.chave} className="flex flex-col gap-1">
                {c.tipo === "sim-nao" || c.tipo === "opcoes"
                  ? <Select label={c.rotulo} value={valores[c.chave] ?? ""} onChange={(v) => muda(c.chave, v)} options={c.opcoes ?? SIM_NAO} />
                  : <Input label={c.rotulo} value={valores[c.chave] ?? ""} onChange={(e) => muda(c.chave, e.target.value)}
                      inputMode={c.tipo === "texto" ? "text" : "decimal"} required={c.obrigatorio} />}
                <p className="text-caption text-muted">{c.ajuda}</p>
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar cadastro fiscal"}</Button>
        <AvisoCard aviso={aviso} />
      </div>
    </Card>
  );
}

const lerArquivoBase64 = (f: File) => new Promise<string>((ok, falha) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
  r.onerror = () => falha(r.error);
  r.readAsDataURL(f);
});

function CadastroFocus({ empresa, ligado }: { empresa: EmpresaFiscal; ligado: boolean }) {
  const cfg = empresa.config ?? {};
  const [d, setD] = React.useState<Omit<DadosEmpresaFocus, "certificadoBase64" | "senhaCertificado">>({
    nome: empresa.nome, nomeFantasia: "", cnpj: String(cfg.cnpj ?? ""), inscricaoMunicipal: String(cfg.inscricaoMunicipal ?? ""),
    regimeTributario: cfg.optanteSimples === true ? "1" : "3", email: "", telefone: "",
    logradouro: "", numero: "", complemento: "", bairro: "", municipio: "", uf: "", cep: "",
    padrao: cfg.padrao === "nacional" ? "nacional" : "municipal",
  });
  const [arquivo, setArquivo] = React.useState<File | null>(null);
  const [senha, setSenha] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [aviso, setAviso] = React.useState<Aviso>(null);
  const muda = (k: keyof typeof d, v: string) => setD((s) => ({ ...s, [k]: v }));

  async function enviar(simular: boolean) {
    if (!arquivo) { setAviso({ tom: "warning", linhas: ["Escolha o arquivo do certificado A1."] }); return; }
    setEnviando(true); setAviso(null);
    try {
      const certificadoBase64 = await lerArquivoBase64(arquivo);
      const r = await fetch("/api/admin/focus-empresa", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados: { ...d, certificadoBase64, senhaCertificado: senha }, simular }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.ok) setAviso({ tom: "positive", linhas: [j.mensagem] });
      else setAviso({ tom: "warning", linhas: j.problemas ?? [j.mensagem ?? j.motivo ?? "Não foi possível cadastrar."] });
    } catch {
      setAviso({ tom: "warning", linhas: ["Sem conexão. Nada foi enviado."] });
    } finally { setEnviando(false); }
  }

  const campo = (k: keyof typeof d, rotulo: string, extra?: Partial<React.ComponentProps<typeof Input>>) => (
    <Input label={rotulo} value={String(d[k] ?? "")} onChange={(e) => muda(k, e.target.value)} {...extra} />
  );

  return (
    <Card>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <h2 className="text-h3 text-ink">Cadastro na Focus</h2>
          <p className="text-caption text-muted mt-1">Cria a empresa na Focus com o certificado A1. O certificado e a senha vão direto à Focus e não ficam guardados aqui.</p>
        </div>
        <StatusBadge tone={ligado ? "positive" : "neutral"}>{ligado ? "Ligado" : "Desligado"}</StatusBadge>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 mt-5">
        {campo("nome", "Razão social")}
        {campo("nomeFantasia", "Nome fantasia")}
        {campo("cnpj", "CNPJ", { inputMode: "numeric" })}
        {campo("inscricaoMunicipal", "Inscrição municipal", { inputMode: "numeric" })}
        <Select label="Regime tributário" value={d.regimeTributario} onChange={(v) => muda("regimeTributario", v)} options={[...REGIMES_FOCUS]} />
        <Select label="Onde a nota é emitida" value={d.padrao} onChange={(v) => muda("padrao", v)}
          options={[{ value: "municipal", label: "Na prefeitura" }, { value: "nacional", label: "No emissor nacional" }]} />
        {campo("email", "E-mail", { type: "email" })}
        {campo("telefone", "Telefone", { inputMode: "tel" })}
        {campo("cep", "CEP", { inputMode: "numeric" })}
        {campo("logradouro", "Logradouro")}
        {campo("numero", "Número")}
        {campo("complemento", "Complemento")}
        {campo("bairro", "Bairro")}
        {campo("municipio", "Cidade")}
        {campo("uf", "UF", { maxLength: 2 })}
        <Input label="Senha do certificado" type="password" autoComplete="off" value={senha} onChange={(e) => setSenha(e.target.value)} />
        <div className="flex flex-col gap-1 sm:col-span-2">
          <label className="text-label text-ink" htmlFor="certificado-a1">Certificado A1 (.pfx ou .p12)</label>
          <input id="certificado-a1" type="file" accept=".pfx,.p12,application/x-pkcs12" className="text-body text-ink"
            onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        </div>
      </div>
      <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <Button variant="secondary" onClick={() => enviar(true)} disabled={!ligado || enviando}>Simular</Button>
        <Button onClick={() => enviar(false)} disabled={!ligado || enviando}>{enviando ? "Enviando…" : "Cadastrar na Focus"}</Button>
        <AvisoCard aviso={aviso} />
      </div>
    </Card>
  );
}
