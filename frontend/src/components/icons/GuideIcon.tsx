import React from 'react'
import { SvgIcon, SvgIconProps } from '@mui/material'

const GuideIcon: React.FC<SvgIconProps> = (props) => (
  <SvgIcon {...props} viewBox="0 0 24 24">
    <path d="M12 3a9 9 0 1 0 9 9 9 9 0 0 0-9-9Zm0 14.2a1.2 1.2 0 1 1 1.2-1.2A1.2 1.2 0 0 1 12 17.2Zm1.9-7.8-.7.7A2.6 2.6 0 0 0 12.4 12a.6.6 0 0 1-1.2 0 3.8 3.8 0 0 1 1.1-2.7l.9-.9a1.4 1.4 0 0 0-1-.4 1.6 1.6 0 0 0-1.5 1 .6.6 0 0 1-.56.4.6.6 0 0 1-.64-.6 2.8 2.8 0 0 1 2.8-2 2.6 2.6 0 0 1 1.8.7 2.2 2.2 0 0 1 0 3.1Z" />
  </SvgIcon>
)

export default GuideIcon
