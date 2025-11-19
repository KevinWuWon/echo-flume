import React, { useState, useCallback } from 'react';
import FluidVisualizer from './components/FluidVisualizer';
import { audioManager } from './services/audioManager';
import { AudioMetrics } from './types';

interface DragState {
  active: boolean;
  startX: number;
  startY: number;
  currentY: number;
  startGain: number;
}

const App: React.FC = () => {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [metrics, setMetrics] = useState<AudioMetrics>({ bass: 0, mid: 0, treble: 0, volume: 0 });
  const [gain, setGain] = useState(1.5); // Default gain slightly boosted
  const [dragState, setDragState] = useState<DragState | null>(null);

  const updateMetrics = useCallback(() => {
    if (!audioManager.isInitialized) return;
    const m = audioManager.getMetrics();
    setMetrics(m);
    requestAnimationFrame(updateMetrics);
  }, []);

  const handleStart = async () => {
    try {
      await audioManager.initialize();
      setPermissionGranted(true);
      updateMetrics();
    } catch (e) {
      console.error("Microphone access required", e);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Prevent browser default behavior (text selection, scrolling, etc.) which can cancel pointer events on mobile
    e.preventDefault();
    
    if (!permissionGranted) return;
    if (!e.isPrimary) return;

    const state: DragState = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      currentY: e.clientY,
      startGain: gain
    };
    setDragState(state);
    
    // Capture the pointer to the main container
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Prevent default to ensure continuous tracking without scrolling
    e.preventDefault();

    if (!dragState?.active) return;

    const deltaY = dragState.startY - e.clientY;
    // Exponential scaling: Dragging up (positive delta) increases gain significantly but smoothly
    // Sensitivity: 300px move ~ 4.5x change
    const sensitivity = 0.005;
    const newGain = Math.max(0.1, dragState.startGain * Math.exp(deltaY * sensitivity));

    setGain(newGain);
    setDragState(prev => prev ? { ...prev, currentY: e.clientY } : null);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragState?.active) {
      setDragState(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch (err) {
        // Ignore if capture was already lost
      }
    }
  };

  return (
    <div 
      className="relative w-full h-screen bg-black text-white overflow-hidden cursor-none touch-none select-none"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      // Removed onPointerLeave as it can prematurely interrupt dragging on mobile boundaries
    >
      <div className="absolute inset-0">
        <FluidVisualizer audioMetrics={metrics} gain={gain} />
      </div>

      {/* Futuristic Recessed Gain Slider UI */}
      {dragState && (
        <div 
          className="absolute pointer-events-none z-50 mix-blend-screen"
          style={{ 
            left: dragState.startX, 
            top: dragState.startY,
          }}
        >
          {/* The Recessed Track with Fade-out Mask */}
          <div 
            className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-96"
            style={{
              maskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 20%, black 80%, transparent)'
            }}
          >
             {/* Track Background */}
             <div className="absolute inset-0 bg-black/40 backdrop-blur-sm border-x border-white/5">
                {/* Side Gradients for 3D Recessed Look */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80" />
                
                {/* Center Fill Gradient */}
                <div className="absolute left-1/2 top-0 bottom-0 w-2 -translate-x-1/2 bg-gradient-to-b from-white/0 via-white/10 to-white/0" />
                
                {/* Fine Center Guide Line */}
                <div className="absolute left-1/2 top-0 bottom-0 w-[1px] -translate-x-1/2 bg-white/10" />
             </div>
          </div>
          
          {/* The Thumb (Knob) */}
          <div 
            className="absolute left-0 -translate-x-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center"
            style={{ 
              top: dragState.currentY - dragState.startY 
            }}
          >
              {/* 3D Glass Button */}
              <div className="w-12 h-12 rounded-full bg-gradient-to-b from-white/20 to-white/5 backdrop-blur-md border border-white/40 shadow-[0_4px_15px_rgba(0,0,0,0.5)] relative">
                 {/* Top highlight for glass effect */}
                 <div className="absolute inset-x-3 top-1 h-4 bg-gradient-to-b from-white/40 to-transparent rounded-full opacity-70" />
                 
                 {/* Center glow dot */}
                 <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_2px_rgba(255,255,255,0.6)]" />
              </div>
          </div>
        </div>
      )}

      {!permissionGranted && (
        <div 
          className="absolute inset-0 z-50 flex items-center justify-center cursor-pointer bg-black/20 backdrop-blur-[2px]"
          onClick={handleStart}
        >
           <div className="text-white/40 font-light tracking-[0.3em] text-xs animate-pulse">
             TAP TO IMMERSE
           </div>
        </div>
      )}
    </div>
  );
};

export default App;