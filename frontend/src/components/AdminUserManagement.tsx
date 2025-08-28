import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  CardHeader,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  LinearProgress,
  Chip,
  Tooltip,
  TextField,
  InputAdornment
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Key as KeyIcon,
  Person as PersonIcon,
  Email as EmailIcon,
  Search as SearchIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

const BACKEND = (import.meta as any).env?.VITE_BACKEND_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8005');

interface User {
  id: number;
  email: string;
  created_at: string;
  last_login: string | null;
}

interface PasswordResetResult {
  email: string;
  temporary_password: string;
}

export default function AdminUserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Dialog states
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [resetPasswordDialog, setResetPasswordDialog] = useState(false);
  const [passwordResetResult, setPasswordResetResult] = useState<PasswordResetResult | null>(null);
  
  // Selected user for actions
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${BACKEND}/api/admin/users`);
      const data = await res.json();
      
      if (data.success) {
        setUsers(data.users);
        setError(null);
      } else {
        setError(data.error || 'Errore nel caricamento utenti');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;
    
    try {
      const res = await fetch(`${BACKEND}/api/admin/users/${selectedUser.id}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      if (data.success) {
        setDeleteDialog(false);
        setSelectedUser(null);
        loadUsers();
      } else {
        setError(data.error || 'Errore nell\'eliminazione utente');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    
    try {
      const res = await fetch(`${BACKEND}/api/admin/users/${selectedUser.id}/reset-password`, {
        method: 'POST'
      });
      
      const data = await res.json();
      if (data.success) {
        setPasswordResetResult({
          email: data.email,
          temporary_password: data.temporary_password
        });
        setResetPasswordDialog(true);
        setSelectedUser(null);
      } else {
        setError(data.error || 'Errore nel reset password');
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'Mai';
    return new Date(dateString).toLocaleString('it-IT');
  };

  const getDaysSinceCreation = (dateString: string): number => {
    const created = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - created.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getDaysSinceLastLogin = (dateString: string | null): number | null => {
    if (!dateString) return null;
    const lastLogin = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - lastLogin.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const filteredUsers = users.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <Box sx={{ width: '100%' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Card>
        <CardHeader
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <PersonIcon />
              <Typography variant="h6">Gestione Utenti</Typography>
              <Chip label={`${users.length} utenti`} size="small" />
            </Box>
          }
          action={
            <Button
              variant="outlined"
              startIcon={<RefreshIcon />}
              onClick={loadUsers}
              size="small"
            >
              Aggiorna
            </Button>
          }
        />
        <CardContent>
          {/* Search */}
          <TextField
            fullWidth
            variant="outlined"
            placeholder="Cerca per email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
          />

          {/* Users Table */}
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Data Registrazione</TableCell>
                  <TableCell>Ultimo Login</TableCell>
                  <TableCell>Stato</TableCell>
                  <TableCell>Azioni</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.map((user) => {
                  const daysSinceCreation = getDaysSinceCreation(user.created_at);
                  const daysSinceLastLogin = getDaysSinceLastLogin(user.last_login);
                  
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <EmailIcon fontSize="small" />
                          {user.email}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2">
                            {formatDate(user.created_at)}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {daysSinceCreation} giorni fa
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2">
                            {formatDate(user.last_login)}
                          </Typography>
                          {daysSinceLastLogin && (
                            <Typography variant="caption" color="text.secondary">
                              {daysSinceLastLogin} giorni fa
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={user.last_login ? 'Attivo' : 'Mai loggato'}
                          color={user.last_login ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Tooltip title="Reset Password">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setSelectedUser(user);
                                handleResetPassword();
                              }}
                            >
                              <KeyIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Elimina Utente">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setSelectedUser(user);
                                setDeleteDialog(true);
                              }}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      {searchTerm ? 'Nessun utente trovato' : 'Nessun utente registrato'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Delete User Dialog */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Conferma Eliminazione</DialogTitle>
        <DialogContent>
          <Typography>
            Sei sicuro di voler eliminare l'utente <strong>{selectedUser?.email}</strong>?
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            Questa azione eliminerà anche tutte le conversazioni dell'utente e non può essere annullata.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Annulla</Button>
          <Button
            onClick={handleDeleteUser}
            variant="contained"
            color="error"
          >
            Elimina
          </Button>
        </DialogActions>
      </Dialog>

      {/* Password Reset Result Dialog */}
      <Dialog open={resetPasswordDialog} onClose={() => setResetPasswordDialog(false)}>
        <DialogTitle>Password Reset Completato</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>
            Password resettata con successo per {passwordResetResult?.email}
          </Alert>
          
          <Typography variant="body2" gutterBottom>
            <strong>Nuova password temporanea:</strong>
          </Typography>
          
          <TextField
            fullWidth
            value={passwordResetResult?.temporary_password || ''}
            variant="outlined"
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position="end">
                  <Button
                    size="small"
                    onClick={() => copyToClipboard(passwordResetResult?.temporary_password || '')}
                  >
                    Copia
                  </Button>
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2 }}
          />
          
          <Alert severity="info">
            Comunica questa password temporanea all'utente. L'utente dovrebbe cambiarla al primo login.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setResetPasswordDialog(false);
              setPasswordResetResult(null);
            }}
            variant="contained"
          >
            Chiudi
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
