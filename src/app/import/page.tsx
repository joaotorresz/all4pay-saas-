import { redirect } from "next/navigation";

// O Onboarding inteligente foi unificado na página "Upload de dados".
export default function ImportPage() {
  redirect("/upload");
}
