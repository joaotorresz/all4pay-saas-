"use client";

/**
 * Dados da Empresa — Dados gerais + Contatos.
 *
 * ⚠️ Grava no MESMO `a4p_company` que o onboarding preencheu e que
 * `/configuracoes` já lê (`lib/company`). Criar um segundo cadastro de empresa
 * aqui produziria duas razões sociais divergentes, e a que sai na nota fiscal
 * seria a que ninguém editou.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Card, Button, Icon, Input, Select, DateField, CurrencyInput, Textarea, Checkbox,
} from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import { fetchCompany, persistCompany, loadCompany, type StoredCompany } from "@/lib/company";
import { regimeDoCadastro } from "@/core/fiscal/perfil";
import { lookupCep } from "@/lib/viacep";
import {
  validarDadosEmpresa, logoAceito, optantePeloSimples, identidadeDoCadastro, cadastroParaGravar,
  SEGMENTOS, REGIMES, FORMATOS_LOGO, LADO_MINIMO_LOGO,
  type DadosEmpresa, type ContatoEmpresa, type TipoPessoa,
  type StatusEmpresa, type RegimeTributario,
} from "@/core/administracao";

import { ANEXOS_SIMPLES, type AnexoSimplesCadastro } from "@/core/tax/duplicidade";
const UFS = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG",
  "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

const VAZIO: DadosEmpresa = {
  tipoPessoa: "juridica", documento: "", razaoSocial: "", nomeFantasia: "",
  dataFundacao: "", segmento: "Serviços", faturamentoMensal: 0,
  identificadorEstrangeiro: "", status: "ativa", inscricaoEstadual: "",
  inscricaoMunicipal: "", contribuinteICMS: false, regime: "", anexoSimples: "",
  regimeEspecialNFSe: "0", pais: "Brasil", cep: "", rua: "", numero: "",
  complemento: "", bairro: "", estado: "SP", cidade: "", email: "", site: "",
  ddi: "+55", telefone: "", notificacoesEmail: true, observacaoInterna: "",
  logo: null,
};

const CONTATO_VAZIO: ContatoEmpresa = { nome: "", email: "", ddi: "+55", telefone: "", whatsapp: "" };

type Aba = "gerais" | "contatos";

export function DadosEmpresaView() {
  const qc = useQueryClient();
  const { show: toast, node } = useToast();
  const empresa = useQuery({ queryKey: ["company"], queryFn: fetchCompany });

  const [aba, setAba] = React.useState<Aba>("gerais");
  const [d, setD] = React.useState<DadosEmpresa>(VAZIO);
  const [principal, setPrincipal] = React.useState<ContatoEmpresa>(CONTATO_VAZIO);
  const [financeiro, setFinanceiro] = React.useState<ContatoEmpresa>(CONTATO_VAZIO);
  const [erros, setErros] = React.useState<Record<string, string>>({});
  const [erroLogo, setErroLogo] = React.useState<string | null>(null);
  /** O botão "Escolher logo" abre ESTE seletor — `<Button>` dentro de `<label>` não repassa o clique. */
  const inputLogo = React.useRef<HTMLInputElement>(null);
  const [sujo, setSujo] = React.useState(false);
  const [inicial, setInicial] = React.useState<DadosEmpresa>(VAZIO);

  React.useEffect(() => {
    const db = (empresa.data?.db ?? {}) as Record<string, unknown>;
    // ⚠️ A tela mostra o que o SISTEMA USA: as chaves canônicas (`cnpj`,
    // `fantasia`, o regime resolvido por `regimeDoCadastro`) vêm primeiro —
    // ver `identidadeDoCadastro`. O regime gravado pelo onboarding é o RÓTULO
    // ("Lucro Presumido"); lido cru, o seletor abria vazio e o salvar seguinte
    // APAGAVA o regime declarado.
    const regime = regimeDoCadastro(db);
    const lido: DadosEmpresa = {
      ...VAZIO,
      ...Object.fromEntries(Object.entries(db).filter(([k]) => k in VAZIO)),
      ...identidadeDoCadastro(db),
      regime: regime === "nao_declarado" ? "" : regime,
    } as DadosEmpresa;
    setD(lido);
    setInicial(lido);
    const c = (empresa.data as unknown as { contatos?: { principal?: ContatoEmpresa; financeiro?: ContatoEmpresa } })?.contatos;
    setPrincipal(c?.principal ?? CONTATO_VAZIO);
    setFinanceiro(c?.financeiro ?? CONTATO_VAZIO);
    setSujo(false);
  }, [empresa.data]);

  function set<K extends keyof DadosEmpresa>(k: K, v: DadosEmpresa[K]) {
    setD((x) => ({ ...x, [k]: v }));
    setSujo(true);
  }

  async function preencherPorCEP(cep: string) {
    const r = await lookupCep(cep).catch(() => null);
    if (!r) return;
    setD((x) => ({
      ...x,
      rua: r.street || x.rua,
      bairro: r.district || x.bairro,
      cidade: r.city || x.cidade,
      estado: r.state || x.estado,
    }));
    setSujo(true);
  }

  function escolherLogo(file: File | null) {
    if (!file) return;
    const erro = logoAceito(file.name, file.size);
    if (erro) { setErroLogo(erro); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const img = new window.Image();
      img.onload = () => {
        // O aviso é SUGESTÃO, não bloqueio: um logo pequeno ainda é melhor que
        // nenhum, e recusá-lo faria a pessoa desistir de cadastrar.
        setErroLogo(
          img.width < LADO_MINIMO_LOGO || img.height < LADO_MINIMO_LOGO
            ? `Imagem de ${img.width}×${img.height}px — abaixo dos ${LADO_MINIMO_LOGO}×${LADO_MINIMO_LOGO}px recomendados, vai aparecer borrada nos relatórios impressos.`
            : null,
        );
        set("logo", url);
      };
      img.src = url;
    };
    reader.readAsDataURL(file);
  }

  const [salvando, setSalvando] = React.useState(false);
  /**
   * ⚠️ **GRAVAVA SÓ NO NAVEGADOR — o "escritor morto".** Era `saveCompany`, o
   * cache local; em produção o cadastro mora em `company_profiles`, e
   * `fetchCompany` (servidor primeiro) ainda REGRAVA o cache com a versão do
   * servidor. Resultado: "Dados da empresa salvos", a consulta recarregava do
   * servidor e o formulário voltava ao valor antigo — a edição sumia na frente
   * da pessoa. Agora vai por `persistCompany` (cache + servidor) e a recusa do
   * banco aparece com a mensagem dele, nunca como sucesso.
   *
   * ⚠️ A base da mescla é o que a CONSULTA trouxe (o servidor), não o cache
   * local: mesclar sobre o cache de outra máquina sobrescreveria campos que um
   * colega editou.
   */
  async function salvar() {
    const e = validarDadosEmpresa(d);
    setErros(e);
    if (Object.keys(e).length > 0) { toast("Revise os campos destacados."); return; }
    const atual: StoredCompany = empresa.data ?? loadCompany() ?? {};
    const novo = {
      ...atual,
      db: cadastroParaGravar(atual.db as Record<string, unknown> | undefined, d) as StoredCompany["db"],
      contatos: { principal, financeiro },
    } as StoredCompany;
    setSalvando(true);
    try {
      await persistCompany(novo);
    } catch (err) {
      toast(`Não foi possível salvar: ${err instanceof Error ? err.message : String(err)}`);
      return;
    } finally {
      setSalvando(false);
    }
    await qc.invalidateQueries({ queryKey: ["company"] });
    setInicial(d);
    setSujo(false);
    toast("Dados da empresa salvos.");
  }

  function descartar() {
    setD(inicial);
    setErros({});
    setSujo(false);
    toast("Alterações descartadas.");
  }

  const simples = d.regime !== "" && optantePeloSimples(d.regime);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <p className="m-0 text-label text-muted">Informações cadastrais, contato e preferências.</p>
        {d.documento && (
          <span className="text-caption text-faint tabular-nums px-3 py-1 rounded-pill bg-surface-2">
            ID {d.documento}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 border-b border-border-soft">
        {([["gerais", "Dados gerais"], ["contatos", "Contatos"]] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`px-4 py-3 text-label transition-colors border-b-2 -mb-px ${
              aba === id ? "text-ink border-ink font-medium" : "text-muted border-transparent hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {aba === "gerais" ? (
        <>
          <Card>
            <div className="flex flex-col gap-3">
              <span className="text-h3 font-semibold text-ink">Logo da empresa</span>
              <div className="flex items-center gap-5 flex-wrap">
                <label className="w-[112px] h-[112px] rounded-md bg-surface-2 border border-dashed border-border flex items-center justify-center cursor-pointer overflow-hidden shrink-0">
                  {d.logo
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={d.logo} alt="Logo da empresa" className="w-full h-full object-contain" />
                    : <Icon name="building" size={26} color="var(--color-text-tertiary)" />}
                  <input type="file" className="hidden" accept={FORMATOS_LOGO.join(",")}
                    onChange={(e) => escolherLogo(e.target.files?.[0] ?? null)} />
                </label>
                <div className="flex flex-col gap-2">
                  <div className="inline-flex">
                    <Button variant="secondary" onClick={() => inputLogo.current?.click()}>Escolher logo</Button>
                    <input ref={inputLogo} type="file" className="hidden" accept={FORMATOS_LOGO.join(",")}
                      onChange={(e) => { escolherLogo(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                  </div>
                  <span className="text-caption text-faint">
                    PNG, JPG ou WebP · mín. {LADO_MINIMO_LOGO}×{LADO_MINIMO_LOGO}px recomendado · máx. 5 MB
                  </span>
                  {erroLogo && <span className="text-caption text-warning max-w-[62ch]">{erroLogo}</span>}
                  {d.logo && (
                    <button onClick={() => set("logo", null)} className="self-start text-caption text-muted hover:text-negative transition-colors">
                      Remover logo
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4">
              <span className="text-h3 font-semibold text-ink">Identificação</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Select label="Tipo de pessoa" value={d.tipoPessoa} onChange={(v) => set("tipoPessoa", v as TipoPessoa)}
                  options={[{ value: "juridica", label: "Pessoa jurídica" }, { value: "fisica", label: "Pessoa física" }]} />
                <Campo label={d.tipoPessoa === "fisica" ? "CPF" : "CNPJ"} erro={erros.documento}>
                  <Input value={d.documento} onChange={(e) => set("documento", e.target.value)} invalid={!!erros.documento} />
                </Campo>
                <Campo label="Razão social" erro={erros.razaoSocial}>
                  <Input value={d.razaoSocial} onChange={(e) => set("razaoSocial", e.target.value)} invalid={!!erros.razaoSocial} />
                </Campo>
                <Campo label="Nome fantasia">
                  <Input value={d.nomeFantasia} onChange={(e) => set("nomeFantasia", e.target.value)} />
                </Campo>
                <DateField label="Data de fundação" value={d.dataFundacao} onChange={(v) => set("dataFundacao", v)} />
                <Select label="Segmento / tipo de negócio" value={d.segmento} onChange={(v) => set("segmento", v)}
                  options={SEGMENTOS.map((s) => ({ value: s, label: s }))} />
                <Campo label="Faturamento mensal" erro={erros.faturamentoMensal}>
                  <CurrencyInput value={d.faturamentoMensal} onValueChange={(v) => set("faturamentoMensal", v)} />
                </Campo>
                <Campo label="Identificador estrangeiro" ajuda="Para empresas com registro fora do Brasil.">
                  <Input value={d.identificadorEstrangeiro} onChange={(e) => set("identificadorEstrangeiro", e.target.value)} />
                </Campo>
                <Select label="Status" value={d.status} onChange={(v) => set("status", v as StatusEmpresa)}
                  options={[{ value: "ativa", label: "Ativa" }, { value: "inativa", label: "Inativa" }]} />
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4">
              <span className="text-h3 font-semibold text-ink">Dados fiscais</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="Inscrição estadual">
                  <Input value={d.inscricaoEstadual} onChange={(e) => set("inscricaoEstadual", e.target.value)} />
                </Campo>
                <Campo label="Inscrição municipal">
                  <Input value={d.inscricaoMunicipal} onChange={(e) => set("inscricaoMunicipal", e.target.value)} />
                </Campo>
                <Select label="Contribuinte de ICMS" value={d.contribuinteICMS ? "sim" : "nao"}
                  onChange={(v) => set("contribuinteICMS", v === "sim")}
                  options={[{ value: "nao", label: "Não" }, { value: "sim", label: "Sim" }]} />
                <Campo
                  label="Regime tributário"
                  ajuda={simples
                    ? "Define automaticamente optante pelo Simples Nacional."
                    : "Fora do Simples — o imposto sai por alíquota, não por faixa de RBT12."}
                >
                  <Select value={d.regime} onChange={(v) => set("regime", v as RegimeTributario | "")}
                    options={[
                      /* ⚠️ A opção vazia é o estado inicial de verdade: sem ela
                         o formulário afirma um regime que ninguém escolheu. */
                      { value: "", label: "Selecione o regime…" },
                      ...REGIMES.map((r) => ({ value: r.id, label: r.label })),
                    ]} />
                </Campo>
                {/* ⚠️ O ANEXO só existe DENTRO do Simples — e é ele que decide
                    coisas que mudam dinheiro: no Anexo IV a CPP patronal é
                    recolhida por FORA do DAS, nos demais está dentro. Oferecê-lo
                    fora do Simples faria a tela perguntar algo que não se
                    aplica. */}
                {simples && (
                  <Campo label="Anexo do Simples" ajuda="Decide o que está dentro do DAS. No Anexo IV a contribuição patronal é recolhida por fora; nos demais, não.">
                    <Select value={d.anexoSimples ?? ""} onChange={(v) => set("anexoSimples", v as AnexoSimplesCadastro | "")}
                      options={[
                        { value: "", label: "Selecione o anexo…" },
                        ...ANEXOS_SIMPLES.map((a2) => ({ value: a2.id, label: a2.label })),
                      ]} />
                  </Campo>
                )}
                <Campo label="Regime especial de tributação (NFS-e)" ajuda="Código do município; 0 quando não há regime especial.">
                  <Input value={d.regimeEspecialNFSe} onChange={(e) => set("regimeEspecialNFSe", e.target.value)} />
                </Campo>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4">
              <span className="text-h3 font-semibold text-ink">Endereço</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Select label="País" value={d.pais} onChange={(v) => set("pais", v)}
                  options={[{ value: "Brasil", label: "Brasil" }, { value: "Outro", label: "Outro" }]} />
                <Campo label="CEP" erro={erros.cep}>
                  <Input value={d.cep} invalid={!!erros.cep}
                    onChange={(e) => { set("cep", e.target.value); if (e.target.value.replace(/\D/g, "").length === 8) preencherPorCEP(e.target.value); }} />
                </Campo>
                <Campo label="Rua"><Input value={d.rua} onChange={(e) => set("rua", e.target.value)} /></Campo>
                <Campo label="Número"><Input value={d.numero} onChange={(e) => set("numero", e.target.value)} /></Campo>
                <Campo label="Complemento"><Input value={d.complemento} onChange={(e) => set("complemento", e.target.value)} /></Campo>
                <Campo label="Bairro"><Input value={d.bairro} onChange={(e) => set("bairro", e.target.value)} /></Campo>
                <Select label="Estado" value={d.estado} onChange={(v) => set("estado", v)}
                  options={UFS.map((u) => ({ value: u, label: u }))} />
                <Campo label="Cidade"><Input value={d.cidade} onChange={(e) => set("cidade", e.target.value)} /></Campo>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4">
              <span className="text-h3 font-semibold text-ink">Canais da empresa — institucional</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Campo label="E-mail" erro={erros.email}>
                  <Input type="email" value={d.email} onChange={(e) => set("email", e.target.value)} invalid={!!erros.email} />
                </Campo>
                <Campo label="Site" erro={erros.site}>
                  <Input value={d.site} onChange={(e) => set("site", e.target.value)} invalid={!!erros.site} />
                </Campo>
                <Campo label="DDI"><Input value={d.ddi} onChange={(e) => set("ddi", e.target.value)} /></Campo>
                <Campo label="Telefone"><Input value={d.telefone} onChange={(e) => set("telefone", e.target.value)} /></Campo>
              </div>
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4">
              <span className="text-h3 font-semibold text-ink">Preferências</span>
              <Checkbox
                checked={d.notificacoesEmail}
                onChange={(e) => set("notificacoesEmail", e.target.checked)}
                label="Permitir notificações por e-mail"
              />
              <Campo label="Observação interna" ajuda="Só a sua equipe vê — não sai em nota, boleto ou relatório.">
                <Textarea value={d.observacaoInterna} onChange={(e) => set("observacaoInterna", e.target.value)} rows={3} />
              </Campo>
            </div>
          </Card>
        </>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BlocoContato titulo="Contato principal" c={principal} onChange={(v) => { setPrincipal(v); setSujo(true); }} />
          <BlocoContato titulo="Contato financeiro" c={financeiro} onChange={(v) => { setFinanceiro(v); setSujo(true); }} />
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" disabled={!sujo} onClick={descartar}>Descartar alterações</Button>
        <Button variant="primary" disabled={!sujo || salvando} onClick={salvar}>
          <Icon name="check" size={15} color="currentColor" />
          Salvar alterações
        </Button>
      </div>
      {node}
    </div>
  );
}

/* --------------------------------- peças --------------------------------- */

function Campo({
  label, erro, ajuda, children,
}: { label: string; erro?: string; ajuda?: string; children: React.ReactNode }) {
  // ⚠️ O `<label>` ENVOLVE o campo. Ele era um irmão solto, sem `htmlFor`:
  // os 26 campos desta tela não tinham nome acessível (o leitor de tela dizia
  // "campo de edição" e mais nada) e clicar no rótulo não focava o campo.
  // Envolver associa sem precisar de id em cada um.
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-label font-medium text-muted">{label}</span>
      {children}
      {erro ? <span className="text-caption text-negative">{erro}</span>
        : ajuda ? <span className="text-caption text-faint">{ajuda}</span> : null}
    </label>
  );
}

function BlocoContato({
  titulo, c, onChange,
}: { titulo: string; c: ContatoEmpresa; onChange: (c: ContatoEmpresa) => void }) {
  const set = (k: keyof ContatoEmpresa, v: string) => onChange({ ...c, [k]: v });
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <span className="text-h3 font-semibold text-ink">{titulo}</span>
        <Campo label="Nome"><Input value={c.nome} onChange={(e) => set("nome", e.target.value)} /></Campo>
        <Campo label="E-mail"><Input type="email" value={c.email} onChange={(e) => set("email", e.target.value)} /></Campo>
        <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-3">
          <Campo label="DDI"><Input value={c.ddi} onChange={(e) => set("ddi", e.target.value)} /></Campo>
          <Campo label="Telefone"><Input value={c.telefone} onChange={(e) => set("telefone", e.target.value)} /></Campo>
        </div>
        <Campo label="WhatsApp"><Input value={c.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></Campo>
      </div>
    </Card>
  );
}
