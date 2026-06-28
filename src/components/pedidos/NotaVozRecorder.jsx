import React, { useRef, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Mic, Square, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const SR = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition)
  : null;

/**
 * NotaVozRecorder — Fase 4.
 *
 * Graba audio (MediaRecorder) y, en paralelo, lo transcribe en vivo con la Web
 * Speech API (SpeechRecognition, es-MX). Al detener, sube el audio al bucket
 * `notas-voz` (Supabase Storage) y emite { audioUrl, transcript } al padre.
 *
 * Degradación: si el navegador no soporta SpeechRecognition, igual graba y sube
 * el audio; el transcript queda editable a mano por el padre. Si no soporta
 * grabación, lo avisa y no rompe (la nota se escribe a mano).
 *
 * CONTROLADO: el padre es dueño de audioUrl + transcript.
 *
 * Props:
 *  - audioUrl: string  (URL del audio actual)
 *  - transcript: string
 *  - onChange({ audioUrl, transcript })
 *  - disabled
 */
export default function NotaVozRecorder({ audioUrl = '', transcript = '', onChange, disabled = false }) {
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const finalRef = useRef(transcript || '');

  const soportaGrabacion = typeof navigator !== 'undefined'
    && navigator.mediaDevices && typeof window !== 'undefined' && !!window.MediaRecorder;
  const soportaTranscripcion = !!SR;

  // Limpieza al desmontar: corta micrófono, reconocimiento y timer.
  useEffect(() => () => {
    try { mediaRef.current?.stream?.getTracks?.().forEach(t => t.stop()); } catch (_) {}
    try { recognitionRef.current?.stop?.(); } catch (_) {}
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const iniciar = async () => {
    if (disabled || recording || uploading) return;
    if (!soportaGrabacion) { toast.error('Este navegador no permite grabar audio.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = onStop;
      mediaRef.current = mr;
      finalRef.current = transcript || '';
      mr.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);

      if (soportaTranscripcion) {
        const rec = new SR();
        rec.lang = 'es-MX';
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (ev) => {
          let interim = '';
          for (let i = ev.resultIndex; i < ev.results.length; i++) {
            const r = ev.results[i];
            if (r.isFinal) finalRef.current = (finalRef.current + ' ' + r[0].transcript).trim();
            else interim += r[0].transcript;
          }
          onChange?.({ audioUrl, transcript: (finalRef.current + ' ' + interim).trim() });
        };
        rec.onerror = () => { /* no romper la grabación por un error de dictado */ };
        try { rec.start(); recognitionRef.current = rec; } catch (_) {}
      }
    } catch (err) {
      console.error('[NotaVoz] getUserMedia:', err);
      toast.error('No se pudo acceder al micrófono. Revisa los permisos del navegador.');
    }
  };

  const detener = () => {
    if (!recording) return;
    try { mediaRef.current?.stop(); } catch (_) {}
    try { recognitionRef.current?.stop(); } catch (_) {}
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
  };

  const onStop = async () => {
    const stream = mediaRef.current?.stream;
    try { stream?.getTracks?.().forEach((t) => t.stop()); } catch (_) {}
    const tipo = chunksRef.current[0]?.type || 'audio/webm';
    const blob = new Blob(chunksRef.current, { type: tipo });
    chunksRef.current = [];
    if (!blob || blob.size === 0) { toast.error('No se capturó audio.'); return; }
    setUploading(true);
    try {
      const ext = tipo.includes('ogg') ? 'ogg' : tipo.includes('mp4') ? 'mp4' : 'webm';
      const file = new File([blob], `nota-voz-${Date.now()}.${ext}`, { type: tipo });
      const res = await base44.integrations.Core.UploadFile({ file, bucket: 'notas-voz' });
      const url = res?.file_url || '';
      if (!url) throw new Error('Sin URL');
      onChange?.({ audioUrl: url, transcript: finalRef.current || transcript || '' });
      toast.success('Nota de voz guardada');
    } catch (err) {
      console.error('[NotaVoz] upload:', err);
      toast.error('No se pudo subir la nota de voz. Intenta de nuevo.');
    } finally {
      setUploading(false);
    }
  };

  const quitar = () => {
    if (disabled || recording || uploading) return;
    onChange?.({ audioUrl: '', transcript: '' });
  };

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {!recording ? (
          <Button
            type="button" variant="outline" size="sm" onClick={iniciar}
            disabled={disabled || uploading || !soportaGrabacion}
            className="gap-1.5"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
            {uploading ? 'Subiendo…' : (audioUrl ? 'Regrabar' : 'Grabar nota de voz')}
          </Button>
        ) : (
          <Button type="button" variant="destructive" size="sm" onClick={detener} className="gap-1.5">
            <Square className="w-4 h-4" /> Detener · {fmt(elapsed)}
          </Button>
        )}

        {audioUrl && !recording && (
          <>
            <audio controls src={audioUrl} className="h-9 max-w-[220px]" />
            <Button
              type="button" variant="ghost" size="sm" onClick={quitar}
              disabled={disabled || uploading} className="text-red-600 gap-1"
              title="Quitar nota de voz"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </>
        )}
      </div>

      {recording && (
        <p className="text-[11px] text-rose-600 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
          Grabando… {soportaTranscripcion ? 'transcribiendo en vivo' : '(sin transcripción automática en este navegador — escribe la nota a mano)'}
        </p>
      )}
      {!soportaGrabacion && (
        <p className="text-[11px] text-muted-foreground">
          Este navegador no permite grabar audio; escribe la nota a mano.
        </p>
      )}
    </div>
  );
}
