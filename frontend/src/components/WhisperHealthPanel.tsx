import React, { useEffect, useState, useCallback } from 'react';
import { Paper, Stack, Typography, Button, Chip, LinearProgress, Alert, Box, Divider, Tooltip } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import MemoryIcon from '@mui/icons-material/Memory';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { apiService } from '../apiService';

interface HealthData {
  current_model?: string|null;
  models?: any[];
  gpu_available?: boolean;
  ffmpeg?: { found: boolean; path?: string; version?: string|null };
  versions?: { torch?: string; whisper?: string };
}

const WhisperHealthPanel: React.FC = () => {
  const [data, setData] = useState<HealthData| null>(null);
  const [loading, setLoading] = useState(false);
  const [warming, setWarming] = useState(false);
  const [msg, setMsg] = useState<string|null>(null);
  const [err, setErr] = useState<string|null>(null);

  const load = useCallback(async ()=> {
    setLoading(true); setErr(null);
    const res = await apiService.getWhisperHealth();
    if (!res.error) setData(res.data as HealthData); else setErr(res.error);
    setLoading(false);
  }, []);

  useEffect(()=>{ load(); }, [load]);

  const warm = async ()=> {
    setWarming(true); setMsg(null); setErr(null);
    const res = await apiService.warmWhisperModel();
    if (!res.error) setMsg(res.data?.message || 'Warm-up avviato / completato'); else setErr(res.error);
    setWarming(false);
  };

  return (
    <Paper variant='outlined' sx={{ p:2 }}>
      <Stack direction='row' spacing={1} alignItems='center'>
        <MemoryIcon fontSize='small' />
        <Typography variant='subtitle1' sx={{ flex:1 }}>Whisper Health</Typography>
        <Button size='small' startIcon={<RefreshIcon />} onClick={load} disabled={loading}>Refresh</Button>
        <Button size='small' startIcon={<WhatshotIcon />} onClick={warm} disabled={warming}>Warm</Button>
      </Stack>
      {loading && <LinearProgress sx={{ mt:1 }} />}
      {data && (
        <Stack spacing={1.5} sx={{ mt:1 }}>
          <Stack direction='row' spacing={1} flexWrap='wrap'>
            <Chip size='small' color='info' label={`Current: ${data.current_model || '—'}`} />
            <Chip size='small' color={data.gpu_available? 'success':'default'} icon={data.gpu_available? <CheckCircleIcon />:<WarningAmberIcon />} label={data.gpu_available? 'GPU OK':'CPU'} />
            <Tooltip title={data.ffmpeg?.path || ''}>
              <Chip size='small' color={data.ffmpeg?.found? 'success':'warning'} label={`ffmpeg: ${data.ffmpeg?.found? (data.ffmpeg?.version?.split(' ')[2] || 'ok'):'missing'}`} />
            </Tooltip>
            <Chip size='small' label={`torch ${data.versions?.torch || '?'}`} />
            <Chip size='small' label={`whisper ${data.versions?.whisper || '?'}`} />
          </Stack>
          <Divider />
          <Box sx={{ display:'grid', gap:0.8, gridTemplateColumns:'repeat(auto-fill,minmax(210px,1fr))' }}>
            {data.models?.map(m => (
              <Paper key={m.name} variant='outlined' sx={{ p:0.8, display:'flex', flexDirection:'column', gap:.4, borderColor: data.current_model===m.name? 'primary.main':'divider', backgroundColor: data.current_model===m.name? 'action.hover':'transparent' }}>
                <Stack direction='row' spacing={.5} alignItems='center'>
                  <Chip size='small' label={m.name} color={m.downloaded? 'success':'default'} />
                  {data.current_model===m.name && <CheckCircleIcon fontSize='inherit' color='primary' />}
                </Stack>
                <Typography variant='caption'>{m.size} · Acc:{m.accuracy} · Vel:{m.speed}</Typography>
                <Typography variant='caption' sx={{ opacity:.7 }}>RAM:{m.memory} Disk:{m.disk_space}</Typography>
                <LinearProgress variant='determinate' value={m.downloaded? 100: (m.download_progress || 0)} sx={{ height:4, borderRadius:1, mt:0.3 }} />
              </Paper>
            ))}
          </Box>
        </Stack>
      )}
      {msg && <Alert severity='success' onClose={()=>setMsg(null)} sx={{ mt:1 }}>{msg}</Alert>}
      {err && <Alert severity='error' onClose={()=>setErr(null)} sx={{ mt:1 }}>{err}</Alert>}
    </Paper>
  );
};

export default WhisperHealthPanel;
