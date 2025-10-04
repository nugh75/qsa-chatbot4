import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Stack,
  IconButton
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'

interface QualitativeFeedbackDialogProps {
  open: boolean
  onClose: () => void
  backendUrl: string
}

export function QualitativeFeedbackDialog({ open, onClose, backendUrl }: QualitativeFeedbackDialogProps) {
  const [riflessioni, setRiflessioni] = useState('')
  const [commenti, setCommenti] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [success, setSuccess] = useState(false)

  const handleSubmit = async () => {
    // Valida che almeno un campo sia compilato
    if (!riflessioni.trim() && !commenti.trim()) {
      setError('Compila almeno uno dei campi testuali')
      return
    }

    setSubmitting(true)
    setError(undefined)

    try {
      const response = await fetch(`${backendUrl}/api/survey/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q_riflessioni: riflessioni.trim() || null,
          q_commenti: commenti.trim() || null
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.detail || 'Errore nell\'invio del feedback')
      }

      setSuccess(true)
      // Chiudi il dialog dopo 1.5 secondi
      setTimeout(() => {
        handleClose()
      }, 1500)
    } catch (err: any) {
      setError(err.message || 'Errore nella sottomissione del feedback')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      setRiflessioni('')
      setCommenti('')
      setError(undefined)
      setSuccess(false)
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>
          Feedback Qualitativo
        </Typography>
        <IconButton size="small" onClick={handleClose} disabled={submitting}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>
      
      <DialogContent dividers>
        <Stack spacing={3}>
          {success && (
            <Alert severity="success">
              Grazie per il tuo feedback! È stato salvato con successo.
            </Alert>
          )}
          
          {error && (
            <Alert severity="error">{error}</Alert>
          )}

          {!success && (
            <>
              <Typography variant="body2" color="text.secondary">
                Condividi la tua esperienza con il chatbot. Compila almeno uno dei campi seguenti.
              </Typography>

              <TextField
                label="Riflessioni sull'esperienza"
                placeholder="Descrivi la tua esperienza complessiva con il chatbot..."
                multiline
                rows={4}
                fullWidth
                value={riflessioni}
                onChange={(e) => setRiflessioni(e.target.value)}
                disabled={submitting}
                helperText="Es: Come ti sei trovato? Il chatbot ha risposto alle tue aspettative?"
              />

              <TextField
                label="Commenti e suggerimenti"
                placeholder="Eventuali suggerimenti per migliorare il servizio..."
                multiline
                rows={4}
                fullWidth
                value={commenti}
                onChange={(e) => setCommenti(e.target.value)}
                disabled={submitting}
                helperText="Es: Cosa potrebbe essere migliorato? Funzionalità mancanti?"
              />
            </>
          )}
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={submitting}>
          {success ? 'Chiudi' : 'Annulla'}
        </Button>
        {!success && (
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={submitting || (!riflessioni.trim() && !commenti.trim())}
            startIcon={submitting ? <CircularProgress size={16} /> : undefined}
          >
            {submitting ? 'Invio...' : 'Invia Feedback'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  )
}
