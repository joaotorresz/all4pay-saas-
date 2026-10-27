"use client";

/**
 * Banco Inter · cobrança — o painel da EMPRESA (cartão de Integrações): a
 * conta que recebe os boletos com Pix gerados nos títulos a receber.
 *
 * ⚠️ **O segredo se mostra UMA vez: enquanto se digita.** Client Secret,
 * certificado e chave sobem ao servidor, que os testa no Inter e guarda
 * CIFRADOS; nenhuma resposta os devolve. Conectada, a tela mostra só o
 * Client ID, a conta, o ambiente e quando o certificado vence.
 *
 * ⚠️ Só quem ADMINISTRA a empresa conecta ou desconecta — o banco confere.
 * O certificado do Inter vence (em geral em um ano): a tela avisa 30 dias
 * antes, porque vencido a cobrança simplesmente para.
 */
import * as React from "react";
import { Card, Button, Input, Select, Textarea, StatusBadge } from "@/components/ui";
import { isDemo } from "@/lib/demo";
import { usePermissoes } from "@/components/app/usePermissoes";
import { diasParaVencer } from "@/core/cobranca-banco/conexao";

type Conexao = {
  id: string;
  ambiente: "sandbox" | "producao";
  client_id: string;
  conta_corrente: string | null;
  certificado_ate: string | null;
  testada_em: string | null;
  criado_em: string;
};

type Estado = { ligada: boolean; cofre: boolean; conexao: Conexao | null; pendente?: string };

const AMBIENTES = [
  { value: "producao", label: "Produção (cobra de verdade)" },
  { value: "sandbox", label: "Sandbox (teste do Inter)" },
];

const hojeISO = () => new Date().toISOString().slice(0, 10);
const dia = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

function lerArquivo(f: File): Promise<string> {
  return new Promise((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result ?? ""));
    r.onerror = () => falha(new Error("Não foi possível ler o arquivo."));
    r.readAsText(f);
  });
}

export function CobrancaBancoPainel({ toast }: { toast: (s: string) => void }) {
  const { pode } = usePermissoes();
  const administra = isDemo || pode("administrar");
  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [enviando, setEnviando] = React.useState(false);
  const [form, setForm] = React.useState({
    ambiente: "producao", clientId: "", clientSecret: "", certificado: "", chave: "", contaCorrente: "",
  });

  const carregar = React.useCallback(async () => {
    if (isDemo) {
      setEstado({ ligada: false, cofre: false, conexao: null });
      return;
    }
    try {
      const r = await fetch("/api/cobranca-banco/conexao", { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as Partial<Estado> & { motivo?: string };
      if (!r.ok) {
        setErro(j.motivo ?? "Não foi possível ler a conta conectada.");
        return;
      }
      setErro(null);
      setEstado({ ligada: !!j.ligada, cofre: !!j.cofre, conexao: j.conexao ?? null, pendente: j.pendente });
    } catch {
      setErro("Não foi possível falar com o servidor.");
    }
  }, []);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const campo = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const arquivo = (k: "certificado" | "chave") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 20_000) return toast("Arquivo grande demais para ser o certificado ou a chave da integração.");
    try {
      campo(k)(await lerArquivo(f));
    } catch {
      toast("Não foi possível ler o arquivo.");
    }
  };

  const conectar = async () => {
    setEnviando(true);
    try {
      const r = await fetch("/api/cobranca-banco/conexao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = (await r.json().catch(() => ({}))) as { motivo?: string };
      if (r.ok) {
        // O segredo sai da memória da tela assim que o servidor o guardou.
        setForm({ ambiente: form.ambiente, clientId: "", clientSecret: "", certificado: "", chave: "", contaCorrente: "" });
        toast("Conta Inter conectada. Os títulos a receber já podem gerar boleto com Pix.");
        await carregar();
      } else {
        toast(j.motivo ?? "Não foi possível conectar agora.");
      }
    } catch {
      toast("Não foi possível falar com o servidor.");
    } finally {
      setEnviando(false);
    }
  };

  const desconectar = async () => {
    if (!window.confirm("Desconectar a conta Inter? As cobranças já emitidas continuam valendo no banco, mas nenhuma nova será gerada.")) return;
    setEnviando(true);
    try {
      const r = await fetch("/api/cobranca-banco/conexao", { method: "DELETE" });
      const j = (await r.json().catch(() => ({}))) as { motivo?: string };
      toast(r.ok ? "Conta Inter desconectada." : j.motivo ?? "Não foi possível desconectar agora.");
      await carregar();
    } catch {
      toast("Não foi possível falar com o servidor.");
    } finally {
      setEnviando(false);
    }
  };

  if (erro) {
    return <Card><p className="m-0 text-label text-negative">{erro}</p></Card>;
  }
  if (!estado) return null;

  const c = estado.conexao;
  const faltam = c ? diasParaVencer(c.certificado_ate, hojeISO()) : null;

  // Por que o botão de conectar não pode ser usado agora — em frase, no lugar dele.
  const bloqueio = isDemo
    ? "Na demonstração nenhuma conta é conectada: o formulário está aqui para você ver o que será pedido."
    : estado.pendente === "migration"
      ? "A cobrança pela conta bancária ainda está sendo instalada no servidor."
      : !estado.ligada
        ? "A cobrança pela conta bancária ainda não foi liberada pela Quattro."
        : !estado.cofre
          ? "O servidor ainda não tem onde guardar a credencial com segurança."
          : !administra
            ? "Só quem administra a empresa conecta a conta que recebe as cobranças."
            : null;

  if (c) {
    return (
      <Card>
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <span className="text-h3 font-semibold text-ink">Conta conectada</span>
            <StatusBadge tone={c.ambiente === "producao" ? "positive" : "neutral"}>
              {c.ambiente === "producao" ? "Produção" : "Sandbox"}
            </StatusBadge>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 m-0">
            <div className="flex flex-col gap-[2px]">
              <dt className="text-caption text-muted">Client ID</dt>
              <dd className="m-0 text-label text-ink break-all">{c.client_id}</dd>
            </div>
            <div className="flex flex-col gap-[2px]">
              <dt className="text-caption text-muted">Conta corrente</dt>
              <dd className="m-0 text-label text-ink tabular-nums">{c.conta_corrente ?? "A da credencial"}</dd>
            </div>
            <div className="flex flex-col gap-[2px]">
              <dt className="text-caption text-muted">Certificado vence em</dt>
              <dd className="m-0 text-label text-ink tabular-nums">{dia(c.certificado_ate)}</dd>
            </div>
            <div className="flex flex-col gap-[2px]">
              <dt className="text-caption text-muted">Testada no Inter em</dt>
              <dd className="m-0 text-label text-ink tabular-nums">{dia(c.testada_em ?? c.criado_em)}</dd>
            </div>
          </dl>
          {faltam !== null && faltam <= 30 && (
            <p className="m-0 text-label text-warning max-w-[80ch]">
              {faltam < 0
                ? "O certificado venceu: o Inter recusa toda cobrança nova. Gere outro no Internet Banking e conecte de novo."
                : `O certificado vence em ${faltam} dia(s). Gere outro no Internet Banking e conecte de novo antes disso.`}
            </p>
          )}
          <p className="m-0 text-caption text-muted max-w-[80ch]">
            O Client Secret, o certificado e a chave ficam guardados cifrados e não aparecem de novo. Para trocar, desconecte e conecte com a credencial nova.
          </p>
          {administra && (
            <div className="pt-3 border-t border-border-soft flex justify-end">
              <Button variant="ghost" onClick={() => void desconectar()} disabled={enviando}>Desconectar</Button>
            </div>
          )}
        </div>
      </Card>
    );
  }

  const travado = !!bloqueio || enviando;
  return (
    <Card>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-h3 font-semibold text-ink">Conectar a conta Inter</span>
          <span className="text-caption text-muted max-w-[80ch] leading-[1.5]">
            No Internet Banking do Inter (PJ), em Soluções para sua empresa › Nova integração, crie uma integração com o escopo de
            boletos e cobranças. Ela entrega o Client ID, o Client Secret e dois arquivos: o certificado (.crt) e a chave (.key).
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Select label="Ambiente" options={AMBIENTES} value={form.ambiente} onChange={campo("ambiente")} disabled={travado} />
          <Input label="Conta corrente (opcional)" inputMode="numeric" value={form.contaCorrente}
            onChange={(e) => campo("contaCorrente")(e.target.value)} disabled={travado}
            placeholder="Só se a integração tiver mais de uma conta" />
          <Input label="Client ID" value={form.clientId} onChange={(e) => campo("clientId")(e.target.value)} disabled={travado} autoComplete="off" />
          <Input label="Client Secret" type="password" value={form.clientSecret}
            onChange={(e) => campo("clientSecret")(e.target.value)} disabled={travado} autoComplete="new-password" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(["certificado", "chave"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-2">
              <Textarea
                label={k === "certificado" ? "Certificado (.crt)" : "Chave (.key)"}
                rows={4}
                value={form[k]}
                onChange={(e) => campo(k)(e.target.value)}
                disabled={travado}
                spellCheck={false}
                placeholder={k === "certificado" ? "-----BEGIN CERTIFICATE-----" : "-----BEGIN PRIVATE KEY-----"}
                className="font-mono text-caption"
              />
              <label className={`self-start text-label ${travado ? "text-faint" : "text-ink cursor-pointer hover:underline"}`}>
                Escolher arquivo {k === "certificado" ? ".crt" : ".key"}
                <input type="file" accept={k === "certificado" ? ".crt,.pem,.cer" : ".key,.pem"} className="sr-only"
                  onChange={arquivo(k)} disabled={travado} />
              </label>
            </div>
          ))}
        </div>
        <div className="pt-3 border-t border-border-soft flex items-center justify-between gap-3 flex-wrap">
          <span className="text-caption text-muted max-w-[60ch]">
            {bloqueio ?? "Antes de guardar, o sistema pede um acesso ao Inter com esta credencial. Se o Inter recusar, nada é guardado."}
          </span>
          <Button onClick={() => void conectar()} disabled={travado}>
            {enviando ? "Testando no Inter…" : "Testar e conectar"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
