/**
 * Busca todas as linhas de uma consulta, pagina por pagina.
 *
 * O PostgREST devolve no maximo 1.000 linhas por requisicao e NAO AVISA quando
 * corta. As telas somavam saldo, DRE e relatorios em cima de uma unica chamada:
 * ao passar de 1.000 lancamentos os numeros ficariam errados em silencio, sem
 * erro nenhum na tela. A base tinha 585 em nove meses.
 *
 * A consulta precisa de ordenacao estavel (termine com `.order("id")`), senao
 * uma linha pode aparecer em duas paginas ou em nenhuma.
 */
export async function fetchAllRows<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>,
  pageSize = 1000
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < pageSize) return rows;
    if (from > 500_000) throw new Error("Consulta grande demais para paginar no cliente.");
  }
}
