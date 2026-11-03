import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Ao interceptar as rotas, o Next.js reconhece a aplicação como dinâmica
  // e desativa a geração de páginas estáticas durante o build.
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Aplica em todas as rotas da aplicação, exceto:
     * - arquivos estáticos (_next/static, _next/image, favicon.ico)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};