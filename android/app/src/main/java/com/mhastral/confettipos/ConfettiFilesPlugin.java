package com.mhastral.confettipos;

import android.app.Activity;
import android.content.Intent;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;

/** Export only PNG/PDF through Android's user-selected document destination. */
@CapacitorPlugin(name = "ConfettiFiles")
public class ConfettiFilesPlugin extends Plugin {
    private boolean guardando = false;
    private synchronized void liberar() { guardando = false; }
    @PluginMethod
    public void guardarArchivo(PluginCall call) {
        String mime = call.getString("mime", "");
        String data = call.getString("datos", "");
        String name = call.getString("nombre", "Etiquetas-Confetti");
        if (!("application/pdf".equals(mime) || "image/png".equals(mime)) || data.isEmpty() || data.length() > 20000000) {
            call.reject("Archivo inválido o demasiado grande."); return;
        }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mime);
        intent.putExtra(Intent.EXTRA_TITLE, name.replaceAll("[^A-Za-z0-9._-]", "_"));
        synchronized (this) {
            if (guardando) { call.reject("Hay otro archivo en proceso de guardado."); return; }
            guardando = true;
        }
        try { startActivityForResult(call, intent, "archivoElegido"); }
        catch (Exception error) { liberar(); call.reject("No se pudo abrir el selector de archivos.", error); }
    }

    @ActivityCallback
    private void archivoElegido(PluginCall call, ActivityResult result) {
        if (call == null) { liberar(); return; }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            liberar(); call.reject("Guardado cancelado."); return;
        }
        final android.net.Uri uri = result.getData().getData();
        getBridge().execute(() -> {
            try (OutputStream output = getContext().getContentResolver().openOutputStream(uri, "w")) {
                if (output == null) throw new java.io.IOException("Destino no disponible.");
                byte[] bytes = Base64.decode(call.getString("datos", ""), Base64.DEFAULT);
                output.write(bytes);
            } catch (Exception error) {
                liberar(); call.reject("No se pudo guardar el archivo.", error); return;
            }
            // Only confirm success after flush/close; closing a destination can fail.
            liberar(); call.resolve(new JSObject().put("guardado", true));
        });
    }
}
