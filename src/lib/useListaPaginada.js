import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * REGISTROS — Lista paginada incremental ("cargar más").
 *
 * Reemplaza el patrón anterior de "cargar un tope (1000) y filtrar/cortar en el
 * navegador". Trae páginas de `pageSize` desde la base, acumula y permite cargar
 * más. Así NO se cargan 11.000 registros de golpe.
 *
 * fetchPage(skip, limit) debe devolver un array (la página). El hook detecta el
 * final cuando una página viene con menos de `pageSize` elementos.
 *
 * deps: cuando cambian (p. ej. sucursal activa), se reinicia desde la página 0.
 */
export function useListaPaginada(fetchPage, pageSize, deps = []) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hayMas, setHayMas] = useState(false);
  const skipRef = useRef(0);
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const cargar = useCallback(async (reset) => {
    const skip = reset ? 0 : skipRef.current;
    if (reset) { setLoading(true); } else { setLoadingMore(true); }
    try {
      const page = await fetchRef.current(skip, pageSize);
      const arr = Array.isArray(page) ? page : [];
      setItems(prev => (reset ? arr : [...prev, ...arr]));
      skipRef.current = skip + arr.length;
      setHayMas(arr.length === pageSize);
    } catch (e) {
      console.warn('[useListaPaginada] error:', e);
      if (reset) setItems([]);
      setHayMas(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize]);

  useEffect(() => {
    skipRef.current = 0;
    cargar(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const cargarMas = useCallback(() => {
    if (!loadingMore && hayMas) cargar(false);
  }, [cargar, loadingMore, hayMas]);

  const recargar = useCallback(() => { skipRef.current = 0; cargar(true); }, [cargar]);

  return { items, loading, loadingMore, hayMas, cargarMas, recargar };
}