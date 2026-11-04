"use client";

/**
 * "VAMOS COMPLETAR SEU CADASTRO" na conversa (Fase 4.2, 04/11/2026).
 *
 * A Quattro AI pergunta, uma coisa por vez, o que a abertura de conta deixou
 * para depois (`PARA_COMPLETAR_DEPOIS`). O roteiro e a regra de cada resposta
 * moram em `core/cadastro/completar`: esta tela só pergunta, mostra e grava.
 *
 *   - cada resposta vai ao perfil da empresa pelo escritor dele
 *     (`persistCompany`, o mesmo que Configurações usa);
 *   - "Pular esta" tira a pergunta da conversa sem gravar resposta;
 *   - o que tem escritor próprio (alçada, equipe) a conversa não grava: ela
 *     termina indicando a tela.
 *
 * ⚠️ Quando a gravação falha, a mensagem real aparece e a pergunta fica.
 */
import * as React from "react";
import Link from "next/link";
import { Icon } from "@/components/ui";
import { fetchCompany, loadCompany, persistCompany, type StoredCompany } from "@/lib/company";
import {
  NAO_TENHO, RespostaInvalida, perguntasPendentes, proximaPergunta, pular, responder, telasDoRoteiro,
  type PassoPergunta, type PerfilParaCompletar, type Resposta,
} from "@/core/cadastro/completar";
import { DigitandoIA, TextoRevelado } from "./conversa";

interface TurnoCompletar { id: string; pergunta: string; resposta: string }

const comoTexto = (r: Resposta) =>
  Array.isArray(r) ? r.join(", ") : typeof r === "boolean" ? (r ? "Sim" : "Não") : String(r);

export function ConversaCompletar({ nome, campoRef, aoFechar }: {
  nome: string | null;
  campoRef: React.RefObject<HTMLInputElement>;
  aoFechar: () => void;
}) {
  const [perfil, setPerfil] = React.useState<PerfilParaCompletar | null>(null);
  const [turnos, setTurnos] = React.useState<TurnoCompletar[]>([]);
  const [marcadas, setMarcadas] = React.useState<string[]>([]);
  const [texto, setTexto] = React.useState("");
  const [gravando, setGravando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [erroLeitura, setErroLeitura] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);
  const fimRef = React.useRef<HTMLDivElement>(null);

  // O perfil do servidor manda (outra pessoa pode ter respondido em outra
  // máquina). ⚠️ E a conversa só pergunta DEPOIS de lê-lo: `persistCompany`
  // grava o perfil inteiro, e gravar por cima de uma leitura que falhou
  // apagaria o resto do cadastro.
  React.useEffect(() => {
    let vivo = true;
    fetchCompany().then((c) => {
      if (!vivo) return;
      const base = (c ?? loadCompany() ?? {}) as PerfilParaCompletar;
      setPerfil(base);
      setTotal(perguntasPendentes(base).length);
    }).catch((e) => {
      if (vivo) setErroLeitura(`Não consegui abrir o seu cadastro: ${e instanceof Error ? e.message : String(e)}`);
    });
    return () => { vivo = false; };
  }, []);

  const atual = perfil ? proximaPergunta(perfil) : null;
  React.useEffect(() => { setMarcadas([]); setTexto(""); setErro(null); }, [atual?.id]);
  React.useEffect(() => { fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turnos, atual?.id]);

  const gravar = async (passo: PassoPergunta, novo: PerfilParaCompletar, mostrada: string) => {
    setGravando(true);
    setErro(null);
    try {
      await persistCompany(novo as StoredCompany);
      setPerfil(novo);
      setTurnos((ts) => [...ts, { id: passo.id, pergunta: passo.pergunta, resposta: mostrada }]);
    } catch (e) {
      setErro(`Não consegui salvar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGravando(false);
    }
  };

  const responderCom = (r: Resposta) => {
    if (!perfil || !atual || gravando) return;
    let novo: PerfilParaCompletar;
    try {
      novo = responder(perfil, atual.id, r);
    } catch (e) {
      if (e instanceof RespostaInvalida) { setErro(e.message); return; }
      throw e;
    }
    void gravar(atual, novo, comoTexto(r));
  };
  const pularEsta = () => {
    if (!perfil || !atual || gravando) return;
    void gravar(atual, pular(perfil, atual.id), "Pulei esta");
  };

  const restantes = perfil ? perguntasPendentes(perfil).length : 0;
  const telas = telasDoRoteiro(perfil);
  const campoAberto = !!atual && (atual.tipo === "texto" || atual.tipo === "moeda");

  return (
    <>
      <div className="relative flex-1 min-h-0 overflow-y-auto" tabIndex={-1}>
        <div className="mx-auto w-full max-w-[720px] px-5 pt-10 pb-10 flex flex-col gap-8" data-completar="conversa">
          <div className="a4p-entra flex flex-col gap-2 pt-6" data-ia="saudacao">
            <h2 className="m-0 text-[28px] text-ink">{nome ? `Oi, ${nome}! Vamos completar seu cadastro.` : "Oi! Vamos completar seu cadastro."}</h2>
            <p className="m-0 text-[15px] text-muted">
              {total > 0
                ? <>São <b className="text-ink tabular-nums">{total}</b> {total === 1 ? "pergunta rápida" : "perguntas rápidas"}. Pode pular qualquer uma e voltar depois.</>
                : "Uma pergunta por vez. Pode pular qualquer uma e voltar depois."}
            </p>
          </div>

          {turnos.map((t) => (
            <React.Fragment key={t.id}>
              <p className="m-0 self-start max-w-[90%] text-[16px] text-ink">{t.pergunta}</p>
              <div data-ia="pergunta" className="a4p-bolha-usuario self-end max-w-[80%] px-5 py-3 rounded-[24px] text-[15px]">{t.resposta}</div>
            </React.Fragment>
          ))}

          {erroLeitura ? (
            <p role="alert" className="m-0 text-[15px] text-negative" data-completar="erro-leitura">{erroLeitura}. Tente de novo daqui a pouco.</p>
          ) : !perfil ? (
            <DigitandoIA rotulo="Abrindo o seu cadastro" className="self-start" />
          ) : atual ? (
            <div className="a4p-entra self-start flex flex-col gap-4 w-full" data-completar-pergunta={atual.id}>
              <p className="m-0 text-[18px] text-ink"><TextoRevelado texto={atual.pergunta} /></p>
              <Opcoes passo={atual} marcadas={marcadas} setMarcadas={setMarcadas} gravando={gravando} responder={responderCom} />
              {erro && <p role="alert" className="m-0 text-[14px] text-negative">{erro}</p>}
              <div className="flex flex-wrap items-center gap-3">
                {atual.tipo === "multi" && (
                  <button
                    type="button"
                    onClick={() => responderCom(marcadas)}
                    disabled={gravando || !marcadas.length}
                    data-completar="confirmar"
                    className="inline-flex items-center h-12 px-5 rounded-pill text-[15px] disabled:opacity-50"
                    style={{ background: "var(--color-ink)", color: "var(--color-surface-1)" }}
                  >
                    Confirmar
                  </button>
                )}
                {atual.atalho && (
                  <button type="button" onClick={() => responderCom(atual.tipo === "multi" ? [atual.atalho!] : atual.atalho!)} disabled={gravando} className="inline-flex items-center h-12 px-5 rounded-pill text-[15px] a4p-pilula disabled:opacity-50">
                    {atual.atalho}
                  </button>
                )}
                <button type="button" onClick={pularEsta} disabled={gravando} data-completar="pular" className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] text-muted disabled:opacity-50">
                  Pular esta
                </button>
                <span className="ml-auto text-[13px] text-muted">Faltam <span className="tabular-nums">{restantes}</span></span>
              </div>
            </div>
          ) : (
            <div className="a4p-entra self-start flex flex-col gap-4" data-completar="fim">
              <p className="m-0 text-[18px] text-ink">
                <TextoRevelado texto={turnos.length ? "Pronto, o cadastro está completo. Tudo o que você respondeu já está nas Configurações." : "O seu cadastro já está completo."} />
              </p>
              {telas.length > 0 && (
                <>
                  <p className="m-0 text-[15px] text-muted">Duas coisas têm tela própria, porque mexem em quem pode o quê:</p>
                  <div className="flex flex-wrap gap-3">
                    {telas.map((t) => (
                      <Link key={t.id} href={t.rota} onClick={aoFechar} data-completar-tela={t.id} title={t.pergunta} className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] a4p-pilula">
                        <Icon name="arrow-up-right" size={16} strokeWidth={1.5} />
                        {t.rotuloRota}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          <div ref={fimRef} />
        </div>
      </div>
      <form
        onSubmit={(e) => { e.preventDefault(); if (campoAberto) responderCom(texto); }}
        className="flex-none mx-auto mb-2 w-[calc(100%-40px)] max-w-[720px] h-14 flex items-center gap-3 px-[10px] rounded-[28px]"
        style={{ background: "var(--color-white)" }}
      >
        <input
          ref={campoRef}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          disabled={!campoAberto || gravando}
          inputMode={atual?.tipo === "moeda" ? "decimal" : undefined}
          placeholder={campoAberto ? (atual?.tipo === "moeda" ? "R$ 0,00" : "Escreva a resposta") : "Escolha uma opção acima"}
          aria-label={atual?.pergunta ?? "Resposta"}
          className="a4p-ia-campo flex-1 min-w-0 pl-3 bg-transparent outline-none text-[15px] text-ink placeholder:text-muted"
        />
        <button
          type="submit"
          aria-label="Enviar resposta"
          disabled={!campoAberto || gravando}
          className="w-9 h-9 flex-none rounded-pill flex items-center justify-center disabled:opacity-50"
          style={{ background: "var(--erp-num-cor)", color: "var(--color-surface-1)" }}
        >
          <Icon name="arrow-up" size={18} strokeWidth={1.5} />
        </button>
      </form>
    </>
  );
}

function Opcoes({ passo, marcadas, setMarcadas, gravando, responder }: {
  passo: PassoPergunta;
  marcadas: string[];
  setMarcadas: React.Dispatch<React.SetStateAction<string[]>>;
  gravando: boolean;
  responder: (r: Resposta) => void;
}) {
  const opcoes = passo.tipo === "sim-nao" ? ["Sim", "Não"] : (passo.opcoes ?? []).filter((o) => o !== NAO_TENHO);
  if (!opcoes.length) return null;
  return (
    <div className="flex flex-wrap gap-3" role={passo.tipo === "multi" ? "group" : undefined} aria-label={passo.pergunta}>
      {opcoes.map((o) => {
        const ligada = marcadas.includes(o);
        return (
          <button
            key={o}
            type="button"
            disabled={gravando}
            aria-pressed={passo.tipo === "multi" ? ligada : undefined}
            data-completar-opcao={o}
            onClick={() => passo.tipo === "multi"
              ? setMarcadas((m) => (m.includes(o) ? m.filter((x) => x !== o) : [...m, o]))
              : responder(passo.tipo === "sim-nao" ? o === "Sim" : o)}
            className="inline-flex items-center gap-2 h-12 px-5 rounded-pill text-[15px] a4p-pilula disabled:opacity-50"
            style={ligada ? { background: "var(--color-ink)", color: "var(--color-surface-1)" } : undefined}
          >
            {passo.tipo === "multi" && <Icon name={ligada ? "check" : "plus"} size={15} strokeWidth={1.5} />}
            {o}
          </button>
        );
      })}
    </div>
  );
}
