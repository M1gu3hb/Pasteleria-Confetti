package com.mhastral.confettipos;

import android.content.Context;
import android.util.AttributeSet;
import android.view.KeyEvent;

import com.getcapacitor.CapacitorWebView;

/**
 * El mismo WebView de Capacitor, con un único añadido: ofrecer cada tecla al lector nativo
 * ANTES del IME (etapa "pre-IME" de Android). Así, aunque un teclado en pantalla esté conectado
 * a un campo enfocado, una lectura del lector vinculado no puede escribirse en él.
 *
 * Se usa por el layout capacitor_bridge_layout_main.xml de la app (sustituye al de la librería
 * con el mismo id @id/webview). Si el lector no reclama la tecla, el comportamiento es idéntico
 * al de CapacitorWebView.
 */
public class ConfettiWebView extends CapacitorWebView {

    public ConfettiWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    public boolean dispatchKeyEventPreIme(KeyEvent event) {
        if (ConfettiScannerPlugin.interceptar(event)) return true;
        return super.dispatchKeyEventPreIme(event);
    }
}
