import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * A MOLDURA DAS TELAS PÚBLICAS — login, criar conta, privacidade, 404 e erro.
 *
 * Mesma identidade do app: fundo escuro (`.a4p-canvas`) + o conteúdo num cartão
 * claro arredondado (`.a4p-app-card`). São as MESMAS classes que o `AppShell`
 * usa, não uma cópia — e é isso que importa: o login e o app não podem ter duas
 * molduras que divergem no primeiro ajuste.
 *
 * ⚠️ Existe como componente, e não como seis edições parecidas, porque foi
 * assim que a divergência nasceu da primeira vez. Estas telas ficam FORA do
 * `AppShell` (não há sessão, não há menu), então nada as alcançava — cada uma
 * repetia `min-h-screen bg-surface-1` por conta própria, e mudar a identidade
 * do produto deixava justamente a primeira tela para trás.
 *
 * ⚠️ A barra tem SÓ a marca. Aqui não há conta, busca nem grupo para navegar —
 * repetir os controles do app daria botões que não levam a lugar nenhum.
 */
export function MolduraPublica({
  children,
  cartaoClassName,
}: {
  children: React.ReactNode;
  /**
   * Substitui o comportamento padrão do cartão (rolagem própria). O login passa
   * `grid lg:grid-cols-2` porque quem rola lá é a coluna do formulário, não o
   * cartão inteiro.
   */
  cartaoClassName?: string;
}) {
  return (
    <div className="a4p-canvas min-h-screen flex flex-col">
      <header className="shrink-0 flex items-center h-[68px] px-4 lg:px-6">
        {/* Sempre a marca LIMA: o fundo é escuro nos dois temas, e a versão
            escura sumiria no claro. */}
        <Link href="/" aria-label="Início" className="inline-flex items-center">
          <Image src="/all4pay-lime.png" alt="all4pay" width={132} height={26} className="h-[26px] w-auto" priority />
        </Link>
      </header>
      <div
        className={cn(
          "a4p-app-card flex-1 min-h-0 mx-4 mb-4 lg:mx-6 lg:mb-6",
          cartaoClassName ?? "overflow-y-auto",
        )}
      >
        {children}
      </div>
    </div>
  );
}
