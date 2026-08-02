"use client";

/**
 * Integrações — o catálogo de oito cartões e o painel de cada um.
 *
 * ⚠️ A regra que atravessa a tela inteira: **um segredo se mostra UMA vez**.
 * Chave de API, token e senha de certificado são exibidos no momento em que
 * nascem e nunca mais. Reexibi-los transformaria qualquer sessão aberta, print
 * de tela ou acesso de leitura num vazamento que o dono do dado não tem como
 * perceber. O que fica guardado é a máscara — prefixo + quatro últimos —, o
 * suficiente para saber QUAL credencial está ali.
 */
import * as React from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, Button, Icon, Input, Select, DateField, Switch } from "@/components/ui";
import { useToast } from "@/components/listas/ListChrome";
import {
  CATALOGO_INTEGRACOES, PLATAFORMAS_VENDAS, BANCOS_OPEN_FINANCE,
  CONSENTIMENTO_MESES, consentimentoOpenFinance, certificadoValido, mascararSegredo,
  type CartaoIntegracao,
} from "@/core/administracao";
import {
  lerIntegracoes, salvarIntegracao, guardarCredencial,
  type EstadoIntegracao,
} from "@/lib/administracao-store";

const VAZIA = (id: string): EstadoIntegracao => ({
  id, ativa: false, credencialMascarada: null, certificadoValidade: null,
  consentimentoEm: null, conectados: [], chaves: {}, atualizadoEm: null,
});

const hojeISO = () => new Date().toISOString().slice(0, 10);
const fmtDia = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export function IntegracoesView() {
  const router = useRouter();
  const params = useSearchParams();
  const aberto = params.get("cartao");
  const { show: toast, node } = useToast();
  const [estados, setEstados] = React.useState<Record<string, EstadoIntegracao>>({});
  // ⚠️ O estado vem do localStorage, que não existe no servidor. Lê-lo durante o
  // render produz um HTML no servidor diferente do que o cliente monta e o React
  // aborta a hidratação daquele trecho — o painel voltava a renderizar do zero.
  // Só depois de montado a tela mostra o que está guardado.
  const [montado, setMontado] = React.useState(false);

  React.useEffect(() => {
    setEstados(lerIntegracoes());
    setMontado(true);
  }, []);

  const cartao = CATALOGO_INTEGRACOES.find((c) => c.id === aberto) ?? null;

  function atualizar(e: EstadoIntegracao) {
    setEstados(salvarIntegracao(e));
  }

  if (cartao) {
    if (!montado) return null;
    return (
      <div className="flex flex-col gap-6">
        <button
          onClick={() => router.push("/dashboard/administration/integrations")}
          className="self-start inline-flex items-center gap-1 text-label text-muted hover:text-ink transition-colors"
        >
          <Icon name="chevron-left" size={14} color="currentColor" />
          Todas as integrações
        </button>
        <PainelIntegracao
          key={cartao.id}
          cartao={cartao}
          estado={estados[cartao.id] ?? VAZIA(cartao.id)}
          onMudar={atualizar}
          toast={toast}
        />
        {node}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="m-0 text-label text-muted max-w-[80ch]">
        Conecte a all4pay às plataformas externas que automatizam entrada de dados e emissão fiscal.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {CATALOGO_INTEGRACOES.map((c) => {
          const e = estados[c.id];
          const ativa = e?.ativa ?? false;
          return (
            <Card key={c.id} className="cursor-pointer hover:bg-surface-2/40 transition-colors"
              onClick={() => router.push(`/dashboard/administration/integrations?cartao=${c.id}`)}>
              <div className="flex flex-col gap-3 h-full">
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex items-center justify-center w-11 h-11 rounded-[12px] bg-ink shrink-0">
                    <Icon name={c.icone} size={18} color="var(--color-lime)" />
                  </span>
                  <span className="inline-flex items-center gap-[6px] text-caption text-muted">
                    <span className="w-[7px] h-[7px] rounded-pill" style={{ background: ativa ? "var(--color-positive)" : "var(--color-placeholder)" }} />
                    {ativa ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <span className="text-h3 font-semibold text-ink">{c.titulo}</span>
                <span className="text-caption text-muted flex-1">{c.descricao}</span>
                <span className="text-label text-ink">Abrir ↗</span>
              </div>
            </Card>
          );
        })}
      </div>
      {node}
    </div>
  );
}

/* ============================ painel por cartão ============================ */

function PainelIntegracao({
  cartao, estado, onMudar, toast,
}: {
  cartao: CartaoIntegracao;
  estado: EstadoIntegracao;
  onMudar: (e: EstadoIntegracao) => void;
  toast: (s: string) => void;
}) {
  const hoje = hojeISO();

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex items-start gap-4">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-[12px] bg-ink shrink-0">
            <Icon name={cartao.icone} size={20} color="var(--color-lime)" />
          </span>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-h2 font-semibold text-ink">{cartao.titulo}</span>
            <span className="text-label text-muted max-w-[80ch]">{cartao.descricao}</span>
            {estado.atualizadoEm && (
              <span className="text-caption text-faint">Atualizado em {fmtDia(estado.atualizadoEm)}</span>
            )}
          </div>
        </div>
      </Card>

      {cartao.id === "plataformas" && (
        <Conectores
          titulo="Conectores disponíveis"
          nota="Cada plataforma pede credenciais próprias, um webhook e um prazo de baixa — os três precisam bater com o painel do gateway, senão a venda entra sem o recebimento."
          itens={PLATAFORMAS_VENDAS} estado={estado} onMudar={onMudar} toast={toast}
        />
      )}

      {cartao.id === "emissao-nf" && (
        <Certificado
          estado={estado} onMudar={onMudar} toast={toast} hoje={hoje}
          nota="A emissão exige certificado digital válido. Vencido, a plataforma não assina a nota — e a venda fica sem documento fiscal."
        />
      )}

      {cartao.id === "receber-nf" && (
        <Certificado
          estado={estado} onMudar={onMudar} toast={toast} hoje={hoje}
          nota="A consulta à SEFAZ roda de madrugada com o certificado A1 (.pfx/.p12) e a senha dele. Sem certificado válido a captura simplesmente para — e ninguém percebe, porque a tela de NFs recebidas continua abrindo."
        />
      )}

      {cartao.id === "contabil" && (
        <Card>
          <div className="flex flex-col gap-4">
            <span className="text-h3 font-semibold text-ink">Envios automáticos</span>
            <p className="m-0 text-caption text-faint max-w-[84ch]">
              Os dois interruptores são <strong>independentes</strong>: há escritório que quer os
              XMLs mas lança o extrato à mão, e o contrário também acontece. Um interruptor só
              obrigaria a mandar o que ninguém pediu.
            </p>
            <Chave
              rotulo="Enviar NFs emitidas e recebidas" chave="nfs" estado={estado}
              onMudar={onMudar} toast={toast}
            />
            <Chave
              rotulo="Enviar extratos bancários" chave="extratos" estado={estado}
              onMudar={onMudar} toast={toast}
            />
            <div className="pt-3 border-t border-border-soft flex items-center justify-between gap-3 flex-wrap">
              <span className="text-caption text-muted">
                Geração manual por período fica em Contabilidade › TXT Domínio.
              </span>
              <Button variant="ghost" onClick={() => { window.location.href = "/dashboard/accounting/dominio-export"; }}>
                Abrir gerador ↗
              </Button>
            </div>
          </div>
        </Card>
      )}

      {cartao.id === "dda" && (
        <Card>
          <div className="flex flex-col gap-4">
            <span className="text-h3 font-semibold text-ink">Termo de adesão</span>
            <p className="m-0 text-caption text-muted max-w-[84ch]">
              O DDA entrega à plataforma todo boleto emitido contra o seu CNPJ na CIP. A adesão é
              um ato do titular — por isso ela exige aceite explícito, e não um interruptor.
            </p>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox" checked={estado.ativa}
                onChange={(e) => {
                  onMudar({ ...estado, ativa: e.target.checked, atualizadoEm: hoje });
                  toast(e.target.checked ? "Adesão ao DDA registrada." : "Adesão ao DDA revogada.");
                }}
                className="mt-[3px]"
              />
              <span className="text-label text-ink max-w-[76ch]">
                Aceito o termo de adesão ao Débito Direto Autorizado e autorizo a consulta dos
                boletos emitidos contra o CNPJ desta empresa.
              </span>
            </label>
            <span className="text-caption text-faint">
              Os boletos capturados aparecem em Compras › Boletos recebidos.
            </span>
          </div>
        </Card>
      )}

      {cartao.id === "open-finance" && (
        <OpenFinance estado={estado} onMudar={onMudar} toast={toast} hoje={hoje} />
      )}

      {cartao.id === "apis" && <APIs estado={estado} onMudar={onMudar} toast={toast} hoje={hoje} />}

      {cartao.id === "mcp" && <MCP estado={estado} onMudar={onMudar} toast={toast} hoje={hoje} />}
    </div>
  );
}

/* --------------------------------- blocos --------------------------------- */

function Conectores({
  titulo, nota, itens, estado, onMudar, toast,
}: {
  titulo: string; nota: string; itens: string[];
  estado: EstadoIntegracao; onMudar: (e: EstadoIntegracao) => void; toast: (s: string) => void;
}) {
  const [busca, setBusca] = React.useState("");
  const lista = itens.filter((i) => i.toLowerCase().includes(busca.toLowerCase()));
  const conectados = estado.conectados ?? [];

  function alternar(nome: string) {
    const novos = conectados.includes(nome)
      ? conectados.filter((c) => c !== nome)
      : [...conectados, nome];
    onMudar({ ...estado, conectados: novos, ativa: novos.length > 0, atualizadoEm: hojeISO() });
    toast(conectados.includes(nome) ? `${nome} desconectada.` : `${nome} conectada.`);
  }

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-h3 font-semibold text-ink">{titulo}</span>
          <span className="text-caption text-faint tabular-nums">
            {conectados.length} de {itens.length} conectadas
          </span>
        </div>
        <p className="m-0 text-caption text-faint max-w-[84ch]">{nota}</p>
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar conector…" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {lista.map((nome) => {
            const on = conectados.includes(nome);
            return (
              <button
                key={nome} onClick={() => alternar(nome)}
                className={`flex items-center justify-between gap-2 px-4 py-3 rounded-md text-left transition-colors ${
                  on ? "bg-surface-2" : "bg-surface-2/50 hover:bg-surface-2"
                }`}
              >
                <span className="text-label text-ink truncate">{nome}</span>
                <span className="inline-flex items-center gap-[6px] text-caption text-muted shrink-0">
                  <span className="w-[7px] h-[7px] rounded-pill" style={{ background: on ? "var(--color-positive)" : "var(--color-placeholder)" }} />
                  {on ? "Ativa" : "Inativa"}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function Certificado({
  estado, onMudar, toast, hoje, nota,
}: {
  estado: EstadoIntegracao; onMudar: (e: EstadoIntegracao) => void;
  toast: (s: string) => void; hoje: string; nota: string;
}) {
  const [senha, setSenha] = React.useState("");
  const [validade, setValidade] = React.useState(estado.certificadoValidade ?? "");
  const valido = certificadoValido(estado.certificadoValidade, hoje);

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <span className="text-h3 font-semibold text-ink">Certificado digital</span>
        <p className="m-0 text-caption text-faint max-w-[84ch]">{nota}</p>

        {estado.certificadoValidade && (
          <div className="rounded-md bg-surface-2 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
            <span className="flex flex-col">
              <span className="text-caption text-faint">Certificado carregado</span>
              <span className="text-label text-ink tabular-nums">
                {estado.credencialMascarada ?? "senha guardada"} · válido até {fmtDia(estado.certificadoValidade)}
              </span>
            </span>
            <span className="inline-flex items-center gap-[6px] text-caption"
              style={{ color: valido ? "var(--color-positive)" : "var(--color-negative)" }}>
              <Icon name={valido ? "check" : "triangle-alert"} size={14} color="currentColor" />
              {valido ? "Válido" : "VENCIDO — a captura está parada"}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Arquivo (.pfx / .p12)</label>
            <label className="flex items-center gap-2 px-3 h-10 rounded-md bg-surface-2 cursor-pointer text-label text-muted">
              <Icon name="upload" size={15} color="currentColor" />
              Escolher arquivo
              <input type="file" accept=".pfx,.p12" className="hidden" onChange={() => toast("Arquivo selecionado.")} />
            </label>
          </div>
          <div className="flex flex-col gap-[6px]">
            <label className="text-label font-medium text-muted">Senha do certificado</label>
            <Input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="••••••••" />
          </div>
          <DateField label="Válido até" value={validade} onChange={setValidade} />
        </div>

        <div className="flex items-center justify-end">
          <Button
            variant="primary"
            disabled={!senha || !validade}
            onClick={() => {
              const novo = guardarCredencial(estado.id, senha, hoje);
              onMudar({ ...novo, certificadoValidade: validade });
              setSenha("");
              toast("Certificado registrado. A senha não será exibida novamente.");
            }}
          >
            Salvar certificado
          </Button>
        </div>
        <span className="text-caption text-faint">
          A senha é guardada mascarada e não volta na tela. Para trocá-la, envie de novo.
        </span>
      </div>
    </Card>
  );
}

function Chave({
  rotulo, chave, estado, onMudar, toast,
}: {
  rotulo: string; chave: string; estado: EstadoIntegracao;
  onMudar: (e: EstadoIntegracao) => void; toast: (s: string) => void;
}) {
  const on = estado.chaves?.[chave] ?? false;
  return (
    <div className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-4 py-3">
      <span className="text-label text-ink">{rotulo}</span>
      <Switch
        checked={on}
        onChange={(v) => {
          const chaves = { ...(estado.chaves ?? {}), [chave]: v };
          onMudar({
            ...estado, chaves,
            ativa: Object.values(chaves).some(Boolean),
            atualizadoEm: hojeISO(),
          });
          toast(v ? `${rotulo}: ligado.` : `${rotulo}: desligado.`);
        }}
        label=""
      />
    </div>
  );
}

function OpenFinance({
  estado, onMudar, toast, hoje,
}: {
  estado: EstadoIntegracao; onMudar: (e: EstadoIntegracao) => void;
  toast: (s: string) => void; hoje: string;
}) {
  const consent = estado.consentimentoEm ? consentimentoOpenFinance(estado.consentimentoEm, hoje) : null;
  const conectados = estado.conectados ?? [];

  return (
    <>
      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-h3 font-semibold text-ink">Consentimento</span>
          <p className="m-0 text-caption text-faint max-w-[84ch]">
            O consentimento do Open Finance vale <strong>{CONSENTIMENTO_MESES} meses</strong> — é
            regra do Banco Central, não escolha da plataforma. Quando ele vence, a sincronização
            de extrato e saldo PARA, e o saldo da tela congela no último dia que entrou.
          </p>
          {consent ? (
            <div className="rounded-md bg-surface-2 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <span className="flex flex-col">
                <span className="text-caption text-faint">Concedido em {fmtDia(estado.consentimentoEm)}</span>
                <span className="text-label text-ink tabular-nums">Vence em {fmtDia(consent.vence)}</span>
              </span>
              <span
                className="inline-flex items-center gap-[6px] text-caption"
                style={{ color: consent.vencido ? "var(--color-negative)" : consent.aVencer ? "var(--color-warning)" : "var(--color-positive)" }}
              >
                <Icon name={consent.vencido ? "triangle-alert" : "check"} size={14} color="currentColor" />
                {consent.vencido
                  ? `VENCIDO há ${Math.abs(consent.diasRestantes)} dias — a sincronização está parada`
                  : consent.aVencer
                  ? `Renove: faltam ${consent.diasRestantes} dias`
                  : `${consent.diasRestantes} dias restantes`}
              </span>
            </div>
          ) : (
            <span className="text-label text-muted">Nenhum consentimento registrado.</span>
          )}
          <div className="flex items-center justify-end">
            <Button
              variant="primary"
              onClick={() => {
                onMudar({ ...estado, consentimentoEm: hoje, ativa: true, atualizadoEm: hoje });
                toast("Consentimento renovado por 12 meses.");
              }}
            >
              {consent ? "Renovar consentimento" : "Conceder consentimento"}
            </Button>
          </div>
        </div>
      </Card>

      <Conectores
        titulo="Bancos homologados"
        nota="Só o que está homologado sincroniza. Conta em banco fora da lista continua entrando por importação de extrato."
        itens={BANCOS_OPEN_FINANCE} estado={estado} onMudar={onMudar} toast={toast}
      />
      {conectados.length > 0 && !consent && (
        <Card>
          <div className="flex items-start gap-3">
            <Icon name="triangle-alert" size={17} color="var(--color-warning)" />
            <span className="text-caption text-muted max-w-[86ch]">
              Há {conectados.length} banco(s) marcado(s) sem consentimento registrado — a
              sincronização não roda até o consentimento existir.
            </span>
          </div>
        </Card>
      )}
    </>
  );
}

function APIs({
  estado, onMudar, toast, hoje,
}: {
  estado: EstadoIntegracao; onMudar: (e: EstadoIntegracao) => void;
  toast: (s: string) => void; hoje: string;
}) {
  const [novaChave, setNovaChave] = React.useState<string | null>(null);
  const [webhook, setWebhook] = React.useState("");

  function gerar() {
    // Gerada no cliente só para a demonstração; em produção quem emite é o
    // servidor, e o valor cru nunca chega ao localStorage.
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    const chave = `a4p_live_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    setNovaChave(chave);
    onMudar(guardarCredencial(estado.id, chave, hoje));
    toast("Chave gerada. Copie agora — ela não será exibida de novo.");
  }

  return (
    <>
      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-h3 font-semibold text-ink">Chave de API</span>
          <p className="m-0 text-caption text-faint max-w-[84ch]">
            A autenticação é por header <code className="tabular-nums">X-API-Key</code>. A chave
            aparece <strong>uma única vez</strong>, no momento em que é gerada: reexibi-la depois
            transformaria qualquer print ou sessão aberta num vazamento silencioso.
          </p>

          {novaChave ? (
            <div className="rounded-md bg-lime-tint px-4 py-3 flex flex-col gap-2">
              <span className="text-caption text-ink font-medium">Copie agora — esta é a única vez que a chave aparece.</span>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-label text-ink tabular-nums break-all">{novaChave}</code>
                <Button variant="secondary" onClick={() => {
                  navigator.clipboard?.writeText(novaChave).then(() => toast("Chave copiada.")).catch(() => toast("Copie manualmente."));
                }}>
                  Copiar
                </Button>
              </div>
            </div>
          ) : estado.credencialMascarada ? (
            <div className="rounded-md bg-surface-2 px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <span className="flex flex-col">
                <span className="text-caption text-faint">Chave ativa</span>
                <span className="text-label text-ink tabular-nums">{estado.credencialMascarada}</span>
              </span>
              <span className="text-caption text-faint">Gerada em {fmtDia(estado.atualizadoEm)}</span>
            </div>
          ) : (
            <span className="text-label text-muted">Nenhuma chave gerada — a API está desabilitada nesta empresa.</span>
          )}

          <div className="flex items-center justify-end gap-2">
            {estado.credencialMascarada && (
              <Button variant="ghost" onClick={() => {
                onMudar({ ...estado, credencialMascarada: null, ativa: false, atualizadoEm: hoje });
                setNovaChave(null);
                toast("Chave revogada.");
              }}>
                Revogar
              </Button>
            )}
            <Button variant="primary" onClick={gerar}>
              {estado.credencialMascarada ? "Gerar nova chave" : "Gerar chave"}
            </Button>
          </div>
          {estado.credencialMascarada && (
            <span className="text-caption text-faint">
              Gerar uma nova invalida a anterior — integrações que ainda usam a antiga param na hora.
            </span>
          )}
        </div>
      </Card>

      <Card>
        <div className="flex flex-col gap-4">
          <span className="text-h3 font-semibold text-ink">Webhook de vendas</span>
          <p className="m-0 text-caption text-faint max-w-[84ch]">
            A URL que recebe cada venda sincronizada. Precisa aceitar POST e responder 2xx — uma
            resposta de erro faz a plataforma reenviar, e o reenvio sem idempotência do seu lado
            duplica a venda.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] gap-3">
            <Input value={webhook} onChange={(e) => setWebhook(e.target.value)} placeholder="https://seu-sistema.com.br/webhooks/vendas" />
            <Button variant="secondary" disabled={!webhook} onClick={() => toast("Webhook salvo.")}>Salvar</Button>
          </div>
        </div>
      </Card>
    </>
  );
}

function MCP({
  estado, onMudar, toast, hoje,
}: {
  estado: EstadoIntegracao; onMudar: (e: EstadoIntegracao) => void;
  toast: (s: string) => void; hoje: string;
}) {
  const ESCOPOS = [
    { id: "leitura:saldo", label: "Ler saldo e contas" },
    { id: "leitura:lancamentos", label: "Ler lançamentos" },
    { id: "leitura:relatorios", label: "Ler DRE e relatórios" },
    { id: "escrita:lancamentos", label: "Criar lançamentos" },
  ];
  const [modo, setModo] = React.useState<"bearer" | "oauth">("bearer");
  const escolhidos = estado.conectados ?? [];

  return (
    <Card>
      <div className="flex flex-col gap-4">
        <span className="text-h3 font-semibold text-ink">Acesso de IAs</span>
        <p className="m-0 text-caption text-faint max-w-[84ch]">
          O MCP dá a uma IA acesso direto aos dados financeiros da empresa. O escopo é a única
          barreira — conceder escrita para uma pergunta de leitura é dar à IA a capacidade de
          criar lançamento que ninguém pediu.
        </p>
        <Select
          label="Forma de autenticação" value={modo} onChange={(v) => setModo(v as "bearer" | "oauth")}
          options={[
            { value: "bearer", label: "Token Bearer (uma IA, um token)" },
            { value: "oauth", label: "Cliente OAuth (aplicação registrada)" },
          ]}
          containerClassName="max-w-[380px]"
        />
        <div className="flex flex-col gap-2">
          <span className="text-label font-medium text-muted">Escopos concedidos</span>
          {ESCOPOS.map((e) => {
            const on = escolhidos.includes(e.id);
            const escrita = e.id.startsWith("escrita");
            return (
              <label key={e.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-4 py-3 cursor-pointer">
                <span className="flex flex-col">
                  <span className="text-label text-ink">{e.label}</span>
                  {escrita && <span className="text-caption text-warning">Permite alterar dados — conceda só se a IA precisar agir.</span>}
                </span>
                <input
                  type="checkbox" checked={on}
                  onChange={() => {
                    const novos = on ? escolhidos.filter((x) => x !== e.id) : [...escolhidos, e.id];
                    onMudar({ ...estado, conectados: novos, ativa: novos.length > 0, atualizadoEm: hoje });
                  }}
                />
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-end">
          <Button
            variant="primary" disabled={escolhidos.length === 0}
            onClick={() => {
              const bytes = new Uint8Array(24);
              crypto.getRandomValues(bytes);
              const token = `mcp_${Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
              onMudar({ ...guardarCredencial(estado.id, token, hoje), conectados: escolhidos });
              toast(`Token gerado com ${escolhidos.length} escopo(s): ${mascararSegredo(token)}. Copie agora.`);
            }}
          >
            Gerar token
          </Button>
        </div>
        {estado.credencialMascarada && (
          <span className="text-caption text-faint tabular-nums">
            Token ativo: {estado.credencialMascarada} · gerado em {fmtDia(estado.atualizadoEm)}
          </span>
        )}
      </div>
    </Card>
  );
}
