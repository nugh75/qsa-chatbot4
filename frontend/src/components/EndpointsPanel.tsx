import React, { useEffect, useState, useMemo } from 'react';
import { apiService } from '../apiService';
import { Box, Card, CardContent, Typography, TextField, Chip, Stack, Table, TableHead, TableRow, TableCell, TableBody, LinearProgress, Alert, ToggleButton, ToggleButtonGroup } from '@mui/material';

interface EndpointItem { method: string; path: string; name?: string; summary?: string; }

const methodColors: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'> = {
  GET: 'success',
  POST: 'primary'
};

const EndpointsPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [endpoints, setEndpoints] = useState<EndpointItem[]>([]);
  const [filter, setFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState<string|'ALL'>('ALL');

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true); setError(null);
      const res = await apiService.listEndpoints();
      if (mounted) {
        if (res.success) setEndpoints(res.data?.endpoints || []); else setError(res.error || 'Errore caricamento endpoints');
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    return endpoints.filter(ep => {
      if (methodFilter !== 'ALL' && ep.method !== methodFilter) return false;
      if (!filter) return true;
      const f = filter.toLowerCase();
      return ep.path.toLowerCase().includes(f) || (ep.name||'').toLowerCase().includes(f) || (ep.summary||'').toLowerCase().includes(f);
    });
  }, [endpoints, filter, methodFilter]);

  return (
    <Stack spacing={2}>
      {loading && <LinearProgress />}
      {error && <Alert severity="error" onClose={()=> setError(null)}>{error}</Alert>}
      <Card>
        <CardContent>
          <Stack direction={{ xs:'column', sm:'row' }} spacing={2} alignItems={{ xs:'stretch', sm:'center' }} sx={{ mb:2 }}>
            <TextField label="Filtro" size="small" value={filter} onChange={e=> setFilter(e.target.value)} fullWidth />
            <ToggleButtonGroup value={methodFilter} exclusive size="small" onChange={(_,v)=> v && setMethodFilter(v)}>
              <ToggleButton value="ALL">ALL</ToggleButton>
              <ToggleButton value="GET">GET</ToggleButton>
              <ToggleButton value="POST">POST</ToggleButton>
            </ToggleButtonGroup>
            <Chip label={`${filtered.length}/${endpoints.length}`} />
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell width={80}>Metodo</TableCell>
                <TableCell>Path</TableCell>
                <TableCell>Nome</TableCell>
                <TableCell>Summary</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map(ep => (
                <TableRow key={ep.method+ep.path}>
                  <TableCell>
                    <Chip label={ep.method} color={methodColors[ep.method]||'default'} size="small" />
                  </TableCell>
                  <TableCell><code>{ep.path}</code></TableCell>
                  <TableCell>{ep.name||'-'}</TableCell>
                  <TableCell>{ep.summary||''}</TableCell>
                </TableRow>
              ))}
              {filtered.length===0 && (
                <TableRow><TableCell colSpan={4}><Typography variant="body2" color="text.secondary">Nessun endpoint trovato</Typography></TableCell></TableRow>
              )}
            </TableBody>
          </Table>
          <Box sx={{ mt:2 }}>
            <Typography variant="caption" color="text.secondary">Elenco generato dinamicamente dall'endpoint /admin/endpoints (solo GET/POST).</Typography>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
};

export default EndpointsPanel;
