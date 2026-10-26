import { QueryCache, QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  // One place to see every failed query. Pages still show their own retry UI; this is for logging and later reporting.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (error?.name === "NotFoundError") return;
      console.error("Query failed", query.queryKey, error);
    }
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false
    }
  }
});
