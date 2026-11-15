"use client";
// Adsense · página de um canal (ex.: /ads/tiktok-shop): importação de planilhas, lançamento manual e sugestões.
import { useParams } from "next/navigation";
import AdsPainel from "../AdsPainel";

export default function AdsCanalPage() {
  const params = useParams<{ canal: string }>();
  const slug = decodeURIComponent(String(params?.canal || ""));
  return <AdsPainel key={slug} modo="canal" canalSlug={slug} />;
}
