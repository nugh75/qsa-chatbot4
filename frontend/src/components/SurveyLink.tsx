import React from 'react'
import { Box, Link } from '@mui/material'

export const SurveyLink: React.FC<{onOpen: ()=>void}> = ({onOpen}) => {
  return (
    <Box sx={{ mt:1, textAlign:'right' }}>
      <Link component="button" type="button" onClick={onOpen} underline="hover" sx={{ fontSize: 12 }}>
        Questionario esperienza (anonimo)
      </Link>
    </Box>
  )
}
export default SurveyLink
