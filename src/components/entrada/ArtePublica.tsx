/**
 * A ARTE E O "CARREGANDO" DAS TELAS DE ENTRADA — login e senha nova.
 *
 * Saíram de dentro do `/login` quando a tela de senha nova nasceu: duas cópias
 * da mesma arte divergem no primeiro ajuste, e as duas telas são a mesma porta
 * vista em dois momentos.
 */
export function Spinner() {
  return <span className="inline-block w-4 h-4 rounded-full border-2 border-on-lime/30 border-t-on-lime animate-spin" aria-hidden />;
}

/** Composição geométrica lime → dark (tokens), inspirada na Payfy. */
export function ArtPanel({ pessoal }: { pessoal: boolean }) {
  return (
    <div
      className="hidden lg:block relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, var(--color-lime) 0%, var(--color-ink) 78%)" }}
      aria-hidden
    >
      {/* camadas/quadrados arredondados sobrepostos — SÓLIDOS (sem vidro,
          16/10/2026): misturas opacas dos tokens, nada translúcido nem desfocado. */}
      <div className="absolute rounded-card" style={{ width: 360, height: 360, top: "12%", left: "18%", background: "color-mix(in srgb, var(--color-lime) 46%, var(--color-ink))", transform: "rotate(14deg)" }} />
      <div className="absolute rounded-card" style={{ width: 280, height: 280, top: "34%", left: "40%", background: "color-mix(in srgb, var(--color-lime) 30%, var(--color-ink))", transform: "rotate(-10deg)" }} />
      <div className="absolute rounded-card" style={{ width: 220, height: 220, top: "52%", left: "20%", background: "color-mix(in srgb, var(--color-ink) 82%, var(--color-lime))", transform: "rotate(8deg)" }} />
      <div className="absolute rounded-pill" style={{ width: 520, height: 520, top: "-10%", right: "-12%", background: "color-mix(in srgb, var(--color-lime) 78%, var(--color-ink))" }} />
      <div className="absolute inset-0 flex items-end p-12">
        <div className="max-w-[420px]">
          <p className="m-0 text-h3 font-medium leading-tight" style={{ color: "var(--color-white)" }}>
            {pessoal
              ? "Seu dinheiro do dia a dia, organizado e sob controle."
              : "O sistema operacional financeiro que também guarda e move o seu dinheiro."}
          </p>
          <p className="m-0 mt-3 text-label" style={{ color: "var(--color-white)", opacity: 0.75 }}>
            {pessoal
              ? "Gastos, contas e orçamento — tudo num lugar só, sem planilha."
              : "Caixa, risco, cobrança e pagamento — em camadas, num lugar só."}
          </p>
        </div>
      </div>
    </div>
  );
}
