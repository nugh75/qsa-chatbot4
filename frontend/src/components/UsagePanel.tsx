import React, { useEffect, useState, useCallback } from 'react';
import { Paper, Stack, Typography, Button, LinearProgress, Alert, Divider, Box, FormControl, InputLabel, Select, MenuItem, TextField, IconButton, Tooltip, Table, TableHead, TableRow, TableCell, TableBody, Chip, Pagination } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import DeleteIcon from '@mui/icons-material/Delete';
import GroupWorkIcon from '@mui/icons-material/GroupWork';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import { apiService } from '../apiService';

interface InteractionItem {
  request_id?: string;
  provider?: string; provider_header?: string;
  model?: string; personality_id?: string; personality_name?: string;
  duration_ms?: number; tokens?: { total_tokens?: number; total?: number };
  tokens_total?: number; // grouped
  start_ts?: string; end_ts?: string; ts?: string; // depending grouped/ungrouped
  events?: string[]; topic?: string; rag_used?: boolean;
}

const pageSize = 50; // for grouped pagination local; backend uses offset/limit

const UsagePanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState<string>('');
  const [filters, setFilters] = useState<{ providers: string[]; models: string[]; personalities: {id:string; name:string}[] }>({ providers: [], models: [], personalities: [] });
  const [provider, setProvider] = useState('');
  const [model, setModel] = useState('');
  const [personality, setPersonality] = useState('');
  const [q, setQ] = useState('');
  const [grouped, setGrouped] = useState(true);
  const [items, setItems] = useState<InteractionItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [opMsg, setOpMsg] = useState<string|null>(null);

  const loadDatesAndFilters = useCallback(async(selectedDate?: string) => {
    try {
      const [dRes, fRes] = await Promise.all([
        apiService.getInteractionDates(),
        apiService.getInteractionFilters(selectedDate)
      ]);
      if (dRes.success) setDates(dRes.data!.dates);
      if (fRes.success) {
        const d = fRes.data!;
        setFilters({ providers: d.providers, models: d.models, personalities: d.personalities });
      }
    } catch(e:any){ setError(e.message); }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const offset = (page-1)*pageSize;
      const params: any = { limit: pageSize, offset, group_by_request_id: grouped };
      if (date) params.date = date;
      if (provider) params.provider = provider;
      if (model) params.model = model;
      if (personality) params.personality_id = personality;
      const res = await apiService.getInteractions(params);
      if (!res.success) throw new Error(res.error||'Errore load interactions');
      setItems(res.data!.items);
      setTotal(res.data!.total);
    } catch(e:any){ setError(e.message); } finally { setLoading(false); }
  }, [date, provider, model, personality, page, grouped]);

  useEffect(()=> { loadDatesAndFilters(date); }, [loadDatesAndFilters, date]);
  useEffect(()=> { loadData(); }, [loadData]);

  const handleReset = () => {
    setProvider(''); setModel(''); setPersonality(''); setPage(1); setGrouped(true); setQ('');
  };

  const exportCsv = async () => {
    try {
      const params: any = { group_by_request_id: grouped };
      if (date) params.date = date;
      if (provider) params.provider = provider;
      if (model) params.model = model;
      if (personality) params.personality_id = personality;
      const res = await apiService.getInteractions({ ...params, limit: 10000, offset:0 });
      if (!res.success) throw new Error(res.error||'Errore export');
      const rows = res.data!.items;
      const csvLines = [ 'ts,provider,model,personality,duration_ms,tokens_total,events' ];
      rows.forEach(r => {
        const ts = r.end_ts || r.ts || r.start_ts || '';
        const prov = r.provider || r.provider_header || '';
        const tok = (r.tokens_total || r.tokens?.total_tokens || r.tokens?.total || '');
        const ev = (r.events||[]).join('|');
        csvLines.push([ts, prov, r.model||'', r.personality_name||'', r.duration_ms||'', tok, ev].map(v => String(v).replace(/,/g,';')).join(','));
      });
      const blob = new Blob([csvLines.join('\n')], { type:'text/csv' });
      const url = URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download='usage_detailed.csv'; a.click(); URL.revokeObjectURL(url);
    } catch(e:any){ setOpMsg(e.message); }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <Paper variant='outlined' sx={{ p:2 }}>
      <Stack direction='row' spacing={1} alignItems='center' flexWrap='wrap' sx={{ mb:1 }}>
        <Typography variant='subtitle1' sx={{ flex:1 }}>Interazioni LLM dettagliate</Typography>
        <Tooltip title={grouped? 'Vista eventi singoli':'Raggruppa per richiesta'}>
          <IconButton size='small' onClick={()=> { setGrouped(g=> !g); setPage(1); }}>
            {grouped? <FormatListBulletedIcon fontSize='small'/> : <GroupWorkIcon fontSize='small'/>}
          </IconButton>
        </Tooltip>
        <Button size='small' startIcon={<RefreshIcon />} onClick={()=> loadData()} disabled={loading}>Refresh</Button>
        <Button size='small' startIcon={<DownloadIcon />} onClick={exportCsv}>Export</Button>
        <Button size='small' color='warning' onClick={handleReset}>Reset filtri</Button>
      </Stack>
      {error && <Alert severity='error' onClose={()=> setError(null)} sx={{ mb:1 }}>{error}</Alert>}
      {loading && <LinearProgress sx={{ mb:1 }} />}
      <Stack direction='row' spacing={1} flexWrap='wrap' sx={{ mb:1 }}>
        <FormControl size='small' sx={{ minWidth:140 }}>
          <InputLabel>Data</InputLabel>
          <Select label='Data' value={date} onChange={e=> { setDate(e.target.value); setPage(1); }}>
            <MenuItem value=''><em>Ultima</em></MenuItem>
            {dates.map(d=> <MenuItem key={d} value={d}>{d}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size='small' sx={{ minWidth:140 }}>
          <InputLabel>Provider</InputLabel>
          <Select label='Provider' value={provider} onChange={e=> { setProvider(e.target.value); setPage(1); }}>
            <MenuItem value=''><em>All</em></MenuItem>
            {filters.providers.map(p=> <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size='small' sx={{ minWidth:140 }}>
          <InputLabel>Modello</InputLabel>
          <Select label='Modello' value={model} onChange={e=> { setModel(e.target.value); setPage(1); }}>
            <MenuItem value=''><em>All</em></MenuItem>
            {filters.models.map(m=> <MenuItem key={m} value={m}>{m}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size='small' sx={{ minWidth:160 }}>
          <InputLabel>Personalità</InputLabel>
          <Select label='Personalità' value={personality} onChange={e=> { setPersonality(e.target.value); setPage(1); }}>
            <MenuItem value=''><em>All</em></MenuItem>
            {filters.personalities.map(p=> <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField size='small' label='Search (client)' value={q} onChange={e=> setQ(e.target.value)} sx={{ minWidth:180 }} />
      </Stack>
      <Divider sx={{ mb:1 }} />
      <Box sx={{ maxHeight:420, overflow:'auto', border: '1px solid', borderColor:'divider', borderRadius:1 }}>
        <Table size='small' stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>TS</TableCell>
              <TableCell>Provider</TableCell>
              <TableCell>Model</TableCell>
              <TableCell>Personality</TableCell>
              <TableCell>Dur (ms)</TableCell>
              <TableCell>Tokens</TableCell>
              <TableCell>RAG</TableCell>
              <TableCell>Events</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.filter(it => {
              if (!q) return true;
              const blob = JSON.stringify(it).toLowerCase();
              return blob.includes(q.toLowerCase());
            }).map((r,idx) => {
              const ts = r.end_ts || r.ts || r.start_ts || '';
              const tok = r.tokens_total || r.tokens?.total_tokens || r.tokens?.total || '';
              const prov = r.provider || r.provider_header || '';
              return (
                <TableRow key={idx} hover>
                  <TableCell>{ts?.replace('T',' ').replace('Z','')}</TableCell>
                  <TableCell>{prov}</TableCell>
                  <TableCell>{r.model || '-'}</TableCell>
                  <TableCell>{r.personality_name || r.personality_id || '-'}</TableCell>
                  <TableCell>{r.duration_ms ?? '-'}</TableCell>
                  <TableCell>{tok}</TableCell>
                  <TableCell>{r.rag_used ? <Chip size='small' color='success' label='Yes'/> : ''}</TableCell>
                  <TableCell>{(r.events||[]).slice(0,3).join(',')}</TableCell>
                </TableRow>
              );
            })}
            {items.length===0 && !loading && <TableRow><TableCell colSpan={8}><Typography variant='body2' color='text.secondary'>Nessun dato</Typography></TableCell></TableRow>}
          </TableBody>
        </Table>
      </Box>
      <Stack direction='row' alignItems='center' justifyContent='space-between' sx={{ mt:1 }}>
        <Typography variant='caption'>Totale: {total}</Typography>
        <Pagination size='small' count={totalPages} page={page} onChange={(_,v)=> setPage(v)} />
      </Stack>
      {opMsg && <Alert severity='info' sx={{ mt:1 }} onClose={()=> setOpMsg(null)}>{opMsg}</Alert>}
    </Paper>
  );
};

export default UsagePanel;
