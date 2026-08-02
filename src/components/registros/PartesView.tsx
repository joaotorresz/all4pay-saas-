"use client";

/**
 * Cadastros › Clientes e Fornecedores — a MESMA tela em dois lados.
 *
 * Cliente e fornecedor são a mesma entidade (`parties`) com a flag invertida;
 * o que muda é o vocabulário ("Razão Social" × "Nome"), a categoria padrão
 * (receita × despesa) e o bloco exclusivo do fornecedor: chave PIX e Dados PJ.
 * Um componente só com `lado` — dois arquivos envelheceriam separado.
 *
 * A gravação dos campos canônicos passa por `useCreateParty`/`useUpdateParty`,
 * os MESMOS writers do resto do sistema. O que a tabela ainda não tem (categoria
 * padrão, PIX, ativo, bloco PJ) vai para `salvarExtraParty`, indexado pelo id —
 * dois formulários escrevendo a mesma coluna divergiriam na primeira mudança.
 */
import * as React from "react";
import { Card, Button, Input, Select, Textarea, DateField, CurrencyInput, Icon } from "@/components/ui";
import { FormModal } from "@/components/lancamentos/FormModal";
import { useToast } from "@/components/listas/ListChrome";
import { usePartiesList, useCreateParty, useUpdateParty } from "@/components/lancamentos/hooks";
import { validateDoc, maskDoc, maskCep } from "@/lib/validators";
import { lookupCep } from "@/lib/viacep";
import { UFS, municipiosDe } from "@/lib/ibge";
import { filtrarRegistros, type FiltroStatus } from "@/core/registros";
import { listPlanoContas } from "@/lib/registros";
import { extraParty, salvarExtraParty, listExtrasParty, type ExtraParty } from "@/lib/registros";
import {
  CabecalhoRegistro, FiltrosRegistro, TabelaRegistro, VazioRegistro, AcaoLinha,
  EtiquetaStatus, Campo, BlocoForm, SwitchAtivo, OPCOES_STATUS,
} from "./kit";
import type { Party, PartyType } from "@/lib/types";

type Lado = "cliente" | "fornecedor";

const TEXTO = {
  cliente: {
    titulo: "clientes", singular: "cliente", nomeCampo: "Nome / Razão Social",
    subtitulo: "Gerencie seus clientes.", novo: "Novo cliente",
    categoria: "Categoria padrão de receita",
    ajudaCategoria: "Pré-preenche a categoria ao lançar uma conta a receber deste cliente.",
    natureza: "receita" as const,
  },
  fornecedor: {
    titulo: "fornecedores", singular: "fornecedor", nomeCampo: "Razão Social",
    subtitulo: "Gerencie seus fornecedores.", novo: "Novo fornecedor",
    categoria: "Categoria padrão de despesa",
    ajudaCategoria: "Pré-preenche a categoria ao lançar uma conta a pagar deste fornecedor.",
    natureza: "despesa" as const,
  },
};

export function PartesView({ lado }: { lado: Lado }) {
  const t = TEXTO[lado];
  const { data, isLoading } = usePartiesList();
  const [aba, setAba] = React.useState<"cadastro" | "resumo">("cadastro");
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("todos");
  const [categoria, setCategoria] = React.useState("");
  const [editando, setEditando] = React.useState<Party | null>(null);
  const [novo, setNovo] = React.useState(false);
  const [extras, setExtras] = React.useState<Record<string, ExtraParty>>({});
  const { show, node } = useToast();

  React.useEffect(() => { setExtras(listExtrasParty()); }, []);

  const cats = React.useMemo(
    () => listPlanoContas().filter((c) => c.natureza === t.natureza && c.paiId),
    [t.natureza],
  );

  const doLado = React.useMemo(
    () => (data ?? [])
      .filter((p) => (lado === "cliente" ? p.is_customer : p.is_supplier))
      .map((p) => ({
        ...p,
        ativo: extras[p.id]?.ativo ?? true,
        categoriaPadrao: extras[p.id]?.categoriaPadrao ?? "",
        nomeFantasia: extras[p.id]?.nomeFantasia ?? "",
      })),
    [data, lado, extras],
  );

  const visiveis = React.useMemo(() => {
    const base = filtrarRegistros(doLado, busca, (p) => [p.name, p.nomeFantasia, p.doc, p.email, p.id], status);
    return base.filter((p) => !categoria || p.categoriaPadrao === categoria);
  }, [doLado, busca, status, categoria]);

  const nomeCat = (id: string) => cats.find((c) => c.id === id)?.nome ?? "";

  const linhas = React.useMemo(() => [
    ["ID", t.nomeCampo, "Nome fantasia", "CPF/CNPJ", "E-mail", "Telefone", "Categoria padrão", "Status"],
    ...visiveis.map((p) => [
      p.id, p.name, p.nomeFantasia, p.doc ?? "", p.email ?? "", p.phone ?? "",
      nomeCat(p.categoriaPadrao), p.ativo ? "Ativo" : "Inativo",
    ]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [visiveis, t.nomeCampo, cats]);

  return (
    <div className="flex flex-col gap-5 pb-4">
      <CabecalhoRegistro
        subtitulo={t.subtitulo}
        acaoNova={{ label: t.novo, onClick: () => setNovo(true) }}
        exportar={{ nomeArquivo: t.titulo, aba: t.titulo, linhas }}
      />

      <div className="flex items-center gap-1 border-b border-border-soft">
        {(["cadastro", "resumo"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setAba(a)}
            className={`relative px-3 py-2 text-label transition-colors inline-flex items-center gap-2 ${aba === a ? "text-ink font-medium" : "text-muted hover:text-ink"}`}
          >
            {a === "cadastro" ? "Cadastro" : "Resumo"}
            {a === "resumo" && (
              <span className="rounded-pill bg-surface-3 text-caption text-muted px-[7px] py-[1px] tabular-nums">
                {doLado.length}
              </span>
            )}
            {aba === a && <span className="absolute left-0 -bottom-px w-full h-[2px] bg-ink rounded-pill" />}
          </button>
        ))}
      </div>

      {aba === "resumo" ? (
        <Resumo itens={doLado} cats={cats} lado={lado} />
      ) : (
        <>
          <FiltrosRegistro
            busca={busca} onBusca={setBusca} placeholder="ID, nome, CPF/CNPJ ou e-mail…"
            campos={[
              { label: "Status", value: status, onChange: (v) => setStatus(v as FiltroStatus), options: OPCOES_STATUS },
              { label: "Categoria", value: categoria, onChange: setCategoria, options: [{ value: "", label: "Todas as categorias" }, ...cats.map((c) => ({ value: c.id, label: c.nome }))] },
            ]}
          />

          {isLoading ? (
            <div className="text-label text-muted py-8 text-center">Carregando {t.titulo}…</div>
          ) : (
            <TabelaRegistro
              itens={visiveis}
              vazio={
                <VazioRegistro
                  texto={doLado.length === 0
                    ? `Nenhum ${t.singular} cadastrado. Cadastre o primeiro para lançar contas a ${lado === "cliente" ? "receber" : "pagar"}.`
                    : `Nenhum ${t.singular} encontrado com esses filtros.`}
                  acao={doLado.length === 0 ? <Button variant="primary" onClick={() => setNovo(true)}>{t.novo}</Button> : undefined}
                />
              }
              colunas={[
                { chave: "nome", label: t.nomeCampo, render: (p) => (
                  <div className="flex flex-col">
                    <span className="text-ink">{p.name}</span>
                    {p.nomeFantasia && <span className="text-caption text-faint">{p.nomeFantasia}</span>}
                  </div>
                ) },
                { chave: "doc", label: "CPF/CNPJ", render: (p) => <span className="text-muted tabular-nums">{p.doc || "—"}</span> },
                { chave: "contato", label: "Contato", render: (p) => (
                  <div className="flex flex-col">
                    <span className="text-muted">{p.email || "—"}</span>
                    {p.phone && <span className="text-caption text-faint tabular-nums">{p.phone}</span>}
                  </div>
                ) },
                { chave: "cat", label: "Categoria padrão", render: (p) => <span className="text-muted">{nomeCat(p.categoriaPadrao) || "—"}</span> },
                { chave: "status", label: "Status", render: (p) => <EtiquetaStatus ativo={p.ativo} /> },
              ]}
              acoes={(p) => (
                <>
                  <AcaoLinha
                    label="Abrir ficha"
                    icone="eye"
                    onClick={() => window.dispatchEvent(new CustomEvent("a4p:open-contato", { detail: { id: p.id } }))}
                  />
                  <AcaoLinha label="Editar" icone="edit" onClick={() => setEditando(p)} />
                </>
              )}
            />
          )}
        </>
      )}

      {(novo || editando) && (
        <FormParte
          lado={lado}
          parte={editando}
          cats={cats}
          onClose={() => { setNovo(false); setEditando(null); }}
          onSalvo={(msg) => {
            setExtras(listExtrasParty());
            setNovo(false); setEditando(null);
            show(msg);
          }}
        />
      )}
      {node}
    </div>
  );
}

/* --------------------------------- resumo --------------------------------- */

/** A aba Resumo responde "como está a carteira", não repete a lista. */
function Resumo({
  itens, cats, lado,
}: {
  itens: { id: string; ativo: boolean; categoriaPadrao: string; doc?: string | null; email?: string | null; phone?: string | null; type: PartyType }[];
  cats: { id: string; nome: string }[];
  lado: Lado;
}) {
  const ativos = itens.filter((i) => i.ativo).length;
  const pj = itens.filter((i) => i.type === "pj").length;
  const semContato = itens.filter((i) => !i.email && !i.phone).length;
  const semCategoria = itens.filter((i) => !i.categoriaPadrao).length;

  const porCategoria = React.useMemo(() => {
    const mapa = new Map<string, number>();
    for (const i of itens) {
      const nome = cats.find((c) => c.id === i.categoriaPadrao)?.nome ?? "Sem categoria padrão";
      mapa.set(nome, (mapa.get(nome) ?? 0) + 1);
    }
    return Array.from(mapa, ([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);
  }, [itens, cats]);

  if (itens.length === 0) {
    return <Card><VazioRegistro texto={`Nenhum ${lado} cadastrado ainda.`} /></Card>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Numero label="Cadastrados" valor={itens.length} />
        <Numero label="Ativos" valor={ativos} />
        <Numero label="Pessoa jurídica" valor={pj} />
        {/* Estes dois números existem para VIRAR trabalho: sem telefone não há
            cobrança por WhatsApp; sem categoria, o lançamento cai sem classificar. */}
        <Numero label="Sem contato" valor={semContato} alerta={semContato > 0} />
      </div>
      <Card>
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-h3 font-semibold text-ink">Por categoria padrão</span>
          {semCategoria > 0 && (
            <span className="text-caption text-warning">
              {semCategoria} sem categoria padrão
            </span>
          )}
        </div>
        <div className="flex flex-col">
          {porCategoria.map((c) => (
            <div key={c.nome} className="flex items-baseline justify-between gap-3 py-2 border-b border-border-soft last:border-0">
              <span className="text-label text-ink truncate">{c.nome}</span>
              <span className="text-label text-ink tabular-nums shrink-0">{c.qtd}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Numero({ label, valor, alerta }: { label: string; valor: number; alerta?: boolean }) {
  return (
    <Card>
      <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">{label}</span>
      <span className={`block mt-2 text-[26px] leading-none font-semibold tabular-nums ${alerta ? "text-warning" : "text-ink"}`}>
        {valor}
      </span>
    </Card>
  );
}

/* ------------------------------- formulário ------------------------------- */

function FormParte({
  lado, parte, cats, onClose, onSalvo,
}: {
  lado: Lado;
  parte?: Party | null;
  cats: { id: string; nome: string }[];
  onClose: () => void;
  onSalvo: (msg: string) => void;
}) {
  const t = TEXTO[lado];
  const criar = useCreateParty();
  const atualizar = useUpdateParty();
  const extra = parte ? extraParty(parte.id) : {};
  const [tentou, setTentou] = React.useState(false);
  const [cepCarregando, setCepCarregando] = React.useState(false);
  const [cidades, setCidades] = React.useState<string[]>([]);

  const [f, setF] = React.useState({
    type: (parte?.type ?? "pj") as PartyType,
    doc: parte?.doc ?? "",
    name: parte?.name ?? "",
    email: parte?.email ?? "",
    phone: parte?.phone ?? "",
    pais: extra.pais ?? "Brasil",
    zip: "", street: "", number: "", complement: "", district: "", city: "", state: "",
    categoriaPadrao: extra.categoriaPadrao ?? "",
    chavePix: extra.chavePix ?? "",
    observacao: extra.observacao ?? "",
    ativo: extra.ativo ?? true,
    nomeFantasia: extra.nomeFantasia ?? "",
    inscricaoMunicipal: extra.inscricaoMunicipal ?? "",
    inscricaoEstadual: extra.inscricaoEstadual ?? "",
    optanteSimples: extra.optanteSimples ?? "",
    contribuinteEstadual: extra.contribuinteEstadual ?? "",
    identificadorEstrangeiro: extra.identificadorEstrangeiro ?? "",
    dataFundacao: extra.dataFundacao ?? "",
    faturamentoMensal: extra.faturamentoMensal ?? 0,
    site: extra.site ?? "",
  });
  const set = (p: Partial<typeof f>) => setF((s) => ({ ...s, ...p }));

  // A cidade depende do estado — carregar a lista inteira do país seria inútil.
  React.useEffect(() => {
    if (!f.state) { setCidades([]); return; }
    let vivo = true;
    municipiosDe(f.state).then((ms) => { if (vivo) setCidades(ms); }).catch(() => { /* offline: digita à mão */ });
    return () => { vivo = false; };
  }, [f.state]);

  const docOk = f.doc.trim() === "" ? true : validateDoc(f.type, f.doc);
  const erros = {
    doc: !f.doc.trim() ? "Informe o CPF/CNPJ." : !docOk ? "Documento inválido." : "",
    name: !f.name.trim() ? `Informe ${lado === "cliente" ? "o nome" : "a razão social"}.` : "",
  };
  const invalido = Object.values(erros).some(Boolean);

  const buscarCep = async (cep: string) => {
    if (cep.replace(/\D/g, "").length !== 8) return;
    setCepCarregando(true);
    try {
      const r = await lookupCep(cep);
      if (r) set({ street: r.street, district: r.district, city: r.city, state: r.state });
    } finally {
      setCepCarregando(false);
    }
  };

  const salvar = () => {
    setTentou(true);
    if (invalido) return;
    const base = {
      type: f.type,
      name: f.name.trim(),
      doc: f.doc.trim() || null,
      email: f.email.trim() || null,
      phone: f.phone.trim() || null,
      is_customer: lado === "cliente",
      is_supplier: lado === "fornecedor",
      is_carrier: false,
      antt: null,
    };
    /**
     * O endereço só entra no patch quando foi PREENCHIDO nesta sessão.
     * `listParties` não devolve as colunas de endereço, então os campos abrem
     * vazios ao editar — gravá-los assim apagaria o endereço que está no banco.
     */
    const endereco = f.zip.trim()
      ? {
          zip: f.zip, street: f.street, number: f.number, complement: f.complement,
          district: f.district, city: f.city, state: f.state,
        }
      : {};
    const extras: ExtraParty = {
      categoriaPadrao: f.categoriaPadrao, chavePix: f.chavePix, observacao: f.observacao,
      ativo: f.ativo, nomeFantasia: f.nomeFantasia, pais: f.pais,
      inscricaoMunicipal: f.inscricaoMunicipal, inscricaoEstadual: f.inscricaoEstadual,
      optanteSimples: f.optanteSimples as ExtraParty["optanteSimples"],
      contribuinteEstadual: f.contribuinteEstadual as ExtraParty["contribuinteEstadual"],
      identificadorEstrangeiro: f.identificadorEstrangeiro, dataFundacao: f.dataFundacao,
      faturamentoMensal: f.faturamentoMensal, site: f.site,
    };

    if (parte) {
      atualizar.mutate({ id: parte.id, patch: { ...base, ...endereco } }, {
        onSuccess: () => { salvarExtraParty(parte.id, extras); onSalvo(`${cap(t.singular)} salvo.`); },
      });
    } else {
      criar.mutate({
        ...base,
        zip: null, street: null, number: null, complement: null, district: null, city: null, state: null,
        ...endereco,
      }, {
        onSuccess: (novo: { id?: string } | void) => {
          const id = (novo as { id?: string } | undefined)?.id;
          if (id) salvarExtraParty(id, extras);
          onSalvo(`${cap(t.singular)} criado.`);
        },
      });
    }
  };

  const pj = f.type === "pj";

  return (
    <FormModal
      title={parte ? `Editar ${t.singular}` : t.novo}
      size="large"
      onClose={onClose}
      onSave={salvar}
      saving={criar.isPending || atualizar.isPending}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="Tipo" obrigatorio>
          <Select
            value={f.type}
            onChange={(v) => set({ type: v as PartyType })}
            options={[{ value: "pj", label: "Pessoa Jurídica" }, { value: "pf", label: "Pessoa Física" }]}
          />
        </Campo>
        <Campo label={pj ? "CNPJ" : "CPF"} obrigatorio erro={tentou ? erros.doc : ""}>
          <Input value={f.doc} onChange={(e) => set({ doc: maskDoc(f.type, e.target.value) })} placeholder={pj ? "00.000.000/0000-00" : "000.000.000-00"} />
        </Campo>
      </div>

      <Campo label={t.nomeCampo} obrigatorio erro={tentou ? erros.name : ""}>
        <Input value={f.name} onChange={(e) => set({ name: e.target.value })} />
      </Campo>

      {lado === "fornecedor" && (
        <Campo label="Nome fantasia">
          <Input value={f.nomeFantasia} onChange={(e) => set({ nomeFantasia: e.target.value })} />
        </Campo>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo label="E-mail">
          <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} placeholder="contato@empresa.com.br" />
        </Campo>
        <Campo label="Telefone" ajuda={lado === "cliente" ? "Sem telefone não há cobrança automática por WhatsApp." : undefined}>
          <Input value={f.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="(11) 90000-0000" />
        </Campo>
      </div>

      {lado === "fornecedor" && (
        <Campo label="Chave PIX">
          <Input value={f.chavePix} onChange={(e) => set({ chavePix: e.target.value })} placeholder="CNPJ, e-mail, telefone ou chave aleatória" />
        </Campo>
      )}

      <Campo label={t.categoria} ajuda={t.ajudaCategoria}>
        <Select
          value={f.categoriaPadrao}
          onChange={(v) => set({ categoriaPadrao: v })}
          placeholder="Selecione a categoria"
          options={cats.map((c) => ({ value: c.id, label: c.nome }))}
        />
      </Campo>

      <BlocoForm titulo="Endereço">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Campo label="País"><Input value={f.pais} onChange={(e) => set({ pais: e.target.value })} /></Campo>
          <Campo label="CEP" ajuda={cepCarregando ? "Buscando endereço…" : undefined}>
            <Input
              value={f.zip}
              onChange={(e) => set({ zip: maskCep(e.target.value) })}
              onBlur={(e) => buscarCep(e.target.value)}
              placeholder="00000-000"
            />
          </Campo>
          <Campo label="Número"><Input value={f.number} onChange={(e) => set({ number: e.target.value })} /></Campo>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Campo label="Rua"><Input value={f.street} onChange={(e) => set({ street: e.target.value })} /></Campo>
          <Campo label="Complemento"><Input value={f.complement} onChange={(e) => set({ complement: e.target.value })} /></Campo>
          <Campo label="Bairro"><Input value={f.district} onChange={(e) => set({ district: e.target.value })} /></Campo>
          <Campo label="Estado">
            <Select
              value={f.state}
              onChange={(v) => set({ state: v, city: "" })}
              placeholder="Selecione o estado"
              options={UFS.map((u) => ({ value: u.sigla, label: `${u.sigla} — ${u.nome}` }))}
            />
          </Campo>
          <Campo label="Cidade" className="sm:col-span-2">
            {cidades.length > 0 ? (
              <Select
                value={f.city}
                onChange={(v) => set({ city: v })}
                placeholder="Selecione a cidade"
                options={cidades.map((c) => ({ value: c, label: c }))}
              />
            ) : (
              <Input
                value={f.city}
                onChange={(e) => set({ city: e.target.value })}
                placeholder={f.state ? "Carregando cidades…" : "Selecione o estado primeiro"}
              />
            )}
          </Campo>
        </div>
      </BlocoForm>

      <Campo label="Observação">
        <Textarea value={f.observacao} onChange={(e) => set({ observacao: e.target.value })} rows={2} />
      </Campo>

      <SwitchAtivo checked={f.ativo} onChange={(v) => set({ ativo: v })} label={`${cap(t.singular)} ativo`} />

      {/* Dados PJ: só o fornecedor pessoa jurídica tem inscrição e regime. */}
      {lado === "fornecedor" && pj && (
        <BlocoForm titulo="Dados PJ">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Campo label="Inscrição Municipal"><Input value={f.inscricaoMunicipal} onChange={(e) => set({ inscricaoMunicipal: e.target.value })} /></Campo>
            <Campo label="Inscrição Estadual"><Input value={f.inscricaoEstadual} onChange={(e) => set({ inscricaoEstadual: e.target.value })} /></Campo>
            <Campo label="Optante Simples Nacional">
              <Select value={f.optanteSimples} onChange={(v) => set({ optanteSimples: v as "sim" | "nao" | "" })}
                placeholder="Selecione uma opção" options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }]} />
            </Campo>
            <Campo label="Contribuinte Estadual">
              <Select value={f.contribuinteEstadual} onChange={(v) => set({ contribuinteEstadual: v as "sim" | "nao" | "" })}
                placeholder="Selecione uma opção" options={[{ value: "sim", label: "Sim" }, { value: "nao", label: "Não" }]} />
            </Campo>
            <Campo label="Identificador Estrangeiro"><Input value={f.identificadorEstrangeiro} onChange={(e) => set({ identificadorEstrangeiro: e.target.value })} /></Campo>
            <Campo label="Data de fundação"><DateField value={f.dataFundacao} onChange={(v) => set({ dataFundacao: v })} /></Campo>
            <Campo label="Faturamento mensal"><CurrencyInput value={f.faturamentoMensal} onValueChange={(v) => set({ faturamentoMensal: v })} /></Campo>
            <Campo label="Site"><Input value={f.site} onChange={(e) => set({ site: e.target.value })} placeholder="https://" /></Campo>
          </div>
        </BlocoForm>
      )}

      {tentou && invalido && (
        <p className="m-0 inline-flex items-center gap-2 text-caption text-negative">
          <Icon name="triangle-alert" size={14} color="currentColor" />
          Revise os campos obrigatórios acima.
        </p>
      )}
    </FormModal>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
