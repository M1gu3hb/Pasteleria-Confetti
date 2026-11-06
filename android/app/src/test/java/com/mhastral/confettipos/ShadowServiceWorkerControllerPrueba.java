package com.mhastral.confettipos;

import android.webkit.ServiceWorkerClient;
import android.webkit.ServiceWorkerController;
import android.webkit.ServiceWorkerWebSettings;

import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;

/** Robolectric no trae proveedor de WebView: Capacitor sólo registra aquí su cliente de service worker. */
@Implements(ServiceWorkerController.class)
public class ShadowServiceWorkerControllerPrueba {
    private static final ServiceWorkerController INSTANCIA = new ServiceWorkerController() {
        @Override public ServiceWorkerWebSettings getServiceWorkerWebSettings() { return null; }
        @Override public void setServiceWorkerClient(ServiceWorkerClient client) {}
    };

    @Implementation
    protected static ServiceWorkerController getInstance() {
        return INSTANCIA;
    }
}
