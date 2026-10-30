/** O aviso da página pública de pagamento: link inválido ou fora do ar. */
export function AvisoDoLink({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="flex flex-col gap-2 text-center">
      <h1 className="text-h2 text-ink">{titulo}</h1>
      <p className="text-body text-muted leading-[1.5]">{texto}</p>
    </div>
  );
}
