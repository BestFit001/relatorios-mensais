import type { Metadata } from "next";
import "./globals.css";

// Desativa a pré-geração estática no build para todas as rotas (evita Out Of Memory na Vercel)
export const dynamic = 'force-dynamic';
export const dynamicParams = true;
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Hub Best Fit",
  description: "Sistema de Gestão e Dashboard Omnichannel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <head>
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className="antialiased bg-[#07090e] text-slate-100">
        {children}
      </body>
    </html>
  );
}