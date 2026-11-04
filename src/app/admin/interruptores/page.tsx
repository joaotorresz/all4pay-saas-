/** Área da plataforma · Interruptores. Os cadeados de servidor moram em `layout.tsx`. */
import { AdminShell } from "@/components/admin/AdminShell";
import { InterruptoresView } from "@/components/admin/InterruptoresView";
import { estadoDosInterruptores } from "@/lib/interruptores";

// O estado é lido a cada pedido: a variável muda na Vercel e um build não a congela.
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AdminShell>
      <InterruptoresView linhas={estadoDosInterruptores()} />
    </AdminShell>
  );
}
