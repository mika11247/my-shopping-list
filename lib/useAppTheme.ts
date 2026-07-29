"use client";

import { useSyncExternalStore } from "react";

const subscribe = (onStoreChange: () => void) => {
  window.addEventListener("theme-change", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener("theme-change", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
};

const getSnapshot = () => localStorage.getItem("theme") ?? "default";
const getServerSnapshot = () => "default";

/** React adapter for the app's existing localStorage + theme-change mechanism. */
export const useAppTheme = () =>
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
