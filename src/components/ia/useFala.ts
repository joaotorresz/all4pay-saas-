"use client";

/**
 * O MICROFONE do chat: transcreve a fala em português pelo reconhecimento de
 * voz do próprio navegador (Web Speech API) — sem enviar áudio a servidor
 * nenhum. O texto aparece no campo enquanto a pessoa fala e, no fim da frase,
 * vai para a conversa como se tivesse sido digitado ("Gastei R$ 100 de
 * gasolina" vira a proposta de lançamento, que só grava no "Confirmar").
 *
 * Navegador sem reconhecimento (Firefox, por exemplo): `suportado` é falso e o
 * botão não aparece — um microfone que não escuta é pior que nenhum.
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
  "service-not-allowed": "O navegador não deu acesso ao microfone. Libere nas permissões do site e tente de novo.",
  "no-speech": "Não ouvi nada. Toque no microfone e fale de novo.",
  "audio-capture": "Nenhum microfone encontrado neste aparelho.",
  network: "O reconhecimento de voz precisa de internet. Confira a conexão.",
};

export function useFala({ onParcial, onFinal }: { onParcial: (t: string) => void; onFinal: (t: string) => void }) {
  const [suportado, setSuportado] = React.useState(false);
  const [ouvindo, setOuvindo] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const rec = React.useRef<Reconhecedor | null>(null);
  const cb = React.useRef({ onParcial, onFinal });
  cb.current = { onParcial, onFinal };

  // Lido depois de montar: no servidor não há `window`, e decidir no render
  // quebraria a hidratação.
  React.useEffect(() => { setSuportado(construtor() !== null); return () => rec.current?.abort(); }, []);

  const parar = React.useCallback(() => rec.current?.stop(), []);

  const ouvir = React.useCallback(() => {
    const C = construtor();
    if (!C || rec.current) return;
    const r = new C();
    r.lang = "pt-BR";
    r.interimResults = true;
    r.continuous = false;
    let final = "";
    r.onresult = (e) => {
      let parcial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) final += res[0].transcript; else parcial += res[0].transcript;
      }
      cb.current.onParcial((final + parcial).trim());
    };
    r.onerror = (e) => { if (e.error !== "aborted") setErro(MOTIVO[e.error] ?? "Não consegui ouvir. Tente de novo ou digite."); };
    r.onend = () => {
      rec.current = null;
      setOuvindo(false);
      if (final.trim()) cb.current.onFinal(final.trim());
    };
    setErro(null);
    rec.current = r;
    setOuvindo(true);
    try { r.start(); } catch { rec.current = null; setOuvindo(false); setErro("Não consegui abrir o microfone."); }
  }, []);

  return { suportado, ouvindo, erro, ouvir, parar };
}
