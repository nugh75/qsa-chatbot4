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
  // When encryption is disabled, this dialog is informational only
  const { onUnlocked: _noop } = { onUnlocked };
  const handleClose = () => {
    onClose();
    onUnlocked && onUnlocked();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Conversazioni accessibili</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          La crittografia client-side è disabilitata: tutte le conversazioni sono visibili dopo il login.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} variant="contained">Chiudi</Button>
      </DialogActions>
    </Dialog>
  );
};

export default CryptoUnlockDialog;
