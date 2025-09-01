import React, { useEffect, useState } from 'react';
import { Box, Card, CardHeader, CardContent, Button, Select, MenuItem, FormControl, InputLabel, LinearProgress, Typography, Chip, Stack } from '@mui/material';
import ragApiService from '../services/ragApiService';

interface ModelInfo {
  name: string;
  display_name?: string;
  description?: string;
  dimension?: number;
}

interface ActiveConfig {
  provider_type: string;
  model_name: string;
  dimension?: number;
  runtime?: any;
}

interface DownloadTask {
  id: string;
  model_name: string;
  status: string;
  progress: number;
  error?: string;
}

const EmbeddingModelSelector: React.FC = () => {
  const [models, setModels] = useState<string[]>([]);
  const [active, setActive] = useState<ActiveConfig | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [changing, setChanging] = useState(false);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);
  const [downloadTaskId, setDownloadTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [cfg, list, t] = await Promise.all([
        ragApiService.getEmbeddingConfig(),
        ragApiService.listEmbeddingModels(),
        ragApiService.embeddingDownloadTasks()
      ]);
      if (cfg.success) setActive(cfg.config);
      if (list.success) {
        setModels(list.models);
        setSelected(list.active?.model_name || list.models[0] || '');
      }
      if (t.success) setTasks(t.tasks);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Poll download task progress
  useEffect(() => {
    if (!downloadTaskId) return;
    const intId = setInterval(async () => {
      try {
        const st = await ragApiService.embeddingDownloadStatus(downloadTaskId);
        if (st.success) {
          const task = st.task;
            setTasks(prev => prev.map(t => t.id === task.id ? task : t));
            if (task.status === 'completed' || task.status === 'failed') {
              if (task.status === 'completed') setSuccess('Download completato');
              if (task.status === 'failed') setError(task.error || 'Download fallito');
              setDownloadTaskId(null);
              loadData();
            }
        }
      } catch (e) {
        setDownloadTaskId(null);
      }
    }, 1200);
    return () => clearInterval(intId);
  }, [downloadTaskId]);

  const handleChangeModel = async () => {
    try {
      setChanging(true);
      const res = await ragApiService.selectEmbeddingModel('local', selected);
      if (res.success) {
        setSuccess('Modello selezionato');
        loadData();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setChanging(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await ragApiService.startEmbeddingDownload(selected);
      if (res.success) {
        setDownloadTaskId(res.task_id);
        setTasks(prev => [...prev, { id: res.task_id, model_name: selected, status: 'pending', progress: 0 }]);
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <Card variant="outlined">
      <CardHeader title="Embedding Model" subheader="Seleziona e scarica il modello di embedding" />
      <CardContent>
        {loading && <LinearProgress sx={{ mb:2 }} />}
        {error && <Typography color="error" variant="body2" sx={{ mb:1 }}>{error}</Typography>}
        {success && <Typography color="success.main" variant="body2" sx={{ mb:1 }}>{success}</Typography>}
        <FormControl fullWidth size="small" sx={{ mb:2 }}>
          <InputLabel id="embedding-model-select-label">Modello</InputLabel>
          <Select labelId="embedding-model-select-label" label="Modello" value={selected} onChange={e => setSelected(e.target.value)}>
            {models.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </Select>
        </FormControl>
        {active && (
          <Box sx={{ mb:2 }}>
            <Typography variant="body2">Attivo: <strong>{active.model_name}</strong></Typography>
            {active.dimension && <Chip size="small" color="primary" label={`${active.dimension}D`} sx={{ mt:1 }} />}
            {active.runtime?.loaded === false && <Typography variant="caption" color="text.secondary" display="block">(non ancora caricato in memoria)</Typography>}
          </Box>
        )}
        <Stack direction="row" spacing={2} sx={{ mb:2 }}>
          <Button variant="contained" size="small" disabled={!selected || changing} onClick={handleChangeModel}>Applica</Button>
          <Button variant="outlined" size="small" disabled={!selected || !!downloadTaskId} onClick={handleDownload}>Download / Warm</Button>
          <Button variant="text" size="small" onClick={loadData}>Refresh</Button>
        </Stack>
        {tasks.length > 0 && (
          <Box>
            {tasks.slice().reverse().map(t => (
              <Box key={t.id} sx={{ mb:1, p:1, border: '1px solid', borderColor: 'divider', borderRadius:1 }}>
                <Typography variant="caption">Task {t.id} – {t.model_name} – {t.status}</Typography>
                <LinearProgress variant="determinate" value={t.progress} sx={{ height:6, borderRadius:1, mt:0.5 }} />
              </Box>
            ))}
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default EmbeddingModelSelector;
