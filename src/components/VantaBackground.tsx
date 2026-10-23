import React, { useEffect, useRef } from 'react';

interface VantaEffect {
  destroy: () => void;
}

interface VantaWaves {
  (config: {
    el: HTMLElement;
    mouseControls: boolean;
    touchControls: boolean;
    gyroControls: boolean;
    minHeight: number;
    minWidth: number;
    scale: number;
    scaleMobile: number;
    color: number;
    waveHeight: number;
    waveSpeed: number;
    zoom: number;
    backgroundColor: number;
  }): VantaEffect;
}

declare global {
  interface Window {
    VANTA: {
      WAVES: VantaWaves;
    };
  }
}

const VantaBackground: React.FC = () => {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<VantaEffect | null>(null);

  useEffect(() => {
    const initVanta = () => {
      if (vantaRef.current && !vantaEffect.current && window.VANTA) {
        vantaEffect.current = window.VANTA.WAVES({
          el: vantaRef.current,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.00,
          minWidth: 200.00,
          scale: 1.00,
          scaleMobile: 1.00,
          color: 0xc001f,
          waveHeight: 15,
          waveSpeed: 1.5,
          zoom: 0.75,
          backgroundColor: 0x000000
        });
      }
    };

    // Small delay to ensure scripts are loaded
    setTimeout(initVanta, 300);

    return () => {
      if (vantaEffect.current) {
        vantaEffect.current.destroy();
      }
    };
  }, []);

  return (
    <div
      ref={vantaRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100vh',
        zIndex: -1,
        backgroundColor: '#000000'
      }}
    />
  );
};

export default VantaBackground;