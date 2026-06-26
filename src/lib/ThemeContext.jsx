import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

/**
 * ThemeContext — modo claro / oscuro global.
 *
 * - 100% estético: solo toggle de la clase `.dark` en <html>.
 * - Persistencia por dispositivo en localStorage (key: `mh_theme`).
 * - Funciona con shadcn/Tailwind: tailwind.config.js usa `darkMode: ["class"]`
 *   y el index.css ya define todas las variables HSL para `.dark`.
 * - Animación: una clase temporal `.theme-anim` se aplica al <html> para que
 *   transiciones CSS de fondo/borde/color tomen efecto solo durante el cambio
 *   y no permanentemente (evita reflows costosos en móvil).
 *
 * NO toca lógica de negocio, datos, entidades ni queries.
 */

const STORAGE_KEY = 'mh_theme';
const ANIM_CLASS = 'theme-anim';
const ANIM_MS = 500;

function readStored() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'dark' || v === 'light') return v;
  } catch {}
  return 'light';
}

function applyThemeToRoot(theme) {
  try {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    // Marca el color-scheme nativo para inputs/scrollbars.
    root.style.colorScheme = theme === 'dark' ? 'dark' : 'light';
  } catch {}
}

function pulseAnimClass() {
  try {
    const root = document.documentElement;
    root.classList.add(ANIM_CLASS);
    window.setTimeout(() => {
      try { root.classList.remove(ANIM_CLASS); } catch {}
    }, ANIM_MS + 50);
  } catch {}
}

const ThemeContext = createContext({
  theme: 'light',
  isDark: false,
  toggle: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  // Inicialización síncrona — antes del primer paint — para evitar flash.
  const [theme, setThemeState] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const t = readStored();
    applyThemeToRoot(t);
    return t;
  });

  // En cliente, garantizamos que el <html> tenga la clase correcta.
  useEffect(() => { applyThemeToRoot(theme); }, [theme]);

  const setTheme = useCallback((next) => {
    const value = next === 'dark' ? 'dark' : 'light';
    pulseAnimClass();
    setThemeState(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch {}
  }, []);

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, isDark: theme === 'dark', toggle, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * Hook ligero para componentes que sólo quieren saber si está oscuro.
 * Evita re-render innecesario fuera del provider.
 */
export function useIsDark() {
  return useContext(ThemeContext).isDark;
}