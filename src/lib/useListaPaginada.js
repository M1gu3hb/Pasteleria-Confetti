import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * REGISTROS — Lista paginada incremental ("cargar más").
 *
 * Reemplaza el patrón anterior de "cargar un tope (1000) y filtrar/cortar en el
 * navegador". Trae páginas de `pageSize` desde la base, acumula y permite cargar
 * más. Así NO se cargan 11.000 registros de golpe.
 *
 * fetchPage(skip, limit) debe devolver un array (la página). El hook detecta el
 * final únicamente cuando una página viene vacía (el API puede tener otro cap).
 *
 * deps: cuando cambian (p. ej. sucursal activa), se reinicia desde la página 0.
 */
export function useListaPaginada(fetchPage, pageSize, deps = []) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const [error, setError] = useState(null);
  const generacionRef = useRef(0);
  const enCursoRef = useRef(false);
  const skipRef = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const cargar = useCallback(async (reset) => {
    if (!reset && enCursoRef.current) return;
    if (reset) { generacionRef.current++; setItems([]); }
    const generacion = generacionRef.current;
    enCursoRef.current = true;
    setError(null);
    const skip = reset ? 0 : skipRef.current;
    if (reset) { setLoading(true); } else { setLoadingMore(true); }
    try {
      const page = await fetchRef.current(skip, pageSize);
      if (generacion !== generacionRef.current) return;
      if (!Array.isArray(page)) throw new Error('Lista incompleta; reintenta la consulta.');
      const arr = page;
      setItems(prev => { const seen = new Set(); return (reset ? arr : [...prev, ...arr]).filter(row => { if (seen.has(row.id)) return false; seen.add(row.id); return true; }); });
      skipRef.current = skip + arr.length;
      setHayMas(arr.length > 0);
    } catch (e) {
      if (generacion !== generacionRef.current) return;
      console.warn('[useListaPaginada] error:', e);
      setError(e);
      if (reset) setItems([]);
      setHayMas(true);
    } finally {
      if (generacion === generacionRef.current) {
        enCursoRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  useEffect(() => {
    skipRef.current = 0;
    cargar(true);
    return () => { generacionRef.current++; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const cargarMas = useCallback(() => {
    if (!loadingMore && hayMas) cargar(false);
  }, [cargar, loadingMore, hayMas]);

  const recargar = useCallback(() => { skipRef.current = 0; cargar(true); }, [cargar]);

  return { items, loading, loadingMore, hayMas, cargarMas, recargar, error };
}
