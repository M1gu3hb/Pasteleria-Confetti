# Confetti POS

POS de tres sucursales: React/Vite, Supabase y Vercel. Lee CLAUDE.md, PROJECT_CONTEXT.md y HANDOFF.md antes de cambiar código o dinero. El histórico Base44 se conserva como documentación; ya no es el servicio de producción.

Instala con `npm ci`. Para desarrollo usa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY del proyecto autorizado; nunca credenciales de servicio/contraseñas en VITE. Ejecuta `npm run dev`. `npm run build` exige lint, puerta de tipos y pruebas operativas/autoridad/evidencia antes de Vite.

La rama de producción es migracion/supabase; apk/capacitor debe avanzar al mismo commit porque los APK instalados cargan su alias Vercel. No repuntar ni recompilar APK sin verificar compatibilidad. Código/migraciones y estados se consultan en GitHub/Supabase/Vercel; un deploy no demuestra que la tablet recargó.

Pruebas usan fixtures aislados. No generar cobros, pedidos o cortes ficticios en producción. La fórmula de efectivo y los tres candados de Caja están en CLAUDE.md.
