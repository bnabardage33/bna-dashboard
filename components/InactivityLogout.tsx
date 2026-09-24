"use client";

import { useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const DUREE_INACTIVITE_MS = 15 * 60 * 1000; // 15 minutes

const CHEMINS_EXCLUS = ["/login", "/espace-client", "/demo-client"];

export default function InactivityLogout() {
  const pathname = usePathname();
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const estExclu = CHEMINS_EXCLUS.some((p) => pathname?.startsWith(p));

  const deconnecter = useCallback(async () => {
    // using supabase singleton
    await supabase.auth.signOut();
window.location.href = "/login";
  }, [router]);

  const reinitialiserTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(deconnecter, DUREE_INACTIVITE_MS);
  }, [deconnecter]);

  useEffect(() => {
    if (estExclu) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    reinitialiserTimer();

    const evenements = ["mousedown", "touchstart", "keydown", "scroll"];
    evenements.forEach((evt) => window.addEventListener(evt, reinitialiserTimer));

    return () => {
      evenements.forEach((evt) => window.removeEventListener(evt, reinitialiserTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [estExclu, reinitialiserTimer]);

  return null;
}
