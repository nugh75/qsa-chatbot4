import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

// Arena icon: stylized trophy/cup
const ArenaIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M5 4h14v2a5 5 0 0 1-4 4.9V12a3 3 0 0 1-2 2.82V18h3v2H8v-2h3v-3.18A3 3 0 0 1 9 12v-1.1A5 5 0 0 1 5 6Z" />
    <path d="M5 6a3 3 0 0 1-3-3h3Zm14 0V3h3a3 3 0 0 1-3 3Z" />
  </SvgIcon>
)

export default ArenaIcon
