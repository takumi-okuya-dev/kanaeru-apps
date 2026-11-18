// TanStack Query の入れ物。
import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "./api.ts";

/**
 * 画面の QueryClient を作る。見つからない（404）などの答えは、何度読み直しても変わらないので、読み直さない。
 * @returns QueryClient
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (failureCount, error) =>
          !(error instanceof ApiError && error.status < 500) && failureCount < 2,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  });
}
