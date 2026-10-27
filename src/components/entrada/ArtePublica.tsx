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

/**
 * O painel da marca, no design system de 27/10/2026 (o do site): bloco na
 * tinta (#3B4332, `--color-ink`) com o título em Agrandir 700 e um cartão
 * branco com o valor-herói — "o número manda". O lime é só o marcador.
 *
 * ⚠️ O degradê lime → tinta que vinha aqui pintava metade da tela de lime:
 * o lime é a cor da AÇÃO (o botão Entrar ao lado), e um painel inteiro dele
 * disputava o olho com o único botão que importa.
 *
 * O valor do cartão é ILUSTRAÇÃO (está escrito "exemplo"): esta tela não tem
 * sessão, não há número de ninguém para mostrar.
 */
export function ArtPanel({ pessoal }: { pessoal: boolean }) {
  const barras = [38, 52, 44, 66, 58, 74, 86];
  return (
    <div className="hidden lg:flex p-4 lg:p-5" aria-hidden>
      <div
        className="relative flex-1 overflow-hidden rounded-bloco flex flex-col justify-between p-12"
        style={{ background: "var(--color-ink)" }}
      >
        {/* Formas na própria tinta, só tons dela — sem segunda cor. */}
        <div className="absolute rounded-pill" style={{ width: 560, height: 560, top: "-18%", right: "-22%", background: "color-mix(in srgb, var(--color-white) 6%, var(--color-ink))" }} />
        <div className="absolute rounded-pill" style={{ width: 340, height: 340, bottom: "-14%", left: "-10%", background: "color-mix(in srgb, var(--color-white) 4%, var(--color-ink))" }} />

        <div className="relative flex items-center gap-2">
          <span className="w-2 h-2 rounded-pill" style={{ background: "var(--color-lime)" }} />
          <span className="text-[13px]" style={{ color: "var(--color-white)", opacity: 0.7 }}>
            {pessoal ? "Quattro para você" : "Quattro ERP"}
          </span>
        </div>

        {/* O cartão: o mesmo desenho dos cartões do app (branco, 24px, sem sombra). */}
        <div className="relative self-center w-[340px] max-w-full rounded-card p-7" style={{ background: "var(--color-white)" }}>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-muted">{pessoal ? "Saldo do mês" : "Caixa consolidado"}</span>
            <span className="text-[12px] text-muted rounded-pill px-2.5 py-1" style={{ background: "var(--color-surface-1)" }}>exemplo</span>
          </div>
          <p className="m-0 mt-3 a4p-heroi a4p-num text-[40px] leading-none" style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: "var(--color-ink)" }}>
            {pessoal ? "R$ 8.420,00" : "R$ 248.310,00"}
          </p>
          <div className="mt-6 flex items-end gap-2 h-[86px]">
            {barras.map((h, k) => (
              <span
                key={k}
                className="flex-1 rounded-[6px]"
                style={{ height: `${h}%`, background: k === barras.length - 1 ? "var(--color-lime)" : "color-mix(in srgb, var(--color-areia) 45%, var(--color-white))" }}
              />
            ))}
          </div>
        </div>

        <div className="relative max-w-[440px]">
          <p className="m-0 text-[34px] leading-[1.05]" style={{ fontFamily: "var(--font-display)", fontWeight: 700, letterSpacing: "-0.02em", wordSpacing: "var(--a4p-titulo-espaco-palavra)", color: "var(--color-white)" }}>
            {pessoal
              ? "Seu dinheiro do dia a dia, organizado e sob controle."
              : "O sistema financeiro que também guarda e move o seu dinheiro."}
          </p>
          <p className="m-0 mt-4 text-[15px]" style={{ color: "var(--color-white)", opacity: 0.72 }}>
            {pessoal
              ? "Gastos, contas e orçamento num lugar só, sem planilha."
              : "Caixa, cobrança e pagamento num lugar só."}
          </p>
        </div>
      </div>
    </div>
  );
}
