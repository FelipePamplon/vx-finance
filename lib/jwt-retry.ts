/**
 * fetch que tenta de novo quando o Supabase recusa um token RECEM-EMITIDO.
 *
 * O que aconteceu em 16/11: depois de dias sem acesso, a sessao foi renovada
 * as 13:02:17 e o painel fez tres consultas dois segundos depois com o token
 * novo. Duas passaram; a de lancamentos voltou 401 "JWT issued at future"
 * (PGRST303): o relogio do servidor que atendeu estava alguns instantes atras
 * do que emitiu o token. O painel nao tinha segunda tentativa e caiu inteiro.
 *
 * O erro se resolve sozinho em segundos, entao a correcao e esperar e repetir.
 * So esse codigo e repetido: qualquer outro 401 (sessao expirada, sem
 * permissao) volta na hora, como antes.
 */

const CODIGO = "PGRST303";

export interface RetryOptions {
  tentativas?: number;
  esperaMs?: number;
  dormir?: (ms: number) => Promise<void>;
}

const dormirPadrao = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function tokenNoFuturo(res: Response): Promise<boolean> {
  if (res.status !== 401) return false;
  try {
    const corpo = await res.clone().text();
    return corpo.includes(CODIGO);
  } catch {
    return false;
  }
}

export function createJwtSkewRetryFetch(
  base: typeof fetch = fetch,
  { tentativas = 3, esperaMs = 1000, dormir = dormirPadrao }: RetryOptions = {}
): typeof fetch {
  return async (input, init) => {
    let res = await base(input, init);
    for (let i = 1; i <= tentativas && (await tokenNoFuturo(res)); i++) {
      // 1s, 2s, 3s: cobre a diferenca de relogio observada (~2s) com folga.
      await dormir(esperaMs * i);
      res = await base(input, init);
    }
    return res;
  };
}
