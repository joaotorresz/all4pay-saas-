import type { Metadata } from "next";
import { AppShell } from "@/components/app/AppShell";
import { Card } from "@/components/ui";
import { Icon3D, type Icon3DName, type Icon3DStyle } from "@/components/ui/Icon3D";

export const metadata: Metadata = { title: "Ícones 3D — proposta" };

const GLYPHS: Icon3DName[] = ["money", "chart", "card", "calendar", "wallet", "bank", "spark", "doc"];
const STYLES: { id: Icon3DStyle; label: string; sub: string }[] = [
  { id: "lime", label: "Estilo A · Lime", sub: "tile lime + glifo preto" },
  { id: "ink", label: "Estilo B · Ink", sub: "tile preto + glifo lime" },
  { id: "duo", label: "Estilo C · Duo", sub: "lime + preto + acento amarelo" },
];

export default function Icones3DPage() {
  return (
    <AppShell title="Ícones 3D" crumb="Proposta de identidade">
      <div className="flex flex-col gap-6">
        <p className="text-body text-muted max-w-[640px]">
          Ícones 3D nativos da marca (vetoriais): volume por gradiente, cores exatas
          verde/amarelo/preto da all4pay, sem sombra e theme-aware. Escolha o estilo.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {STYLES.map((s) => (
            <Card key={s.id} className="flex flex-col gap-5">
              <div>
                <div className="text-h3 font-semibold text-ink">{s.label}</div>
                <div className="text-caption text-muted">{s.sub}</div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                {GLYPHS.map((g) => (
                  <div key={g} className="flex flex-col items-center gap-1">
                    <Icon3D name={g} variant={s.id} size={52} />
                    <span className="text-[11px] text-faint">{g}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
        {/* Tamanhos */}
        <Card className="flex items-end gap-6">
          <div className="text-caption text-muted">Escala:</div>
          {[28, 36, 44, 56, 72].map((z) => (
            <Icon3D key={z} name="money" variant="lime" size={z} />
          ))}
        </Card>
      </div>
    </AppShell>
  );
}
