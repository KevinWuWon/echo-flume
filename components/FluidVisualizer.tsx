import React, { useEffect, useRef } from 'react';
import { AudioMetrics } from '../types';

interface Props {
  audioMetrics: AudioMetrics;
  gain: number;
}

const FluidVisualizer: React.FC<Props> = ({ audioMetrics, gain }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef({ metrics: audioMetrics, gain });

  useEffect(() => {
    audioRef.current = { metrics: audioMetrics, gain };
  }, [audioMetrics, gain]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl');
    if (!gl) return;

    // Resize logic
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    window.addEventListener('resize', resize);
    resize();

    // --- Shader Setup ---

    const createShader = (gl: WebGLRenderingContext, type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error("Shader compile error:", gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const createProgram = (gl: WebGLRenderingContext, vs: string, fs: string) => {
      const vertexShader = createShader(gl, gl.VERTEX_SHADER, vs);
      const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fs);
      if (!vertexShader || !fragmentShader) return null;
      
      const program = gl.createProgram();
      if (!program) return null;
      
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error("Program link error:", gl.getProgramInfoLog(program));
        return null;
      }
      return program;
    };

    const vsSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;

    // Simulation Shader: Handles Gaseous Advection, Noise Injection, and Ripples
    const fsSimSource = `
      precision highp float;
      uniform sampler2D u_texture;
      uniform vec2 u_resolution;
      uniform float u_time;
      uniform float u_bass;
      uniform float u_mid;
      uniform float u_treble;
      uniform float u_vol;

      // --- Noise Functions ---
      float random (in vec2 _st) {
          return fract(sin(dot(_st.xy, vec2(12.9898,78.233)))*43758.5453123);
      }

      float noise (in vec2 st) {
          vec2 i = floor(st);
          vec2 f = fract(st);

          float a = random(i);
          float b = random(i + vec2(1.0, 0.0));
          float c = random(i + vec2(0.0, 1.0));
          float d = random(i + vec2(1.0, 1.0));

          vec2 u = f * f * (3.0 - 2.0 * f);

          return mix(a, b, u.x) +
                  (c - a)* u.y * (1.0 - u.x) +
                  (d - b) * u.x * u.y;
      }

      float fbm (in vec2 st) {
          float v = 0.0;
          float a = 0.5;
          mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
          for (int i = 0; i < 5; ++i) {
              v += a * noise(st);
              st = rot * st * 2.0 + 100.0;
              a *= 0.5;
          }
          return v;
      }

      // HSB to RGB conversion
      vec3 hsb2rgb(in vec3 c) {
        vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
        rgb = rgb * rgb * (3.0 - 2.0 * rgb);
        return c.z * mix(vec3(1.0), rgb, c.y);
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        vec2 center = vec2(0.5, 0.5);
        
        // Aspect ratio correction for polar math
        float aspect = u_resolution.x / u_resolution.y;
        vec2 p = uv - center;
        p.x *= aspect;
        float radius = length(p);
        float angle = atan(p.y, p.x);

        // --- 1. Advection (Flow) ---
        // Move pixels outwards. 
        // Value < 1.0 means sampling from closer to center (outward flow).
        // Previous speed was 0.96. Halving the *movement* (0.04) means 0.02 -> 0.98.
        float expansionSpeed = 0.985 - (u_bass * 0.01); 

        // Calculate turbulence based on noise
        float turbulence = fbm(vec2(radius * 1.5, angle * 2.0 + u_time * 0.2));
        
        // Sound Ripple: A wave traveling outwards
        float wave = sin(radius * 20.0 - u_time * 8.0);
        float ripple = wave * u_bass * 0.05;

        // Apply rotation and turbulence to angle
        float rotation = (u_time * 0.05) + (turbulence * 0.1) + ripple;

        // Calculate sampling coordinate
        vec2 sampleDir = vec2(cos(angle - rotation), sin(angle - rotation));
        
        // Apply radial noise to expansion (varying speed by angle)
        float radialNoise = (noise(vec2(angle * 4.0, u_time * 0.5)) - 0.5) * 0.02;
        
        sampleDir *= radius * (expansionSpeed + radialNoise); 
        sampleDir.x /= aspect; // Remove aspect correction
        vec2 sampleUV = center + sampleDir;

        // Sample previous frame
        vec4 prev = texture2D(u_texture, sampleUV);
        
        // Decay trail - preserve brightness at edges better by distance based decay
        float decay = 0.97 + (radius * 0.025); 
        prev *= min(decay, 0.995); 

        // --- 2. Injection (New Matter) ---
        // Create gaseous source in center, irregular shape
        float shapeNoise = fbm(vec2(angle * 3.0, u_time * 0.5));
        float sourceRadius = 0.03 + (u_mid * 0.1) + (shapeNoise * 0.05);
        
        float sourceMask = smoothstep(sourceRadius, sourceRadius * 0.5, radius);

        // Color logic: Single hue base, rotating slowly
        float baseHue = fract(u_time * 0.02);
        // Vary hue slightly by turbulence
        float localHue = fract(baseHue + turbulence * 0.1);
        
        float saturation = 0.5 + (u_treble * 0.3);
        
        // Constant generation brightness (idle state) + Audio reactivity
        float brightness = 0.2 + (u_vol * 1.5); 
        
        // Add bright ripples to the newly generated matter
        brightness += (wave * 0.5 + 0.5) * u_mid * sourceMask;

        vec3 sourceColor = hsb2rgb(vec3(localHue, saturation, brightness));
        
        // Inject source into field with additive mixing for glowing gas effect
        // But mix with prev to keep flow
        vec3 color = mix(prev.rgb, sourceColor, sourceMask * brightness);

        // --- 3. Global Reaction ---
        // Slight global brightening on loud sounds
        color *= (1.0 + u_vol * 0.05);

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    // Display Shader: Renders the simulation texture to screen
    const fsDisplaySource = `
      precision highp float;
      uniform sampler2D u_texture;
      uniform vec2 u_resolution;
      void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        vec4 color = texture2D(u_texture, uv);
        // Slight contrast boost for display
        color.rgb = pow(color.rgb, vec3(1.1)); 
        gl_FragColor = color;
      }
    `;

    const simProgram = createProgram(gl, vsSource, fsSimSource);
    const displayProgram = createProgram(gl, vsSource, fsDisplaySource);

    if (!simProgram || !displayProgram) return;

    // Buffer Setup (Full screen quad)
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1.0, -1.0,
      1.0, -1.0,
      -1.0, 1.0,
      1.0, 1.0,
    ]), gl.STATIC_DRAW);

    const aPositionSim = gl.getAttribLocation(simProgram, "position");
    const aPositionDisplay = gl.getAttribLocation(displayProgram, "position");

    // Ping-Pong Buffers Setup
    const createTexture = (w: number, h: number) => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      return tex;
    };

    const createFBO = (tex: WebGLTexture) => {
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      return fbo;
    };

    let w = canvas.width;
    let h = canvas.height;
    
    let texA = createTexture(w, h);
    let texB = createTexture(w, h);
    let fboA = createFBO(texA!);
    let fboB = createFBO(texB!);

    // Uniform Locations
    const simLocs = {
      res: gl.getUniformLocation(simProgram, "u_resolution"),
      time: gl.getUniformLocation(simProgram, "u_time"),
      bass: gl.getUniformLocation(simProgram, "u_bass"),
      mid: gl.getUniformLocation(simProgram, "u_mid"),
      treble: gl.getUniformLocation(simProgram, "u_treble"),
      vol: gl.getUniformLocation(simProgram, "u_vol"),
      tex: gl.getUniformLocation(simProgram, "u_texture"),
    };

    const displayLocs = {
      res: gl.getUniformLocation(displayProgram, "u_resolution"),
      tex: gl.getUniformLocation(displayProgram, "u_texture"),
    };

    let animationFrameId: number;
    let startTime = Date.now();

    const render = () => {
      if (canvas.width !== w || canvas.height !== h) {
        w = canvas.width;
        h = canvas.height;
        gl.viewport(0, 0, w, h);
        gl.deleteTexture(texA); gl.deleteTexture(texB);
        gl.deleteFramebuffer(fboA); gl.deleteFramebuffer(fboB);
        texA = createTexture(w, h); texB = createTexture(w, h);
        fboA = createFBO(texA!); fboB = createFBO(texB!);
      }

      const time = (Date.now() - startTime) / 1000;
      const { metrics: m, gain: g } = audioRef.current;

      // --- Pass 1: Simulation (Read B, Write A) ---
      gl.useProgram(simProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fboA);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texB);
      gl.uniform1i(simLocs.tex, 0);

      gl.uniform2f(simLocs.res, w, h);
      gl.uniform1f(simLocs.time, time);
      
      // Apply gain to metrics before sending to shader
      gl.uniform1f(simLocs.bass, m.bass * g);
      gl.uniform1f(simLocs.mid, m.mid * g);
      gl.uniform1f(simLocs.treble, m.treble * g);
      gl.uniform1f(simLocs.vol, m.volume * g);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(aPositionSim);
      gl.vertexAttribPointer(aPositionSim, 2, gl.FLOAT, false, 0, 0);
      
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // --- Pass 2: Display (Read A, Write Screen) ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.useProgram(displayProgram);
      
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texA);
      gl.uniform1i(displayLocs.tex, 0);
      gl.uniform2f(displayLocs.res, w, h);

      gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
      gl.enableVertexAttribArray(aPositionDisplay);
      gl.vertexAttribPointer(aPositionDisplay, 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // Swap ping-pong
      let tempT = texA; texA = texB; texB = tempT;
      let tempF = fboA; fboA = fboB; fboB = tempF;

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      gl.deleteProgram(simProgram);
      gl.deleteProgram(displayProgram);
      gl.deleteTexture(texA);
      gl.deleteTexture(texB);
      gl.deleteFramebuffer(fboA);
      gl.deleteFramebuffer(fboB);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
};

export default FluidVisualizer;