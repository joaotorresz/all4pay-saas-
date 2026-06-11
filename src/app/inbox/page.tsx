import { redirect } from "next/navigation";

// A Caixa de Entrada foi unificada na página "Upload de dados".
export default function InboxPage() {
  redirect("/upload");
}
