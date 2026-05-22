import React, { useState } from 'react'
import {
  Box,
  Typography,
  TextField,
  Button,
  Alert,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Slider,
  FormControlLabel,
  Checkbox,
  Link,
} from '@mui/material'

// Likert scale keys (quantitative block)
type LikertKey =
  | 'q_utilita'
  | 'q_pertinenza'
  | 'q_chiarezza'
  | 'q_dettaglio'
  | 'q_facilita'
  | 'q_velocita'
  | 'q_fiducia'
  | 'q_riflessione'
  | 'q_coinvolgimento'
  | 'q_riuso'

const labels: Record<LikertKey, string> = {
  q_utilita: 'Il chatbot mi è stato utile',
  q_pertinenza: 'Le risposte erano pertinenti',
  q_chiarezza: 'Le risposte erano chiare',
  q_dettaglio: 'Il livello di dettaglio era adeguato',
  q_facilita: "È stato facile usarlo",
  q_velocita: 'Le risposte erano abbastanza veloci',
  q_fiducia: 'Mi fido delle informazioni fornite',
  q_riflessione: 'Mi ha aiutato a riflettere su di me',
  q_coinvolgimento: "L’interazione è stata coinvolgente",
  q_riuso: 'Lo riutilizzerei / consiglierei',
}

const likertMarks = [
  { value: 0, label: 'NR' },
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
]

export const SurveyForm: React.FC<{ backendUrl: string; onSubmitted?: () => void }> = ({ backendUrl, onSubmitted }) => {
  const [values, setValues] = useState<Partial<Record<LikertKey, number>>>({})
  // Dati anagrafici
  const [eta, setEta] = useState<number | ''>('')
  const [sesso, setSesso] = useState('')
  const [istruzione, setIstruzione] = useState('')
  const [tipoIstituto, setTipoIstituto] = useState('')
  const [provenienza, setProvenienza] = useState('')
  const [area, setArea] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [contactEmail, setContactEmail] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)

  const sessionIdKey = 'survey_session_id'
  const existingSession = localStorage.getItem(sessionIdKey) || undefined

  const handleLikertChange = (key: LikertKey, rawValue: number) => {
    setValues((prev) => {
      const next = { ...prev }
      if (typeof rawValue === 'number' && rawValue >= 1) {
        next[key] = rawValue
      } else {
        delete next[key]
      }
      return next
    })
  }

  const likertAnswered = Object.keys(values).length
  const quantSectionFilled = likertAnswered > 0
  const allDemoFilled = eta !== '' && sesso && istruzione && tipoIstituto && provenienza
  const submitDisabled =
    !consent || sending || done || !(quantSectionFilled && allDemoFilled)

  // Deriva automaticamente area STEM/Umanistiche
  const deriveArea = (istr: string, tipo: string): string => {
    if (!istr || !tipo) return ''
    const stem = [
      'Ingegneria',
      'Informatica',
      'Matematica',
      'Fisica',
      'Biologia',
      'Medicina',
      'Architettura',
      'Istituto Tecnico',
      'Liceo Scientifico',
    ]
    if (stem.includes(tipo)) return 'STEM'
    return 'Umanistiche'
  }

  React.useEffect(() => {
    setArea(deriveArea(istruzione, tipoIstituto))
  }, [istruzione, tipoIstituto])

  React.useEffect(() => {
    ;(async () => {
      try {
        const resp = await fetch(`${backendUrl}/api/config/public`)
        if (resp.ok) {
          const js = await resp.json()
          const ui = js?.ui_settings || {}
          setContactEmail(ui.contact_email || null)
        }
      } catch {
        /* ignore */
      }
    })()
  }, [backendUrl])

  const submit = async () => {
    setError(undefined)
    const quantFilledNow = quantSectionFilled

    if (!quantFilledNow) {
      setError('Compila almeno una delle valutazioni.')
      return
    }
    if (quantFilledNow && !allDemoFilled) {
      setError('Per inviare le valutazioni numeriche compila i dati di base (età, sesso, istruzione, istituto, provenienza).')
      return
    }

    setSending(true)
    try {
      const payload: Record<string, unknown> = { session_id: existingSession }
      if (eta !== '') payload.demo_eta = eta
      if (sesso) payload.demo_sesso = sesso
      if (istruzione) payload.demo_istruzione = istruzione
      if (tipoIstituto) payload.demo_tipo_istituto = tipoIstituto
      if (provenienza) payload.demo_provenienza = provenienza
      if (area) payload.demo_area = area
      Object.entries(values).forEach(([k, v]) => {
        if (typeof v === 'number' && v >= 1 && v <= 5) payload[k] = v
      })

      const resp = await fetch(`${backendUrl}/api/survey/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      let data: any = {}
      try {
        data = await resp.json()
      } catch {
        /* ignore parse error */
      }
      if (!resp.ok) {
        const detail = data?.detail || data?.message || `HTTP ${resp.status}`
        throw new Error(`Invio fallito: ${detail}`)
      }
      if (data.session_id) localStorage.setItem(sessionIdKey, data.session_id)
      setDone(true)
      if (onSubmitted) onSubmitted()
    } catch (e: any) {
      setError(e.message || 'Errore')
    } finally {
      setSending(false)
    }
  }

  if (done) {
    return <Alert severity="success">Grazie! Le tue risposte anonime sono state registrate.</Alert>
  }

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ mb: 1, fontWeight: 600 }}>
        Questionario esperienza (anonimo)
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        Puoi rispondere solo alle domande che preferisci. La sezione quantitativa (domande chiuse 1-5)
        richiede i dati di base, mentre il blocco qualitativo ti permette di inviare riflessioni libere.
        Tutte le risposte restano anonime.
      </Typography>

      <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>
        Dati di base (richiesti per la parte quantitativa)
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mb: 2 }}>
        <FormControl fullWidth>
          <InputLabel>Età</InputLabel>
          <Select
            label="Età"
            value={eta === '' ? '' : String(eta)}
            onChange={(e) => setEta(e.target.value ? Number(e.target.value) : '')}
          >
            <MenuItem value="" disabled>
              Seleziona
            </MenuItem>
            {Array.from({ length: 70 }, (_, i) => i + 12).map((n) => (
              <MenuItem key={n} value={String(n)}>
                {n}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Sesso</InputLabel>
          <Select label="Sesso" value={sesso} onChange={(e) => setSesso(e.target.value)}>
            <MenuItem value="" disabled>
              Seleziona
            </MenuItem>
            <MenuItem value="F">Femminile</MenuItem>
            <MenuItem value="M">Maschile</MenuItem>
            <MenuItem value="Altro">Altro</MenuItem>
            <MenuItem value="ND">Preferisco non dirlo</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Istruzione</InputLabel>
          <Select
            label="Istruzione"
            value={istruzione}
            onChange={(e) => {
              setIstruzione(e.target.value)
              setTipoIstituto('')
            }}
          >
            <MenuItem value="" disabled>
              Seleziona
            </MenuItem>
            <MenuItem value="Scuola">Scuola superiore</MenuItem>
            <MenuItem value="Università">Università</MenuItem>
            <MenuItem value="Dottorato">Dottorato</MenuItem>
            <MenuItem value="Altro">Altro</MenuItem>
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Tipo istituto</InputLabel>
          <Select label="Tipo istituto" value={tipoIstituto} onChange={(e) => setTipoIstituto(e.target.value)}>
            <MenuItem value="" disabled>
              Seleziona
            </MenuItem>
            {(() => {
              const scuola = [
                'Liceo Classico',
                'Liceo Scientifico',
                'Liceo Linguistico',
                'Liceo Artistico',
                'Istituto Tecnico',
                'Istituto Professionale',
              ]
              const uni = [
                'Ingegneria',
                'Informatica',
                'Matematica',
                'Fisica',
                'Biologia',
                'Medicina',
                'Economia',
                'Giurisprudenza',
                'Lettere',
                'Filosofia',
                'Psicologia',
                'Lingue',
                'Scienze Politiche',
                'Architettura',
                'Altro',
              ]
              const opts = istruzione === 'Scuola' ? scuola : istruzione ? uni : []
              return opts.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))
            })()}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel>Provenienza</InputLabel>
          <Select label="Provenienza" value={provenienza} onChange={(e) => setProvenienza(e.target.value)}>
            <MenuItem value="" disabled>
              Seleziona
            </MenuItem>
            {['Nord-Ovest', 'Nord-Est', 'Centro', 'Sud', 'Isole', 'Estero'].map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label="Area di studio (automatica)"
          value={area}
          InputProps={{ readOnly: true }}
          helperText="Si compila in base ai campi precedenti"
        />
      </Box>

      <Typography variant="subtitle2" sx={{ mt: 2, mb: 0.5 }}>
        Valutazione quantitativa (facoltativa)
      </Typography>
      <Typography variant="caption" sx={{ display: 'block', mb: 2 }}>
        Scala 1 = Per niente, 5 = Molto. Lascia "NR" (non rispondo) se vuoi saltare una domanda.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {(Object.keys(labels) as LikertKey[]).map((key) => {
          const value = values[key] ?? 0
          return (
            <Box key={key}>
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                {labels[key]}
              </Typography>
              <Slider
                size="small"
                value={value}
                min={0}
                max={5}
                step={1}
                marks={likertMarks}
                onChange={(_, v) => handleLikertChange(key, v as number)}
                valueLabelDisplay={value ? 'on' : 'off'}
                valueLabelFormat={(v) => (v === 0 ? '' : v)}
              />
            </Box>
          )
        })}
      </Box>

      <FormControlLabel
        sx={{ mt: 2 }}
        control={<Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} />}
        label={
          <Typography variant="caption">
            Dichiaro di aver letto e compreso che le risposte sono raccolte in forma anonima senza alcun
            tracciamento. Acconsento all'uso dei dati aggregati esclusivamente per scopi di ricerca e
            miglioramento del servizio.
            {contactEmail && (
              <>
                {' '}
                Per qualsiasi domanda posso contattare l'amministratore via email:
                {' '}
                <Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>.
              </>
            )}
          </Typography>
        }
      />

      {!consent && (
        <Alert severity="warning" variant="outlined">
          Devi accettare le condizioni per inviare il questionario.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      <Button
        sx={{ mt: 2 }}
        variant="contained"
        disabled={submitDisabled}
        onClick={submit}
      >
        {sending ? 'Invio...' : 'Invia'}
      </Button>
    </Box>
  )
}

export default SurveyForm
