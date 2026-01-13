import { createTheme } from '@mui/material/styles'

// Base radius previously visually around 16? We'll define base 8 and keep components tighter.
const baseRadius = 8

export const appTheme = createTheme({
  shape: { borderRadius: baseRadius },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        // Rimuove il grassetto globale su strong/b applicato da CssBaseline
        'strong, b': {
          fontWeight: 'inherit'
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        rounded: { borderRadius: baseRadius },
        root: { borderRadius: baseRadius }
      }
    },
    MuiCard: {
      styleOverrides: { root: { borderRadius: baseRadius } }
    },
    MuiButton: {
      styleOverrides: { root: { borderRadius: baseRadius - 2 } }
    },
    MuiTextField: {
      defaultProps: { variant: 'outlined' }
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: baseRadius } }
    }
  }
})

export default appTheme