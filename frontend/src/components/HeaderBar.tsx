import React from 'react'
import { AppBar, Toolbar, Box, IconButton, Select, MenuItem, FormControl, Tooltip, useMediaQuery, useTheme, Menu, Avatar } from '@mui/material'
import MoreVertIcon from '@mui/icons-material/MoreVert'

// Simple inline SVG icons (uniform style)
const PersonalitySvg = (props:any)=> (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.4-4 4.6-6 8-6s6.6 2 8 6" />
  </svg>
)
// Rimosse icone non utilizzate (VoiceSvg, DownloadSvg, GuideIcon, ArenaIcon, Login/Logout imports)

export interface HeaderBarProps {
  personalities: {id:string; name:string; provider:string; avatar_url?: string | null}[]
  selectedPersonalityId: string
  onChangePersonality: (id:string)=> void
  onOpenSidebar?: () => void
  onDownloadPdf?: ()=> void
  onDownloadTxt?: ()=> void
  onDownloadReport?: ()=> void
  onNewChat?: ()=> void
  onShowGuide?: ()=> void
  onOpenArena?: ()=> void
  showArena?: boolean
  isAuthenticated?: boolean
  onLogin?: ()=> void
  onLogout?: ()=> void
  dense?: boolean
  isAdmin?: boolean
}

const HeaderBar: React.FC<HeaderBarProps> = ({ personalities, selectedPersonalityId, onChangePersonality, onOpenSidebar, onDownloadPdf, onDownloadTxt, onDownloadReport, onNewChat, onShowGuide, onOpenArena, showArena, isAuthenticated, onLogin, onLogout, dense, isAdmin }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null)
  const [desktopAnchor, setDesktopAnchor] = React.useState<null | HTMLElement>(null)
  const menuOpen = Boolean(menuAnchor)
  const desktopOpen = Boolean(desktopAnchor)
  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>) => setMenuAnchor(e.currentTarget)
  const handleCloseMenu = () => setMenuAnchor(null)
  const handleOpenDesktop = (e: React.MouseEvent<HTMLElement>) => setDesktopAnchor(e.currentTarget)
  const handleCloseDesktop = () => setDesktopAnchor(null)
  // Safe fallbacks to avoid runtime errors if props become undefined (e.g. during async config load)
  const safePersonalities = Array.isArray(personalities) ? personalities : []
  // TTS selector rimosso; voce impostata dalla personalità
  return (
    <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', background:'#fff', borderRadius: 2, mb: 2 }}>
      <Toolbar variant={dense ? 'dense' : 'regular'} sx={{ display:'flex', gap:1, alignItems:'center', minHeight: dense ? 44 : undefined, px: 1 }}>
  {/* Hamburger rimosso: accesso conversazioni solo tramite menu overflow */}
  {/* Titolo rimosso: presenza personalità già indicata dal selettore */}
        {/* Personality selector */}
        <Box sx={{ display:'flex', alignItems:'center', gap:0.75, minWidth: isMobile ? 140 : 210 }}>
          {(() => {
            const current = safePersonalities.find(p=> p.id === selectedPersonalityId)
            const src = current?.avatar_url || '/volto.png'
            return <Avatar src={src} alt={current?.name || 'Bot'} sx={{ width: dense?30:36, height: dense?30:36 }} />
          })()}
          <FormControl size="small" fullWidth>
            <Select value={selectedPersonalityId || ''} onChange={e=> onChangePersonality(e.target.value as string)} displayEmpty sx={{ fontSize:14 }}>
              {safePersonalities.length === 0 && <MenuItem value=""><em>Nessuna</em></MenuItem>}
              {safePersonalities.map(p=> (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
  {/* Voice selector rimosso */}
  {/* Icone singole rimosse: tutte le azioni ora nel menu a tre puntini */}
        {/* Desktop overflow menu */}
        {!isMobile && (
          <>
            <Tooltip title="Altro">
              <IconButton size="small" onClick={handleOpenDesktop} aria-label="menu azioni">
                <MoreVertIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={desktopAnchor}
              open={desktopOpen}
              onClose={handleCloseDesktop}
              anchorOrigin={{ vertical:'bottom', horizontal:'right' }}
              transformOrigin={{ vertical:'top', horizontal:'right' }}
            >
              {onNewChat && <MenuItem onClick={()=> { handleCloseDesktop(); onNewChat() }}>Nuova conversazione</MenuItem>}
              <MenuItem disabled={!onDownloadPdf} onClick={()=> { handleCloseDesktop(); onDownloadPdf && onDownloadPdf() }}>Scarica PDF</MenuItem>
              <MenuItem disabled={!onDownloadTxt} onClick={()=> { handleCloseDesktop(); onDownloadTxt && onDownloadTxt() }}>Scarica TXT</MenuItem>
              <MenuItem disabled={!onDownloadReport} onClick={()=> { handleCloseDesktop(); onDownloadReport && onDownloadReport() }}>Scarica report AI</MenuItem>
              {onOpenSidebar && <MenuItem onClick={()=> { handleCloseDesktop(); onOpenSidebar() }}>Chat salvate</MenuItem>}
              {onShowGuide && <MenuItem onClick={()=> { handleCloseDesktop(); onShowGuide() }}>Guida</MenuItem>}
              {showArena && onOpenArena && <MenuItem onClick={()=> { handleCloseDesktop(); onOpenArena() }}>Arena</MenuItem>}
              {isAdmin && <MenuItem onClick={()=> { handleCloseDesktop(); window.location.href = '/admin' }}>Admin</MenuItem>}
              <MenuItem onClick={()=> { handleCloseDesktop(); isAuthenticated ? (onLogout && onLogout()) : (onLogin && onLogin()) }}>
                {isAuthenticated ? 'Logout' : 'Login'}
              </MenuItem>
            </Menu>
          </>
        )}
  {isMobile && (
          <>
            <IconButton size="small" onClick={handleOpenMenu} aria-label="menu azioni">
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu
              anchorEl={menuAnchor}
              open={menuOpen}
              onClose={handleCloseMenu}
              anchorOrigin={{ vertical:'bottom', horizontal:'right' }}
              transformOrigin={{ vertical:'top', horizontal:'right' }}
            >
              {onNewChat && <MenuItem onClick={()=> { handleCloseMenu(); onNewChat() }}>Nuova conversazione</MenuItem>}
              <MenuItem disabled={!onDownloadPdf} onClick={()=> { handleCloseMenu(); onDownloadPdf && onDownloadPdf() }}>Scarica PDF</MenuItem>
              <MenuItem disabled={!onDownloadTxt} onClick={()=> { handleCloseMenu(); onDownloadTxt && onDownloadTxt() }}>Scarica TXT</MenuItem>
              <MenuItem disabled={!onDownloadReport} onClick={()=> { handleCloseMenu(); onDownloadReport && onDownloadReport() }}>Scarica report AI</MenuItem>
              {onOpenSidebar && <MenuItem onClick={()=> { handleCloseMenu(); onOpenSidebar() }}>Chat salvate</MenuItem>}
              {onShowGuide && <MenuItem onClick={()=> { handleCloseMenu(); onShowGuide() }}>Guida</MenuItem>}
              {showArena && onOpenArena && <MenuItem onClick={()=> { handleCloseMenu(); onOpenArena() }}>Arena</MenuItem>}
              {isAdmin && <MenuItem onClick={()=> { handleCloseMenu(); window.location.href = '/admin' }}>Admin</MenuItem>}
              <MenuItem onClick={()=> { handleCloseMenu(); isAuthenticated ? (onLogout && onLogout()) : (onLogin && onLogin()) }}>
                {isAuthenticated ? 'Logout' : 'Login'}
              </MenuItem>
            </Menu>
          </>
        )}
        <Box sx={{ flex:1 }} />
      </Toolbar>
    </AppBar>
  )
}

export default HeaderBar
