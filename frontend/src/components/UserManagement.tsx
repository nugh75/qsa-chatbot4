import React from 'react'
import { Box, Card, CardContent, Typography, Chip, Button, TextField, TableContainer, Paper, Table, TableHead, TableRow, TableCell, TableBody, LinearProgress, Alert, FormControlLabel, Switch, Tooltip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions } from '@mui/material'
import { Key as KeyIcon, Delete as DeleteIcon } from '@mui/icons-material'
import { authFetch, BACKEND } from '../utils/authFetch'

const UserManagement: React.FC = () => {
  const [users, setUsers] = React.useState<any[]>([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchTerm, setSearchTerm] = React.useState('')
  const [selectedUser, setSelectedUser] = React.useState<any>(null)
  const [resetPasswordDialog, setResetPasswordDialog] = React.useState(false)
  const [deleteDialog, setDeleteDialog] = React.useState(false)
  const [passwordResetResult, setPasswordResetResult] = React.useState<any>(null)

  const loadUsers = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await authFetch(`${BACKEND}/api/auth/admin/users`)
      const json = await res.json()
      if ((json as any).success && (json as any).data) {
        setUsers(((json as any).data as any).users || [])
      } else if ((json as any).users) {
        setUsers((json as any).users)
      } else {
        setError('Errore nel caricamento utenti')
      }
    } catch {
      setError('Errore di connessione')
    } finally { setLoading(false) }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return
    try {
      const res = await authFetch(`${BACKEND}/api/admin/users/${selectedUser.id}`, { method: 'DELETE' })
      const json = await res.json()
      if ((json as any).success !== false) {
        setUsers(prev => prev.filter(u => u.id !== selectedUser.id))
        setDeleteDialog(false); setSelectedUser(null)
      } else setError('Errore nell\'eliminazione utente')
    } catch { setError('Errore di connessione') }
  }

  const handleResetPassword = async () => {
    if (!selectedUser) return
    try {
      const res = await authFetch(`${BACKEND}/api/admin/users/${selectedUser.id}/reset-password`, { method: 'POST' })
      const json = await res.json()
      if ((json as any).success !== false) {
        setPasswordResetResult((json as any).data || json)
        setResetPasswordDialog(true)
        setSelectedUser(null)
      } else setError('Errore nel reset password')
    } catch { setError('Errore di connessione') }
  }

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text)

  const filteredUsers = users.filter(u => (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()))

  React.useEffect(() => { loadUsers() }, [])

  return (
    <Box sx={{ width: '100%' }}>
      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="h6">Gestione Utenti</Typography>
              <Chip label={`${users.length} utenti`} size="small" />
            </Box>
            <Button variant="outlined" onClick={loadUsers} disabled={loading} size="small">Aggiorna</Button>
          </Box>

          <TextField fullWidth size="small" placeholder="Cerca utenti..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} sx={{ mb: 3 }} />

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Email</TableCell>
                  <TableCell>Data Registrazione</TableCell>
                  <TableCell>Ultimo Login</TableCell>
                  <TableCell>Ruolo</TableCell>
                  <TableCell>Stato</TableCell>
                  <TableCell>Azioni</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredUsers.length > 0 ? filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2">{user.email}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{user.created_at ? new Date(user.created_at).toLocaleDateString('it-IT') : '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{user.last_login ? new Date(user.last_login).toLocaleDateString('it-IT') : 'Mai'}</Typography>
                    </TableCell>
                    <TableCell>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={!!(user as any).is_admin}
                            onChange={async (e)=>{
                              try {
                                await authFetch(`${BACKEND}/api/auth/admin/users/${user.id}/role`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_admin: e.target.checked }) })
                                setUsers(prev => prev.map(u => u.id===user.id ? { ...u, is_admin: e.target.checked } : u))
                              } catch {/* ignore */}
                            }}
                          />
                        }
                        label={(user as any).is_admin ? 'Amministratore' : 'Utente'}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip label={user.last_login ? 'Attivo' : 'Mai loggato'} color={user.last_login ? 'success' : 'default'} size="small" />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Reset Password">
                          <IconButton size="small" onClick={() => { setSelectedUser(user); handleResetPassword() }}>
                            <KeyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Elimina Utente">
                          <IconButton size="small" color="error" onClick={() => { setSelectedUser(user); setDeleteDialog(true) }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                )) : (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="text.secondary">{searchTerm ? 'Nessun utente trovato' : 'Nessun utente registrato'}</Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Dialog conferma eliminazione */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Confermi l'eliminazione?</DialogTitle>
        <DialogContent>
          <Typography>Eliminare definitivamente l'utente {selectedUser?.email}?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Annulla</Button>
          <Button onClick={handleDeleteUser} variant="contained" color="error">Elimina</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog reset password */}
      <Dialog open={resetPasswordDialog} onClose={() => setResetPasswordDialog(false)}>
        <DialogTitle>Password reset completato</DialogTitle>
        <DialogContent>
          <Alert severity="success" sx={{ mb: 2 }}>Password resettata con successo per {passwordResetResult?.email}</Alert>
          <Typography variant="body2" gutterBottom>Nuova password temporanea:</Typography>
          <TextField fullWidth value={passwordResetResult?.temporary_password || ''} InputProps={{ readOnly: true, endAdornment: (<Button size="small" onClick={() => copyToClipboard(passwordResetResult?.temporary_password || '')}>Copia</Button>) }} sx={{ mb: 2 }} />
          <Alert severity="info">L'utente dovrà cambiarla al primo login.</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setResetPasswordDialog(false); setPasswordResetResult(null) }} variant="contained">Chiudi</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

export default UserManagement
