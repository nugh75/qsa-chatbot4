import { Avatar } from '@mui/material'

type ChatAvatarProps = {
  src?: string
  alt?: string
  size?: number
}

export default function ChatAvatar({ src = '/volto.png', alt = 'Counselorbot', size = 40 }: ChatAvatarProps){
  return <Avatar alt={alt} src={src} sx={{ width:size, height:size }} />
}
