package com.mhastral.confettipos.scanner;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Núcleo del lector nativo, en Java puro (sin android.*) para probarlo con JUnit.
 *
 * Responsabilidad DELIBERADAMENTE ESTRECHA (como ConfettiPrinter: un "tubo"):
 *   1. Decidir si una tecla viene del lector VINCULADO (o de un dispositivo en el paso explícito
 *      de vinculación) y, sólo entonces, consumirla para que NUNCA llegue al WebView ni al IME.
 *   2. Agrupar esas teclas hasta Enter (o un corte: inactividad, desconexión, pausa, cambio de
 *      contexto) y entregar el grupo al JS con los tiempos del evento original.
 *
 * NO decide si el grupo es un código válido: eso lo hace el MISMO parser JS (barcodeFrame) que usa
 * la ruta web, para que exista una sola regla de lectura y se corrija por Vercel sin reinstalar.
 *
 * Identidad: el deviceId de Android cambia al reconectar, así que el vínculo guarda
 * vendorId + productId + nombre (+ descriptor informativo). Si hay MÁS DE UN dispositivo conectado
 * con esa identidad, no se puede saber cuál es el lector: no se captura ninguno ("ambiguo").
 *
 * Todo se ejecuta en un solo hilo (el principal de Android); no es thread-safe a propósito.
 */
public final class ScannerCore {

    public static final int PROTOCOLO = 1;
    public static final int MAX_TECLAS = 256;
    public static final long VINCULACION_MAX_MS = 5L * 60_000L;
    public static final long INACTIVIDAD_MIN_MS = 150L;
    public static final long INACTIVIDAD_MAX_MS = 2_000L;

    public static final String ORIGEN_VINCULADO = "vinculado";
    public static final String ORIGEN_VINCULACION = "vinculacion";

    public enum Estado { SIN_VINCULAR, CONECTADO, DESCONECTADO, AMBIGUO }

    public enum Resultado { OK, NO_CONECTADO, AMBIGUO, IDENTIDAD_INSUFICIENTE, CAMBIO }

    /** Fotografía de un InputDevice (la arma el adaptador Android). */
    public static final class Dispositivo {
        public final int id;
        public final String descriptor;
        public final int vendorId;
        public final int productId;
        public final String nombre;
        public final boolean externo;
        public final boolean virtual;
        public final boolean teclado;

        public Dispositivo(int id, String descriptor, int vendorId, int productId, String nombre,
                           boolean externo, boolean virtual, boolean teclado) {
            this.id = id;
            this.descriptor = descriptor == null ? "" : descriptor;
            this.vendorId = vendorId;
            this.productId = productId;
            this.nombre = nombre == null ? "" : nombre;
            this.externo = externo;
            this.virtual = virtual;
            this.teclado = teclado;
        }

        /** Sólo teclados físicos externos: nunca el teclado táctil (virtual) ni botones internos. */
        public boolean elegible() {
            return externo && !virtual && teclado;
        }

        boolean mismaIdentidad(int vid, int pid, String n) {
            return vendorId == vid && productId == pid && nombre.equals(n == null ? "" : n);
        }
    }

    /** Lo que se persiste al vincular. */
    public static final class Vinculo {
        public final String descriptor;
        public final int vendorId;
        public final int productId;
        public final String nombre;

        public Vinculo(String descriptor, int vendorId, int productId, String nombre) {
            this.descriptor = descriptor == null ? "" : descriptor;
            this.vendorId = vendorId;
            this.productId = productId;
            this.nombre = nombre == null ? "" : nombre;
        }

        @Override
        public boolean equals(Object o) {
            if (!(o instanceof Vinculo)) return false;
            Vinculo v = (Vinculo) o;
            return vendorId == v.vendorId && productId == v.productId && nombre.equals(v.nombre) && descriptor.equals(v.descriptor);
        }

        @Override
        public int hashCode() {
            return Objects.hash(descriptor, vendorId, productId, nombre);
        }
    }

    /** Una pulsación (sólo ACTION_DOWN), con el nombre de tecla al estilo DOM (KeyboardEvent.key). */
    public static final class Tecla {
        public final String k;
        public final long t;
        public final int r;
        public final boolean ctrl;
        public final boolean alt;
        public final boolean meta;

        public Tecla(String k, long t, int r, boolean ctrl, boolean alt, boolean meta) {
            this.k = k;
            this.t = t;
            this.r = r;
            this.ctrl = ctrl;
            this.alt = alt;
            this.meta = meta;
        }
    }

    /** Grupo de teclas entregado al JS. */
    public static final class Lote {
        public final long seq;
        public final int gen;
        public final String origen;
        public final Dispositivo dispositivo;
        public final List<Tecla> teclas;
        public final String fin;
        public final long tFin;
        public final int iguales;

        Lote(long seq, int gen, String origen, Dispositivo dispositivo, List<Tecla> teclas, String fin, long tFin, int iguales) {
            this.seq = seq;
            this.gen = gen;
            this.origen = origen;
            this.dispositivo = dispositivo;
            this.teclas = teclas;
            this.fin = fin;
            this.tFin = tFin;
            this.iguales = iguales;
        }
    }

    public static final class Resolucion {
        public final Estado estado;
        public final Dispositivo dispositivo;
        public final int iguales;

        Resolucion(Estado estado, Dispositivo dispositivo, int iguales) {
            this.estado = estado;
            this.dispositivo = dispositivo;
            this.iguales = iguales;
        }
    }

    public interface Salida {
        void lote(Lote lote);

        void estadoCambio();
    }

    private static final class Grupo {
        final Dispositivo dispositivo;
        final String origen;
        final int gen;
        final List<Tecla> teclas = new ArrayList<>();
        long ultimo;

        Grupo(Dispositivo dispositivo, String origen, int gen, long ahora) {
            this.dispositivo = dispositivo;
            this.origen = origen;
            this.gen = gen;
            this.ultimo = ahora;
        }
    }

    private final Salida salida;
    private final Map<Integer, Dispositivo> dispositivos = new LinkedHashMap<>();
    private final Map<Integer, Grupo> grupos = new LinkedHashMap<>();
    private Vinculo vinculo;
    private boolean clienteActivo;
    private boolean vinculando;
    private long vinculandoHasta;
    private int gen;
    private long seq;
    private long inactividadMs = 350L;

    public ScannerCore(Salida salida) {
        this.salida = salida;
    }

    // ------------------------------------------------------------------ estado ----

    public Vinculo getVinculo() { return vinculo; }

    public boolean isClienteActivo() { return clienteActivo; }

    public boolean isVinculando() { return vinculando; }

    public long getVinculandoHasta() { return vinculandoHasta; }

    public int getGen() { return gen; }

    public long getInactividadMs() { return inactividadMs; }

    public Dispositivo dispositivo(int id) { return dispositivos.get(id); }

    public List<Dispositivo> elegibles() {
        List<Dispositivo> out = new ArrayList<>();
        for (Dispositivo d : dispositivos.values()) if (d.elegible()) out.add(d);
        return out;
    }

    /** Cuántos dispositivos elegibles conectados comparten vendorId/productId/nombre con d. */
    public int igualesA(Dispositivo d) {
        if (d == null) return 0;
        int n = 0;
        for (Dispositivo x : dispositivos.values()) if (x.elegible() && x.mismaIdentidad(d.vendorId, d.productId, d.nombre)) n++;
        return n;
    }

    public Resolucion resolver() {
        if (vinculo == null) return new Resolucion(Estado.SIN_VINCULAR, null, 0);
        List<Dispositivo> iguales = new ArrayList<>();
        for (Dispositivo d : dispositivos.values()) {
            if (d.elegible() && d.mismaIdentidad(vinculo.vendorId, vinculo.productId, vinculo.nombre)) iguales.add(d);
        }
        if (iguales.isEmpty()) return new Resolucion(Estado.DESCONECTADO, null, 0);
        if (iguales.size() > 1) return new Resolucion(Estado.AMBIGUO, null, iguales.size());
        return new Resolucion(Estado.CONECTADO, iguales.get(0), 1);
    }

    /** Captura activa = hay cliente JS compatible, vínculo, lector inequívoco conectado y no se está vinculando. */
    public boolean capturando() {
        return clienteActivo && !vinculando && resolver().estado == Estado.CONECTADO;
    }

    // --------------------------------------------------------------- dispositivos ----

    /** Reemplaza la fotografía de dispositivos. Un lector que desaparece corta su grupo en curso. */
    public void dispositivos(List<Dispositivo> lista, long ahora) {
        Map<Integer, Dispositivo> nuevos = new LinkedHashMap<>();
        if (lista != null) for (Dispositivo d : lista) if (d != null) nuevos.put(d.id, d);
        for (Grupo g : new ArrayList<>(grupos.values())) {
            Dispositivo actual = nuevos.get(g.dispositivo.id);
            // Mismo id con otra identidad = Android reutilizó el id para OTRO dispositivo.
            if (actual == null || !actual.mismaIdentidad(g.dispositivo.vendorId, g.dispositivo.productId, g.dispositivo.nombre)) {
                cerrar(g, "desconexion", ahora);
            }
        }
        dispositivos.clear();
        dispositivos.putAll(nuevos);
        salida.estadoCambio();
    }

    // ------------------------------------------------------------------ teclas ----

    private String rol(Dispositivo d, long ahora) {
        if (d == null || !d.elegible()) return null;
        expirarVinculacion(ahora);
        if (vinculando) return ORIGEN_VINCULACION;
        if (!clienteActivo || vinculo == null) return null;
        Resolucion r = resolver();
        if (r.estado == Estado.CONECTADO && r.dispositivo.id == d.id
                && r.dispositivo.mismaIdentidad(d.vendorId, d.productId, d.nombre)) {
            return ORIGEN_VINCULADO;
        }
        return null;
    }

    /**
     * ACTION_DOWN (o ACTION_MULTIPLE ya desglosado en varias teclas).
     * @return true = consumir (no llega al WebView/IME). Las teclas de sistema (atrás, volumen,
     * encendido…) nunca se consumen.
     */
    public boolean teclaAbajo(Dispositivo d, List<Tecla> teclas, boolean sistema, long ahora) {
        String rol = rol(d, ahora);
        if (rol == null || sistema) return false;
        if (teclas == null || teclas.isEmpty()) return true;
        for (Tecla t : teclas) {
            Grupo g = grupos.get(d.id);
            if (g != null && !g.origen.equals(rol)) {
                cerrar(g, "vinculacion", ahora);
                g = null;
            }
            if (g == null) {
                g = new Grupo(d, rol, gen, t.t);
                grupos.put(d.id, g);
            }
            g.teclas.add(t);
            g.ultimo = Math.max(g.ultimo, t.t);
            if ("Enter".equals(t.k)) {
                cerrar(g, "enter", ahora);
            } else if (g.teclas.size() >= MAX_TECLAS) {
                cerrar(g, "limite", ahora);
            }
        }
        return true;
    }

    /** ACTION_UP: se consume si su dispositivo está siendo capturado; nunca se reenvía. */
    public boolean teclaArriba(Dispositivo d, boolean sistema, long ahora) {
        return !sistema && rol(d, ahora) != null;
    }

    // ------------------------------------------------------------ temporizadores ----

    /** Momento (misma base que los eventos) del siguiente corte por inactividad o fin de vinculación; -1 si ninguno. */
    public long proximoVencimiento() {
        long next = -1;
        for (Grupo g : grupos.values()) {
            long v = g.ultimo + inactividadMs;
            if (next < 0 || v < next) next = v;
        }
        if (vinculando && (next < 0 || vinculandoHasta < next)) next = vinculandoHasta;
        return next;
    }

    public void tick(long ahora) {
        for (Grupo g : new ArrayList<>(grupos.values())) {
            if (ahora >= g.ultimo + inactividadMs) cerrar(g, "tiempo", ahora);
        }
        expirarVinculacion(ahora);
    }

    private void expirarVinculacion(long ahora) {
        if (vinculando && ahora >= vinculandoHasta) {
            vinculando = false;
            cerrarTodos("vinculacion", ahora);
            salida.estadoCambio();
        }
    }

    // ------------------------------------------------------------------ cliente ----

    /** El JS compatible se registró: a partir de aquí se captura el lector vinculado. */
    public void iniciarCliente(int nuevaGen, long maxGapMs, long ahora) {
        cerrarTodos("invalidado", ahora);
        clienteActivo = true;
        gen = nuevaGen;
        configurar(maxGapMs);
        salida.estadoCambio();
    }

    /** Recarga/navegación del WebView: sin cliente JS no se captura (el lector vuelve a ser teclado). */
    public void clienteInactivo(long ahora) {
        cerrarTodos("pausa", ahora);
        clienteActivo = false;
        vinculando = false;
        salida.estadoCambio();
    }

    /** Corte de holgura = tiempo máximo entre teclas del JS + margen. El JS es quien valida los tiempos. */
    public void configurar(long maxGapMs) {
        long v = maxGapMs + 100L;
        if (v < INACTIVIDAD_MIN_MS) v = INACTIVIDAD_MIN_MS;
        if (v > INACTIVIDAD_MAX_MS) v = INACTIVIDAD_MAX_MS;
        inactividadMs = v;
    }

    /** Cambió pantalla/sesión/caja/sucursal/ajustes en el JS: los grupos en curso quedan obsoletos. */
    public void invalidar(int nuevaGen, long ahora) {
        gen = nuevaGen;
        cerrarTodos("invalidado", ahora);
    }

    public void pausa(long ahora) {
        cerrarTodos("pausa", ahora);
    }

    // --------------------------------------------------------------- vinculación ----

    public void iniciarVinculacion(long ahora, long duracionMs) {
        cerrarTodos("vinculacion", ahora);
        long d = duracionMs <= 0 ? VINCULACION_MAX_MS : Math.min(duracionMs, VINCULACION_MAX_MS);
        vinculando = true;
        vinculandoHasta = ahora + d;
        salida.estadoCambio();
    }

    public void cancelarVinculacion(long ahora) {
        boolean estaba = vinculando;
        vinculando = false;
        cerrarTodos("vinculacion", ahora);
        if (estaba) salida.estadoCambio();
    }

    /**
     * Comprueba que la identidad leída en el paso de vinculación corresponde a UN SOLO dispositivo
     * conectado. No persiste nada (lo hace el adaptador); devuelve el vínculo a guardar o el motivo.
     */
    public Object[] validarVinculo(String descriptor, int vendorId, int productId, String nombre) {
        if (vendorId == 0 && productId == 0) return new Object[] { Resultado.IDENTIDAD_INSUFICIENTE, null };
        List<Dispositivo> iguales = new ArrayList<>();
        for (Dispositivo d : dispositivos.values()) {
            if (d.elegible() && d.mismaIdentidad(vendorId, productId, nombre)) iguales.add(d);
        }
        if (iguales.isEmpty()) return new Object[] { Resultado.NO_CONECTADO, null };
        if (iguales.size() > 1) return new Object[] { Resultado.AMBIGUO, null };
        Dispositivo d = iguales.get(0);
        if (!d.descriptor.equals(descriptor == null ? "" : descriptor)) return new Object[] { Resultado.CAMBIO, null };
        return new Object[] { Resultado.OK, new Vinculo(d.descriptor, d.vendorId, d.productId, d.nombre) };
    }

    /** Llamar SÓLO después de persistir con éxito (o al cargar lo persistido). */
    public void establecerVinculo(Vinculo v, long ahora) {
        cerrarTodos("invalidado", ahora);
        vinculo = v;
        vinculando = false;
        salida.estadoCambio();
    }

    public void desvincular(long ahora) {
        cerrarTodos("invalidado", ahora);
        vinculo = null;
        salida.estadoCambio();
    }

    // ------------------------------------------------------------------ helpers ----

    private void cerrarTodos(String fin, long ahora) {
        for (Grupo g : new ArrayList<>(grupos.values())) cerrar(g, fin, ahora);
    }

    private void cerrar(Grupo g, String fin, long ahora) {
        grupos.remove(g.dispositivo.id);
        if (g.teclas.isEmpty()) return;
        seq++;
        Dispositivo actual = dispositivos.get(g.dispositivo.id);
        int iguales = igualesA(actual != null ? actual : g.dispositivo);
        salida.lote(new Lote(seq, g.gen, g.origen, g.dispositivo, Collections.unmodifiableList(new ArrayList<>(g.teclas)), fin, ahora, iguales));
    }
}
