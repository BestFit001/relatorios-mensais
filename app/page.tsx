import Link from "next/link";

export default function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50 p-8 text-gray-900">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-6 text-gray-800">Painel de Performance</h1>

        {/* Menu de Navegação Real (Rotas) */}
        <div className="flex space-x-6 border-b border-gray-300 pb-2 mb-6">
          <Link href="/" className="px-4 py-2 font-semibold text-lg border-b-4 border-blue-600 text-blue-600">
            Curva ABC & Histórico
          </Link>
          <Link href="/upload" className="px-4 py-2 font-semibold text-lg text-gray-500 hover:text-blue-500 transition-colors">
            Upload de Planilhas
          </Link>
        </div>

        {/* Conteúdo Exclusivo do Dashboard */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold mb-4 text-gray-700">Análise de Vendas</h2>
          <p className="text-gray-500">Os dados cruzados entre Curva ABC e o Saldo de Inventário do Supabase aparecerão aqui.</p>
        </div>
      </div>
    </div>
  );
}