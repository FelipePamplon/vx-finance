"use client";

import { ErrorScreen } from "@/components/layout/error-screen";

// Cobre falhas no layout do painel (que o app/dashboard/error.tsx nao alcanca).
export default function RootError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-dvh bg-background p-6">
      <ErrorScreen {...props} />
    </main>
  );
}
