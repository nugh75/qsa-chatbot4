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

  // --- Predefined Queries & NLQ ---
  const [queries, setQueries] = useState<any[]>([]);
  const [queriesLoading, setQueriesLoading] = useState<boolean>(false);
  const [selectedQueryId, setSelectedQueryId] = useState<string>('');
  const [queryMeta, setQueryMeta] = useState<any|null>(null);
  const [queryParams, setQueryParams] = useState<Record<string, any>>({});
  const [queryOrderBy, setQueryOrderBy] = useState<string>('');
  const [queryOrderDir, setQueryOrderDir] = useState<'ASC'|'DESC'>('DESC');
  const [queryLimit, setQueryLimit] = useState<number>(50);
  const [queryRows, setQueryRows] = useState<any[]>([]);
  const [queryCols, setQueryCols] = useState<string[]>([]);
  const [queryError, setQueryError] = useState<string|null>(null);
  const [nlqText, setNlqText] = useState<string>('');
  const [nlqHint, setNlqHint] = useState<string>('');

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

  // Load predefined queries list (once)
  useEffect(() => {
    (async () => {
      setQueriesLoading(true);
      try {
        const r = await apiService.listQueries();
        if (r.success && (r.data as any)?.queries) setQueries((r.data as any).queries);
      } catch {/* ignore */}
      setQueriesLoading(false);
    })()
  }, []);

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

  // ---------------------- Predefined Queries helpers ----------------------
  const loadQueryMeta = async (qid: string) => {
    setQueryError(null);
    setQueryRows([]); setQueryCols([]);
    if (!qid) { setQueryMeta(null); setQueryParams({}); return }
    const res = await apiService.describeQuery(qid)
    if (res.success && (res.data as any)?.query) {
      const meta = (res.data as any).query
      setQueryMeta(meta)
      // Defaults
      const initParams: Record<string, any> = {}
      ;(meta.params || []).forEach((p:any) => {
        if (p.default !== undefined) initParams[p.name] = p.default
        else if (p.type === 'integer') initParams[p.name] = undefined
        else initParams[p.name] = ''
      })
      setQueryParams(initParams)
      const obDef = meta.order_by?.default || {}
      const firstCol = (meta.order_by?.allowed || [])[0] || 'id'
      setQueryOrderBy(obDef.column || firstCol)
      setQueryOrderDir((obDef.direction || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC')
      const lim = meta.limit?.default || 50
      setQueryLimit(lim)
    } else setQueryMeta(null)
  }

  const onChangeQuery = async (qid: string) => {
    setSelectedQueryId(qid)
    await loadQueryMeta(qid)
  }

  const runPredef = async (mode: 'preview'|'execute') => {
    if (!selectedQueryId) return
    setQueryError(null)
    try {
      const payload: any = { ...queryParams, order_by: { column: queryOrderBy, direction: queryOrderDir }, limit: queryLimit }
      const r = mode==='preview' ? await apiService.previewQuery(selectedQueryId, payload) : await apiService.executeQuery(selectedQueryId, payload)
      if (r.success && (r.data as any)?.rows) {
        const rows = (r.data as any).rows
        const cols = rows.length ? Object.keys(rows[0]) : []
        setQueryRows(rows)
        setQueryCols(cols)
      } else {
        setQueryError(r.error || 'Errore esecuzione')
      }
    } catch (e:any) {
      setQueryError(e?.message || 'Errore esecuzione')
    }
  }

  const runNlq = async () => {
    setNlqHint('')
    if (!nlqText.trim()) return
    const r = await apiService.nlq(nlqText.trim())
    if ((r.data as any)?.matched && (r.data as any)?.query_id) {
      const qid = (r.data as any).query_id as string
      setSelectedQueryId(qid)
      await loadQueryMeta(qid)
      const p = (r.data as any).params || {}
      setQueryParams(prev => ({ ...prev, ...p }))
      setNlqHint((r.data as any).label || 'Riconosciuta')
    } else {
      setNlqHint((r.data as any)?.message || 'Non riconosciuta')
    }
  }
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

      {/* Tabella selezionata (editable) */}
      {selectedTable && sampleCols.length>0 && (
        <Box sx={{ mt:2 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ mb:1 }}>
            <Typography variant="subtitle2">Tabella: <code>{selectedTable}</code></Typography>
            {pkCols.length>0 ? (
              <Chip size="small" label={`PK: ${pkCols.join(', ')}`} />
            ) : (
              <Chip size="small" color="warning" label="PK non rilevata" />
            )}
          </Stack>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  {sampleCols.map(c => <TableCell key={c} sx={{ fontWeight:600 }}>{c}</TableCell>)}
                  <TableCell align="right">Azioni</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sampleRows.map((row, idx) => (
                  <TableRow key={idx}>
                    {sampleCols.map(col => (
                      <TableCell key={`${idx}-${col}`} onDoubleClick={()=> startEditCell(idx, col)} sx={{ cursor:'text' }}>
                        {editingCell && editingCell.rowIndex===idx && editingCell.col===col ? (
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
                          editingRow===idx ? (
                            <TextField size="small" value={editValues[col] ?? ''} onChange={e=> setEditValues(v=> ({...v, [col]: e.target.value}))} />
                          ) : (
                            <Typography variant="body2" sx={{ whiteSpace:'pre-wrap' }}>{String(row[col] ?? '')}</Typography>
                          )
                        )}
                      </TableCell>
                    ))}
                    <TableCell align="right">
                      {editingRow===idx ? (
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button size="small" onClick={cancelEdit}>Annulla</Button>
                          <Button size="small" variant="contained" onClick={saveRow}>Salva</Button>
                        </Stack>
                      ) : (
                        <Button size="small" onClick={()=> startEdit(idx)}>Modifica</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
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

            <Divider sx={{ my:2 }} />
            <Typography variant="subtitle2" gutterBottom>Query predefinite</Typography>
            <Stack direction={{ xs:'column', md:'row' }} spacing={1} alignItems={{ md:'center' }} sx={{ mb:1 }}>
              <FormControl size="small" sx={{ minWidth:260 }}>
                <InputLabel id="predef-query-label">Seleziona query</InputLabel>
                <Select labelId="predef-query-label" label="Seleziona query" value={selectedQueryId} onChange={(e)=> onChangeQuery(String(e.target.value))}>
                  <MenuItem value=""><em>Nessuna</em></MenuItem>
                  {queries.map((q:any)=> <MenuItem key={q.id} value={q.id}>{q.label || q.id}</MenuItem>)}
                </Select>
              </FormControl>
              <Box sx={{ flex:1 }} />
              <TextField size="small" label="Query uman-like" value={nlqText} onChange={(e)=> setNlqText(e.target.value)} placeholder="es. conversazioni utente 42" sx={{ minWidth: 260 }} />
              <Button variant="outlined" onClick={runNlq}>Interpreta</Button>
              {nlqHint && <Chip size="small" color="info" label={nlqHint} />}
            </Stack>
            {queryMeta && (
              <>
                <Typography variant="body2" color="text.secondary" sx={{ mb:1 }}>{queryMeta.description}</Typography>
                <Grid container spacing={2}>
                  {(queryMeta.params||[]).map((p:any)=> (
                    <Grid item xs={12} sm={6} md={4} key={p.name}>
                      {p.type === 'enum' ? (
                        <FormControl fullWidth size="small">
                          <InputLabel>{p.name}</InputLabel>
                          <Select label={p.name} value={queryParams[p.name] ?? ''} onChange={(e)=> setQueryParams(v=> ({ ...v, [p.name]: e.target.value }))}>
                            {Array.isArray(p.enum) ? p.enum.map((v:any)=> <MenuItem key={String(v)} value={v}>{String(v)}</MenuItem>) : null}
                          </Select>
                        </FormControl>
                      ) : (
                        <TextField fullWidth size="small" type={p.type==='integer'||p.type==='number'?'number':(p.type==='date'?'date':'text')} label={p.name} value={queryParams[p.name] ?? ''} onChange={(e)=> setQueryParams(v=> ({ ...v, [p.name]: (p.type==='integer'||p.type==='number') ? (e.target.value===''? '' : Number(e.target.value)) : e.target.value }))} InputLabelProps={p.type==='date'?{ shrink: true }: undefined} />
                      )}
                    </Grid>
                  ))}
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Ordina per</InputLabel>
                      <Select label="Ordina per" value={queryOrderBy} onChange={(e)=> setQueryOrderBy(String(e.target.value))}>
                        {(queryMeta.order_by?.allowed||[]).map((c:string)=> <MenuItem key={c} value={c}>{c}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <FormControl fullWidth size="small">
                      <InputLabel>Direzione</InputLabel>
                      <Select label="Direzione" value={queryOrderDir} onChange={(e)=> setQueryOrderDir(String(e.target.value) as any)}>
                        <MenuItem value="ASC">ASC</MenuItem>
                        <MenuItem value="DESC">DESC</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} sm={6} md={4}>
                    <TextField fullWidth size="small" type="number" label="Limite" value={queryLimit} onChange={(e)=> setQueryLimit(Math.max(1, Math.min(1000, Number(e.target.value||0))))} />
                  </Grid>
                </Grid>
                <Stack direction="row" spacing={1} sx={{ mt:1 }}>
                  <Button variant="outlined" onClick={()=> runPredef('preview')}>Anteprima</Button>
                  <Button variant="contained" onClick={()=> runPredef('execute')}>Esegui</Button>
                  <Button variant="text" onClick={async ()=> {
                    try {
                      const payload: any = { ...queryParams, order_by: { column: queryOrderBy, direction: queryOrderDir }, limit: queryLimit }
                      const blob = await apiService.exportQueryCsv(selectedQueryId, payload)
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a')
                      a.href = url
                      a.download = `${selectedQueryId}.csv`
                      document.body.appendChild(a)
                      a.click()
                      a.remove()
                      URL.revokeObjectURL(url)
                    } catch (e:any) { setQueryError(e?.message || 'Export fallito') }
                  }}>Esporta CSV</Button>
                  {queryError && <Alert severity="error" sx={{ ml:2 }}>{queryError}</Alert>}
                </Stack>
                {queryRows.length>0 && (
                  <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 320, mt:1 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          {queryCols.map(c => <TableCell key={c} sx={{ fontWeight:600 }}>{c}</TableCell>)}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {queryRows.map((r, idx) => (
                          <TableRow key={idx}>
                            {queryCols.map(c => <TableCell key={c}>{typeof r === 'object' ? (r[c] ?? '') : ''}</TableCell>)}
                          </TableRow>
                        ))}
                        {queryRows.length === 0 && (
                          <TableRow><TableCell colSpan={queryCols.length || 1}><Typography variant="body2" color="text.secondary">Nessun risultato</Typography></TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </>
            )}

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
