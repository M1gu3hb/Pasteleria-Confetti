package com.mhastral.confettipos;

import android.hardware.input.InputManager;
import android.os.Handler;
import android.view.InputDevice;

import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.annotation.Resetter;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Lista de dispositivos de entrada controlada por la prueba. El shadow por defecto de Robolectric
 * 4.14 asume ids 0..n-1 (SparseArray.get(i)); un lector reconectado recibe otro id arbitrario.
 */
@Implements(InputManager.class)
public class ShadowInputManagerPrueba {
    static final Map<Integer, InputDevice> DISPOSITIVOS = new LinkedHashMap<>();

    @Implementation
    protected int[] getInputDeviceIds() {
        int[] ids = new int[DISPOSITIVOS.size()];
        int i = 0;
        for (int id : DISPOSITIVOS.keySet()) ids[i++] = id;
        return ids;
    }

    @Implementation
    protected InputDevice getInputDevice(int id) {
        return DISPOSITIVOS.get(id);
    }

    @Implementation
    protected void registerInputDeviceListener(InputManager.InputDeviceListener listener, Handler handler) {}

    @Implementation
    protected void unregisterInputDeviceListener(InputManager.InputDeviceListener listener) {}

    @Resetter
    public static void reset() {
        DISPOSITIVOS.clear();
    }
}
