"use client";

import * as React from "react";
import { AcaoDestrutiva, Button, CampoCodigo, Card, Icon, StatusBadge } from "@/components/ui";
import { copiarTexto } from "@/components/ia/chat-kit";
import {
  cancelarCadastroDoFator, confirmarCadastroDoFator, fatoresDaConta, iniciarCadastroDoFator, removerFator,
} from "@/lib/entrada";
import { gerarQR, qrParaSVG } from "@/lib/qrcode";
import { dataBR } from "@/lib/format";
import { MARCA } from "@/core/marca";
import { DIGITOS_CODIGO, ROTA_CODIGO, blocosDaChave, codigoCompleto, type FatorDaConta } from "@/core/segundo-fator";

const configured = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

type Msg = { tone: "error" | "ok"; text: string } | null;
type Cadastro = { factorId: string; uri: string; chave: string };

/**
 * SEGURANÇA DA CONTA — cadastrar, ver e remover o aplicativo autenticador.
 *
 * ⚠️ **A chave aparece UMA vez**, só durante o cadastro: não vai para a lista,
 * para log, para o armazenamento do navegador nem para atributo de
 * acessibilidade (o exemplo da documentação do Supabase põe o endereço com a
 * chave no `alt` da imagem — não copiar).
 *
 * ⚠️ **O QR sai de `lib/qrcode`, nas cores da paleta**, e não do SVG que o
 * Supabase devolve (preto puro, fora do sistema, invisível para a guarda da
 * paleta). Endereço longo demais para o QR cai na chave manual, nunca no SVG
 * de fora.
 *
 * ⚠️ **Em demonstração não há conta**: a tela explica e não chama a rede (o
 * cliente sem endereço lança).
 */
export function SegurancaContaView() {
  const [fatores, setFatores] = React.useState<FatorDaConta[] | null>(null);
  const [erroLista, setErroLista] = React.useState<string | null>(null);
  const [cadastro, setCadastro] = React.useState<Cadastro | null>(null);
  const [codigo, setCodigo] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<Msg>(null);
  const [copiada, setCopiada] = React.useState<boolean | null>(null);
  const [pedeCodigo, setPedeCodigo] = React.useState(false);
  // Ao fechar o painel do cadastro (confirmado ou cancelado), o foco volta ao
  // título da conta — senão cai no BODY junto com o painel que desmontou.
  const tituloConta = React.useRef<HTMLSpanElement>(null);
  const voltarFoco = () => requestAnimationFrame(() => tituloConta.current?.focus());

  // ⚠️ Lista que não veio fica AUSENTE (`null`), nunca vazia: vazia mostraria
  // "Desligado" e o convite para cadastrar a quem já tem aplicativo, e o
  // clique criaria um segundo aparelho que a pessoa acha que é o primeiro.
  const carregar = React.useCallback(async () => {
    const r = await fatoresDaConta();
    if (r.ok) { setFatores(r.fatores); setErroLista(null); }
    else { setFatores(null); setErroLista(r.comoResolver ? `${r.motivo} ${r.comoResolver}` : r.motivo); }
  }, []);

  React.useEffect(() => { if (configured) void carregar(); }, [carregar]);

  const verificados = (fatores ?? []).filter((f) => f.verificado);
  // O aparelho que está sendo cadastrado AGORA não entra na lista: ali ele
  // apareceria como "Não confirmado" com um "Descartar" ao lado do próprio
  // QR que a pessoa está lendo. Pendente é só o cadastro abandonado de antes.
  const pendentes = (fatores ?? []).filter((f) => !f.verificado && f.id !== cadastro?.factorId);
  const ativo = verificados.length > 0;

  async function comecar() {
    if (busy) return;
    setBusy(true); setMsg(null); setCopiada(null); setCodigo("");
    const r = await iniciarCadastroDoFator();
    setBusy(false);
    if (!r.ok) { setMsg({ tone: "error", text: r.comoResolver ? `${r.motivo} ${r.comoResolver}` : r.motivo }); return; }
    setCadastro({ factorId: r.factorId, uri: r.uri, chave: r.chave });
    void carregar();
  }

  async function confirmar() {
    if (!cadastro || busy) return;
    if (!codigoCompleto(codigo)) { setMsg({ tone: "error", text: `Digite os ${DIGITOS_CODIGO} números que aparecem no aplicativo.` }); return; }
    setBusy(true); setMsg(null);
    const r = await confirmarCadastroDoFator(cadastro.factorId, codigo);
    setBusy(false);
    if (!r.ok) {
      setCodigo("");
      setMsg({ tone: "error", text: "comoResolver" in r && r.comoResolver ? `${r.motivo} ${r.comoResolver}` : r.motivo });
      return;
    }
    setCadastro(null); setCodigo("");
    setMsg({ tone: "ok", text: `Aplicativo autenticador ativado. A partir da próxima entrada, a ${MARCA} pede o código depois da senha.` });
    voltarFoco();
    await carregar();
  }

  async function cancelar() {
    if (!cadastro) return;
    const id = cadastro.factorId;
    setCadastro(null); setCodigo(""); setMsg(null);
    voltarFoco();
    await cancelarCadastroDoFator(id);
    await carregar();
  }

  async function descartar(id: string) {
    await cancelarCadastroDoFator(id);
    await carregar();
  }

  async function remover(f: FatorDaConta) {
    const r = await removerFator(f.id);
    if (!r.ok) {
      setMsg({ tone: "error", text: r.comoResolver ? `${r.motivo} ${r.comoResolver}` : r.motivo });
    } else if (r.pedeCodigo) {
      // Esta sessão tinha entrado com o aparelho removido: sem o código de
      // outro, nada mais abre. Dito agora, e não no meio do próximo trabalho.
      setPedeCodigo(true);
      setMsg({ tone: "ok", text: `${f.nome} removido. Esta sessão tinha entrado com ele: digite agora o código de outro aparelho cadastrado.` });
    } else {
      setMsg({ tone: "ok", text: `${f.nome} removido.` });
    }
    await carregar();
  }

  if (!configured) {
    return (
      <Card className="flex flex-col gap-2">
        <span className="text-h3 font-medium text-ink">Segundo fator</span>
        <p className="m-0 text-label text-muted max-w-[72ch]">
          No modo demonstração não há conta para proteger. Na conta de verdade, esta tela cadastra o aplicativo
          autenticador do seu celular: depois da senha, a {MARCA} passa a pedir o código de {DIGITOS_CODIGO} dígitos que
          ele mostra para abrir o sistema.
        </p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-[860px]">
      <Card
        className="flex flex-col gap-4"
        info={{
          titulo: "Segundo fator",
          oQue: `Uma segunda prova de que é você: além da senha, a ${MARCA} pede o código que o aplicativo autenticador do seu celular mostra para abrir o sistema, trocar a senha ou remover o aplicativo. Ele soma à senha, não a substitui: se desconfiar que ela vazou, troque-a.`,
          comoCalcula: "O código muda a cada 30 segundos e é calculado pelo aplicativo a partir de uma chave que só ele e a sua conta conhecem. Cadastrar dois aparelhos vale como reserva: o código de qualquer um deles serve.",
        }}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span ref={tituloConta} tabIndex={-1} className="text-h3 font-medium text-ink outline-none">Aplicativo autenticador</span>
          {fatores === null ? null : ativo
            ? <StatusBadge tone="positive">Ativo</StatusBadge>
            : <StatusBadge tone="warning">Desligado</StatusBadge>}
        </div>
        {fatores !== null && (
        <p className="m-0 text-label text-muted max-w-[72ch]">
          {ativo
            ? "A cada entrada, depois da senha, a conta pede o código do aplicativo. Cadastre um segundo aparelho como reserva: sem o celular, só o suporte consegue retirar o segundo fator."
            : `Proteja a conta com o código do aplicativo autenticador do celular (Google Authenticator, Microsoft Authenticator, 1Password ou outro). Depois de ativado, a ${MARCA} pede o código a cada entrada.`}
        </p>
        )}

        {erroLista && (
          <div className="flex items-center gap-3 flex-wrap">
            <p role="alert" className="m-0 text-caption text-negative">{erroLista}</p>
            <Button variant="secondary" onClick={() => { setErroLista(null); void carregar(); }}>Tentar de novo</Button>
          </div>
        )}

        {verificados.length + pendentes.length > 0 && (
          <ul className="m-0 p-0 list-none flex flex-col">
            {[...verificados, ...pendentes].map((f, i) => (
              <li key={f.id} className={`flex items-center justify-between gap-3 py-3 ${i > 0 ? "border-t border-border-soft" : ""}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <Icon name="smartphone" size={16} color="var(--color-text-secondary)" />
                  <div className="min-w-0">
                    <div className="text-label font-medium text-ink truncate">{f.nome}</div>
                    <span className="a4p-label text-muted">Cadastrado em {dataBR(f.criadoEm)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {f.verificado
                    ? <StatusBadge tone="positive">Ativo</StatusBadge>
                    : <StatusBadge tone="warning">Não confirmado</StatusBadge>}
                  {f.verificado ? (
                    <AcaoDestrutiva
                      rotulo="Remover"
                      titulo="Remover este aparelho?"
                      descricao={verificados.length > 1
                        ? `“${f.nome}” deixa de gerar códigos aceitos. O outro aparelho cadastrado continua valendo na entrada — e, se você entrou hoje com o código deste, a conta pede em seguida o código do outro.`
                        : `“${f.nome}” sai, e a conta volta a entrar só com a senha. Para quem administra a plataforma, a área administrativa passa a recusar o acesso quando o prazo do segundo fator vencer.`}
                      confirmarRotulo="Remover"
                      desfaz={false}
                      onConfirmar={() => remover(f)}
                    />
                  ) : (
                    <button type="button" className="text-caption font-medium text-muted hover:text-ink underline"
                      onClick={() => descartar(f.id)}>
                      Descartar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {pedeCodigo && (
          <div>
            <Button variant="primary" onClick={() => window.location.assign(ROTA_CODIGO)} leftIcon={<Icon name="shield-check" size={15} />}>
              Digitar o código de outro aparelho
            </Button>
          </div>
        )}

        {!cadastro && !pedeCodigo && fatores !== null && (
          <div>
            <Button variant={ativo ? "secondary" : "primary"} disabled={busy || fatores === null} aria-busy={busy} onClick={comecar}
              leftIcon={<Icon name={ativo ? "plus" : "shield-check"} size={15} />}>
              {ativo ? "Adicionar outro aparelho" : "Cadastrar aplicativo autenticador"}
            </Button>
          </div>
        )}

        {msg && !cadastro && (
          <p role={msg.tone === "error" ? "alert" : "status"} className={`m-0 text-caption ${msg.tone === "error" ? "text-negative" : "text-positive"}`}>
            {msg.text}
          </p>
        )}
      </Card>

      {cadastro && (
        <PainelCadastro
          cadastro={cadastro}
          codigo={codigo}
          setCodigo={setCodigo}
          busy={busy}
          msg={msg}
          copiada={copiada}
          aoCopiar={async () => setCopiada(await copiarTexto(cadastro.chave))}
          aoConfirmar={confirmar}
          aoCancelar={cancelar}
        />
      )}
    </div>
  );
}

function PainelCadastro({
  cadastro, codigo, setCodigo, busy, msg, copiada, aoCopiar, aoConfirmar, aoCancelar,
}: {
  cadastro: Cadastro;
  codigo: string;
  setCodigo: (c: string) => void;
  busy: boolean;
  msg: Msg;
  copiada: boolean | null;
  aoCopiar: () => void;
  aoConfirmar: () => void;
  aoCancelar: () => void;
}) {
  // O QR é desenhado aqui, nas cores da paleta. Endereço longo demais para o
  // QR (e-mail muito comprido) devolve vazio, e a tela fica com a chave manual.
  const svg = React.useMemo(() => {
    try {
      const qr = gerarQR(cadastro.uri);
      return qrParaSVG(qr, (qr.tamanho + 8) * 4, undefined, "Código QR para cadastrar o aplicativo autenticador");
    } catch {
      return "";
    }
  }, [cadastro.uri]);

  // O botão que abriu o painel some da árvore; sem levar o foco ao passo 1,
  // ele cai no BODY e quem usa teclado ou leitor de tela não sabe onde está.
  const titulo = React.useRef<HTMLSpanElement>(null);
  React.useEffect(() => { titulo.current?.focus(); }, []);

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="a4p-label text-muted">Passo 1 de 2</span>
        <span ref={titulo} tabIndex={-1} className="text-h3 font-medium text-ink outline-none">Adicione a conta no aplicativo</span>
        <p className="m-0 text-label text-muted max-w-[72ch]">
          No computador, leia o código QR com o aplicativo autenticador do celular. No próprio celular, toque em
          “Abrir no aplicativo autenticador” ou digite a chave.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-5 sm:items-start">
        {/* No telefone o link vem primeiro: o QR não se lê com o próprio aparelho. */}
        {svg ? (
          <div className="order-last sm:order-none rounded-card bg-white p-2 self-start" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <p className="order-last sm:order-none m-0 text-caption text-faint max-w-[36ch]">
            O endereço desta conta é longo demais para caber num código QR. Use a chave ao lado.
          </p>
        )}
        <div className="flex flex-col gap-2 min-w-0">
          <a href={cadastro.uri} className="text-label font-medium text-ink underline">Abrir no aplicativo autenticador</a>
          <span className="text-caption text-muted">Ou digite esta chave no aplicativo:</span>
          <div className="rounded-md bg-surface-2 px-3 py-2 font-mono text-label text-ink break-all">
            {blocosDaChave(cadastro.chave)}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={aoCopiar} leftIcon={<Icon name="layers" size={15} />}>Copiar chave</Button>
            {copiada === true && <span role="status" className="text-caption text-muted">Chave copiada.</span>}
            {copiada === false && <span role="status" className="text-caption text-muted">Não foi possível copiar; selecione e copie a chave.</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 max-w-[380px]">
        <div className="flex flex-col gap-1">
          <span className="a4p-label text-muted">Passo 2 de 2</span>
          <span className="text-h3 font-medium text-ink">Confirme com o primeiro código</span>
          <p className="m-0 text-caption text-faint">
            Ao confirmar, as outras sessões abertas da sua conta são encerradas.
          </p>
        </div>
        <CampoCodigo valor={codigo} onMudar={setCodigo} onConfirmar={aoConfirmar} disabled={busy} invalido={msg?.tone === "error"} />
        {msg && (
          <p role={msg.tone === "error" ? "alert" : "status"} className={`m-0 text-caption ${msg.tone === "error" ? "text-negative" : "text-positive"}`}>
            {msg.text}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled={busy} aria-busy={busy} onClick={aoConfirmar}>Confirmar código</Button>
          <Button variant="secondary" disabled={busy} onClick={aoCancelar}>Cancelar</Button>
        </div>
      </div>
    </Card>
  );
}
