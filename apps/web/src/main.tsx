// 画面の入口。TanStack Query と道（router.tsx）をつなぐ。
// zod の設定は、ほかのどの import よりも先に読む（lib/zod-config.ts）
import "./lib/zod-config.ts";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { UiProvider } from "@workspace/ui/components/ui-provider";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "./lib/query.ts";
import { createAppRouter } from "./router.tsx";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root が見つかりません。");

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

createRoot(root).render(
  <StrictMode>
    <UiProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </UiProvider>
  </StrictMode>,
);
