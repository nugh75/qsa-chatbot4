import React, { useState, useEffect, useCallback } from 'react'
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Alert,
  CircularProgress
} from '@mui/material'
import PersonIcon from '@mui/icons-material/Person'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import { useAuth, type UserInfo } from '../contexts/AuthContext'
import { authFetch } from '../utils/authFetch'

export function UserImpersonation() {
  const { user, impersonatedUser, setImpersonation } = useAuth()
  const [users, setUsers] = useState<UserInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadUsers = useCallback(async () => {
    console.log('[UserImpersonation] Loading users from /api/admin/users')
    setLoading(true)
    setError(null)

    try {
      const response = await authFetch('/api/admin/users')
      console.log('[UserImpersonation] Response status:', response.status, 'ok:', response.ok)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.log('[UserImpersonation] Response data:', data)

      if (data.success && Array.isArray(data.users)) {
        console.log('[UserImpersonation] Loaded users:', data.users.length, data.users)
        setUsers(data.users)
        setError(null)
      } else {
        console.error('[UserImpersonation] Invalid response format:', data)
        setError('Errore nel caricamento degli utenti')
      }
    } catch (err: any) {
      console.error('[UserImpersonation] Error loading users:', err)
      setError(err.message || 'Errore di connessione')
    } finally {
      console.log('[UserImpersonation] Setting loading to false')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    console.log('[UserImpersonation] useEffect triggered', {
      user_is_admin: user?.is_admin,
      user_email: user?.email,
      users_count: users.length,
      loading
    })
    if (user?.is_admin && users.length === 0 && !loading) {
      console.log('[UserImpersonation] Calling loadUsers')
      loadUsers()
    }
  }, [user?.is_admin, loadUsers, users.length, loading])

  const handleUserChange = (userId: number | string) => {
    if (userId === '' || userId === 0) {
      // Reset impersonation
      setImpersonation(null)
    } else {
      const selectedUser = users.find(u => u.id === Number(userId))
      if (selectedUser) {
        // Ensure all required fields are present
        const userInfo: UserInfo = {
          id: selectedUser.id,
          email: selectedUser.email,
          username: selectedUser.username,
          is_admin: selectedUser.is_admin,
          created_at: selectedUser.created_at || new Date().toISOString()
        }
        setImpersonation(userInfo)
      }
    }
  }

  if (!user?.is_admin) {
    return null
  }

  return (
    <Box sx={{ minWidth: 250 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      
      <FormControl fullWidth size="small">
        <InputLabel>Visualizza come utente</InputLabel>
        <Select
          value={impersonatedUser?.id ?? 'none'}
          onChange={(e) => handleUserChange(e.target.value)}
          label="Visualizza come utente"
          disabled={loading}
          displayEmpty
          renderValue={(selected) => {
            if (loading) {
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <CircularProgress size={16} />
                  <span>Caricamento utenti...</span>
                </Box>
              )
            }

            if (!selected || selected === 'none') {
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <AdminPanelSettingsIcon fontSize="small" color="primary" />
                  <span>Vista Admin (te stesso)</span>
                </Box>
              )
            }

            const selectedUser = users.find(u => u.id === Number(selected))

            if (!selectedUser) {
              return (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PersonIcon fontSize="small" />
                  <span>Utente selezionato</span>
                </Box>
              )
            }

            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <PersonIcon fontSize="small" />
                <span>{selectedUser.username || selectedUser.email}</span>
                {selectedUser.is_admin && (
                  <Chip label="Admin" size="small" color="primary" />
                )}
              </Box>
            )
          }}
        >
          <MenuItem value="none">
            <span>Vista Admin (te stesso)</span>
          </MenuItem>
          {users.map((u) => (
            <MenuItem key={u.id} value={u.id}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>{u.username || u.email}</span>
                {u.is_admin && (
                  <Chip label="Admin" size="small" color="primary" sx={{ ml: 1 }} />
                )}
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      
      {impersonatedUser && (
        <Alert severity="warning" sx={{ mt: 1 }} icon={<PersonIcon />}>
          Stai visualizzando le conversazioni di: <strong>{impersonatedUser.username || impersonatedUser.email}</strong>
        </Alert>
      )}
    </Box>
  )
}
