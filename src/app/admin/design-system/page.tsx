/** Área da plataforma · Design system. Os cadeados de servidor moram em `layout.tsx`. */
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/AdminShell";
import { VitrineDesign } from "@/components/design-system/VitrineDesign";

export default function Page() {
  return (
    <AdminShell>
      <Suspense>
        <VitrineDesign />
      </Suspense>
    </AdminShell>
  );
}
