import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, Typography, Alert, Divider, FormControlLabel, Switch, LinearProgress, Tooltip, Chip, Snackbar, Paper, TextField, Autocomplete } from '@mui/material';
import { CloudDownload as DownloadIcon, CloudUpload as UploadIcon, Replay as ReplayIcon, CheckCircle as CheckIcon, Warning as WarningIcon, Fingerprint as HashIcon } from '@mui/icons-material';
import { apiService } from '../apiService';

interface StatusFile { id:string; relative: string; filename: string; kind: string; required: boolean; sha256?: string; exists: boolean }

const BackupPanel: React.FC = () => {
  // Basic backup/restore state
  const [includeSeed, setIncludeSeed] = useState(false);
  const [includeAvatars, setIncludeAvatars] = useState(false);
  const [dryRunBackup, setDryRunBackup] = useState(false);
  const [includeDb, setIncludeDb] = useState(true);
  const [status, setStatus] = useState<{files: StatusFile[]; aggregate_sha256: string} | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [backupInfo, setBackupInfo] = useState<any|null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreResult, setRestoreResult] = useState<any|null>(null);
  const fileInputRef = useRef<HTMLInputElement|null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [allowSeedRestore, setAllowSeedRestore] = useState(false);
  const [copyOk, setCopyOk] = useState(false);
  const [snack, setSnack] = useState<{msg:string; sev:'success'|'error'|'info'}|null>(null);
  const [hideMissing, setHideMissing] = useState(false);
  // Advanced import states
  const [useAdvanced, setUseAdvanced] = useState(true);
  const [advPreview, setAdvPreview] = useState<any|null>(null);
  const [advDecisions, setAdvDecisions] = useState<any>({});
  const [advImportId, setAdvImportId] = useState<string|null>(null);
  // DB dump options
  const [dbTables, setDbTables] = useState<string>('');
  const [dbTableOptions, setDbTableOptions] = useState<string[]>([]);
  const [dbSelectedTables, setDbSelectedTables] = useState<string[]>([]);
  // file selection mode ref to avoid async state race
  const pendingModeRef = useRef<'advanced'|'simple'|null>(null);

  const loadStatus = useCallback(async() => {
    setLoadingStatus(true); setError(null);
    const res = await apiService.getConfigStatus();
    if (res.success) setStatus(res.data as any);
    else setError(res.error || 'Errore status');
    setLoadingStatus(false);
  }, []);

  useEffect(()=>{ loadStatus(); }, [loadStatus]);
  useEffect(()=>{
    if(!autoRefresh) return; const id = setInterval(loadStatus, 8000); return ()=> clearInterval(id);
  }, [autoRefresh, loadStatus]);

  // Load preferences once
  useEffect(()=>{
    try {
      const raw = localStorage.getItem('backupPanelPrefs');
      if(raw){
        const p = JSON.parse(raw);
        if(typeof p.includeSeed==='boolean') setIncludeSeed(p.includeSeed);
        if(typeof p.includeAvatars==='boolean') setIncludeAvatars(p.includeAvatars);
        if(typeof p.dryRunBackup==='boolean') setDryRunBackup(p.dryRunBackup);
        if(typeof p.includeDb==='boolean') setIncludeDb(p.includeDb);
        if(typeof p.autoRefresh==='boolean') setAutoRefresh(p.autoRefresh);
        if(typeof p.allowSeedRestore==='boolean') setAllowSeedRestore(p.allowSeedRestore);
        if(typeof p.hideMissing==='boolean') setHideMissing(p.hideMissing);
        if(typeof p.useAdvanced==='boolean') setUseAdvanced(p.useAdvanced);
        if (typeof p.dbTables === 'string') setDbTables(p.dbTables);
        if (Array.isArray(p.dbSelectedTables)) setDbSelectedTables(p.dbSelectedTables.filter((s:string)=>!!s));
      }
    } catch {/* ignore */}
  }, []);

  // Fetch DB tables options once
  useEffect(()=>{
    (async ()=>{
      try {
        const res = await apiService.listDbTables();
        if (res.success && Array.isArray(res.data?.tables)) setDbTableOptions(res.data.tables);
      } catch {/* ignore */}
    })();
  }, []);

  // Persist preferences
  useEffect(()=>{
    const p = { includeSeed, includeAvatars, dryRunBackup, includeDb, autoRefresh, allowSeedRestore, hideMissing, useAdvanced, dbTables, dbSelectedTables };
    try { localStorage.setItem('backupPanelPrefs', JSON.stringify(p)); } catch {/* ignore */}
  }, [includeSeed, includeAvatars, dryRunBackup, includeDb, autoRefresh, allowSeedRestore, hideMissing, useAdvanced, dbTables, dbSelectedTables]);

  const handleDownload = async () => {
    setError(null); setBackupInfo(null);
    try {
      const response = await apiService.downloadConfigBackup({ include_seed: includeSeed, include_avatars: includeAvatars, include_db: includeDb, dry_run: dryRunBackup });
      const ct = response.headers.get('content-type') || '';
      if (dryRunBackup || !ct.includes('zip')) {
        // try json first
        const txt = await response.text();
        try {
          const data = JSON.parse(txt);
          setBackupInfo(data);
          if (!response.ok) setError(data.detail || data.error || 'Errore');
        } catch {
          setError('Risposta non valida: ' + txt.slice(0,200));
        }
        return;
      }
      if (!response.ok) {
        setError('Errore HTTP ' + response.status);
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `config-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.zip`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e:any){
      setError(e?.message || 'Errore rete');
    }
  };

  const handleDbDumpDownload = async () => {
    setError(null);
    try {
      const tables = (dbSelectedTables && dbSelectedTables.length)
        ? dbSelectedTables
        : (dbTables.trim() ? dbTables.split(',').map(s=>s.trim()).filter(Boolean) : undefined);
      const response = await apiService.downloadDbDump(tables);
      const ct = response.headers.get('content-type') || '';
      if (!response.ok) {
        // try to parse error text/json
        const txt = await response.text();
        try { const j = JSON.parse(txt); setError(j.detail || j.error || `Errore HTTP ${response.status}`); }
        catch { setError(txt || `Errore HTTP ${response.status}`); }
        return;
      }
      if (!ct.includes('zip')) {
        const txt = await response.text();
        setError('Risposta non valida: ' + txt.slice(0,200));
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `db-dump-${new Date().toISOString().replace(/[:.]/g,'-')}.zip`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e:any) {
      setError(e?.message || 'Errore rete');
    }
  };

  const handleRestoreSelect = () => fileInputRef.current?.click();
  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0]; if(!f) return; setRestoring(true); setRestoreResult(null); setError(null);
    const mode = pendingModeRef.current || (useAdvanced ? 'advanced' : 'simple');
    pendingModeRef.current = null;
    if (mode === 'advanced') {
      const res = await apiService.backupImportPreview(f);
      if (res.success) {
        setAdvPreview(res.data);
        setAdvImportId((res.data as any).import_id || null);
        initDecisions(res.data);
        openSnack('Anteprima import pronta', 'success');
      } else {
        setError(res.error || 'Errore anteprima import');
        openSnack('Errore anteprima','error');
      }
    } else {
      const res = await apiService.restoreConfigBackup(f, { dry_run: true, allow_seed: allowSeedRestore });
      if (res.success) { setRestoreResult(res.data); openSnack('Restore dry-run OK', 'success'); } else { setError(res.error || 'Errore restore'); openSnack('Restore dry-run errore','error'); }
    }
    setRestoring(false);
  };

  const applyRestore = async () => {
    setError(null);
    if (useAdvanced) {
      if (!advImportId) { setError('Nessuna anteprima pronta'); return; }
      setRestoring(true);
      const res = await apiService.backupImportApply(advImportId, advDecisions);
      if (res.success) {
        openSnack('Import applicato','success');
        try { await apiService.backupImportDelete(advImportId); } catch {/* ignore */}
        setAdvPreview(null); setAdvImportId(null);
        loadStatus();
      } else {
        setError(res.error || 'Errore applicazione import');
        openSnack('Import fallito','error');
      }
      setRestoring(false);
      return;
    }
    if(!restoreResult || !fileInputRef.current?.files?.[0]) return;
    setRestoring(true);
    const f = fileInputRef.current.files[0];
    const res = await apiService.restoreConfigBackup(f, { dry_run: false, allow_seed: allowSeedRestore });
    if(res.success) { setRestoreResult(res.data); loadStatus(); openSnack('Restore applicato','success'); }
    else { setError(res.error || 'Errore applicazione restore'); openSnack('Restore fallito','error'); }
    setRestoring(false);
  };

  const selectAdvanced = () => { pendingModeRef.current = 'advanced'; fileInputRef.current?.click(); };
  const selectSimple = () => { pendingModeRef.current = 'simple'; fileInputRef.current?.click(); };
  const applyAdvanced = async () => {
    if (!advImportId) { setError('Nessuna anteprima pronta'); return; }
    setError(null); setRestoring(true);
    const res = await apiService.backupImportApply(advImportId, advDecisions);
    if (res.success) {
      openSnack('Import applicato','success');
      try { await apiService.backupImportDelete(advImportId); } catch {/* ignore */}
      setAdvPreview(null); setAdvImportId(null);
      loadStatus();
    } else {
      setError(res.error || 'Errore applicazione import');
      openSnack('Import fallito','error');
    }
    setRestoring(false);
  };
  const cancelAdvanced = async () => {
    if (advImportId) {
      try { await apiService.backupImportDelete(advImportId); } catch {/* ignore */}
    }
    setAdvPreview(null); setAdvImportId(null);
  };
  const applySimple = async () => {
    if(!restoreResult || !fileInputRef.current?.files?.[0]) { setError('Seleziona prima un file e fai il dry-run'); return; }
    setError(null); setRestoring(true);
    const f = fileInputRef.current.files[0];
    const res = await apiService.restoreConfigBackup(f, { dry_run: false, allow_seed: allowSeedRestore });
    if(res.success) { setRestoreResult(res.data); loadStatus(); openSnack('Restore applicato','success'); }
    else { setError(res.error || 'Errore applicazione restore'); openSnack('Restore fallito','error'); }
    setRestoring(false);
  };

  const handleCopyHash = async () => {
    if(!status) return; try { await navigator.clipboard.writeText(status.aggregate_sha256); setCopyOk(true); setTimeout(()=> setCopyOk(false), 1500);} catch {/* ignore */}
  };

  const openSnack = (msg:string, sev:'success'|'error'|'info'='info')=> setSnack({msg, sev});

  // Initialize advanced decisions from preview (defaults: apply all adds+updates)
  const initDecisions = (preview: any) => {
    const d: any = {};
    try {
      const c = preview.conflicts || {};
      const ids = (arr: any[]) => (arr||[]).map((x:any)=> x?.id || x?.incoming?.id).filter(Boolean);
      // system prompts
      const sp_add = ids(c.system_prompts?.add);
      const sp_upd = ids(c.system_prompts?.update);
      d.system_prompts = { apply_ids: Array.from(new Set([...sp_add, ...sp_upd])), use_incoming_active: false };
      // summary prompts
      const su_add = ids(c.summary_prompts?.add);
      const su_upd = ids(c.summary_prompts?.update);
      d.summary_prompts = { apply_ids: Array.from(new Set([...su_add, ...su_upd])), use_incoming_active: false };
      // welcome / guides
      const w_add = ids(c.welcome_guides?.welcome?.add);
      const w_upd = ids(c.welcome_guides?.welcome?.update);
      d.welcome = { apply_ids: Array.from(new Set([...w_add, ...w_upd])), use_incoming_active: false };
      const g_add = ids(c.welcome_guides?.guides?.add);
      const g_upd = ids(c.welcome_guides?.guides?.update);
      d.guides = { apply_ids: Array.from(new Set([...g_add, ...g_upd])), use_incoming_active: false };
      // personalities
      const p_add = ids(c.personalities?.add);
      const p_upd = ids(c.personalities?.update);
      d.personalities = { apply_ids: Array.from(new Set([...p_add, ...p_upd])) };
    } catch {/* ignore */}
    setAdvDecisions(d);
  };

  const toggleId = (section: 'system_prompts'|'summary_prompts'|'welcome'|'guides'|'personalities', id: string) => {
    setAdvDecisions((prev: any) => {
      const next = { ...(prev||{}) };
      const sec = { ...(next[section]||{}) };
      const arr: string[] = Array.isArray(sec.apply_ids) ? [...sec.apply_ids] : [];
      const idx = arr.indexOf(id);
      if (idx >= 0) arr.splice(idx,1); else arr.push(id);
      sec.apply_ids = arr;
      next[section] = sec;
      return next;
    });
  };

  const toggleUseIncomingActive = (section: 'system_prompts'|'summary_prompts'|'welcome'|'guides', val: boolean) => {
    setAdvDecisions((prev:any) => ({ ...(prev||{}), [section]: { ...(prev?.[section]||{}), use_incoming_active: !!val } }));
  };

  return (
    <Box>
      <Typography variant="h6" sx={{ mb: 1 }}>
        Backup e Ripristino Configurazione
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {/* Guida rapida (step-by-step) */}
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Guida rapida</Typography>
        <Typography variant="body2" component="div">
          <ol style={{ marginTop: 0, marginBottom: 8, paddingLeft: 18 }}>
            <li><strong>Backup configurazione</strong>: scegli le opzioni (Seed, Avatars, DB, Dry-run) e clicca {`"`}{dryRunBackup ? 'Genera manifest' : 'Scarica ZIP'}{`"`}. Il Dry-run mostra un manifest senza scaricare.</li>
            <li><strong>Dump solo DB</strong>: opzionalmente indica le tabelle (es. users,personalities) e clicca "Scarica dump DB".</li>
            <li><strong>Verifica stato</strong>: consulta lo <em>Stato file</em> per hash aggregato e file mancanti/presenti.</li>
            <li><strong>Ripristino avanzato (consigliato)</strong>: clicca "Seleziona ZIP per anteprima", esamina conflitti, seleziona cosa applicare e poi "Applica import".</li>
            <li><strong>Ripristino semplice (compatibilità)</strong>: abilita "Permetti seed" solo se vuoi sovrascrivere i seed, seleziona ZIP per il dry-run, poi "Applica ripristino".</li>
          </ol>
          Opzioni:
          <ul style={{ marginTop: 0, marginBottom: 0 }}>
            <li><strong>Includi seed</strong>: include file seed di sola lettura nel backup (in genere non serve).</li>
            <li><strong>Includi avatars</strong>: aggiunge gli avatar al backup (aumenta la dimensione).</li>
            <li><strong>Includi DB</strong>: include i dati DB di personalità ecc. nel backup configurazione.</li>
            <li><strong>Backup dry-run</strong>: genera un manifest JSON invece dello ZIP (per verifica rapida).</li>
            <li><strong>Permetti seed</strong>: nel ripristino semplice consente di ripristinare anche i seed (attenzione a sovrascritture).</li>
          </ul>
        </Typography>
      </Alert>

      {/* Backup configurazione (ZIP) */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Backup configurazione (ZIP)</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Comprende: prompts di sistema e di riassunto, messaggi di benvenuto e guide (file JSON runtime) e personalità dal database. Opzionalmente include seed e avatars.
        </Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center" sx={{ mb: 1 }}>
          <FormControlLabel control={<Switch size="small" checked={includeSeed} onChange={e=> setIncludeSeed(e.target.checked)} />} label="Includi seed" />
          <FormControlLabel control={<Switch size="small" checked={includeAvatars} onChange={e=> setIncludeAvatars(e.target.checked)} />} label="Includi avatars" />
          <FormControlLabel control={<Switch size="small" checked={includeDb} onChange={e=> setIncludeDb(e.target.checked)} />} label="Includi DB" />
          <FormControlLabel control={<Switch size="small" checked={dryRunBackup} onChange={e=> setDryRunBackup(e.target.checked)} />} label="Backup dry-run" />
          <Button size="small" variant="contained" color="primary" onClick={handleDownload} startIcon={<DownloadIcon />}>{dryRunBackup? 'Genera manifest' : 'Scarica ZIP'}</Button>
        </Stack>
        {backupInfo && (
          <Box>
            <Typography variant="subtitle2">Manifest (prova)</Typography>
            <Box component="pre" sx={{ maxHeight:200, overflow:'auto', bgcolor:'background.paper', p:1, fontSize:12 }}>
              {JSON.stringify(backupInfo.manifest || backupInfo, null, 2)}
            </Box>
          </Box>
        )}
      </Paper>

      {/* Dump Database (solo Postgres) */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Dump Database (solo Postgres)</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Scarica un archivio con il dump del database. Facoltativamente, limita alle tabelle indicate (separate da virgola).
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1, flexWrap:'wrap' }}>
          <Autocomplete
            multiple
            freeSolo
            options={dbTableOptions}
            value={dbSelectedTables}
            onChange={(_, val)=> setDbSelectedTables((val||[]).filter(Boolean))}
            renderInput={(params) => (
              <TextField {...params} size="small" placeholder="Seleziona o scrivi tabelle (invio per aggiungere)" sx={{ minWidth: 360 }} />
            )}
            sx={{ minWidth: 360, mr: 1 }}
          />
          <TextField size="small" value={dbTables} onChange={e=> setDbTables(e.target.value)} placeholder="oppure: users,personalities" sx={{ minWidth: 260 }} />
          <Button size="small" variant="outlined" color="primary" onClick={handleDbDumpDownload} startIcon={<DownloadIcon />}>Scarica dump DB</Button>
        </Stack>
      </Paper>

      {/* Stato file e integrità */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Stato file e integrità</Typography>
        <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center" sx={{ mb: 1 }}>
          <FormControlLabel control={<Switch size="small" checked={autoRefresh} onChange={e=> setAutoRefresh(e.target.checked)} />} label="Aggiorna stato auto" />
          <FormControlLabel control={<Switch size="small" checked={hideMissing} onChange={e=> setHideMissing(e.target.checked)} />} label="Nascondi mancanti" />
          <Button size="small" variant="outlined" onClick={loadStatus} startIcon={<HashIcon />}>Aggiorna stato</Button>
        </Stack>
        {loadingStatus && <LinearProgress sx={{ mb: 1 }} />}
        {status && (
          <Box>
            <Typography variant="caption" color="text.secondary">Hash aggregato:</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:0.5 }}>
              <Typography variant="body2" sx={{ fontFamily:'monospace', wordBreak:'break-all', flex:1 }}>{status.aggregate_sha256}</Typography>
              <Button size="small" onClick={handleCopyHash} variant="outlined">{copyOk? 'Copiato':'Copia'}</Button>
            </Stack>
            {(()=>{
              const existing = status.files.filter(f=>f.exists);
              const missingRequired = status.files.filter(f=>!f.exists && f.required);
              const missingOptional = status.files.filter(f=>!f.exists && !f.required);
              const copyList = async (items: StatusFile[]) => {
                try { await navigator.clipboard.writeText(items.map(i=>i.filename).join('\n')); openSnack('Copiato','success'); } catch {/* ignore */}
              };
              return (
                <Box>
                  <Typography variant="caption" sx={{ fontWeight:600 }}>File presenti ({existing.length})</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt:0.5, mb:1 }}>
                    {existing.filter(f=>!hideMissing || f.exists).map(f=> (
                      <Tooltip key={f.id} title={`${f.filename} | ${f.kind}${f.sha256? '\n'+f.sha256:''}`}> 
                        <Chip size="small" icon={<CheckIcon color="success"/>} label={f.filename} variant="outlined" />
                      </Tooltip>
                    ))}
                  </Stack>
                  <Button size="small" onClick={()=>copyList(existing)} sx={{ mb:1 }} variant="text">Copia lista presenti</Button>
                  {missingRequired.length>0 && (
                    <Box sx={{ mb:1 }}>
                      <Typography variant="caption" sx={{ fontWeight:600, color:'error.main' }}>File mancanti obbligatori ({missingRequired.length})</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt:0.5 }}>
                        {missingRequired.map(f=> (
                          <Tooltip key={f.id} title={`${f.filename} | ${f.kind}`}> 
                            <Chip size="small" icon={<WarningIcon color="warning"/>} label={f.filename} color="warning" variant="filled" />
                          </Tooltip>
                        ))}
                      </Stack>
                      <Button size="small" onClick={()=>copyList(missingRequired)} sx={{ mt:0.5 }} variant="text">Copia obbligatori mancanti</Button>
                    </Box>
                  )}
                  {missingOptional.length>0 && (
                    <Box sx={{ mb:1 }}>
                      <Typography variant="caption" sx={{ fontWeight:600 }}>File mancanti opzionali ({missingOptional.length})</Typography>
                      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt:0.5 }}>
                        {missingOptional.map(f=> (
                          <Tooltip key={f.id} title={`${f.filename} | opzionale`}> 
                            <Chip size="small" icon={<WarningIcon color="warning"/>} label={f.filename} color="warning" variant="outlined" />
                          </Tooltip>
                        ))}
                      </Stack>
                      <Button size="small" onClick={()=>copyList(missingOptional)} sx={{ mt:0.5 }} variant="text">Copia mancanti opzionali</Button>
                    </Box>
                  )}
                </Box>
              );
            })()}
            <Stack direction="row" spacing={2} sx={{ mt:1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <CheckIcon color="success" sx={{ fontSize:18 }} />
                <Typography variant="caption">Presente</Typography>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center">
                <WarningIcon color="warning" sx={{ fontSize:18 }} />
                <Typography variant="caption">Mancante / Opzionale</Typography>
              </Stack>
            </Stack>
          </Box>
        )}
      </Paper>

      {/* Import avanzato (consigliato) */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Import avanzato (consigliato)</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Permette l'anteprima, la risoluzione dei conflitti e la scelta dettagliata di cosa importare. Non modifica nulla finché non clicchi "Applica import".
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
          <Button size="small" variant="outlined" color="secondary" onClick={selectAdvanced} startIcon={<UploadIcon />}>Seleziona ZIP per anteprima</Button>
          <input ref={fileInputRef} type="file" accept="application/zip" style={{ display:'none' }} onChange={handleFileChange} />
          <Button size="small" disabled={!advPreview || restoring} variant="contained" color="secondary" onClick={applyAdvanced} startIcon={<ReplayIcon />}>Applica import</Button>
          {advPreview && <Button size="small" variant="text" onClick={cancelAdvanced}>Annulla anteprima</Button>}
        </Stack>
        {restoring && <LinearProgress sx={{ mb: 1 }} />}
        {advPreview && (
          <Box>
            <Typography variant="body2" sx={{ mb:1 }}>Import ID: {advImportId}</Typography>
            <Paper variant="outlined" sx={{ p:1 }}>
              {/* System prompts */}
              <SectionChooser title="Prompts di sistema" items={advPreview.conflicts?.system_prompts} decisions={advDecisions.system_prompts} onToggle={(id:string)=> toggleId('system_prompts', id)} onToggleActive={(v:boolean)=> toggleUseIncomingActive('system_prompts', v)} />
              {/* Summary prompts */}
              <SectionChooser title="Prompts di riassunto" items={advPreview.conflicts?.summary_prompts} decisions={advDecisions.summary_prompts} onToggle={(id:string)=> toggleId('summary_prompts', id)} onToggleActive={(v:boolean)=> toggleUseIncomingActive('summary_prompts', v)} />
              {/* Welcome */}
              <SectionChooser title="Messaggi di benvenuto" items={advPreview.conflicts?.welcome_guides?.welcome} decisions={advDecisions.welcome} onToggle={(id:string)=> toggleId('welcome', id)} onToggleActive={(v:boolean)=> toggleUseIncomingActive('welcome', v)} />
              {/* Guides */}
              <SectionChooser title="Guide" items={advPreview.conflicts?.welcome_guides?.guides} decisions={advDecisions.guides} onToggle={(id:string)=> toggleId('guides', id)} onToggleActive={(v:boolean)=> toggleUseIncomingActive('guides', v)} />
              {/* Personalities */}
              <SectionChooser title="Personalità" items={advPreview.conflicts?.personalities} decisions={advDecisions.personalities} onToggle={(id:string)=> toggleId('personalities', id)} hideActive />
            </Paper>
          </Box>
        )}
      </Paper>

      {/* Ripristino semplice (compatibilità) */}
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ mb: 1 }}>Ripristino semplice (compatibilità)</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Esegue un ripristino diretto del pacchetto. Esegui prima il dry-run per verificare cosa verrebbe applicato. Usa "Permetti seed" solo se vuoi ripristinare anche i file seed (può sovrascrivere valori predefiniti).
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 1 }}>
          <FormControlLabel control={<Switch size="small" checked={allowSeedRestore} onChange={e=> setAllowSeedRestore(e.target.checked)} />} label="Permetti seed" />
          <Button size="small" variant="outlined" color="secondary" onClick={selectSimple} startIcon={<UploadIcon />}>Seleziona ZIP per ripristino dry-run</Button>
          <Button size="small" disabled={!restoreResult || restoring} variant="contained" color="secondary" onClick={applySimple} startIcon={<ReplayIcon />}>Applica ripristino</Button>
        </Stack>
        {restoreResult && (
          <Box>
            <Typography variant="subtitle2">Risultato dry-run</Typography>
            <Alert severity={restoreResult.validation_errors && restoreResult.validation_errors.length ? 'warning':'success'} sx={{ mb:1 }}>
              Applied: {restoreResult.applied_count} | Skipped: {restoreResult.skipped_count}
            </Alert>
            {restoreResult.validation_errors && restoreResult.validation_errors.length > 0 && (
              <Box component="ul" sx={{ pl:3, fontSize:12, mt:0 }}>
                {restoreResult.validation_errors.map((e:string,i:number)=>(<li key={i}>{e}</li>))}
              </Box>
            )}
          </Box>
        )}
      </Paper>

      {snack && <Snackbar open autoHideDuration={2000} onClose={()=> setSnack(null)} anchorOrigin={{ vertical:'bottom', horizontal:'right' }}>
        <Alert onClose={()=> setSnack(null)} severity={snack.sev} variant="filled" sx={{ fontSize:12, py:0.5 }}>
          {snack.msg}
        </Alert>
      </Snackbar>}
    </Box>
  );
};

// Inline helper component for conflict selection
type SectionChooserProps = {
  title: string;
  items: any;
  decisions: any;
  onToggle: (id: string) => void;
  onToggleActive?: (v: boolean) => void;
  hideActive?: boolean;
};

const SectionChooser = ({ title, items, decisions, onToggle, onToggleActive, hideActive }: SectionChooserProps) => {
  const ids = (arr: any[]) => (arr || []).map((x: any) => x?.id || x?.incoming?.id).filter(Boolean);
  const add = ids(items?.add);
  const upd = ids(items?.update);
  const miss = ids(items?.missing_in_incoming);
  const activeCurrent = items?.active_current;
  const activeIncoming = items?.active_incoming;
  const selected: string[] = Array.isArray(decisions?.apply_ids) ? decisions.apply_ids : [];
  const toggle = (id: string) => onToggle(id);
  return (
    <Box sx={{ mb: 1.5 }}>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>{title}</Typography>
        {!hideActive && (
          <FormControlLabel control={<Switch size="small" checked={!!decisions?.use_incoming_active} onChange={e => onToggleActive && onToggleActive(e.target.checked)} />} label="Usa active dell'import" />
        )}
      </Stack>
      {!hideActive && (activeCurrent !== undefined || activeIncoming !== undefined) && (
        <Typography variant="caption" color="text.secondary" sx={{ display:'block', mb:0.5 }}>
          Attivo corrente: <strong>{String(activeCurrent ?? '—')}</strong> | Attivo nell'import: <strong>{String(activeIncoming ?? '—')}</strong>
        </Typography>
      )}
      <Typography variant="caption">Aggiunte ({add.length})</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
        {add.map(id => (
          <Chip key={`add-${id}`} size="small" color={selected.includes(id) ? 'success' : 'default'} label={id} onClick={() => toggle(id)} />
        ))}
      </Stack>
      <Typography variant="caption">Aggiornamenti ({upd.length})</Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 0.5 }}>
        {upd.map(id => (
          <Chip key={`upd-${id}`} size="small" color={selected.includes(id) ? 'success' : 'default'} label={id} onClick={() => toggle(id)} />
        ))}
      </Stack>
      {miss.length > 0 && (
        <>
          <Typography variant="caption" color="text.secondary">Mancanti nell'import ({miss.length})</Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {miss.map((id: string) => (<Chip key={`miss-${id}`} size="small" variant="outlined" color="warning" label={id} />))}
          </Stack>
        </>
      )}
    </Box>
  );
};

export default BackupPanel;
