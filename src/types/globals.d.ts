import type { StoreApi, UseBoundStore } from "zustand";

declare global {
  type AnyRecord = Record<string, any>;
  type AnyStore = UseBoundStore<StoreApi<AnyRecord>>;
}

export {};
