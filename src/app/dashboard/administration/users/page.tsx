import { Suspense } from "react";
import { AppShell } from "@/components/app/AppShell";
import { UsuariosView } from "@/components/administracao/AdministracaoViews";

export default function Page() {
  return (
    <AppShell title="Gerenciar usuários" crumb="Administração">
      <Suspense fallback={null}>
        <UsuariosView />
      </Suspense>
    </AppShell>
  );
}
