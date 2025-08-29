import React, { useEffect, useMemo, useState } from 'react';
import { Box, Card, CardContent, Chip, CircularProgress, Collapse, Divider, IconButton, InputAdornment, Menu, MenuItem, Tab, Tabs, TextField, Tooltip, Typography, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import HttpIcon from '@mui/icons-material/Http';
import SearchIcon from '@mui/icons-material/Search';
import CheckIcon from '@mui/icons-material/Check';
import FilterListIcon from '@mui/icons-material/FilterList';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

interface OpenAPISpec { paths?: Record<string, Record<string, any>>; }
interface EndpointItem { method: string; path: string; summary?: string; tags?: string[]; description?: string; requestBody?: any; responses?: any; }

const ALL_METHODS = ['GET','POST','PUT','DELETE','PATCH'];
const CACHE_KEY = 'endpoints_explorer_openapi_v1';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minuti
const FALLBACK_SPEC_PATHS = ['/openapi.json','/api/openapi.json','/docs/openapi.json'];

const groupAndSort = (items: EndpointItem[]) => [...items].sort((a,b)=> a.path===b.path ? a.method.localeCompare(b.method): a.path.localeCompare(b.path));

const EndpointsExplorer: React.FC<{ baseUrl?: string }> = ({ baseUrl }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [raw, setRaw] = useState<OpenAPISpec| null>(null);
  const [rawText, setRawText] = useState<string>('');
  const [filter, setFilter] = useState('');
  const [methodTab, setMethodTab] = useState<'ALL'|'GET'|'POST'>('GET');
  const [methodAnchor, setMethodAnchor] = useState<null | HTMLElement>(null);
  const [enabledMethods, setEnabledMethods] = useState<string[]>(['GET','POST']);
  const [copied, setCopied] = useState<string>('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const specUrl = (baseUrl?.replace(/\/$/, '') || window.location.origin);

  const fetchSpec = async (force=false) => {
    setError(null);
    setRawText('');
    const now = Date.now();
    if (!force) {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const obj = JSON.parse(cached);
          if (now - obj.time < CACHE_TTL_MS) {
            setRaw(obj.data);
            return;
          }
        }
      } catch {/* ignore cache errors */}
    }
    setLoading(true);
    try {
      let lastErr: any = null;
      for (const path of FALLBACK_SPEC_PATHS) {
        try {
          const full = specUrl + path;
          const resp = await fetch(full, { headers: { 'Accept':'application/json, */*' } });
          if (!resp.ok) { lastErr = new Error(`HTTP ${resp.status} ${path}`); continue; }
          const ct = resp.headers.get('content-type') || '';
          const text = await resp.text();
          setRawText(text.slice(0, 800));
          if (!/json/i.test(ct)) {
            // Try manual parse anyway
            try { const parsed = JSON.parse(text); setRaw(parsed); cache(parsed); return; } catch { lastErr = new Error(`Content-Type non JSON per ${path}`); continue; }
          } else {
            try { const parsed = JSON.parse(text); setRaw(parsed); cache(parsed); return; } catch (e) { lastErr = new Error(`Parse fallita ${path}: ${(e as any).message}`); continue; }
          }
        } catch (e:any) { lastErr = e; continue; }
      }
      throw lastErr || new Error('Spec non trovata');
    } catch (e:any) {
      setError(e.message || 'Errore caricamento OpenAPI');
    } finally { setLoading(false); }
  };

  const cache = (data:any) => { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ time: Date.now(), data })); } catch { /* ignore */ } };

  useEffect(() => { fetchSpec(); }, []);

  const endpoints = useMemo(() => {
    if (!raw?.paths) return [] as EndpointItem[];
    const out: EndpointItem[] = [];
    for (const p of Object.keys(raw.paths)) {
      const methods = raw.paths[p];
      for (const m of Object.keys(methods)) {
        const methodUpper = m.toUpperCase();
        if (!ALL_METHODS.includes(methodUpper)) continue;
        const meta = methods[m];
        out.push({ method: methodUpper, path: p, summary: meta.summary, tags: meta.tags, description: meta.description, requestBody: meta.requestBody, responses: meta.responses });
      }
    }
    return groupAndSort(out);
  }, [raw]);

  const visible = endpoints.filter(e => {
    if (methodTab !== 'ALL') {
      if (methodTab === 'GET' && e.method !== 'GET') return false;
      if (methodTab === 'POST' && e.method !== 'POST') return false;
    } else {
      if (!enabledMethods.includes(e.method)) return false;
    }
    if (!filter) return true;
    const f = filter.toLowerCase();
    return e.path.toLowerCase().includes(f) || (e.summary||'').toLowerCase().includes(f) || (e.description||'').toLowerCase().includes(f) || (e.tags||[]).some(t => t.toLowerCase().includes(f));
  });

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt).then(()=>{ setCopied(txt); setTimeout(()=> setCopied(''), 1500); }).catch(()=>{});
  };

  const toggleExpanded = (k: string) => setExpanded(prev => ({ ...prev, [k]: !prev[k] }));
  const toggleMethod = (m: string) => setEnabledMethods(prev => prev.includes(m) ? prev.filter(x=>x!==m) : [...prev, m]);

  const downloadJson = () => {
    if (!raw) return; const blob = new Blob([JSON.stringify(raw, null, 2)], { type:'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'openapi.json'; a.click();
  };

  return (
    <Card variant="outlined" sx={{ mb:2 }}>
      <CardContent>
        <Box sx={{ display:'flex', alignItems:'center', gap:2, flexWrap:'wrap' }}>
          <Typography variant="h6" sx={{ display:'flex', alignItems:'center', gap:1 }}><HttpIcon fontSize="small" /> Endpoint API</Typography>
          <Tabs value={methodTab} onChange={(_,v)=> setMethodTab(v)} sx={{ minHeight:36 }}>
            <Tab value="GET" label="GET" />
            <Tab value="POST" label="POST" />
            <Tab value="ALL" label="Multi" />
          </Tabs>
          {methodTab==='ALL' && (
            <>
              <IconButton size="small" onClick={(e)=> setMethodAnchor(e.currentTarget)}><FilterListIcon fontSize="small" /></IconButton>
              <Menu anchorEl={methodAnchor} open={Boolean(methodAnchor)} onClose={()=> setMethodAnchor(null)}>
                {ALL_METHODS.map(m => (
                  <MenuItem key={m} onClick={()=> toggleMethod(m)}>
                    <Chip size="small" label={m} color={enabledMethods.includes(m) ? (m==='GET' ? 'primary':'secondary') : 'default'} sx={{ mr:1 }} />
                    {enabledMethods.includes(m) ? 'On' : 'Off'}
                  </MenuItem>
                ))}
              </Menu>
            </>
          )}
          <TextField size="small" placeholder="Filtra..." value={filter} onChange={e=> setFilter(e.target.value)} InputProps={{ startAdornment:<InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          <IconButton size="small" onClick={()=> fetchSpec(true)} disabled={loading}><RefreshIcon fontSize="small" /></IconButton>
          <Tooltip title="Scarica openapi.json"><span><IconButton size="small" onClick={downloadJson} disabled={!raw}><DownloadIcon fontSize="small" /></IconButton></span></Tooltip>
          {loading && <CircularProgress size={18} />}
          {error && <Typography variant="body2" color="error">{error}</Typography>}
          <Box sx={{ flexGrow:1 }} />
          <Typography variant="caption" color="text.secondary">{visible.length} / {endpoints.length}</Typography>
        </Box>
        <Divider sx={{ my:1 }} />
        {error && rawText && (
          <Box sx={{ mb:1 }}>
            <Typography variant="caption" color="error">Snippet risposta (debug):</Typography>
            <Box component="pre" sx={{ maxHeight:120, overflow:'auto', background:'#111', color:'#eee', p:1, fontSize:11 }}>{rawText}</Box>
          </Box>
        )}
        <Box sx={{ maxHeight: 420, overflow:'auto', fontFamily:'monospace', fontSize:13 }}>
          {visible.length === 0 && !loading && (
            <Typography variant="body2" color="text.secondary">Nessun endpoint</Typography>
          )}
          {visible.map(e => {
            const key = e.method + e.path;
            const curl = `curl -X ${e.method} '${(baseUrl||window.location.origin) + e.path}'`;
            return (
              <Box key={key} sx={{ borderBottom:'1px solid rgba(0,0,0,0.06)', py:0.5 }}>
                <Box sx={{ display:'flex', alignItems:'center', gap:1 }}>
                  <Chip size="small" label={e.method} color={e.method==='GET' ? 'primary': e.method==='POST' ? 'secondary':'default'} sx={{ width:60 }} />
                  <Typography variant="body2" sx={{ fontFamily:'monospace', flexGrow:1 }}>{e.path}</Typography>
                  <Tooltip title="Copia curl">
                    <IconButton size="small" onClick={()=> copy(curl)}>
                      {copied===curl ? <CheckIcon fontSize="inherit" color="success" /> : <ContentCopyIcon fontSize="inherit" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={expanded[key] ? 'Nascondi dettagli' : 'Mostra dettagli'}>
                    <IconButton size="small" onClick={()=> toggleExpanded(key)}>
                      {expanded[key] ? <ExpandLessIcon fontSize="inherit" /> : <ExpandMoreIcon fontSize="inherit" />}
                    </IconButton>
                  </Tooltip>
                </Box>
                {e.summary && <Typography variant="caption" sx={{ ml:7 }}>{e.summary}</Typography>}
                <Collapse in={!!expanded[key]} unmountOnExit>
                  <Box sx={{ ml:7, my:0.5 }}>
                    {e.description && <Typography variant="body2" sx={{ mb:0.5 }}>{e.description}</Typography>}
                    {e.tags && e.tags.length>0 && <Box sx={{ display:'flex', gap:0.5, flexWrap:'wrap', mb:0.5 }}>{e.tags.map(t => <Chip key={t} size="small" label={t} />)}</Box>}
                    {e.requestBody && <Typography variant="caption" color="text.secondary">Body: {Object.keys(e.requestBody.content||{}).join(', ')}</Typography>}
                    {e.responses && (
                      <Box sx={{ mt:0.5 }}>
                        <Typography variant="caption" color="text.secondary">Responses: {Object.keys(e.responses).slice(0,6).join(', ')}{Object.keys(e.responses).length>6?'…':''}</Typography>
                      </Box>
                    )}
                  </Box>
                </Collapse>
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
};

export default EndpointsExplorer;
