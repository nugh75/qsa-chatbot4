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

// Rimosso pulse/dot: solo onde verticali

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
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 0.6,
        width: size * 4,
        height: size,
        px: 0.5
      }}
    >
      {/* Wave bars */}
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
            width: 3,
            height: size,
            backgroundColor: 'error.main',
            borderRadius: 1.5,
            transformOrigin: 'center',
            animation: `${animation} 1s ease-in-out infinite`,
            animationDelay: `${index * 0.06}s`,
          }}
        />
      ))}
    </Box>
  );
};

export default VoiceRecordingAnimation;
