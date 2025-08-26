import React from 'react';
import { Box, keyframes } from '@mui/material';

const waveAnimation = keyframes`
  0%, 100% {
    transform: scaleY(0.3);
  }
  50% {
    transform: scaleY(1);
  }
`;

const waveAnimation2 = keyframes`
  0%, 100% {
    transform: scaleY(0.5);
  }
  25%, 75% {
    transform: scaleY(1);
  }
`;

const waveAnimation3 = keyframes`
  0%, 100% {
    transform: scaleY(0.7);
  }
  33%, 66% {
    transform: scaleY(1);
  }
`;

const pulseAnimation = keyframes`
  0% {
    transform: scale(1);
    opacity: 1;
  }
  100% {
    transform: scale(1.4);
    opacity: 0;
  }
`;

interface VoiceRecordingAnimationProps {
  isRecording: boolean;
  size?: number;
}

const VoiceRecordingAnimation: React.FC<VoiceRecordingAnimationProps> = ({ 
  isRecording, 
  size = 24 
}) => {
  if (!isRecording) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.8,  // Spazio tra le barre
        position: 'relative',
        width: size * 4,  // Ancora più largo
        height: size,
      }}
    >
      {/* Pulse effect background */}
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          width: size * 1.2,
          height: size * 1.2,
          borderRadius: '50%',
          backgroundColor: 'error.main',
          opacity: 0.15,
          animation: `${pulseAnimation} 2.5s ease-out infinite`,
        }}
      />
      
      {/* Wave bars - ancora più barre per un effetto più ricco */}
      {[
        waveAnimation, 
        waveAnimation2, 
        waveAnimation3, 
        waveAnimation2, 
        waveAnimation, 
        waveAnimation3,
        waveAnimation2,
        waveAnimation,
        waveAnimation3,
        waveAnimation2
      ].map((animation, index) => (
        <Box
          key={index}
          sx={{
            width: 4,  // Barre più larghe
            height: size * 1.1,  // Altezza maggiore
            backgroundColor: 'error.main',
            borderRadius: 2,
            transformOrigin: 'center',
            animation: `${animation} 1s ease-in-out infinite`,  // Animazione più fluida
            animationDelay: `${index * 0.06}s`,  // Delay per effetto cascata
          }}
        />
      ))}
    </Box>
  );
};

export default VoiceRecordingAnimation;
