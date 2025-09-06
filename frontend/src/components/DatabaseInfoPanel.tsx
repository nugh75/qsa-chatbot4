import React, { useEffect, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, IconButton, LinearProgress, List, ListItem, ListItemIcon, ListItemText, Stack, Tooltip, Typography, Divider, Switch, FormControlLabel, FormControl, InputLabel, Select, MenuItem, TextField, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, Snackbar, Grid } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import StorageIcon from '@mui/icons-material/Storage';
import RefreshIcon from '@mui/icons-material/Refresh';
import TableChartIcon from '@mui/icons-material/TableChart';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import NumbersIcon from '@mui/icons-material/Numbers';
import { apiService } from '../apiService';

interface LegacyDbInfo { engine: string; tables: string[] }
interface NewTableInfo { name: string; rows: number|null }
interface NewDbInfo { engine: string; version?: string|null; tables: (NewTableInfo|string)[]; critical_missing?: string[]; attached?: any[]; total_rows?: number; total_size_bytes?: number|null; elapsed_ms?: number; include_sizes?: boolean }
type DbInfoState = LegacyDbInfo | NewDbInfo;

const DatabaseInfoPanel: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [info, setInfo] = useState<DbInfoState|null>(null);
  const [withSizes, setWithSizes] = useState(false);
  const [order, setOrder] = useState<'name'|'rows'|'size'>('name');
  const [forceRefreshFlag, setForceRefreshFlag] = useState(false);
  const [selectedTable, setSelectedTable] = useState<string>('');
  const [sampleCols, setSampleCols] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<any[]>([]);
  const [colMeta, setColMeta] = useState<{ name:string; type:string; is_nullable:boolean; is_primary:boolean }[]>([])
  const pkCols = React.useMemo(()=> colMeta.filter(c=>c.is_primary).map(c=>c.name), [colMeta])
  const [editingRow, setEditingRow] = useState<number|null>(null)
  const [editValues, setEditValues] = useState<Record<string, any>>({})
  // Excel-style per-cell editing
  const [editingCell, setEditingCell] = useState<{ rowIndex: number; col: string }|null>(null)
  const [editCellValue, setEditCellValue] = useState<string>('')
  const [sqlText, setSqlText] = useState<string>('SELECT id, name, is_default FROM personalities ORDER BY name');
  const [exampleKey, setExampleKey] = useState<string>('');
  const [sqlCols, setSqlCols] = useState<string[]>([]);
  const [sqlRows, setSqlRows] = useState<any[]>([]);
  const [sqlLoading, setSqlLoading] = useState<boolean>(false);
  const [sqlError, setSqlError] = useState<string|null>(null);
  const [searchQ, setSearchQ] = useState<string>('');
  const [searchCols, setSearchCols] = useState<string[]>([]);
  const [searchRows, setSearchRows] = useState<any[]>([]);

  // --- Query Builder (simple UI) ---
  const [qbTable, setQbTable] = useState<string>('');
  const [qbMode, setQbMode] = useState<'rows'|'agg'>('rows');
  const [qbSelect, setQbSelect] = useState<string>('');
  const [qbFilters, setQbFilters] = useState<{ column: string; op: string; value?: string }[]>([]);
  const [qbOrderBy, setQbOrderBy] = useState<string>('');
  const [qbOrderDir, setQbOrderDir] = useState<'ASC'|'DESC'>('DESC');
  const [qbLimit, setQbLimit] = useState<number>(50);
  const [qbCols, setQbCols] = useState<string[]>([]);
  const [qbRows, setQbRows] = useState<any[]>([]);
  const [qbError, setQbError] = useState<string|undefined>();
  const [qbColsForTable, setQbColsForTable] = useState<string[]>([]);
  const exportQbCsv = () => {
    if (!qbCols.length) return;
    const esc = (v: any) => {
      if (v === null || v === undefined) return '';
      let s = typeof v === 'string' ? v : JSON.stringify(v);
      // Normalize newlines and escape quotes
      s = s.replace(/\r?\n/g, '\n').replace(/"/g, '""');
      // Wrap if contains separators or quotes
      if (/[",\n]/.test(s)) return '"' + s + '"';
      return s;
    };
    const lines: string[] = [];
    lines.push(qbCols.map(esc).join(','));
    qbRows.forEach(r => {
      const row = qbCols.map(c => esc((r && typeof r === 'object') ? r[c] : ''));
      lines.push(row.join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const fname = qbTable ? `query_${qbTable}.csv` : 'query.csv';
    a.download = fname;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!qbTable) { setQbColsForTable([]); return }
    (async () => {
      const r = await apiService.getTableColumns(qbTable)
      if (r.success && Array.isArray(r.data)) {
        setQbColsForTable((r.data as any[]).map(c => c.name))
      } else setQbColsForTable([])
    })()
  }, [qbTable])

  const addFilter = () => {
    if (!qbTable) return
    setQbFilters(f => [...f, { column: qbColsForTable[0] || 'id', op: 'contains', value: '' }])
  }
  const removeFilter = (idx: number) => setQbFilters(f => f.filter((_,i)=> i!==idx))
  const runQb = async () => {
    setQbError(undefined)
    setQbCols([]); setQbRows([])
    if (!qbTable) { setQbError('Seleziona una tabella'); return }
    try {
      const payload: any = { table: qbTable, limit: qbLimit }
      if (qbMode === 'rows') {
        if (qbSelect.trim()) payload.select = qbSelect.split(',').map(s=> s.trim()).filter(Boolean)
      } else {
        // basic aggregation: group by selected columns; one metric count(*)
        if (qbSelect.trim()) payload.group_by = qbSelect.split(',').map(s=> s.trim()).filter(Boolean)
        payload.metrics = [{ fn: 'count', alias: 'count' }]
      }
      if (qbFilters.length) payload.filters = qbFilters.map(f => ({ column: f.column, op: f.op, value: f.value }))
      if (qbOrderBy) payload.order_by = { by: qbOrderBy, dir: qbOrderDir }
      const r = await apiService.dbQueryBuilder(payload)
      if (r.success && r.data) {
        setQbCols(r.data.columns || [])
        setQbRows(r.data.rows || [])
      } else setQbError(r.error || 'Errore esecuzione')
    } catch (e:any) {
      setQbError(e?.message || 'Errore esecuzione')
    }
  }

  const load = async (sizes = withSizes, ord = order, force = false) => {
    setLoading(true); setError(null);
    const res = await apiService.getDatabaseInfo(sizes, { order: ord, forceRefresh: force });
    if (res.success && res.data) {
      // FastAPI route returns { engine: string, tables: [...] }
      setInfo(res.data as any);
    } else {
      setError(res.error || 'Errore caricamento database info');
    }
    setLoading(false);
  };

  useEffect(() => { load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withSizes, order, forceRefreshFlag]);

  const isPostgres = /postgres/i.test(info?.engine || '');
  const isSQLite = /sqlite/i.test(info?.engine || '');

  const asNew = ((): NewDbInfo | null => {
    if (!info) return null;
    if ((info as any).tables && (info as any).tables.length && typeof (info as any).tables[0] === 'object') return info as NewDbInfo;
    // legacy -> convert array<string>
    if (Array.isArray((info as any).tables)) {
      return { engine: info.engine, tables: (info as any).tables.map((t:string)=> ({ name: t, rows: null })) } as NewDbInfo;
    }
    return null;
  })();

  const tableList: NewTableInfo[] = asNew ? (asNew.tables.map(t => typeof t === 'string' ? { name: t, rows: null } : t) as NewTableInfo[]) : [];
  const missing = asNew?.critical_missing || [];
  const version = asNew?.version;

  const loadSample = async (table: string) => {
    try {
      setSelectedTable(table);
      const r = await apiService.sampleTable(table, 50);
      if (r.success && r.data) {
        setSampleCols(r.data.columns || []);
        setSampleRows(r.data.rows || []);
      }
      const c = await apiService.getTableColumns(table)
      if (c.success && c.data) setColMeta(c.data as any)
    } catch {}
  };

  const runSearch = async () => {
    if (!selectedTable || !searchQ.trim()) return;
    const r = await apiService.dbSearch(selectedTable, searchQ.trim(), 50);
    if (r.success && r.data) {
      setSearchCols(r.data.columns || []);
      setSearchRows(r.data.rows || []);
    }
  };

  const startEdit = (rowIndex: number) => {
    setEditingRow(rowIndex)
    setEditValues({ ...sampleRows[rowIndex] })
  }
  const cancelEdit = () => { setEditingRow(null); setEditValues({}) }
  const startEditCell = (rowIndex: number, col: string) => {
    const row = sampleRows[rowIndex] || {}
    setEditingCell({ rowIndex, col })
    setEditCellValue(String(row[col] ?? ''))
  }
  const cancelEditCell = () => { setEditingCell(null); setEditCellValue('') }
  const commitEditCell = async () => {
    if (!editingCell || !selectedTable) return
    const { rowIndex, col } = editingCell
    const row = sampleRows[rowIndex]
    // Build key from PKs or id
    let key: Record<string, any> = {}
    if (pkCols.length) pkCols.forEach(pk => { key[pk] = row[pk] })
    else if (row.id !== undefined) key = { id: row.id }
    else { setSqlError('Impossibile determinare PK per update'); return }
    const set: Record<string, any> = { [col]: editCellValue }
    const r = await apiService.dbUpdate(selectedTable, key, set)
    if (r.success) {
      const next = [...sampleRows]
      next[rowIndex] = { ...row, [col]: editCellValue }
      setSampleRows(next)
      cancelEditCell()
    } else {
      setSqlError(r.error || 'Update cella fallito')
    }
  }
  const saveRow = async () => {
    if (editingRow === null || !selectedTable) return
    // Build key from primary keys or fallback to 'id'
    let key: Record<string, any> = {}
    if (pkCols.length) {
      pkCols.forEach(pk => { key[pk] = sampleRows[editingRow][pk] })
    } else if (sampleRows[editingRow].id !== undefined) {
      key = { id: sampleRows[editingRow].id }
    } else {
      setSqlError('Impossibile determinare la chiave primaria per l\'update')
      return
    }
    // Compute changed fields
    const original = sampleRows[editingRow]
    const set: Record<string, any> = {}
    sampleCols.forEach(c => {
      if (editValues[c] !== original[c]) set[c] = editValues[c]
    })
    if (Object.keys(set).length === 0) { cancelEdit(); return }
    const r = await apiService.dbUpdate(selectedTable, key, set)
    if (r.success) {
      const next = [...sampleRows]
      next[editingRow] = { ...original, ...set }
      setSampleRows(next)
      cancelEdit()
    } else {
      setSqlError(r.error || 'Update fallito')
    }
  }

  const runQuery = async () => {
    setSqlLoading(true); setSqlError(null);
    try {
      const r = await apiService.runDbQuery(sqlText, 100);
      if (r.success && r.data) {
        setSqlCols(r.data.columns || []);
        setSqlRows(r.data.rows || []);
      } else {
        setSqlError(r.error || 'Errore esecuzione query');
      }
    } catch (e:any) {
      setSqlError(e?.message || 'Errore esecuzione query');
    }
    setSqlLoading(false);
  };

  const exampleQueries: { key: string; label: string; sql: string }[] = [
    { key: 'pers', label: 'Personalities (name + default)', sql: 'SELECT id, name, is_default FROM personalities ORDER BY name' },
    { key: 'users', label: 'Users (email + last_login)', sql: 'SELECT id, email, last_login, is_active FROM users ORDER BY created_at DESC LIMIT 50' },
    { key: 'conv', label: 'Conversations (counts)', sql: 'SELECT id, user_id, message_count, updated_at FROM conversations ORDER BY updated_at DESC LIMIT 50' },
    { key: 'rag_docs', label: 'RAG Documents (latest)', sql: 'SELECT id, group_id, filename, chunk_count, created_at FROM rag_documents ORDER BY created_at DESC LIMIT 50' },
    { key: 'rag_chunks', label: 'RAG Chunks (sample)', sql: 'SELECT id, document_id, group_id, chunk_index FROM rag_chunks ORDER BY id LIMIT 50' },
    { key: 'sync', label: 'Device Sync Log (recent)', sql: "SELECT id, device_id, operation_type, status, timestamp FROM device_sync_log ORDER BY timestamp DESC LIMIT 50" },
  ];

  // pk columns are derived from colMeta
  const [editOpen, setEditOpen] = useState(false);
  const [editKeyText, setEditKeyText] = useState<string>('{}');
  const [editSetText, setEditSetText] = useState<string>('{}');
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertText, setInsertText] = useState<string>('{}');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteKeyText, setDeleteKeyText] = useState<string>('{}');
  const [toast, setToast] = useState<{ open: boolean; msg: string; sev: 'success'|'error' } | null>(null);

  const openEdit = (row: any) => {
    let key: any = {};
    if (pkCols.length) pkCols.forEach(k => key[k] = row[k]);
    else if (row && Object.prototype.hasOwnProperty.call(row, 'id')) key = { id: row['id'] };
    const setObj = { ...row };
    Object.keys(key).forEach(k => delete (setObj as any)[k]);
    setEditKeyText(JSON.stringify(key || {}, null, 2));
    setEditSetText(JSON.stringify(setObj, null, 2));
    setEditOpen(true);
  };

  const doUpdate = async () => {
    try {
      const key = JSON.parse(editKeyText || '{}');
      const set = JSON.parse(editSetText || '{}');
      const res = await apiService.dbUpdate(selectedTable, key, set);
      if (res.success) {
        setToast({ open: true, msg: `Aggiornate ${res.data?.updated ?? 0} righe`, sev: 'success' });
        setEditOpen(false);
        await loadSample(selectedTable);
      } else setToast({ open: true, msg: res.error || 'Errore update', sev: 'error' });
    } catch (e:any) { setToast({ open: true, msg: e?.message || 'JSON non valido', sev: 'error' }); }
  };

  const openInsert = () => { setInsertText('{}'); setInsertOpen(true); };
  const doInsert = async () => {
    try {
      const values = JSON.parse(insertText || '{}');
      const res = await apiService.dbInsert(selectedTable, values);
      if (res.success) {
        setToast({ open: true, msg: `Inserite ${res.data?.inserted ?? 0} righe`, sev: 'success' });
        setInsertOpen(false);
        await loadSample(selectedTable);
      } else setToast({ open: true, msg: res.error || 'Errore insert', sev: 'error' });
    } catch (e:any) { setToast({ open: true, msg: e?.message || 'JSON non valido', sev: 'error' }); }
  };

  const openDelete = (row: any) => {
    let key: any = {};
    if (pkCols.length) pkCols.forEach(k => key[k] = row[k]);
    else if (row && Object.prototype.hasOwnProperty.call(row, 'id')) key = { id: row['id'] };
    setDeleteKeyText(JSON.stringify(key || {}, null, 2));
    setDeleteOpen(true);
  };

  const doDelete = async () => {
    try {
      const key = JSON.parse(deleteKeyText || '{}');
      const res = await apiService.dbDelete(selectedTable, key);
      if (res.success) {
        setToast({ open: true, msg: `Eliminate ${res.data?.deleted ?? 0} righe`, sev: 'success' });
        setDeleteOpen(false);
        await loadSample(selectedTable);
      } else setToast({ open: true, msg: res.error || 'Errore delete', sev: 'error' });
    } catch (e:any) { setToast({ open: true, msg: e?.message || 'JSON non valido', sev: 'error' }); }
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:2 }}>
          <StorageIcon fontSize="small" />
          <Typography variant="h6" component="div">Database</Typography>
          {info?.engine && <Chip size="small" label={info.engine} color={isPostgres? 'primary' : (isSQLite? 'default':'secondary')} />}
          <Tooltip title="Ricarica"><span><IconButton size="small" onClick={()=> load(withSizes, order, false)} disabled={loading}><RefreshIcon fontSize="small" /></IconButton></span></Tooltip>
          <FormControlLabel
            sx={{ ml:1 }}
            control={<Switch size="small" checked={withSizes} onChange={(e)=> setWithSizes(e.target.checked)} />}
            label={withSizes? 'Size on' : 'Size off'}
          />
          <FormControl size="small" sx={{ minWidth:120 }}>
            <InputLabel id="db-order-label">Ordina</InputLabel>
            <Select labelId="db-order-label" label="Ordina" value={order} onChange={(e)=> setOrder(e.target.value as any)}>
              <MenuItem value="name">Nome</MenuItem>
              <MenuItem value="rows">Righe</MenuItem>
              <MenuItem value="size" disabled={!withSizes}>Size</MenuItem>
            </Select>
          </FormControl>
          <Tooltip title="Force refresh cache"><span><IconButton size="small" onClick={()=> { setForceRefreshFlag(f=> !f); load(withSizes, order, true); }} disabled={loading}><RefreshIcon fontSize="small" color="secondary" /></IconButton></span></Tooltip>
        </Stack>
        {loading && <LinearProgress sx={{ mb:2 }} />}
        {error && <Alert severity="error" sx={{ mb:2 }}>{error}</Alert>}
        {info && (
          <>
            <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb:1 }}>
              {version && (
                <Typography variant="body2" sx={{ display:'flex', alignItems:'center', gap:0.5 }}>
                  <InfoOutlinedIcon fontSize="inherit" /> Versione: <code style={{ fontSize:12 }}>{version.split(' on ')[0]}</code>
                </Typography>
              )}
              {asNew && (asNew as any).elapsed_ms !== undefined && (
                <Chip size="small" label={`elapsed ${(asNew as any).elapsed_ms} ms`} />
              )}
              {asNew && (asNew as any).total_rows !== undefined && (
                <Chip size="small" color="info" label={`rows ${(asNew as any).total_rows}`}/>
              )}
              {withSizes && asNew && (asNew as any).total_size_bytes != null && (
                <Chip size="small" color="secondary" label={`size ${(((asNew as any).total_size_bytes)/1024/1024).toFixed(2)} MB`}/>
              )}
              {asNew && (asNew as any).cached && (
                <Chip size="small" color="success" label={`cache ${(asNew as any).cache_age_s?.toFixed?.(1)||0}s`} />
              )}
            </Stack>
            <Typography variant="subtitle2" gutterBottom>Tabelle ({tableList.length})</Typography>
            <List dense sx={{ maxHeight: 260, overflow:'auto', border:'1px solid', borderColor:'divider', borderRadius:1 }}>
              {tableList.map(t => (
                <ListItem key={t.name} sx={{ py:0.4, display:'flex', alignItems:'center', gap:1, cursor:'pointer' }} onClick={()=> loadSample(t.name)} secondaryAction={
                  <Stack direction="row" spacing={0.5} alignItems="center">
                    {t.rows !== null && t.rows !== undefined && <Chip size="small" icon={<NumbersIcon sx={{ fontSize:14 }} />} label={t.rows} />}
                    {withSizes && (t as any).size_bytes != null && <Chip size="small" label={`${(((t as any).size_bytes)/1024).toFixed(1)} KB`} />}
                    {withSizes && (t as any).size_pct != null && <Chip size="small" label={`${(t as any).size_pct.toFixed(2)}%`} />}
                  </Stack>
                }>
                  <ListItemIcon sx={{ minWidth: 30 }}><TableChartIcon fontSize="small" /></ListItemIcon>
                  <ListItemText primary={t.name} primaryTypographyProps={{ fontSize:13 }} />
                </ListItem>
              ))}
              {tableList.length === 0 && (
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 30 }}><WarningAmberIcon fontSize="small" color="warning" /></ListItemIcon>
                  <ListItemText primary="Nessuna tabella trovata" primaryTypographyProps={{ fontSize:13 }} />
                </ListItem>
              )}
            </List>
            {missing.length > 0 && (
              <Alert severity="warning" sx={{ mt:2 }}>
                Tabelle critiche mancanti: {missing.join(', ')}
              </Alert>
            )}
            <Box sx={{ mt:2, display:'flex', flexDirection:'column', gap:1 }}>
              {isPostgres && <Alert icon={<CheckCircleIcon fontSize="inherit" />} severity="success" variant="outlined">PostgreSQL attivo - migrazione avvenuta.</Alert>}
              {isSQLite && <Alert severity="info" variant="outlined">SQLite in uso (modalità sviluppo / fallback).</Alert>}
              {!isPostgres && !isSQLite && info.engine && <Alert severity="info" variant="outlined">Engine non standard: {info.engine}</Alert>}
            </Box>

            <Divider sx={{ my:2 }} />
            <Typography variant="subtitle2" gutterBottom>Query Builder (senza SQL)</Typography>
            <Paper variant="outlined" sx={{ p:1, mb:2 }}>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Tabella</InputLabel>
                    <Select label="Tabella" value={qbTable} onChange={(e)=> setQbTable(String(e.target.value))}>
                      <MenuItem value=""><em>Seleziona…</em></MenuItem>
                      {tableList.map(t => <MenuItem key={t.name} value={t.name}>{t.name}</MenuItem>)}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Modo</InputLabel>
                    <Select label="Modo" value={qbMode} onChange={(e)=> setQbMode(e.target.value as any)}>
                      <MenuItem value="rows">Righe</MenuItem>
                      <MenuItem value="agg">Aggregazione</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} md={4}>
                  <TextField size="small" fullWidth label={qbMode==='rows' ? 'Colonne (es: id,name)' : 'Group by (es: user_id)'} value={qbSelect} onChange={(e)=> setQbSelect(e.target.value)} placeholder={qbMode==='rows' ? 'vuoto = tutte' : 'colonne separate da virgola'} />
                </Grid>
                <Grid item xs={6} md={1}>
                  <TextField size="small" type="number" label="Limite" value={qbLimit} onChange={(e)=> setQbLimit(Math.max(1, Math.min(1000, Number(e.target.value||0))))} />
                </Grid>
                <Grid item xs={6} md={2}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Ordina per</InputLabel>
                    <Select label="Ordina per" value={qbOrderBy} onChange={(e)=> setQbOrderBy(String(e.target.value))}>
                      <MenuItem value=""><em>-</em></MenuItem>
                      {qbMode==='agg' ? (
                        [ ...(qbSelect? qbSelect.split(',').map(s=> s.trim()).filter(Boolean) : []), 'count' ].map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)
                      ) : (
                        qbColsForTable.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)
                      )}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={6} md={1}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Dir</InputLabel>
                    <Select label="Dir" value={qbOrderDir} onChange={(e)=> setQbOrderDir(String(e.target.value) as any)}>
                      <MenuItem value="ASC">ASC</MenuItem>
                      <MenuItem value="DESC">DESC</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
              <Box sx={{ mt:1 }}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="body2" sx={{ fontWeight:600 }}>Filtri</Typography>
                  <Button size="small" variant="outlined" onClick={addFilter} disabled={!qbTable}>Aggiungi filtro</Button>
                </Stack>
                <Grid container spacing={1} sx={{ mt:0.5 }}>
                  {qbFilters.map((f, idx) => (
                    <Grid key={idx} item xs={12}>
                      <Stack direction={{ xs:'column', sm:'row' }} spacing={1} alignItems={{ sm:'center' }}>
                        <FormControl size="small" sx={{ minWidth:160 }}>
                          <InputLabel>Colonna</InputLabel>
                          <Select label="Colonna" value={f.column} onChange={(e)=> setQbFilters(v=> v.map((x,i)=> i===idx? { ...x, column: String(e.target.value) }: x))}>
                            {qbColsForTable.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                          </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ minWidth:160 }}>
                          <InputLabel>Operatore</InputLabel>
                          <Select label="Operatore" value={f.op} onChange={(e)=> setQbFilters(v=> v.map((x,i)=> i===idx? { ...x, op: String(e.target.value) }: x))}>
                            {['=','!=','>','<','>=','<=','contains','startswith','endswith','like','in','is null','is not null'].map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
                          </Select>
                        </FormControl>
                        {!['is null','is not null'].includes(f.op) && (
                          <TextField size="small" label="Valore" value={f.value ?? ''} onChange={(e)=> setQbFilters(v=> v.map((x,i)=> i===idx? { ...x, value: e.target.value }: x))} sx={{ flex:1 }} />
                        )}
                        <Button size="small" color="error" onClick={()=> removeFilter(idx)}>Rimuovi</Button>
                      </Stack>
                    </Grid>
                  ))}
                </Grid>
                <Stack direction="row" spacing={1} sx={{ mt:1 }}>
                  <Button variant="contained" onClick={runQb} disabled={!qbTable}>Esegui</Button>
                  <Button variant="outlined" onClick={exportQbCsv} disabled={!qbCols.length}>Esporta CSV</Button>
                  {qbError && <Alert severity="error">{qbError}</Alert>}
                </Stack>
              </Box>
            </Paper>
            {qbCols.length>0 && (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320, mb:2 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {qbCols.map(c => <TableCell key={c} sx={{ fontWeight:600 }}>{c}</TableCell>)}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {qbRows.map((r, idx) => (
                      <TableRow key={idx}>
                        {qbCols.map(c => <TableCell key={c}>{typeof r==='object' ? (r[c] ?? '') : ''}</TableCell>)}
                      </TableRow>
                    ))}
                    {qbRows.length === 0 && (
                      <TableRow><TableCell colSpan={qbCols.length || 1}><Typography variant="body2" color="text.secondary">Nessun risultato</Typography></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2" gutterBottom>Anteprima tabella {selectedTable ? `“${selectedTable}”` : ''} (clic su una tabella sopra)</Typography>
              {selectedTable && <Button size="small" startIcon={<AddIcon />} variant="outlined" onClick={openInsert}>Inserisci riga</Button>}
            </Stack>
            {selectedTable && (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 240 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {sampleCols.map((c)=> <TableCell key={c} sx={{ fontWeight:600 }}>{c}</TableCell>)}
                      <TableCell sx={{ fontWeight:600 }} align="right">Azioni</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sampleRows.map((r, idx) => (
                      <TableRow key={idx}>
                        {sampleCols.map((c)=> (
                          <TableCell key={c} onDoubleClick={()=> startEditCell(idx, c)} sx={{ cursor:'text' }}>
                            {editingCell && editingCell.rowIndex===idx && editingCell.col===c ? (
                              <TextField
                                size="small"
                                autoFocus
                                value={editCellValue}
                                onChange={e=> setEditCellValue(e.target.value)}
                                onBlur={commitEditCell}
                                onKeyDown={(e)=> {
                                  if (e.key==='Enter') { e.preventDefault(); commitEditCell() }
                                  if (e.key==='Escape') { e.preventDefault(); cancelEditCell() }
                                }}
                              />
                            ) : (
                              <Typography variant="body2" sx={{ whiteSpace:'pre-wrap' }}>{String(typeof r==='object' ? (r[c] ?? '') : '')}</Typography>
                            )}
                          </TableCell>
                        ))}
                        <TableCell align="right" sx={{ whiteSpace:'nowrap' }}>
                          <IconButton size="small" onClick={()=> openEdit(r)}><EditIcon fontSize="small" /></IconButton>
                          <IconButton size="small" color="error" onClick={()=> openDelete(r)}><DeleteIcon fontSize="small" /></IconButton>
                        </TableCell>
                      </TableRow>
                    ))}
                    {sampleRows.length === 0 && (
                      <TableRow><TableCell colSpan={(sampleCols.length || 1) + 1}><Typography variant="body2" color="text.secondary">Nessun dato</Typography></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {selectedTable && (
              <>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mt:1 }}>
                  <TextField size="small" value={searchQ} onChange={(e)=> setSearchQ(e.target.value)} placeholder={`Cerca in ${selectedTable} (es. 'daniele' o 'conv_...')`} fullWidth />
                  <Button variant="outlined" onClick={runSearch}>Cerca</Button>
                </Stack>
                {searchCols.length > 0 && (
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 240, mt:1 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          {searchCols.map(c => <TableCell key={c} sx={{ fontWeight:600 }}>{c}</TableCell>)}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {searchRows.map((r, idx) => (
                          <TableRow key={idx}>
                            {searchCols.map(c => <TableCell key={c}>{typeof r === 'object' ? (r[c] ?? '') : ''}</TableCell>)}
                            <TableCell align="right" sx={{ whiteSpace:'nowrap' }}>
                              <IconButton size="small" onClick={()=> openEdit(r)}><EditIcon fontSize="small" /></IconButton>
                              <IconButton size="small" color="error" onClick={()=> openDelete(r)}><DeleteIcon fontSize="small" /></IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                        {searchRows.length === 0 && (
                          <TableRow><TableCell colSpan={(searchCols.length || 1)+1}><Typography variant="body2" color="text.secondary">Nessun risultato</Typography></TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </>
            )}

            <Divider sx={{ my:2 }} />
            <Typography variant="subtitle2" gutterBottom>Query SQL (solo SELECT)</Typography>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
              <TextField value={sqlText} onChange={(e)=> setSqlText(e.target.value)} size="small" fullWidth multiline minRows={2} placeholder="SELECT * FROM personalities LIMIT 10" />
              <Button variant="contained" onClick={runQuery} disabled={sqlLoading}>Esegui</Button>
              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel id="example-sql-label">Query di esempio</InputLabel>
                <Select
                  labelId="example-sql-label"
                  label="Query di esempio"
                  value={exampleKey}
                  onChange={(e)=> {
                    const key = String(e.target.value);
                    setExampleKey(key);
                    const ex = exampleQueries.find(q => q.key === key);
                    if (ex) setSqlText(ex.sql);
                  }}
                >
                  {exampleQueries.map(q => (
                    <MenuItem key={q.key} value={q.key}>{q.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            {sqlLoading && <LinearProgress sx={{ mb:1 }} />}
            {sqlError && <Alert severity="error" sx={{ mb:1 }}>{sqlError}</Alert>}
            {sqlCols.length > 0 && (
              <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      {sqlCols.map(c => <TableCell key={c} sx={{ fontWeight:600 }}>{c}</TableCell>)}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sqlRows.map((r, idx) => (
                      <TableRow key={idx}>
                        {sqlCols.map(c => <TableCell key={c}>{typeof r === 'object' ? (r[c] ?? '') : ''}</TableCell>)}
                      </TableRow>
                    ))}
                    {sqlRows.length === 0 && (
                      <TableRow><TableCell colSpan={sqlCols.length || 1}><Typography variant="body2" color="text.secondary">Nessun risultato</Typography></TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            )}

            {/* Sezione "Query predefinite" e NLQ rimossa su richiesta */}

            {/* Edit dialog */}
            <Dialog open={editOpen} onClose={()=> setEditOpen(false)} maxWidth="md" fullWidth>
              <DialogTitle>Modifica riga ({selectedTable})</DialogTitle>
              <DialogContent sx={{ pt:1 }}>
                <Typography variant="caption">Key (WHERE)</Typography>
                <TextField value={editKeyText} onChange={(e)=> setEditKeyText(e.target.value)} fullWidth multiline minRows={4} sx={{ mb:2 }} />
                <Typography variant="caption">Set (UPDATE)</Typography>
                <TextField value={editSetText} onChange={(e)=> setEditSetText(e.target.value)} fullWidth multiline minRows={6} />
              </DialogContent>
              <DialogActions>
                <Button onClick={()=> setEditOpen(false)}>Annulla</Button>
                <Button variant="contained" onClick={doUpdate}>Salva</Button>
              </DialogActions>
            </Dialog>

            {/* Insert dialog */}
            <Dialog open={insertOpen} onClose={()=> setInsertOpen(false)} maxWidth="md" fullWidth>
              <DialogTitle>Inserisci riga ({selectedTable})</DialogTitle>
              <DialogContent sx={{ pt:1 }}>
                <Typography variant="caption">Values</Typography>
                <TextField value={insertText} onChange={(e)=> setInsertText(e.target.value)} fullWidth multiline minRows={8} />
              </DialogContent>
              <DialogActions>
                <Button onClick={()=> setInsertOpen(false)}>Annulla</Button>
                <Button variant="contained" onClick={doInsert}>Inserisci</Button>
              </DialogActions>
            </Dialog>

            {/* Delete dialog */}
            <Dialog open={deleteOpen} onClose={()=> setDeleteOpen(false)} maxWidth="md" fullWidth>
              <DialogTitle>Elimina riga ({selectedTable})</DialogTitle>
              <DialogContent sx={{ pt:1 }}>
                <Typography variant="caption">Key (WHERE)</Typography>
                <TextField value={deleteKeyText} onChange={(e)=> setDeleteKeyText(e.target.value)} fullWidth multiline minRows={4} />
              </DialogContent>
              <DialogActions>
                <Button onClick={()=> setDeleteOpen(false)}>Annulla</Button>
                <Button color="error" variant="contained" onClick={doDelete}>Elimina</Button>
              </DialogActions>
            </Dialog>

            <Snackbar open={!!toast?.open} autoHideDuration={3000} onClose={()=> setToast(null)} message={toast?.msg || ''} />
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default DatabaseInfoPanel;
