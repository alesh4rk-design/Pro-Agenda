import {
  type Query,
  type QueryDocumentSnapshot,
  getDocs,
  limit,
  query,
  startAfter,
} from "firebase/firestore";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Lista paginada do Firestore (leituras sob demanda, sem escuta em tempo real,
 * para economizar a cota gratuita). `key` muda => recarrega do início.
 */
export function usePaged<T>(baseQuery: Query | null, key: string, pageSize = 25) {
  const [items, setItems] = useState<(T & { id: string })[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fim, setFim] = useState(true);
  const cursor = useRef<QueryDocumentSnapshot | null>(null);
  const qRef = useRef(baseQuery);
  qRef.current = baseQuery;

  const load = useCallback(
    async (reset: boolean) => {
      const base = qRef.current;
      if (!base) {
        setItems([]);
        setFim(true);
        return;
      }
      setLoading(true);
      setError("");
      try {
        const q = query(base, ...(reset || !cursor.current ? [] : [startAfter(cursor.current)]), limit(pageSize));
        const snap = await getDocs(q);
        const page = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }));
        setItems((prev) => (reset ? page : [...prev, ...page]));
        cursor.current = snap.docs[snap.docs.length - 1] ?? null;
        setFim(snap.docs.length < pageSize);
      } catch {
        setError("Não foi possível carregar a lista. Verifique a conexão.");
      } finally {
        setLoading(false);
      }
    },
    [pageSize],
  );

  useEffect(() => {
    cursor.current = null;
    void load(true);
  }, [key, load]);

  return {
    items,
    loading,
    error,
    fim,
    reload: () => load(true),
    more: () => load(false),
    /** Atualiza um item localmente após uma alteração confirmada pelo servidor. */
    patch: (id: string, data: Partial<T>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...data } : i))),
  };
}
