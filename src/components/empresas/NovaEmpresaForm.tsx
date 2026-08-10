"use client";

/**
 * Nova Empresa — cadastro da empresa que é o CONTEXTO de todo o ERP.
 *
 * O ponto alto é o autopreenchimento: digitar o CNPJ e sair do campo dispara a
 * consulta na base pública (BrasilAPI) e preenche sozinho razão social, nome
 * fantasia, telefone, CEP, rua, número, complemento, bairro, estado, cidade,
 * data de fundação e a observação interna com a atividade econômica (CNAE).
 * O operador confere em vez de digitar.
 *
 * Reusa o que já existe: `lib/cnpj.ts` (consulta + cache), `core/cnae`
 * (validação de CNPJ e leitura da atividade) e `lib/ibge.ts` (UF/municípios).
 * Best-effort — sem rede, o formulário continua inteiramente preenchível à mão.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, Button, Input, Select, CurrencyInput, DateField, InfoHint } from "@/components/ui";
import { regimeDaEmpresa } from "@/core/tax/regime";
import { consultarCNPJ, type DadosCNPJ } from "@/lib/cnpj";
import { cnpjValido } from "@/core/cnae";
import { formatarCNAE } from "@/lib/cnae-enrich";
import { UFS, municipiosDe, capitalizar } from "@/lib/ibge";
import { validateCPF, maskDoc } from "@/lib/validators";
import { loadCompany, saveCompany } from "@/lib/company";

type TipoPessoa = "pj" | "pf";

const SEGMENTOS = ["—", "Serviços", "Indústria", "Comércio"];
const REGIMES = [
  "— Não informado —",
  "Simples Nacional",
  "Lucro Presumido",
  "Lucro Real",
  "MEI",
];

/** "1115768700" → "(11) 1576-8700" · "11987654321" → "(11) 98765-4321" */
function mascararTelefone(bruto: string): string {
  const d = (bruto || "").replace(/\D/g, "");
  if (d.length < 10) return bruto || "";
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  return resto.length >= 9
    ? `(${ddd}) ${resto.slice(0, 5)}-${resto.slice(5, 9)}`
    : `(${ddd}) ${resto.slice(0, 4)}-${resto.slice(4, 8)}`;
}
/** "04711130" → "04711-130" */
const mascararCep = (s: string): string => {
  const d = (s || "").replace(/\D/g, "").slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

interface Estado {
  tipoPessoa: TipoPessoa;
  doc: string;
  razaoSocial: string;
  nomeFantasia: string;
  segmento: string;
  faturamento: number;
  fundacao: string;
  inscEstadual: string;
  inscMunicipal: string;
  contribuinteIcms: string;
  regime: string;
  regimeEspecial: string;
  email: string;
  ddi: string;
  telefone: string;
  pais: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  estado: string;
  cidade: string;
  observacao: string;
}

const VAZIO: Estado = {
  tipoPessoa: "pj", doc: "", razaoSocial: "", nomeFantasia: "", segmento: "—",
  faturamento: 0, fundacao: "", inscEstadual: "", inscMunicipal: "",
  contribuinteIcms: "Não", regime: REGIMES[0], regimeEspecial: "",
  email: "", ddi: "55", telefone: "", pais: "Brasil", cep: "", rua: "",
  numero: "", complemento: "", bairro: "", estado: "", cidade: "", observacao: "",
};

export function NovaEmpresaForm() {
  const router = useRouter();
  const [f, setF] = React.useState<Estado>(VAZIO);
  const set = <K extends keyof Estado>(k: K, v: Estado[K]) => setF((s) => ({ ...s, [k]: v }));

  const [buscando, setBuscando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [cidades, setCidades] = React.useState<string[]>([]);
  const [salvando, setSalvando] = React.useState(false);
  /** CNPJ já consultado — não repete a busca ao sair do campo de novo. */
  const buscado = React.useRef("");

  // Cidades acompanham o estado escolhido (lista dependente).
  React.useEffect(() => {
    if (!f.estado) { setCidades([]); return; }
    let vivo = true;
    void municipiosDe(f.estado).then((m) => { if (vivo) setCidades(m); });
    return () => { vivo = false; };
  }, [f.estado]);

  /** Consulta a base pública e preenche o que estiver vazio. */
  const buscarCNPJ = async () => {
    if (f.tipoPessoa !== "pj") return;
    const cnpj = (f.doc || "").replace(/\D/g, "");
    if (cnpj.length !== 14 || !cnpjValido(cnpj) || buscado.current === cnpj) return;
    buscado.current = cnpj;
    setBuscando(true); setAviso(null); setErro(null);
    try {
      const d: DadosCNPJ | null = await consultarCNPJ(cnpj);
      if (!d) {
        setAviso("Não consegui consultar este CNPJ agora — preencha os dados manualmente.");
        return;
      }
      aplicar(d);
      setAviso(`Dados preenchidos pela base pública · ${d.razaoSocial}${d.situacao ? ` · ${d.situacao}` : ""}`);
    } catch {
      setAviso("Não consegui consultar este CNPJ agora — preencha os dados manualmente.");
    } finally {
      setBuscando(false);
    }
  };

  /**
   * Aplica o retorno da consulta. Nunca sobrescreve o que o operador já
   * digitou: preenche apenas os campos ainda vazios.
   */
  const aplicar = (d: DadosCNPJ) => {
    setF((s) => {
      const manter = (atual: string, novo?: string) => (atual.trim() ? atual : (novo ?? ""));
      const atividade = d.cnaeDescricao
        ? `Atividade econômica: ${formatarCNAE(d.cnaePrincipal)} — ${d.cnaeDescricao}`
        : "";
      return {
        ...s,
        razaoSocial: manter(s.razaoSocial, d.razaoSocial),
        nomeFantasia: manter(s.nomeFantasia, d.nomeFantasia),
        telefone: manter(s.telefone, d.telefone ? mascararTelefone(d.telefone) : ""),
        email: manter(s.email, d.email),
        fundacao: manter(s.fundacao, d.dataAbertura),
        cep: manter(s.cep, d.cep ? mascararCep(d.cep) : ""),
        rua: manter(s.rua, d.logradouro ? capitalizar(d.logradouro) : ""),
        numero: manter(s.numero, d.numero),
        complemento: manter(s.complemento, d.complemento ? capitalizar(d.complemento) : ""),
        bairro: manter(s.bairro, d.bairro ? capitalizar(d.bairro) : ""),
        estado: manter(s.estado, d.uf),
        cidade: manter(s.cidade, d.municipio ? capitalizar(d.municipio) : ""),
        // O Simples/MEI declarado na Receita já posiciona o regime tributário.
        regime: s.regime !== REGIMES[0] ? s.regime : d.mei ? "MEI" : d.simples ? "Simples Nacional" : s.regime,
        observacao: manter(s.observacao, atividade),
      };
    });
  };

  const pj = f.tipoPessoa === "pj";
  const docLabel = pj ? "CNPJ / CPF" : "CPF";
  const docValido = pj
    ? cnpjValido(f.doc.replace(/\D/g, ""))
    : validateCPF(f.doc.replace(/\D/g, ""));
  const docPreenchido = f.doc.replace(/\D/g, "").length > 0;

  const criar = () => {
    if (!f.razaoSocial.trim()) {
      setErro("Informe a Razão Social.");
      return;
    }
    if (docPreenchido && !docValido) {
      setErro(pj ? "CNPJ inválido — confira os dígitos." : "CPF inválido — confira os dígitos.");
      return;
    }
    setErro(null);
    setSalvando(true);
    try {
      const atual = loadCompany() ?? {};
      saveCompany({
        ...atual,
        db: {
          ...(atual.db ?? {}),
          tipoConta: "empresa",
          tipoPessoa: f.tipoPessoa,
          documento: f.doc,
          razaoSocial: f.razaoSocial,
          nomeFantasia: f.nomeFantasia,
          segmento: f.segmento === "—" ? "" : f.segmento,
          faturamentoMensal: String(f.faturamento),
          dataFundacao: f.fundacao,
          inscricaoEstadual: f.inscEstadual,
          inscricaoMunicipal: f.inscMunicipal,
          contribuinteIcms: f.contribuinteIcms === "Sim",
          // ⚠️ AS DUAS CHAVES, EM ACORDO — é aqui que o conflito nascia.
          // Este formulário gravava só `regimeTributario` ("Simples Nacional",
          // texto de exibição) e a tela de dados da empresa gravava só
          // `regime` (o enum canônico). Duas chaves, dois formatos: a mesma
          // empresa aparecia como Simples numa tela e Presumido na outra, e
          // não havia fórmula errada para consertar, porque o defeito era de
          // CADASTRO. Gravar as duas pelo resolvedor faz o desacordo deixar de
          // ser possível na origem; `regimeEmConflito` segue existindo para os
          // cadastros que já nasceram torcidos.
          regimeTributario: f.regime === REGIMES[0] ? "" : f.regime,
          regime: f.regime === REGIMES[0] ? "" : regimeDaEmpresa({ regimeTributario: f.regime }),
          optanteSimples: f.regime === "Simples Nacional" || f.regime === "MEI",
          regimeEspecialNfse: f.regimeEspecial,
          email: f.email,
          ddi: f.ddi,
          telefone: f.telefone,
          pais: f.pais,
          cep: f.cep,
          rua: f.rua,
          numero: f.numero,
          complemento: f.complemento,
          bairro: f.bairro,
          estado: f.estado,
          cidade: f.cidade,
          observacao: f.observacao,
        },
      });
      // Depois de criar, o operador segue para completar integrações e o resto.
      router.push("/configuracoes");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 pb-4">
      <p className="m-0 text-label text-muted">
        Cadastre uma nova empresa. Os dados restantes podem ser preenchidos em Dados da Empresa.
      </p>

      {/* ------------------------------ Identificação ------------------------------ */}
      <Card>
        <h2 className="m-0 mb-5 text-h3 font-semibold text-ink">Identificação</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <Campo label="Tipo de Pessoa">
            <Select
              value={f.tipoPessoa}
              onChange={(v) => { set("tipoPessoa", v as TipoPessoa); buscado.current = ""; }}
              options={[
                { value: "pj", label: "Pessoa Jurídica" },
                { value: "pf", label: "Pessoa Física" },
              ]}
            />
          </Campo>

          <Campo
            label={docLabel}
            hint={
              buscando ? "consultando a base pública…"
              : pj ? "ao sair do campo, buscamos os dados na base pública"
              : undefined
            }
            erro={docPreenchido && !docValido ? (pj ? "CNPJ inválido" : "CPF inválido") : undefined}
          >
            <Input
              value={f.doc}
              placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"}
              onChange={(e) => {
                const bruto = e.target.value;
                set("doc", maskDoc(pj ? "pj" : "pf", bruto));
              }}
              onBlur={() => void buscarCNPJ()}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
            />
          </Campo>

          <Campo label="Razão Social" obrigatorio>
            <Input value={f.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} />
          </Campo>

          <Campo label="Nome Fantasia">
            <Input value={f.nomeFantasia} onChange={(e) => set("nomeFantasia", e.target.value)} />
          </Campo>

          <Campo label="Segmento / Tipo de Negócio">
            <Select value={f.segmento} onChange={(v) => set("segmento", v)}
              options={SEGMENTOS.map((s) => ({ value: s, label: s }))} />
          </Campo>

          <Campo label="Faturamento Mensal (R$)">
            <CurrencyInput value={f.faturamento} onValueChange={(v) => set("faturamento", v)} />
          </Campo>

          <Campo label="Data de Fundação">
            <DateField value={f.fundacao} onChange={(v) => set("fundacao", v)} />
          </Campo>
        </div>

        {aviso && (
          <p className="m-0 mt-5 text-caption text-muted">{aviso}</p>
        )}
      </Card>

      {/* ------------------------------ Dados Fiscais ------------------------------ */}
      <Card>
        <h2 className="m-0 mb-5 text-h3 font-semibold text-ink">Dados Fiscais</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <Campo label="Inscrição Estadual">
            <Input value={f.inscEstadual} onChange={(e) => set("inscEstadual", e.target.value)} />
          </Campo>

          <Campo label="Inscrição Municipal">
            <Input value={f.inscMunicipal} onChange={(e) => set("inscMunicipal", e.target.value)} />
          </Campo>

          <Campo label="Contribuinte de ICMS">
            <Select value={f.contribuinteIcms} onChange={(v) => set("contribuinteIcms", v)}
              options={[{ value: "Não", label: "Não" }, { value: "Sim", label: "Sim" }]} />
          </Campo>

          <Campo
            label="Regime Tributário"
            hint={
              f.regime === "Simples Nacional" || f.regime === "MEI"
                ? "Define automaticamente Optante pelo Simples Nacional"
                : "Define automaticamente Optante pelo Simples Nacional"
            }
          >
            <Select value={f.regime} onChange={(v) => set("regime", v)}
              options={REGIMES.map((r) => ({ value: r, label: r }))} />
          </Campo>

          <Campo
            label="Regime Especial de Tributação (NFS-e)"
            info={{
              titulo: "Regime Especial de Tributação (NFS-e)",
              oQue: "Código do regime especial exigido pela prefeitura na emissão da NFS-e (ex.: microempresa municipal, estimativa, sociedade de profissionais).",
              comoCalcula: "Não é calculado: é o código que a sua prefeitura define. Na dúvida, deixe em branco — a maioria dos municípios aceita vazio.",
            }}
          >
            <Input
              inputMode="numeric"
              value={f.regimeEspecial}
              onChange={(e) => set("regimeEspecial", e.target.value.replace(/\D/g, ""))}
            />
          </Campo>
        </div>
      </Card>

      {/* --------------------------------- Contato --------------------------------- */}
      <Card>
        <h2 className="m-0 mb-5 text-h3 font-semibold text-ink">Contato</h2>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-x-6 gap-y-5">
          <Campo label="E-mail">
            <Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} />
          </Campo>

          <Campo label="DDI" className="md:w-[86px]">
            <Input value={f.ddi} onChange={(e) => set("ddi", e.target.value.replace(/\D/g, "").slice(0, 4))} />
          </Campo>

          <Campo label="Telefone">
            <Input
              value={f.telefone}
              onChange={(e) => set("telefone", e.target.value)}
              onBlur={(e) => set("telefone", mascararTelefone(e.target.value))}
            />
          </Campo>
        </div>
      </Card>

      {/* -------------------------------- Endereço -------------------------------- */}
      <Card>
        <h2 className="m-0 mb-5 text-h3 font-semibold text-ink">Endereço</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
          <Campo label="País">
            <Select value={f.pais} onChange={(v) => set("pais", v)}
              options={[{ value: "Brasil", label: "Brasil" }, { value: "Outro", label: "Outro" }]} />
          </Campo>

          <Campo label="CEP">
            <Input
              value={f.cep}
              placeholder="00000-000"
              onChange={(e) => set("cep", mascararCep(e.target.value))}
            />
          </Campo>

          <Campo label="Rua">
            <Input value={f.rua} onChange={(e) => set("rua", e.target.value)} />
          </Campo>

          <Campo label="Número">
            <Input value={f.numero} onChange={(e) => set("numero", e.target.value)} />
          </Campo>

          <Campo label="Complemento" className="md:col-span-2">
            <Input value={f.complemento} onChange={(e) => set("complemento", e.target.value)} />
          </Campo>

          <Campo label="Bairro">
            <Input value={f.bairro} onChange={(e) => set("bairro", e.target.value)} />
          </Campo>

          <Campo label="Estado">
            <Select
              value={f.estado}
              onChange={(v) => { set("estado", v); set("cidade", ""); }}
              placeholder="UF"
              options={UFS.map((u) => ({ value: u.sigla, label: `${u.sigla} — ${u.nome}` }))}
            />
          </Campo>

          <Campo label="Cidade">
            {cidades.length > 0 ? (
              <Select
                value={f.cidade}
                onChange={(v) => set("cidade", v)}
                placeholder="Selecione a cidade"
                options={cidades.map((c) => ({ value: c, label: c }))}
              />
            ) : (
              // Sem estado escolhido (ou sem rede para a lista): campo livre,
              // que também é o que preserva a cidade vinda do CNPJ.
              <Input
                value={f.cidade}
                placeholder={f.estado ? "Digite a cidade" : "Selecione um estado primeiro"}
                disabled={!f.estado}
                onChange={(e) => set("cidade", e.target.value)}
              />
            )}
          </Campo>
        </div>

        {f.observacao && (
          <div className="mt-5 pt-5 border-t border-border-soft">
            <label className="text-caption font-medium text-muted">Observação interna</label>
            <p className="m-0 mt-1 text-label text-ink">{f.observacao}</p>
          </div>
        )}
      </Card>

      {/* --------------------------------- Ações --------------------------------- */}
      <div className="flex flex-col gap-3">
        <p className="m-0 text-caption text-muted">
          Após criar, você será levado(a) à tela Dados da Empresa para completar endereço,
          integrações e demais informações.
        </p>
        {erro && <p className="m-0 text-caption text-negative">{erro}</p>}
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={() => router.back()}>Cancelar</Button>
          <Button variant="primary" onClick={criar} disabled={salvando}>
            {salvando ? "Criando…" : "Criar Empresa"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- campo --------------------------------- */

function Campo({
  label, children, obrigatorio, hint, erro, info, className,
}: {
  label: string;
  children: React.ReactNode;
  obrigatorio?: boolean;
  hint?: string;
  erro?: string;
  info?: React.ComponentProps<typeof InfoHint>;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-[6px] min-w-0 ${className ?? ""}`}>
      <label className="text-caption font-medium text-muted inline-flex items-center gap-1">
        {label}
        {obrigatorio && <span className="text-negative">*</span>}
        {info && <InfoHint align="left" {...info} />}
      </label>
      {children}
      {erro ? (
        <span className="text-caption text-negative">{erro}</span>
      ) : hint ? (
        <span className="text-caption text-faint">{hint}</span>
      ) : null}
    </div>
  );
}
