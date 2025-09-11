import React from 'react'
import { Box, Card, CardContent, Typography, Grid, Chip, LinearProgress, Link } from '@mui/material'

type Props = {
  payload: any
}

const FormResultRenderer: React.FC<Props> = ({ payload }) => {
  if (!payload || !Array.isArray(payload.rows)) return null

  // Group rows by group/series if provided
  const groups: Record<string, any[]> = {}
  payload.rows.forEach((r: any) => {
    const g = r.group || ''
    groups[g] = groups[g] || []
    groups[g].push(r)
  })

  return (
    <Box>
      {Object.keys(groups).map((g, gi) => (
        <Box key={gi} sx={{ mb: 1 }}>
          {g ? <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>{g}</Typography> : null}
          <Grid container spacing={1}>
            {groups[g].map((r: any, ri: number) => (
              <Grid item xs={12} key={ri}>
                <Card variant="outlined" sx={{ bgcolor: '#fff' }}>
                  <CardContent sx={{ p: 1 }}>
                    <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'normal', wordBreak: 'break-word' }}>{r.series || r.id}</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'normal', wordBreak: 'break-word' }}>{r.label || r.id}</Typography>
                    <Box sx={{ mt: 0.5 }}>
                      {/* Render by inferred type */}
                      {typeof r.value === 'boolean' ? (
                        <Chip label={r.value ? 'Sì' : 'No'} color={r.value ? 'success' : 'default'} size="small" />
                      ) : Array.isArray(r.value) ? (
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>{r.value.map((v:any, idx:number)=> <Chip key={idx} label={String(v)} size="small" />)}</Box>
                      ) : (typeof r.value === 'number' && (r.min !== undefined || r.max !== undefined)) ? (
                        <Box>
                          <Typography variant="body2">{String(r.value ?? '')}</Typography>
                          <LinearProgress variant="determinate" value={((Number(r.value) - (r.min||0)) / ((r.max||1) - (r.min||0))) * 100} sx={{ mt:0.5 }} />
                        </Box>
                      ) : (r.type === 'file' || (r.value && typeof r.value === 'string' && r.value.startsWith('http')) ) ? (
                        <Link href={String(r.value)} target="_blank" rel="noopener noreferrer">{String(r.value)}</Link>
                      ) : (
                        <Typography variant="body2">{String(r.value ?? '')}</Typography>
                      )}
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Box>
  )
}

export default FormResultRenderer
