/**
 * A ARTE E O "CARREGANDO" DAS TELAS DE ENTRADA — login e senha nova.
 *
 * Saíram de dentro do `/login` quando a tela de senha nova nasceu: duas cópias
 * da mesma arte divergem no primeiro ajuste, e as duas telas são a mesma porta
 * vista em dois momentos.
 */
import Image from "next/image";
import { BarrasEntradaSaida } from "@/components/ui";

export function Spinner() {
  return <span className="inline-block w-4 h-4 rounded-full border-2 border-on-lime/30 border-t-on-lime animate-spin" aria-hidden />;
}

/**
 * O painel da marca, no design system de 27/10/2026 (o do site): a foto da
 * maquininha Quattro de fundo (escolhida pelo dono, 27/10/2026) e, no canto, o
 * MESMO cartão "Caixa consolidado" da Home (`CardGrande` de `HomeSnapshot`):
 * rótulo, valor-herói, pílula de variação e o modelo "Entradas" da Biblioteca.
 *
 * ⚠️ O degradê lime → tinta que vinha aqui pintava metade da tela de lime:
 * o lime é a cor da AÇÃO (o botão Entrar ao lado), e um painel inteiro dele
 * disputava o olho com o único botão que importa.
 *
 * Os números do cartão são ILUSTRAÇÃO (o rodapé diz "exemplo"): esta tela não
 * tem sessão, não há número de ninguém para mostrar. A pílula é fixa — nenhuma
 * cor sai de comparar um valor com zero aqui.
 */
const MESES_EXEMPLO = [
  { label: "mai", entrada: 182000, saida: 141000 },
  { label: "jun", entrada: 196000, saida: 152000 },
  { label: "jul", entrada: 171000, saida: 158000 },
  { label: "ago", entrada: 214000, saida: 163000 },
  { label: "set", entrada: 228000, saida: 171000 },
  { label: "out", entrada: 241000, saida: 176000 },
];
const MESES_EXEMPLO_PF = [
  { label: "mai", entrada: 9200, saida: 7400 },
  { label: "jun", entrada: 9200, saida: 8100 },
  { label: "jul", entrada: 9600, saida: 7900 },
  { label: "ago", entrada: 9600, saida: 8300 },
  { label: "set", entrada: 9600, saida: 7700 },
  { label: "out", entrada: 10100, saida: 8000 },
];

export function ArtPanel({ pessoal }: { pessoal: boolean }) {
  return (
    <div className="hidden lg:flex p-4 lg:p-5" aria-hidden>
      <div
        className="relative flex-1 overflow-hidden rounded-bloco flex flex-col justify-end p-10"
        style={{ background: "var(--color-ink)" }}
      >
        {/* A foto da maquininha Quattro (a mesma do site), cobrindo o bloco. */}
        <Image src="/entrada-maquininha.webp" alt="" fill priority sizes="50vw" className="object-cover" style={{ objectPosition: "50% 45%" }} />

        {/* O cartão da Home, a 70% do tamanho de lá (`zoom` encolhe texto,
            gráfico e espaços juntos — mudar só a largura espremeria o gráfico). */}
        <div
          className="relative w-[440px] max-w-full flex flex-col gap-4 px-8 pt-[30px] pb-6"
          style={{ background: "var(--color-white)", borderRadius: "var(--a4p-box-radius)", zoom: 0.7 }}
        >
          <span className="text-[15px] text-ink">{pessoal ? "Saldo do mês" : "Caixa consolidado"}</span>
          <div className="flex items-center gap-[13.8px] flex-wrap">
            <span className="a4p-heroi a4p-num" style={{ fontSize: 36, lineHeight: 1 }}>
              {pessoal ? "R$ 8.420,00" : "R$ 248.310,00"}
            </span>
            <span
              className="rounded-pill px-2 py-[2.4px] text-[10.4px] font-medium whitespace-nowrap tabular-nums"
              style={{ color: "var(--color-positive)", background: "color-mix(in srgb, var(--color-positive) 14%, transparent)" }}
            >
              +4,2% em 30 dias
            </span>
          </div>
          <BarrasEntradaSaida
            dados={pessoal ? MESES_EXEMPLO_PF : MESES_EXEMPLO}
            altura={170}
            vao={4}
            ariaLabel="Entradas e saídas dos últimos seis meses (exemplo)"
          />
          <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-[12px] text-muted pt-3 border-t" style={{ borderColor: "var(--erp-menu-borda)" }}>
            <span>Exemplo</span>
            <span className="text-[13px]">vs. o mesmo dia do mês passado</span>
          </div>
        </div>
      </div>
    </div>
  );
}
