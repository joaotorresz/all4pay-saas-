import { redirect } from "next/navigation";

// O hub "Criar Novo" duplicava a navegação (Sidebar + dropdown "Novo
// lançamento" já cobrem todos os fluxos de criação) — aposentado.
export default function CriarPage() {
  redirect("/");
}
