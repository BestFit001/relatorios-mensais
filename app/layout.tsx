import type { Metadata } from "next";
import "./globals.css";
import AlertaTarefasGlobal from "./components/AlertaTarefasGlobal";
import AvisoConstrucao from "./components/AvisoConstrucao";
import ChatInterno from "./components/ChatInterno";
import EscolherAvatar from "./components/EscolherAvatar";

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
        <AlertaTarefasGlobal />
        <AvisoConstrucao />
        <ChatInterno />
        <EscolherAvatar />
      </body>
    </html>
  );
}