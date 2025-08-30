import React, { useState } from 'react'
import { Box, Typography, TextField, Button, Alert, Divider, FormControl, InputLabel, Select, MenuItem, Slider, FormControlLabel, Checkbox, Link } from '@mui/material'
// Footer icons removed: global footer now handles research/info links

type LikertKey = 'q_utilita'|'q_pertinenza'|'q_chiarezza'|'q_dettaglio'|'q_facilita'|'q_velocita'|'q_fiducia'|'q_riflessione'|'q_coinvolgimento'|'q_riuso'

const labels: Record<LikertKey,string> = {
	q_utilita: 'Il chatbot mi è stato utile',
	q_pertinenza: 'Le risposte erano pertinenti',
	q_chiarezza: 'Le risposte erano chiare',
	q_dettaglio: 'Il livello di dettaglio era adeguato',
	q_facilita: 'È stato facile usarlo',
	q_velocita: 'Le risposte erano abbastanza veloci',
	q_fiducia: 'Mi fido delle informazioni fornite',
	q_riflessione: 'Mi ha aiutato a riflettere su di me',
	q_coinvolgimento: 'L’interazione è stata coinvolgente',
	q_riuso: 'Lo riutilizzerei / consiglierei'
}

export const SurveyForm: React.FC<{ backendUrl: string; onSubmitted?: ()=>void }> = ({ backendUrl, onSubmitted }) => {
	const [values, setValues] = useState<Partial<Record<LikertKey, number>>>({})
	const [riflessioni, setRiflessioni] = useState('')
	const [commenti, setCommenti] = useState('')
	// Dati anagrafici
	const [eta, setEta] = useState<number|''>('')
	const [sesso, setSesso] = useState('')
	const [istruzione, setIstruzione] = useState('')
	const [tipoIstituto, setTipoIstituto] = useState('')
	const [provenienza, setProvenienza] = useState('')
	const [area, setArea] = useState('')
	const [sending, setSending] = useState(false)
	const [done, setDone] = useState(false)
	const [error, setError] = useState<string|undefined>()
	const [contactEmail, setContactEmail] = useState<string | null>(null)
	const [consent, setConsent] = useState(false)

	const sessionIdKey = 'survey_session_id'
	const existingSession = localStorage.getItem(sessionIdKey) || undefined

	const handleChange = (k: LikertKey, v: number) => {
		setValues(prev => ({ ...prev, [k]: v }))
	}

	const filledCount = Object.values(values).filter(v=>typeof v==='number').length
	const allLikertFilled = filledCount === Object.keys(labels).length
	const allDemoFilled = (eta !== '' && sesso && istruzione && tipoIstituto && provenienza && area)
	const canSubmit = allLikertFilled && allDemoFilled && consent && !sending && !done

	// Deriva automaticamente l'area (STEM/Umanistiche) da istruzione+tipoIstituto
	const deriveArea = (istr: string, tipo: string): string => {
		const stem = ['Ingegneria','Informatica','Matematica','Fisica','Biologia','Medicina','Architettura','Istituto Tecnico','Liceo Scientifico']
		if(!istr || !tipo) return ''
		if(stem.includes(tipo)) return 'STEM'
		return 'Umanistiche'
	}

	React.useEffect(()=>{
		setArea(deriveArea(istruzione, tipoIstituto))
	}, [istruzione, tipoIstituto])

	// Load public config just for contact email (footer handled globally now)
	React.useEffect(()=>{
		(async()=>{
			try {
				const resp = await fetch(`${backendUrl}/api/config/public`)
				if(resp.ok){
					const js = await resp.json()
					const ui = js?.ui_settings || {}
					setContactEmail(ui.contact_email || null)
				}
			} catch {/* ignore */}
		})()
	}, [backendUrl])

	// Local footer renderer removed (handled globally)

	const submit = async () => {
		setSending(true); setError(undefined)
		try {
			const payload: any = { session_id: existingSession }
			// Demografia (obbligatoria)
			payload.demo_eta = eta
			payload.demo_sesso = sesso
			payload.demo_istruzione = istruzione
			payload.demo_tipo_istituto = tipoIstituto
			payload.demo_provenienza = provenienza
			payload.demo_area = area
			Object.entries(values).forEach(([k,v])=>{ if(typeof v === 'number' && v >=1 && v <=5) payload[k]=v })
			if(riflessioni.trim()) payload.q_riflessioni = riflessioni.trim()
			if(commenti.trim()) payload.q_commenti = commenti.trim()
			const resp = await fetch(`${backendUrl}/api/survey/submit`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
			let data: any = {}
			try { data = await resp.json() } catch { /* ignore parse error */ }
			if(!resp.ok){
				const detail = data?.detail || data?.message || `HTTP ${resp.status}`
				throw new Error(`Invio fallito: ${detail}`)
			}
			if(data.session_id) localStorage.setItem(sessionIdKey, data.session_id)
			setDone(true)
			if(onSubmitted) onSubmitted()
		} catch(e:any){
			setError(e.message || 'Errore')
		} finally { setSending(false) }
	}

	if(done){
		return <Alert severity="success">Grazie! Le tue risposte anonime sono state registrate.</Alert>
	}

	return (
		<Box>
			<Typography variant="subtitle1" sx={{ mb:1, fontWeight:600 }}>Questionario esperienza (anonimo)</Typography>
			<Typography variant="body2" sx={{ mb:1 }}>
				Prima di tutto, alcune informazioni di base (obbligatorie). Il questionario è anonimo: non raccogliamo dati identificativi, né indirizzi IP, né tracciamo il profilo dell'utente. I dati aggregati saranno utilizzati esclusivamente per scopi di ricerca e miglioramento del servizio.
			</Typography>
			<Box sx={{ display:'grid', gridTemplateColumns:{ xs:'1fr', sm:'1fr 1fr'}, gap:2, mb:2 }}>
				<FormControl fullWidth>
					<InputLabel>Età</InputLabel>
					<Select label="Età" value={eta === '' ? '' : String(eta)} onChange={e=> setEta(e.target.value? Number(e.target.value) : '')}>
						<MenuItem value="" disabled>Seleziona</MenuItem>
						{Array.from({length: 70}, (_,i)=> i+12).map(n=> (
							<MenuItem key={n} value={String(n)}>{n}</MenuItem>
						))}
					</Select>
				</FormControl>
				<FormControl fullWidth>
					<InputLabel>Sesso</InputLabel>
					<Select label="Sesso" value={sesso} onChange={e=> setSesso(e.target.value)}>
						<MenuItem value="" disabled>Seleziona</MenuItem>
						<MenuItem value="F">Femminile</MenuItem>
						<MenuItem value="M">Maschile</MenuItem>
						<MenuItem value="Altro">Altro</MenuItem>
						<MenuItem value="ND">Preferisco non dirlo</MenuItem>
					</Select>
				</FormControl>
            <FormControl fullWidth>
              <InputLabel>Istruzione</InputLabel>
              <Select label="Istruzione" value={istruzione} onChange={e=> { setIstruzione(e.target.value); setTipoIstituto('') }}>
                <MenuItem value="" disabled>Seleziona</MenuItem>
                <MenuItem value="Scuola">Scuola superiore</MenuItem>
                <MenuItem value="Università">Università</MenuItem>
                <MenuItem value="Dottorato">Dottorato</MenuItem>
                <MenuItem value="Altro">Altro</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Tipo istituto</InputLabel>
              <Select label="Tipo istituto" value={tipoIstituto} onChange={e=> setTipoIstituto(e.target.value)}>
                <MenuItem value="" disabled>Seleziona</MenuItem>
                {(() => {
                  const scuola = ['Liceo Classico','Liceo Scientifico','Liceo Linguistico','Liceo Artistico','Istituto Tecnico','Istituto Professionale']
                  const uni = ['Ingegneria','Informatica','Matematica','Fisica','Biologia','Medicina','Economia','Giurisprudenza','Lettere','Filosofia','Psicologia','Lingue','Scienze Politiche','Architettura','Altro']
                  const opts = istruzione === 'Scuola' ? scuola : (istruzione ? uni : [])
                  return opts.map(t => (<MenuItem key={t} value={t}>{t}</MenuItem>))
                })()}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Provenienza</InputLabel>
              <Select label="Provenienza" value={provenienza} onChange={e=> setProvenienza(e.target.value)}>
                <MenuItem value="" disabled>Seleziona</MenuItem>
                {['Nord-Ovest','Nord-Est','Centro','Sud','Isole','Estero'].map(r=> (
                  <MenuItem key={r} value={r}>{r}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField label="Area di studio (derivata)" value={area} InputProps={{ readOnly: true }} />
			</Box>
			<Typography variant="caption" sx={{ display:'block', mb:2 }}>Scala 1 = Per niente, 5 = Molto. Compila tutte le domande.</Typography>
            <Box sx={{ display:'flex', flexDirection:'column', gap:2 }}>
              { (Object.keys(labels) as LikertKey[]).map(k=> (
                <Box key={k}>
                  <Typography variant="body2" sx={{ mb:0.5 }}>{labels[k]}</Typography>
                  <Slider size="small" value={values[k] || 0} min={1} max={5} step={1}
                    marks={[1,2,3,4,5].map(v=>({value:v,label:v}))}
                    onChange={(_,val)=> handleChange(k, val as number)}
                    valueLabelDisplay={values[k]? 'on':'off'}
                  />
                </Box>
              )) }
              <Divider />
				<TextField label="Riflessioni personali (facoltativo)" multiline minRows={2} value={riflessioni} onChange={e=>setRiflessioni(e.target.value)} />
				<TextField label="Altri commenti (facoltativo)" multiline minRows={2} value={commenti} onChange={e=>setCommenti(e.target.value)} />
					<FormControlLabel control={<Checkbox checked={consent} onChange={e=> setConsent(e.target.checked)} />} label={
						<Typography variant="caption">
							Dichiaro di aver letto e compreso che le risposte sono raccolte in forma anonima senza alcun tracciamento. Acconsento all'uso dei dati aggregati esclusivamente per scopi di ricerca e miglioramento del servizio.
							{contactEmail && (
								<> Per qualsiasi domanda posso contattare l'amministratore via email: <Link href={`mailto:${contactEmail}`}>{contactEmail}</Link>.</>
							)}
						</Typography>
					} />
					{!consent && <Alert severity="warning" variant="outlined">Devi accettare le condizioni per inviare il questionario.</Alert>}
				{error && <Alert severity="error">{error}</Alert>}
				{/* Footer info block removed: now shown globally across pages */}
				<Button variant="contained" disabled={!canSubmit} onClick={submit}>{sending? 'Invio...':'Invia'}</Button>
			</Box>
		</Box>
	)
}

export default SurveyForm
