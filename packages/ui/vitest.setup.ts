// Testing Library の確かめ（toBeInTheDocument など）を足し、テストごとに画面を片付ける。
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  if (typeof document !== "undefined") cleanup();
});
