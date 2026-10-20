"use client";

/**
 * A ONDA da gravação de voz: barras que andam da direita para a esquerda com o
 * nível do microfone, como no chat do Claude. É a prova visível de que o áudio
 * está entrando — sem ela, quem fala não sabe se está sendo ouvido.
 *
 * Com o `stream` do microfone, a altura de cada barra é o volume (RMS) daquele
 * instante. Sem ele (a permissão de nível falhou, mas a transcrição segue), a
 * onda anda sozinha num ritmo calmo. As alturas são escritas direto no estilo
 * das barras, fora do React: 30 renderizações por segundo seriam o chat
 * inteiro piscando. Com movimento reduzido, a onda fica parada.
 */
import * as React from "react";

const BARRAS = 110;
const MIN = 3;
const MAX = 22;

export function OndaDeVoz({ stream }: { stream: MediaStream | null }) {
  const barrasRef = React.useRef<HTMLSpanElement[]>([]);

  React.useEffect(() => {
    const parado = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const niveis: number[] = Array(BARRAS).fill(0);
    const pintar = () => niveis.forEach((n, i) => {
      const b = barrasRef.current[i];
      if (b) b.style.height = `${MIN + n * (MAX - MIN)}px`;
    });
    if (parado) { niveis.fill(0.25); pintar(); return; }

    let ctx: AudioContext | null = null;
    let analisador: AnalyserNode | null = null;
    let amostras: Uint8Array<ArrayBuffer> | null = null;
    if (stream) {
      try {
        ctx = new AudioContext();
        analisador = ctx.createAnalyser();
        analisador.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(analisador);
        amostras = new Uint8Array(new ArrayBuffer(analisador.fftSize));
        // Criado fora do toque, o contexto pode nascer suspenso e ler silêncio.
        if (ctx.state === "suspended") void ctx.resume();
      } catch { ctx = null; analisador = null; }
    }

    let quadro = 0;
    let ultimo = 0;
    let t = 0;
    const passo = (agora: number) => {
      quadro = requestAnimationFrame(passo);
      if (agora - ultimo < 45) return; // ~22 barras novas por segundo
      ultimo = agora;
      let nivel: number;
      if (analisador && amostras) {
        analisador.getByteTimeDomainData(amostras);
        let soma = 0;
        for (let i = 0; i < amostras.length; i++) { const d = (amostras[i] - 128) / 128; soma += d * d; }
        nivel = Math.min(1, Math.sqrt(soma / amostras.length) * 4.5);
      } else {
        t += 1;
        nivel = 0.25 + 0.2 * Math.sin(t / 3) * Math.sin(t / 7);
      }
      niveis.shift();
      niveis.push(nivel);
      pintar();
    };
    quadro = requestAnimationFrame(passo);
    return () => { cancelAnimationFrame(quadro); void ctx?.close(); };
  }, [stream]);

  return (
    <div aria-hidden className="flex-1 min-w-0 h-6 flex items-center justify-end gap-[2px] overflow-hidden">
      {Array.from({ length: BARRAS }, (_, i) => (
        <span
          key={i}
          ref={(el) => { if (el) barrasRef.current[i] = el; }}
          className="flex-none w-[3px] rounded-pill bg-ink"
          style={{ height: MIN, transition: "height 80ms linear" }}
        />
      ))}
    </div>
  );
}

/** "0:07" — quanto tempo a gravação já tem. */
export function TempoDeGravacao({ inicio }: { inicio: number | null }) {
  const [agora, setAgora] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (inicio === null) return;
    const id = window.setInterval(() => setAgora(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [inicio]);
  const s = inicio === null ? 0 : Math.max(0, Math.floor((agora - inicio) / 1000));
  return <span className="flex-none tabular-nums text-[13px] text-muted">{Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}</span>;
}
