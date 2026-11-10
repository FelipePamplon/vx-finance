// Roda tests/engine.test.ts sem framework de teste: compila lib/ e o teste com o
// TypeScript do proprio projeto num diretorio temporario e executa com node.
// O alias "@/" e reescrito para caminho relativo porque o tsc nao o resolve na
// saida. Sem dependencia nova e sem mexer no lockfile de producao.
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const work = mkdtempSync(join(tmpdir(), "vx-engine-"));

try {
  for (const f of readdirSync(join(root, "lib")).filter((f) => f.endsWith(".ts"))) {
    cpSync(join(root, "lib", f), join(work, f));
  }
  cpSync(join(root, "types", "database.ts"), join(work, "types-database.ts"));
  cpSync(join(root, "tests", "engine.test.ts"), join(work, "engine.test.ts"));

  for (const f of readdirSync(work)) {
    const src = readFileSync(join(work, f), "utf8")
      .replaceAll("@/lib/supabase/", "./supabase-")
      .replaceAll("@/lib/", "./")
      .replaceAll("@/types/database", "./types-database");
    writeFileSync(join(work, f), src);
  }

  // So o que o teste alcanca: modulos com dependencia de navegador/servidor
  // (export, storage, ledger-server) ficam de fora da compilacao.
  execFileSync(
    join(root, "node_modules", ".bin", "tsc"),
    [
      "--module", "commonjs", "--target", "es2022", "--moduleResolution", "node",
      "--esModuleInterop", "--skipLibCheck", "--strict", "--types", "node",
      "--typeRoots", join(root, "node_modules", "@types"),
      "--outDir", join(work, "out"), join(work, "engine.test.ts"),
    ],
    { stdio: "inherit" }
  );
  execFileSync("node", [join(work, "out", "engine.test.js")], { stdio: "inherit" });
} finally {
  rmSync(work, { recursive: true, force: true });
}
