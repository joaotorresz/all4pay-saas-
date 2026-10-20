"use client";

/**
 * O MICROFONE do chat: transcreve a fala em português pelo reconhecimento de
 * voz do próprio navegador (Web Speech API) — sem enviar áudio a servidor
 * nenhum. O texto aparece AO VIVO enquanto a pessoa fala, e a gravação segue
 * até ela tocar em Concluir (vai para a conversa como se tivesse sido digitado)
 * ou em Cancelar (descarta).
 *
 * ⚠️ A primeira versão parava na primeira pausa (`continuous = false`), o
 * único sinal de gravação era o botão piscando e, num navegador sem
 * reconhecimento, o botão simplesmente sumia: quem tocava não via nada
 * acontecer e concluía que o microfone não funcionava. Agora:
 *  - a gravação é CONTÍNUA e só termina por ato da pessoa (ou silêncio longo);
 *  - o nível do microfone vem de `getUserMedia` e desenha a ONDA (`stream`),
 *    que é a prova visível de que o áudio está entrando;
 *  - sem reconhecimento no navegador, o toque EXPLICA em vez de sumir.
 *
 * O reconhecimento começa no MESMO toque (sem `await` antes do `start`): o
 * Safari exige o gesto da pessoa, e esperar a permissão do microfone antes
 * o perderia. A onda é a segunda metade: se o nível não puder ser lido, a
 * transcrição continua e a onda anda sozinha.
 */
import * as React from "react";

interface Reconhecedor {
  lang: string; interimResults: boolean; continuous: boolean;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}

function construtor(): (new () => Reconhecedor) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MOTIVO: Record<string, string> = {
  "not-allowed": "O navegador não deu acesso ao microfone. Libere nas permissões do site e tente de novo.",
  "service-not-allowed": "Este navegador bloqueou o reconhecimento de voz. Use o Chrome, o Edge ou o Safari.",
  "no-speech": "Não ouvi nada. Toque no microfone e fale de novo.",
  "audio-capture": "Nenhum microfone encontrado neste aparelho.",
  network: "O reconhecimento de voz precisa de internet. Confira a conexão.",
};

export const SEM_RECONHECIMENTO = "Este navegador não transcreve voz. Use o Chrome, o Edge ou o Safari.";

export function useFala({ onParcial, onFinal }: { onParcial: (t: string) => void; onFinal: (t: string) => void }) {
  const [ouvindo, setOuvindo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [stream, setStream] = React.useState<MediaStream | null>(null);
  const [inicio, setInicio] = React.useState<number | null>(null);
  const rec = React.useRef<Reconhecedor | null>(null);
  const cancelado = React.useRef(false);
  const streamRef = React.useRef<MediaStream | null>(null);
  const cb = React.useRef({ onParcial, onFinal });
  cb.current = { onParcial, onFinal };

  const soltarMicrofone = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  React.useEffect(() => () => { cancelado.current = true; rec.current?.abort(); streamRef.current?.getTracks().forEach((t) => t.stop()); }, []);

  /** Termina e envia o que foi dito. */
  const parar = React.useCallback(() => rec.current?.stop(), []);

  /** Termina e descarta. */
  const cancelar = React.useCallback(() => {
    cancelado.current = true;
    rec.current?.abort();
    cb.current.onParcial("");
  }, []);

  const ouvir = React.useCallback(() => {
    const C = construtor();
    if (!C) { setErro(SEM_RECONHECIMENTO); return; }
    if (rec.current) return;
    const r = new C();
    r.lang = "pt-BR";
    r.interimResults = true;
    r.continuous = true;
    cancelado.current = false;
    let final = "";
    let parcial = "";
    r.onresult = (e) => {
      parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += `${res[0].transcript} `; else parcial += res[0].transcript;
      }
      cb.current.onParcial(`${final}${parcial}`.replace(/\s+/g, " ").trim());
    };
    r.onerror = (e) => { if (e.error !== "aborted") setErro(MOTIVO[e.error] ?? "Não consegui ouvir. Tente de novo ou digite."); };
    r.onend = () => {
      rec.current = null;
      setOuvindo(false);
      setInicio(null);
      soltarMicrofone();
      if (cancelado.current) return;
      // O que ainda era parcial quando a pessoa tocou em Concluir também foi dito.
      const dito = `${final}${parcial}`.replace(/\s+/g, " ").trim();
      if (dito) cb.current.onFinal(dito);
    };
    setErro(null);
    rec.current = r;
    try {
      r.start();
    } catch {
      rec.current = null;
      setErro("Não consegui abrir o microfone.");
      return;
    }
    setOuvindo(true);
    setInicio(Date.now());
    cb.current.onParcial("");
    // O nível do microfone, para a onda. Falhar aqui não derruba a transcrição.
    navigator.mediaDevices?.getUserMedia?.({ audio: true })
      .then((s) => {
        if (!rec.current) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        setStream(s);
      })
      .catch(() => {});
  }, [soltarMicrofone]);

  return { ouvindo, erro, stream, inicio, ouvir, parar, cancelar };
}
