import React, { useEffect, useState } from 'react'
import { Card, CardContent, Typography, Grid, TextField, Button, Switch, FormControlLabel, Stack, Alert, LinearProgress } from '@mui/material'
import { authFetch, BACKEND } from '../utils/authFetch'

interface FooterSettings {
  arena_public: boolean
  contact_email?: string | null
  research_project?: string | null
  repository_url?: string | null
  website_url?: string | null
  info_pdf_url?: string | null
  footer_title?: string | null
  footer_text?: string | null
  show_research_project?: boolean
  show_repository_url?: boolean
  show_website_url?: boolean
  show_info_pdf_url?: boolean
  show_contact_email?: boolean
  show_footer_block?: boolean
}

const FooterSettingsPanel: React.FC = () => {
  const [settings, setSettings] = useState<FooterSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/admin/ui-settings`)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const data = await res.json()
      setSettings(data.settings)
    } catch (e: any) {
      setError(e.message || 'Errore caricamento')
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const save = async (partial?: Partial<FooterSettings>) => {
    if (!settings) return
    setSaving(true)
    setError(null)
    try {
      const payload = { ...settings, ...(partial||{}) }
      const res = await authFetch(`${BACKEND}/api/admin/ui-settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!res.ok) throw new Error('HTTP ' + res.status)
      setSettings(payload)
      setSavedAt(Date.now())
      // Refresh public config cache (simple strategy: bump localStorage key read by chat components if needed)
      try { localStorage.setItem('ui_settings_version', Date.now().toString()) } catch {}
    } catch (e: any) {
      setError(e.message || 'Errore salvataggio')
    } finally { setSaving(false) }
  }

  const s = settings
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          <Typography variant="h6">Footer & Informazioni pubbliche</Typography>
          {loading && <LinearProgress />}
          {error && <Alert severity="error" onClose={()=> setError(null)}>{error}</Alert>}
          {!loading && s && (
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6} md={4}>
                <TextField label="Titolo footer" size="small" fullWidth value={s.footer_title||''} onChange={e=> setSettings({...s, footer_title: e.target.value})} />
              </Grid>
              <Grid item xs={12} sm={6} md={8}>
                <TextField label="Testo footer (markdown semplice)" size="small" fullWidth multiline minRows={2} value={s.footer_text||''} onChange={e=> setSettings({...s, footer_text: e.target.value})} />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField label="Email contatto" size="small" fullWidth value={s.contact_email||''} onChange={e=> setSettings({...s, contact_email: e.target.value})} />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField label="Progetto ricerca" size="small" fullWidth value={s.research_project||''} onChange={e=> setSettings({...s, research_project: e.target.value})} />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField label="Repository URL" size="small" fullWidth value={s.repository_url||''} onChange={e=> setSettings({...s, repository_url: e.target.value})} />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField label="Sito Web" size="small" fullWidth value={s.website_url||''} onChange={e=> setSettings({...s, website_url: e.target.value})} />
              </Grid>
              <Grid item xs={12} sm={6} md={4}>
                <TextField label="Informativa PDF URL" size="small" fullWidth value={s.info_pdf_url||''} onChange={e=> setSettings({...s, info_pdf_url: e.target.value})} />
              </Grid>
              <Grid item xs={12}>
                <Stack direction="row" spacing={2} flexWrap="wrap">
                  <FormControlLabel control={<Switch checked={s.show_footer_block!==false} onChange={e=> save({show_footer_block: e.target.checked})} size="small" />} label="Mostra blocco footer" />
                  <FormControlLabel control={<Switch checked={s.show_research_project!==false} onChange={e=> save({show_research_project: e.target.checked})} size="small" />} label="Mostra progetto" />
                  <FormControlLabel control={<Switch checked={s.show_repository_url!==false} onChange={e=> save({show_repository_url: e.target.checked})} size="small" />} label="Mostra repository" />
                  <FormControlLabel control={<Switch checked={s.show_website_url!==false} onChange={e=> save({show_website_url: e.target.checked})} size="small" />} label="Mostra sito" />
                  <FormControlLabel control={<Switch checked={s.show_info_pdf_url!==false} onChange={e=> save({show_info_pdf_url: e.target.checked})} size="small" />} label="Mostra PDF" />
                  <FormControlLabel control={<Switch checked={s.show_contact_email!==false} onChange={e=> save({show_contact_email: e.target.checked})} size="small" />} label="Mostra email" />
                </Stack>
              </Grid>
              <Grid item xs={12}>
                <Stack direction="row" spacing={2}>
                  <Button disabled={saving} size="small" variant="contained" onClick={()=> save()}>Salva tutto</Button>
                  {savedAt && <Typography variant="caption" sx={{ alignSelf:'center', color:'text.secondary' }}>Salvato {new Date(savedAt).toLocaleTimeString()}</Typography>}
                </Stack>
              </Grid>
            </Grid>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}

export default FooterSettingsPanel
