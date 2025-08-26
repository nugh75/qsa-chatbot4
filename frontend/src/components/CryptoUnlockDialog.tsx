import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Alert, Box, Typography } from '@mui/material';
import { ChatCrypto } from '../crypto';
import { useAuth } from '../contexts/AuthContext';

interface CryptoUnlockDialogProps {
  open: boolean;
  onClose: () => void;
  onUnlocked?: () => void; // callback dopo sblocco
}

const CryptoUnlockDialog: React.FC<CryptoUnlockDialogProps> = ({ open, onClose, onUnlocked }) => {
  const { user, login, crypto: existingCrypto } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!user) return null; // Non mostrare se non autenticato

  const handleUnlock = async () => {
    setError(null);
    if (!password.trim()) {
      setError('Inserisci la password.');
      return;
    }
    setLoading(true);
    try {
      // Crea nuova istanza se non esiste o se non inizializzata
      const cryptoInstance = existingCrypto && existingCrypto.isKeyInitialized() ? existingCrypto : new ChatCrypto();
      await cryptoInstance.deriveKeyFromPassword(password, user.email);
      // Reimposta login con crypto inizializzata (mantiene user)
      login(user, cryptoInstance);
      setPassword('');
      onClose();
      onUnlocked && onUnlocked();
    } catch (e:any) {
      setError('Impossibile derivare la chiave. Password errata?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Sblocca conversazioni</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Inserisci la tua password per decrittare i titoli e i messaggi delle conversazioni crittografate.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <TextField
          label="Password"
          type="password"
          fullWidth
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={loading}
          autoFocus
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>Annulla</Button>
        <Button onClick={handleUnlock} variant="contained" disabled={loading}>Sblocca</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CryptoUnlockDialog;
