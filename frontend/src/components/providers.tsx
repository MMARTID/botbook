"use client";

import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getMyBusiness } from "@/lib/api";
import type { Business } from "@/lib/types";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: false,
    },
  },
});

type BusinessContextValue = {
  business: Business | undefined;
  isLoadingBusiness: boolean;
  isError: boolean;
  errorMessage: string | null;
  hasToken: boolean | null;
};

const BusinessContext = createContext<BusinessContextValue | null>(null);

function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    const syncToken = () => {
      const token =
        window.localStorage.getItem("asistai_token") ??
        window.localStorage.getItem("token") ??
        window.localStorage.getItem("jwt");

      setHasToken(Boolean(token));
    };

    syncToken();
    window.addEventListener("storage", syncToken);

    return () => {
      window.removeEventListener("storage", syncToken);
    };
  }, []);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["my-business"],
    queryFn: getMyBusiness,
    enabled: hasToken === true,
    refetchOnWindowFocus: true,
  });

  const errorMessage =
    error instanceof Error
      ? error.message
      : isError
        ? "No se pudo cargar la información del negocio."
        : null;

  const value = useMemo(
    () => ({
      business: data,
      isLoadingBusiness: hasToken === null || (hasToken === true && isLoading),
      isError,
      errorMessage,
      hasToken,
    }),
    [data, errorMessage, hasToken, isLoading, isError],
  );

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error("useBusiness must be used within Providers");
  }
  return context;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BusinessProvider>{children}</BusinessProvider>
    </QueryClientProvider>
  );
}
