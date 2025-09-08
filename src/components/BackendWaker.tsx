"use client";
import { useEffect } from "react";
import { api } from "@/lib/api";

export function BackendWaker() {
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000); // timeout curto
    fetch(api("/health"), { cache: "no-store", signal: ctrl.signal }).catch(() => {});
    return () => { clearTimeout(t); ctrl.abort(); };
  }, []);
  return null;
}
