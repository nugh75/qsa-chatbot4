import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import App from './App'
import AdminPanel from './AdminPanel'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Box, CircularProgress, Typography } from '@mui/material'
import LoginDialog from './components/LoginDialog'
import Arena from './Arena'

const AdminRoute: React.FC = () => {
  const { isAuthenticated, isLoading, user, login } = useAuth()
  const [loginOpen, setLoginOpen] = React.useState(false)
  React.useEffect(()=>{
    if (!isLoading && !isAuthenticated) setLoginOpen(true)
  }, [isLoading, isAuthenticated])
  if (isLoading) return <Box sx={{ p:4, display:'flex', justifyContent:'center' }}><CircularProgress /></Box>
  if (!isAuthenticated) {
    return (
      <>
        <Box sx={{ p:4 }}>
          <Typography sx={{ mb:2 }}>Accedi per continuare.</Typography>
        </Box>
        <LoginDialog
          open={loginOpen}
          onClose={()=> setLoginOpen(false)}
          onLoginSuccess={(u, crypto)=>{ login(u as any, crypto); setLoginOpen(false) }}
        />
      </>
    )
  }
  if (!(user as any)?.is_admin) return <Box sx={{ p:4 }}><Typography>Accesso negato: privilegi amministratore richiesti.</Typography></Box>
  return <AdminPanel />
}
import SurveyResults from './SurveyResults'

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/admin" element={<AdminRoute />} />
        {/* Survey results dedicated route */}
        <Route path="/survey-results" element={<SurveyResults />} />
        {/* Arena: statistiche feedback per provider/modello/personalità */}
        <Route path="/arena" element={<Arena />} />
      </Routes>
    </BrowserRouter>
  </AuthProvider>
)
