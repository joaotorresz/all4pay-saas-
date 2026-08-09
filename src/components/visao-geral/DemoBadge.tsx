import { Badge } from "@/components/ui";

/** Shown whenever the screen is rendering seed data instead of live data. */
export function DemoBadge() {
  return (
    <Badge
      variant="new"
      className="!bg-lime-tint !text-ink !tracking-normal !normal-case border border-[color:var(--color-lime-tint)]"
      title="Dados de demonstração — conecte o Supabase para ver dados reais"
    >
      Demonstração
    </Badge>
  );
}
