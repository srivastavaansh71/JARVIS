import React, { useEffect, useRef, useState, useContext } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { BlobContext } from '../contexts/BlobContext';

const PlasmaBlob = () => {
  const mountRef = useRef(null);
  const [micActive, setMicActive] = useState(false);
  const [micStatus, setMicStatus] = useState('Idle');
  
  const { blobColor, blobSize, blobSensitivity, setTranscripts, setInterimTranscript, speechLang, fetchGroqResponse } = useContext(BlobContext);
  
  useEffect(() => {
    window._jarvisFetchGroq = fetchGroqResponse;
  }, [fetchGroqResponse]);
  const materialsRef = useRef({});
  
  const sensitivityRef = useRef(blobSensitivity);
  useEffect(() => {
    sensitivityRef.current = blobSensitivity;
  }, [blobSensitivity]);

  const speechLangRef = useRef(speechLang);
  useEffect(() => {
    speechLangRef.current = speechLang;
    if (window._jarvisRecognition) {
      try { window._jarvisRecognition.stop(); } catch(e) {}
    }
  }, [speechLang]);
  
  useEffect(() => {
    // ─── State ───────────────────────────────────────────────────────────────────
    let audioLevel = 0;
    let targetScale = 1.0;
    let currentScale = 1.0;
    let analyser = null;
    let dataArray = null;

    window.enableMicrophone = async () => {
      if (window.checkMicActive && window.checkMicActive()) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        source.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        setMicActive(true);
        window.checkMicActive = () => true;
        window.updateMicStatus = (msg) => setMicStatus(msg);
        setMicStatus('Microphone active');

        // Setup Speech Recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
          const recognition = new SpeechRecognition();
          recognition.lang = speechLangRef.current;
          // IMPORTANT FIX: Using continuous = false creates a pulsed "heartbeat".
          // Browsers often fall asleep on continuous=true. By letting it end after each phrase
          // and instantly restarting it in onend, we guarantee real-time accuracy without silent drops.
          recognition.continuous = false;
          recognition.interimResults = true;
          
          recognition.onresult = (event) => {
            let interim = '';
            let final = '';
            for (let i = event.resultIndex; i < event.results.length; ++i) {
              if (event.results[i].isFinal) {
                final += event.results[i][0].transcript;
              } else {
                interim += event.results[i][0].transcript;
              }
            }
            if (final) {
              // Wake-word detection: only send to LLM if "Jarvis" is mentioned
              const hasWakeWord = /jarvis/i.test(final);
              if (hasWakeWord) {
                // Strip the wake word from the command before sending
                const command = final.replace(/\b(hey\s+)?jarvis[,.]?\s*/gi, '').trim();
                setTranscripts(prev => [...prev, { role: 'user', text: final }]);
                if (command && window._jarvisFetchGroq) {
                  window._jarvisFetchGroq(command);
                }
              } else {
                // Show non-Jarvis speech in terminal as ambient (no LLM call)
                setTranscripts(prev => [...prev, { role: 'ambient', text: final }]);
              }
            }
            setInterimTranscript(interim);
          };
          
          recognition.onerror = (e) => {
            if (e.error !== 'no-speech') {
               console.error("Speech recognition error", e);
            }
          };
          
          recognition.onend = () => {
             // HEARTBEAT RESTART: Keep listening continuously by restarting when it ends
             if (window.checkMicActive && window.checkMicActive()) {
               try { 
                 recognition.lang = speechLangRef.current;
                 recognition.start(); 
               } catch(e) {}
             }
          };
          recognition.start();
          
          window._jarvisRecognition = recognition;
        }
      } catch (e) {
        setMicStatus('Mic access denied');
      }
    };

    function getMicLevel() {
      if (!analyser || !dataArray) return 0;
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      const end = Math.min(30, dataArray.length);
      for (let i = 2; i < end; i++) sum += dataArray[i];
      return sum / ((end - 2) * 255);
    }

    // ─── Scene Setup ──────────────────────────────────────────────────────────────
    const container = mountRef.current;
    if (!container) return;
    
    // Initial size (will be updated by ResizeObserver)
    const initialWidth = container.clientWidth || 250;
    const initialHeight = container.clientHeight || 250;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(60, initialWidth / initialHeight, 0.1, 100);
    camera.position.z = 2.8; // Slightly further back for the smaller widget

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false });
    renderer.setSize(initialWidth, initialHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0); // Transparent background
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 1.5;
    controls.maxDistance = 8;

    const mainGroup = new THREE.Group();
    scene.add(mainGroup);

    // ─── GLSL Noise ───────────────────────────────────────────────────────────────
    const noiseFunctions = `
      vec3 mod289v3(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec4 mod289v4(vec4 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
      vec4 permute(vec4 x) { return mod289v4(((x*34.0)+1.0)*x); }
      vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
      float snoise(vec3 v) {
        const vec2 C = vec2(1.0/6.0, 1.0/3.0);
        const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy));
        vec3 x0 = v - i + dot(i, C.xxx);
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min(g.xyz, l.zxy);
        vec3 i2 = max(g.xyz, l.zxy);
        vec3 x1 = x0 - i1 + C.xxx;
        vec3 x2 = x0 - i2 + C.yyy;
        vec3 x3 = x0 - D.yyy;
        i = mod289v3(i);
        vec4 p = permute(permute(permute(
          i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
        float n_ = 0.142857142857;
        vec3 ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_);
        vec4 x = x_ * ns.x + ns.yyyy;
        vec4 y = y_ * ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4(x.xy, y.xy);
        vec4 b1 = vec4(x.zw, y.zw);
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
        vec3 p0 = vec3(a0.xy, h.x);
        vec3 p1 = vec3(a0.zw, h.y);
        vec3 p2 = vec3(a1.xy, h.z);
        vec3 p3 = vec3(a1.zw, h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
      }
      float fbm(vec3 p) {
        float total = 0.0, amp = 0.5, freq = 1.0;
        for (int i = 0; i < 4; i++) {
          total += snoise(p * freq) * amp;
          amp *= 0.5; freq *= 2.0;
        }
        return total;
      }
    `;

    // ─── Outer Shell (Glass) ────────────────────────────────────────────────────
    const shellVert = `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `;
    const shellFrag = `
      varying vec3 vNormal;
      varying vec3 vViewPos;
      uniform vec3 uColor;
      uniform float uOpacity;
      void main() {
        float f = pow(1.0 - dot(normalize(vNormal), normalize(vViewPos)), 2.5);
        gl_FragColor = vec4(uColor, f * uOpacity);
      }
    `;
    const shellGeo = new THREE.SphereGeometry(1.0, 64, 64);
    const shellBack = new THREE.ShaderMaterial({
      vertexShader: shellVert, fragmentShader: shellFrag,
      uniforms: { uColor: { value: new THREE.Color(0x000055) }, uOpacity: { value: 0.3 } },
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false
    });
    const shellFront = new THREE.ShaderMaterial({
      vertexShader: shellVert, fragmentShader: shellFrag,
      uniforms: { uColor: { value: new THREE.Color(0x0066ff) }, uOpacity: { value: 0.41 } },
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.FrontSide, depthWrite: false
    });
    mainGroup.add(new THREE.Mesh(shellGeo, shellBack));
    mainGroup.add(new THREE.Mesh(shellGeo, shellFront));

    // ─── Plasma (Gas) ────────────────────────────────────────────────────────────
    const plasmaGeo = new THREE.SphereGeometry(0.998, 128, 128);
    const plasmaMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:        { value: 0 },
        uScale:       { value: 0.2 },     // Texture Scale
        uBrightness:  { value: 1.31 },    // Brightness
        uThreshold:   { value: 0.09 },    // Voids
        uAudioLevel:  { value: 0.0 },     // Mic amplitude, 0-1
        uColorDeep:   { value: new THREE.Color(0x001433) },
        uColorMid:    { value: new THREE.Color(0x0084ff) },
        uColorBright: { value: new THREE.Color(0x00ffe1) }
      },
      vertexShader: `
        uniform float uAudioLevel;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        ${noiseFunctions}
        void main() {
          vPosition = position;
          float disp = snoise(position * 3.0 + uAudioLevel * 5.0) * uAudioLevel * 0.18;
          vec3 displaced = position + normal * disp;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
          vViewPos = -mv.xyz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uScale;
        uniform float uBrightness;
        uniform float uThreshold;
        uniform float uAudioLevel;
        uniform vec3 uColorDeep;
        uniform vec3 uColorMid;
        uniform vec3 uColorBright;
        varying vec3 vPosition;
        varying vec3 vNormal;
        varying vec3 vViewPos;
        ${noiseFunctions}
        void main() {
          vec3 p = vPosition * uScale;
          float speed = 0.05 + uAudioLevel * 0.12;
          vec3 q = vec3(
            fbm(p + vec3(0.0, uTime * speed, 0.0)),
            fbm(p + vec3(5.2, 1.3, 2.8) + uTime * speed),
            fbm(p + vec3(2.2, 8.4, 0.5) - uTime * speed * 0.4)
          );
          float density = fbm(p + (2.0 + uAudioLevel * 2.0) * q);
          float t = (density + 0.4) * 0.8;
          float alpha = smoothstep(uThreshold, 0.7, t);

          vec3 colorMidAudio = mix(uColorMid, vec3(0.3, 0.7, 1.0), uAudioLevel * 0.6);
          vec3 colorBrightAudio = mix(uColorBright, vec3(1.0, 1.0, 1.0), uAudioLevel * 0.8);

          vec3 color = mix(uColorDeep, colorMidAudio, smoothstep(uThreshold, 0.5, t));
          color = mix(color, colorBrightAudio, smoothstep(0.5, 0.8, t));
          color = mix(color, vec3(1.0), smoothstep(0.8, 1.0, t));

          float facing = dot(normalize(vNormal), normalize(vViewPos));
          float depth = (facing + 1.0) * 0.5;
          float finalAlpha = alpha * (0.02 + 0.98 * depth);
          float brightness = uBrightness + uAudioLevel * 1.2;
          gl_FragColor = vec4(color * brightness, finalAlpha);
        }
      `,
      transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
    });
    const plasmaMesh = new THREE.Mesh(plasmaGeo, plasmaMat);
    mainGroup.add(plasmaMesh);

    // Save refs for dynamic color updating
    materialsRef.current = { plasmaMat, shellFront, shellBack, pMat: null };

    // ─── Particles ────────────────────────────────────────────────────────────────
    const pCount = 600;
    const pPos = new Float32Array(pCount * 3);
    const pSizes = new Float32Array(pCount);
    for (let i = 0; i < pCount; i++) {
      const r = 0.95 * Math.cbrt(Math.random());
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pPos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pPos[i * 3 + 2] = r * Math.cos(phi);
      pSizes[i] = Math.random();
    }
    const pGeo = new THREE.BufferGeometry();
    pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSizes, 1));
    const pMat = new THREE.ShaderMaterial({
      uniforms: {
        uTime:       { value: 0 },
        uAudioLevel: { value: 0.0 },
        uColor:      { value: new THREE.Color(0xffffff) }
      },
      vertexShader: `
        uniform float uTime;
        uniform float uAudioLevel;
        attribute float aSize;
        varying float vAlpha;
        void main() {
          vec3 pos = position;
          pos.y += sin(uTime * 0.2 + pos.x * 3.0) * (0.02 + uAudioLevel * 0.06);
          pos.x += cos(uTime * 0.15 + pos.z * 3.0) * (0.02 + uAudioLevel * 0.06);
          vec4 mv = modelViewMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * mv;
          float base = 8.0 * aSize + 4.0 + uAudioLevel * 12.0;
          gl_PointSize = base * (1.0 / -mv.z);
          vAlpha = 0.8 + 0.2 * sin(uTime + aSize * 10.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord - vec2(0.5);
          float d = length(uv);
          if (d > 0.5) discard;
          float glow = pow(1.0 - d * 2.0, 1.8);
          gl_FragColor = vec4(uColor, glow * vAlpha);
        }
      `,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    });
    materialsRef.current.pMat = pMat;
    mainGroup.add(new THREE.Points(pGeo, pMat));

    // ─── Animation Loop ───────────────────────────────────────────────────────────
    const clock = {
      startTime: performance.now(),
      getElapsedTime: function() {
        return (performance.now() - this.startTime) / 1000;
      }
    };
    let animationId;

    function animate() {
      animationId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      const raw = getMicLevel() * (sensitivityRef.current || 1.0) * 2.5;
      audioLevel += (raw - audioLevel) * 0.05; // Reduced from 0.15 to 0.05 for much smoother response

      const breathe = 1.0 + Math.sin(t * 1.2) * 0.012;
      targetScale = breathe + audioLevel * 0.55;
      currentScale += (targetScale - currentScale) * 0.05; // Reduced from 0.12 to 0.05 for smoother scaling
      mainGroup.scale.setScalar(currentScale);

      const timeScale = 1.2 + audioLevel * 1.5;
      plasmaMat.uniforms.uTime.value = t * timeScale;
      plasmaMat.uniforms.uAudioLevel.value = audioLevel;
      pMat.uniforms.uTime.value = t;
      pMat.uniforms.uAudioLevel.value = audioLevel;

      shellFront.uniforms.uOpacity.value = 0.41 + audioLevel * 0.4;
      shellFront.uniforms.uColor.value.setHSL(0.58 + audioLevel * 0.1, 1.0, 0.5 + audioLevel * 0.2);

      plasmaMesh.rotation.y = t * 0.08;
      mainGroup.rotation.x += 0.002;
      mainGroup.rotation.y += 0.005;

      if (window.checkMicActive && window.checkMicActive()) {
        const pct = Math.round(audioLevel * 100);
        window.updateMicStatus(audioLevel > 0.05 ? `Speaking  ▪ ${pct}%` : 'Listening…');
      }

      controls.update();
      renderer.render(scene, camera);
    }

    const resizeObserver = new ResizeObserver((entries) => {
      if (!entries.length) return;
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
      }
    });
    resizeObserver.observe(container);

    animate();

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      cancelAnimationFrame(animationId);
      if (renderer && renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
      scene.clear();
      if (analyser) {
        analyser.disconnect();
      }
      if (window._jarvisRecognition) {
        window._jarvisRecognition.onend = null;
        window._jarvisRecognition.stop();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

  const handleMicClick = () => {
    if (!micActive) {
      if (window.enableMicrophone) window.enableMicrophone();
    } else {
      setMicActive(false);
      window.checkMicActive = () => false;
      setMicStatus('Idle');
      if (window._jarvisRecognition) {
        try { window._jarvisRecognition.stop(); } catch(e) {}
      }
    }
  };

  useEffect(() => {
    window.checkMicActive = () => micActive;
    window.updateMicStatus = (msg) => setMicStatus(msg);
  }, [micActive]);

  useEffect(() => {
    if (!materialsRef.current.plasmaMat) return;
    const base = new THREE.Color(blobColor);
    const hsl = {};
    base.getHSL(hsl);
    
    const deep = new THREE.Color().setHSL(hsl.h, hsl.s, Math.max(0, hsl.l - 0.4));
    const bright = new THREE.Color().setHSL(hsl.h, hsl.s, Math.min(1, hsl.l + 0.4));
    
    materialsRef.current.plasmaMat.uniforms.uColorMid.value = base;
    materialsRef.current.plasmaMat.uniforms.uColorDeep.value = deep;
    materialsRef.current.plasmaMat.uniforms.uColorBright.value = bright;
    materialsRef.current.shellFront.uniforms.uColor.value = base;
    materialsRef.current.shellBack.uniforms.uColor.value = deep;
  }, [blobColor]);

  return (
    <div 
      style={{ 
        width: `${blobSize}px`, 
        height: `${blobSize}px`, 
        position: 'absolute', 
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        overflow: 'hidden', 
        zIndex: 10, 
        pointerEvents: 'none',
        borderRadius: '20px'
      }}
    >
      <div ref={mountRef} style={{ width: '100%', height: '100%', background: 'transparent', pointerEvents: 'auto' }} />
      <button 
        onClick={handleMicClick}
        style={{
          pointerEvents: 'auto',
          position: 'absolute',
          bottom: '24px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: micActive ? 'rgba(0,100,255,0.25)' : 'rgba(255,255,255,0.08)',
          border: `1px solid ${micActive ? 'rgba(0,180,255,0.7)' : 'rgba(255,255,255,0.2)'}`,
          color: '#fff',
          padding: '10px 24px',
          borderRadius: '999px',
          fontSize: '13px',
          cursor: 'pointer',
          backdropFilter: 'blur(10px)',
          transition: 'background 0.2s, border-color 0.2s',
          zIndex: 10,
          letterSpacing: '0.04em'
        }}
      >
        {micActive ? '🎙 Listening…' : '🎙 Enable Microphone'}
      </button>
      <div 
        style={{
          position: 'absolute',
          bottom: '72px',
          left: '50%',
          transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.4)',
          fontSize: '12px',
          letterSpacing: '0.06em',
          zIndex: 10
        }}
      >
        {micStatus}
      </div>
    </div>
  );
};

export default PlasmaBlob;
