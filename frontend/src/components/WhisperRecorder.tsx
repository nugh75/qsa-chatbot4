import React, { useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, LinearProgress, Typography, Alert } from '@mui/material';
import StopIcon from '@mui/icons-material/Stop';
import MicIcon from '@mui/icons-material/Mic';
import UploadIcon from '@mui/icons-material/Upload';
import { apiService } from '../apiService';
import VoiceRecordingAnimation from './VoiceRecordingAnimation';

interface WhisperRecorderProps {
  model?: string | null;
  onTranscription?: (text: string) => void;
}

// Parametri VAD semplici (RMS soglia)
const RMS_WINDOW = 1024;
const SILENCE_THRESHOLD = 0.02; // livello relativo
const SILENCE_DURATION_MS = 1500; // auto-stop dopo questo silenzio

const WhisperRecorder: React.FC<WhisperRecorderProps> = ({ model, onTranscription }) => {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [transcript, setTranscript] = useState<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const lastVoiceTsRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number| null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const start = async () => {
    setError(null); setTranscript('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;
      lastVoiceTsRef.current = performance.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        sendAudio();
      };
      mediaRecorder.start();
      setRecording(true);
      loopVAD();
    } catch (e:any) {
      setError(e?.message || 'Errore avvio microfono');
    }
  };

  const loopVAD = () => {
    if (!analyserRef.current) return;
    const analyser = analyserRef.current;
    const buffer = new Float32Array(RMS_WINDOW);
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i=0;i<buffer.length;i++) sum += buffer[i]*buffer[i];
    const rms = Math.sqrt(sum / buffer.length);
    const now = performance.now();
    if (rms > SILENCE_THRESHOLD) {
      lastVoiceTsRef.current = now;
    } else {
      if (now - lastVoiceTsRef.current > SILENCE_DURATION_MS && recording) {
        stop();
        return;
      }
    }
    rafRef.current = requestAnimationFrame(loopVAD);
  };

  const stop = () => {
    if (!recording) return;
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const sendAudio = async () => {
    if (!audioChunksRef.current.length) return;
    setProcessing(true);
    try {
      const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const file = new File([blob], 'recording.webm', { type: 'audio/webm' });
      const res = await apiService.transcribeAudio(file, model || undefined);
      if (!res.error) {
        setTranscript(res.data?.text || '');
        onTranscription?.(res.data?.text || '');
      } else setError(res.error);
    } catch (e:any) {
      setError(e?.message || 'Errore trascrizione');
    } finally { setProcessing(false); }
  };

  useEffect(()=> () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); audioCtxRef.current?.close().catch(()=>{}); }, []);

  return (
    <Box>
      <Stack direction='row' spacing={1} alignItems='center'>
        {!recording && <Button size='small' variant='contained' startIcon={<MicIcon />} onClick={start} disabled={processing}>Rec</Button>}
        {recording && <Button size='small' color='error' variant='contained' startIcon={<StopIcon />} onClick={stop}>Stop</Button>}
        {processing && <LinearProgress sx={{ flex:1 }} />}
        <VoiceRecordingAnimation isRecording={recording} size={24} />
      </Stack>
      {error && <Alert severity='error' onClose={()=>setError(null)} sx={{ mt:1 }}>{error}</Alert>}
      {transcript && (
        <Box sx={{ mt:1 }}>
          <Typography variant='caption' sx={{ fontWeight:600 }}>Risultato:</Typography>
          <Typography variant='body2'>{transcript}</Typography>
        </Box>
      )}
    </Box>
  );
};

export default WhisperRecorder;
