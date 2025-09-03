import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Stack, Typography, Alert, Divider, FormControlLabel, Switch, LinearProgress, Tooltip, Chip, Snackbar } from '@mui/material';
import { CloudDownload as DownloadIcon, CloudUpload as UploadIcon, Replay as ReplayIcon, CheckCircle as CheckIcon, FilePresent as FileIcon, Warning as WarningIcon, Fingerprint as HashIcon } from '@mui/icons-material';
import { apiService } from '../apiService';

interface StatusFile { id:string; relative: string; filename: string; kind: string; required: boolean; sha256?: string; exists: boolean }

const BackupPanel: React.FC = () => {
  const [includeSeed, setIncludeSeed] = useState(false);
  const [includeAvatars, setIncludeAvatars] = useState(false);
  const [dryRunBackup, setDryRunBackup] = useState(false);
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

  const handleDownload = async () => {
    setError(null); setBackupInfo(null);
    try {
      const response = await apiService.downloadConfigBackup({ include_seed: includeSeed, include_avatars: includeAvatars, dry_run: dryRunBackup });
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

  const handleRestoreSelect = () => fileInputRef.current?.click();
  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0]; if(!f) return; setRestoring(true); setRestoreResult(null); setError(null);
    const res = await apiService.restoreConfigBackup(f, { dry_run: true, allow_seed: allowSeedRestore });
    if (res.success) { setRestoreResult(res.data); openSnack('Restore dry-run OK', 'success'); } else { setError(res.error || 'Errore restore'); openSnack('Restore dry-run errore','error'); }
    setRestoring(false);
  };

  const applyRestore = async () => {
    if(!restoreResult || !fileInputRef.current?.files?.[0]) return;
    setRestoring(true); setError(null);
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

  useEffect(()=>{
    try {
      const raw = localStorage.getItem('backupPanelPrefs');
      if(raw){
        const p = JSON.parse(raw);
        if(typeof p.includeSeed==='boolean') setIncludeSeed(p.includeSeed);
        if(typeof p.includeAvatars==='boolean') setIncludeAvatars(p.includeAvatars);
        if(typeof p.dryRunBackup==='boolean') setDryRunBackup(p.dryRunBackup);
        if(typeof p.autoRefresh==='boolean') setAutoRefresh(p.autoRefresh);
        if(typeof p.allowSeedRestore==='boolean') setAllowSeedRestore(p.allowSeedRestore);
        if(typeof p.hideMissing==='boolean') setHideMissing(p.hideMissing);
      }
    } catch {/* ignore */}
  },[]);
  useEffect(()=>{
    const prefs = { includeSeed, includeAvatars, dryRunBackup, autoRefresh, allowSeedRestore, hideMissing };
    try { localStorage.setItem('backupPanelPrefs', JSON.stringify(prefs)); } catch {/* ignore */}
  }, [includeSeed, includeAvatars, dryRunBackup, autoRefresh, allowSeedRestore, hideMissing]);

  return (
    <Box>
      <Typography variant="body2" sx={{ mb: 1 }}>
        Esegui backup e ripristino della configurazione (prompts, personalities, admin config). Usa prima il dry-run.
      </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" alignItems="center" sx={{ mb: 1 }}>
        <FormControlLabel control={<Switch size="small" checked={includeSeed} onChange={e=> setIncludeSeed(e.target.checked)} />} label="Include seed" />
        <FormControlLabel control={<Switch size="small" checked={includeAvatars} onChange={e=> setIncludeAvatars(e.target.checked)} />} label="Avatars" />
        <FormControlLabel control={<Switch size="small" checked={dryRunBackup} onChange={e=> setDryRunBackup(e.target.checked)} />} label="Dry-run" />
        <FormControlLabel control={<Switch size="small" checked={autoRefresh} onChange={e=> setAutoRefresh(e.target.checked)} />} label="Auto status" />
  <FormControlLabel control={<Switch size="small" checked={allowSeedRestore} onChange={e=> setAllowSeedRestore(e.target.checked)} />} label="Allow seed" />
  <FormControlLabel control={<Switch size="small" checked={hideMissing} onChange={e=> setHideMissing(e.target.checked)} />} label="Hide missing" />
        <Button size="small" variant="outlined" onClick={loadStatus} startIcon={<HashIcon />}>Status</Button>
        <Button size="small" variant="contained" color="primary" onClick={handleDownload} startIcon={<DownloadIcon />}>{dryRunBackup? 'Genera manifest' : 'Scarica ZIP'}</Button>
        <Button size="small" variant="outlined" color="secondary" onClick={handleRestoreSelect} startIcon={<UploadIcon />}>Restore dry-run</Button>
        <input ref={fileInputRef} type="file" accept="application/zip" style={{ display:'none' }} onChange={handleFileChange} />
        <Button size="small" disabled={!restoreResult || restoring} variant="contained" color="secondary" onClick={applyRestore} startIcon={<ReplayIcon />}>Applica restore</Button>
      </Stack>
      {loadingStatus && <LinearProgress sx={{ mb: 1 }} />}
      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
      {status && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary">Aggregate hash:</Typography>
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
                    <Button size="small" onClick={()=>copyList(missingRequired)} sx={{ mt:0.5 }} variant="text">Copia mancanti obbligatori</Button>
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
      {backupInfo && (
        <Box sx={{ mb:2 }}>
          <Divider sx={{ my:1 }} />
          <Typography variant="subtitle2">Manifest dry-run</Typography>
          <Box component="pre" sx={{ maxHeight:200, overflow:'auto', bgcolor:'background.paper', p:1, fontSize:12 }}>
            {JSON.stringify(backupInfo.manifest || backupInfo, null, 2)}
          </Box>
        </Box>
      )}
      {restoreResult && (
        <Box sx={{ mb:2 }}>
          <Divider sx={{ my:1 }} />
          <Typography variant="subtitle2">Risultato restore</Typography>
          <Alert severity={restoreResult.validation_errors && restoreResult.validation_errors.length ? 'warning':'success'} sx={{ mb:1 }}>
            Applied: {restoreResult.applied_count} | Skipped: {restoreResult.skipped_count}
          </Alert>
          {restoreResult.validation_errors && restoreResult.validation_errors.length > 0 && (
            <Box component="ul" sx={{ pl:3, fontSize:12, mt:0 }}>
              {restoreResult.validation_errors.map((e:string,i:number)=>(<li key={i}>{e}</li>))}
            </Box>
          )}
          {restoring && <LinearProgress />}
        </Box>
      )}
      {snack && <Snackbar open autoHideDuration={2000} onClose={()=> setSnack(null)} anchorOrigin={{ vertical:'bottom', horizontal:'right' }}>
        <Alert onClose={()=> setSnack(null)} severity={snack.sev} variant="filled" sx={{ fontSize:12, py:0.5 }}>
          {snack.msg}
        </Alert>
      </Snackbar>}
    </Box>
  );
};

export default BackupPanel;
