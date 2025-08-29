import React from 'react'
import { AppBar, Toolbar, Box, IconButton, Select, MenuItem, FormControl, Tooltip, useMediaQuery, useTheme } from '@mui/material'
import GuideIcon from './icons/GuideIcon'
import ArenaIcon from './icons/ArenaIcon'
import LogoutIcon from '@mui/icons-material/Logout'
import LoginIcon from '@mui/icons-material/Login'

// Simple inline SVG icons (uniform style)
const PersonalitySvg = (props:any)=> (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.4-4 4.6-6 8-6s6.6 2 8 6" />
  </svg>
)
const VoiceSvg = (props:any)=> (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect x="9" y="4" width="6" height="12" rx="3" />
    <path d="M5 11v1a7 7 0 0 0 14 0v-1" />
    <path d="M12 19v3" />
  </svg>
)
const DownloadSvg = (props:any)=> (
  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </svg>
)

export interface HeaderBarProps {
  personalities: {id:string; name:string; provider:string}[]
  selectedPersonalityId: string
  onChangePersonality: (id:string)=> void
  ttsProviders: string[]
  ttsProvider: string
  onChangeTts: (p:string)=> void
  onDownloadChat?: ()=> void
  onNewChat?: ()=> void
  onShowGuide?: ()=> void
  onOpenArena?: ()=> void
  showArena?: boolean
  isAuthenticated?: boolean
  onLogin?: ()=> void
  onLogout?: ()=> void
  dense?: boolean
}

const HeaderBar: React.FC<HeaderBarProps> = ({ personalities, selectedPersonalityId, onChangePersonality, ttsProviders, ttsProvider, onChangeTts, onDownloadChat, onNewChat, onShowGuide, onOpenArena, showArena, isAuthenticated, onLogin, onLogout, dense }) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'))
  return (
    <AppBar position="static" color="default" elevation={0} sx={{ borderBottom: '1px solid', borderColor: 'divider', background:'#fff' }}>
      <Toolbar variant={dense ? 'dense' : 'regular'} sx={{ display:'flex', gap:1, alignItems:'center', minHeight: dense ? 44 : undefined, px: 1 }}>
        {/* Personality selector */}
        <Box sx={{ display:'flex', alignItems:'center', gap:0.5, minWidth: isMobile ? 120 : 180 }}>
          <PersonalitySvg />
          <FormControl size="small" fullWidth>
            <Select value={selectedPersonalityId || ''} onChange={e=> onChangePersonality(e.target.value as string)} displayEmpty sx={{ fontSize:14 }}>
              {personalities.length === 0 && <MenuItem value=""><em>Nessuna</em></MenuItem>}
              {personalities.map(p=> <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        {/* Voice selector */}
        <Box sx={{ display:'flex', alignItems:'center', gap:0.5, minWidth: isMobile ? 110 : 140 }}>
          <VoiceSvg />
          <FormControl size="small" fullWidth>
            <Select value={ttsProviders.includes(ttsProvider)? ttsProvider: ''} onChange={e=> onChangeTts(e.target.value as string)} displayEmpty sx={{ fontSize:14 }}>
              {ttsProviders.length === 0 && <MenuItem value=""><em>Voce</em></MenuItem>}
              {ttsProviders.map(v=> <MenuItem key={v} value={v}>{v}</MenuItem>)}
            </Select>
          </FormControl>
        </Box>
        {/* Download chat */}
        <Tooltip title="Scarica chat"><span>
          <IconButton size="small" disabled={!onDownloadChat} onClick={onDownloadChat}>
            <DownloadSvg />
          </IconButton></span>
        </Tooltip>
        {!isMobile && onNewChat && (
          <Tooltip title="Nuova conversazione">
            <IconButton size="small" onClick={onNewChat}>
              <span style={{ fontSize:18, lineHeight:1 }}>＋</span>
            </IconButton>
          </Tooltip>
        )}
        {!isMobile && onShowGuide && (
          <Tooltip title="Guida">
            <IconButton size="small" onClick={onShowGuide}>
              <GuideIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {!isMobile && showArena && onOpenArena && (
          <Tooltip title="Arena">
            <IconButton size="small" onClick={onOpenArena}>
              <ArenaIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {!isMobile && (
          isAuthenticated ? (
            <Tooltip title="Logout">
              <IconButton size="small" onClick={onLogout}>
                <LogoutIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : (
            <Tooltip title="Login">
              <IconButton size="small" onClick={onLogin}>
                <LoginIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )
        )}
        <Box sx={{ flex:1 }} />
      </Toolbar>
    </AppBar>
  )
}

export default HeaderBar
