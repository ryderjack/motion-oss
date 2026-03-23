"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { useState } from "react";
import { useThemeEffect, useThemeStore } from "@/hooks/use-theme";

function ThemeSync() {
  useThemeEffect();
  return null;
}

function ThemedToaster() {
  const theme = useThemeStore((s) => s.theme);
  return <Toaster position="bottom-right" richColors theme={theme} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ThemeSync />
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
