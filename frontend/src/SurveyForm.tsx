import React, { useState } from 'react'
import { Box, Typography, Slider, TextField, Button, Alert, Divider } from '@mui/material'

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
	const [sending, setSending] = useState(false)
	const [done, setDone] = useState(false)
	const [error, setError] = useState<string|undefined>()

	const sessionIdKey = 'survey_session_id'
	const existingSession = localStorage.getItem(sessionIdKey) || undefined

	const handleChange = (k: LikertKey, v: number) => {
		setValues(prev => ({ ...prev, [k]: v }))
	}

	const filledCount = Object.values(values).filter(v=>typeof v==='number').length
	const canSubmit = filledCount >= 3 && !sending && !done

	const submit = async () => {
		setSending(true); setError(undefined)
		try {
			const payload: any = { session_id: existingSession }
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
			<Typography variant="caption" sx={{ display:'block', mb:2 }}>Scala 1 = Per niente, 5 = Molto. Compila almeno 3 domande.</Typography>
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
				{error && <Alert severity="error">{error}</Alert>}
				<Button variant="contained" disabled={!canSubmit} onClick={submit}>{sending? 'Invio...':'Invia'}</Button>
			</Box>
		</Box>
	)
}

export default SurveyForm
