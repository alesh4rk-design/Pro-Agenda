import { doc, onSnapshot } from "firebase/firestore";
import { useEffect, useState } from "react";
import { DEFAULT_SYSTEM_NAME } from "@rondas/shared";
import { db } from "./firebase";

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

const NAME_KEY = "rondas.nomeSistema";

function cachedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || DEFAULT_SYSTEM_NAME;
  } catch {
    return DEFAULT_SYSTEM_NAME;
  }
}

/** Nome configurável do sistema (config/publico), com cache local para abrir offline. */
export function useSystemName(): string {
  const [name, setName] = useState(cachedName);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "config/publico"),
        (snap) => {
          const n = (snap.data()?.nomeSistema as string | undefined) || DEFAULT_SYSTEM_NAME;
          setName(n);
          try {
            localStorage.setItem(NAME_KEY, n);
          } catch {
            /* armazenamento indisponível */
          }
        },
        () => undefined,
      ),
    [],
  );
  useEffect(() => {
    document.title = name;
  }, [name]);
  return name;
}
