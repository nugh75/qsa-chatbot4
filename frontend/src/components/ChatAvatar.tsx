import { Avatar } from '@mui/material'
import React from 'react'

type ChatAvatarProps = {
  src?: string
  alt?: string
  size?: number
  personalityId?: string
}

// Avatar robusto: fallback se errore di caricamento, forza rerender al cambio personalityId
export default function ChatAvatar({ src = '/volto.png', alt = 'Counselorbot', size = 40, personalityId }: ChatAvatarProps){
  const [error, setError] = React.useState(false)
  React.useEffect(()=> { setError(false) }, [src, personalityId])
  const finalSrc = error ? '/volto.png' : src
  return <Avatar alt={alt} src={finalSrc} sx={{ width:size, height:size }} onError={()=> setError(true)} />
}
