import { QueryClient } from "@tanstack/react-query";

const noRetry = new Set(["unauthorized", "not_found", "not_configured", "not_a_seller"]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => !noRetry.has(error?.code) && count < 1,
      refetchOnWindowFocus: true,
      staleTime: 0
    }
  }
});
