import Image from "next/image";

/**
 * O MOCKUP 3D da maquininha Quattro (pedido do dono, 28/10/2026): onde o
 * sistema fala da maquininha, ela aparece como É, no lugar do círculo com o
 * ícone de celular. Um arquivo só (`public/maquininha-quattro-icone.webp`:
 * o ícone 3D que o dono enviou, sem o fundo preto, 616×1080) e um componente
 * só: a proporção mora aqui, e a tela escolhe só a ALTURA.
 */
const LARGURA = 616;
const ALTURA = 1080;

export function MaquininhaMockup({ altura, className, decorativa = false }: { altura: number; className?: string; decorativa?: boolean }) {
  return (
    <Image
      src="/maquininha-quattro-icone.webp"
      alt={decorativa ? "" : "Maquininha Quattro"}
      width={LARGURA}
      height={ALTURA}
      // `self-start`: dentro de uma coluna flex o padrão `stretch` esticava a
      // imagem na largura do card (medido no print) e ela saía achatada.
      className={`self-start shrink-0 object-contain ${className ?? ""}`}
      style={{ height: altura, width: "auto" }}
      sizes={`${Math.ceil((altura * LARGURA) / ALTURA) * 2}px`}
    />
  );
}
