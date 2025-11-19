import { ref, onMounted, computed } from 'vue';
import FluidVisualizer from './components/FluidVisualizer.js';
import { audioManager } from './services/audioManager.js';

/**
 * @typedef {import('./services/audioManager.js').AudioMetrics} AudioMetrics
 */

/**
 * @typedef {Object} DragState
 * @property {boolean} active
 * @property {number} startX
 * @property {number} startY
 * @property {number} currentY
 * @property {number} startGain
 */

export default {
  components: { FluidVisualizer },
  setup() {
    const permissionGranted = ref(false);
    /** @type {import('vue').Ref<AudioMetrics>} */
    const metrics = ref({ bass: 0, mid: 0, treble: 0, volume: 0 });
    const gain = ref(1.5);
    /** @type {import('vue').Ref<DragState | null>} */
    const dragState = ref(null);

    const updateMetrics = () => {
      if (!audioManager.isInitialized) return;
      const m = audioManager.getMetrics();
      metrics.value = m;
      requestAnimationFrame(updateMetrics);
    };

    const handleStart = async () => {
      try {
        await audioManager.initialize();
        permissionGranted.value = true;
        updateMetrics();
      } catch (e) {
        console.error("Microphone access required", e);
      }
    };

    /**
     * @param {PointerEvent} e
     */
    const handlePointerDown = (e) => {
      e.preventDefault();

      if (!permissionGranted.value) return;
      if (!e.isPrimary) return;

      dragState.value = {
        active: true,
        startX: e.clientX,
        startY: e.clientY,
        currentY: e.clientY,
        startGain: gain.value
      };

      // Capture the pointer to the main container
      e.currentTarget.setPointerCapture(e.pointerId);
    };

    /**
     * @param {PointerEvent} e
     */
    const handlePointerMove = (e) => {
      e.preventDefault();

      if (!dragState.value?.active) return;

      const deltaY = dragState.value.startY - e.clientY;
      // Exponential scaling: Dragging up (positive delta) increases gain significantly but smoothly
      // Sensitivity: 300px move ~ 4.5x change
      const sensitivity = 0.005;
      const newGain = Math.max(0.1, dragState.value.startGain * Math.exp(deltaY * sensitivity));

      gain.value = newGain;
      dragState.value = { ...dragState.value, currentY: e.clientY };
    };

    /**
     * @param {PointerEvent} e
     */
    const handlePointerUp = (e) => {
      e.preventDefault();
      if (dragState.value?.active) {
        dragState.value = null;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch (err) {
          // Ignore if capture was already lost
        }
      }
    };

    return {
      permissionGranted,
      metrics,
      gain,
      dragState,
      handleStart,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp
    };
  },
  template: `
    <div
      class="relative w-full h-screen bg-black text-white overflow-hidden touch-none select-none"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="handlePointerUp"
      @pointercancel="handlePointerUp"
    >
      <div class="absolute inset-0">
        <FluidVisualizer :audioMetrics="metrics" :gain="gain" />
      </div>

      <!-- Futuristic Recessed Gain Slider UI -->
      <div
        v-if="dragState"
        class="absolute pointer-events-none z-50 mix-blend-screen"
        :style="{
          left: dragState.startX + 'px',
          top: dragState.startY + 'px',
        }"
      >
        <!-- The Recessed Track with Fade-out Mask -->
        <div
          class="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-96"
          style="mask-image: linear-gradient(to bottom, transparent, black 20%, black 80%, transparent); -webkit-mask-image: linear-gradient(to bottom, transparent, black 20%, black 80%, transparent);"
        >
           <!-- Track Background -->
           <div class="absolute inset-0 bg-black/40 backdrop-blur-sm border-x border-white/5">
              <!-- Side Gradients for 3D Recessed Look -->
              <div class="absolute inset-0 bg-gradient-to-r from-black/80 via-transparent to-black/80"></div>

              <!-- Center Fill Gradient -->
              <div class="absolute left-1/2 top-0 bottom-0 w-2 -translate-x-1/2 bg-gradient-to-b from-white/0 via-white/10 to-white/0"></div>

              <!-- Fine Center Guide Line -->
              <div class="absolute left-1/2 top-0 bottom-0 w-[1px] -translate-x-1/2 bg-white/10"></div>
           </div>
        </div>

        <!-- The Thumb (Knob) -->
        <div
          class="absolute left-0 -translate-x-1/2 -translate-y-1/2 w-16 h-16 flex items-center justify-center"
          :style="{
            top: (dragState.currentY - dragState.startY) + 'px'
          }"
        >
            <!-- 3D Glass Button -->
            <div class="w-12 h-12 rounded-full bg-gradient-to-b from-white/20 to-white/5 backdrop-blur-md border border-white/40 shadow-[0_4px_15px_rgba(0,0,0,0.5)] relative">
               <!-- Top highlight for glass effect -->
               <div class="absolute inset-x-3 top-1 h-4 bg-gradient-to-b from-white/40 to-transparent rounded-full opacity-70"></div>

               <!-- Center glow dot -->
               <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white rounded-full shadow-[0_0_8px_2px_rgba(255,255,255,0.6)]"></div>
            </div>
        </div>
      </div>

      <div
        v-if="!permissionGranted"
        class="absolute inset-0 z-50 flex items-center justify-center cursor-pointer bg-black/20 backdrop-blur-[2px]"
        @click="handleStart"
      >
         <div class="text-white/40 font-light tracking-[0.3em] text-xs animate-pulse">
           TAP TO IMMERSE
         </div>
      </div>
    </div>
  `
};
