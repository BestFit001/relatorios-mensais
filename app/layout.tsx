import type { Metadata } from "next";
import "@fontsource/ibm-plex-sans/latin-400.css";
import "@fontsource/ibm-plex-sans/latin-500.css";
import "@fontsource/ibm-plex-sans/latin-600.css";
import "@fontsource/ibm-plex-sans/latin-700.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
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
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        {/* aplica o tema salvo antes de pintar a tela, para não piscar escuro no modo claro */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("hub_bestfit_tema")==="light")document.documentElement.classList.add("light")}catch(e){}` }} />
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css"
        />
      </head>
      <body className="antialiased">
        {children}
        <AlertaTarefasGlobal />
        <AvisoConstrucao />
        <ChatInterno />
        <EscolherAvatar />
      </body>
    </html>
  );
}