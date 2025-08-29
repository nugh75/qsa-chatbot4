import { createTheme } from '@mui/material/styles'

export const appTheme = createTheme({
  // Riduzione dei raggi per un look meno "pill" (circa metà)
  shape: { borderRadius: 8 },
  breakpoints: {
    values: { xs:0, sm:600, md:900, lg:1200, xl:1536 }
  },
  typography: {
    fontFamily: 'Inter, Roboto, Helvetica, Arial, sans-serif',
    h5: { fontSize: '1.3rem', fontWeight:600, '@media (max-width:600px)': { fontSize: '1.15rem' } },
    body1: { fontSize:'0.95rem', '@media (max-width:600px)': { fontSize:'0.9rem' } },
    body2: { fontSize:'0.85rem' }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          WebkitFontSmoothing: 'antialiased',
          backgroundColor: '#f5f7fa'
        }
      }
    },
    MuiContainer: { styleOverrides: { root: { '@media (max-width:600px)': { paddingLeft:8, paddingRight:8 } } } },
  MuiPaper: { styleOverrides: { root: { borderRadius: 8 } } },
  MuiCard: { styleOverrides: { root: { borderRadius: 9 } } },
  MuiButton: { styleOverrides: { root: { borderRadius: 10, textTransform: 'none' } } },
  MuiTextField: { styleOverrides: { root: { borderRadius: 8 } } },
  MuiDialog: { styleOverrides: { paper: { borderRadius: 10 } } },
  MuiAccordion: { styleOverrides: { root: { borderRadius: 8, '&:before': { display: 'none' } } } },
  MuiChip: { styleOverrides: { root: { borderRadius: 6 } } },
  },
  palette: {
    mode: 'light'
  }
})
