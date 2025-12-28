'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars, AdaptiveDpr, Preload } from '@react-three/drei';
import { useRef, useMemo, useEffect, useState } from 'react';
import * as THREE from 'three';

// Couleurs du thème
const TECH_ACCENT = new THREE.Color('#22d3ee');
const TECH_BLACK = '#050505';

// Shader pour gradient conic (disque d'accrétion)
const conicGradientShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uOpacity;
    uniform float uStartAngle;
    uniform float uSpread;
    uniform vec3 uColor;
    uniform float uBlur;
    varying vec2 vUv;

    void main() {
      vec2 center = vUv - 0.5;
      float angle = atan(center.y, center.x);
      float dist = length(center);

      // Normaliser l'angle de -PI à PI vers 0 à 1
      float normalizedAngle = (angle + 3.14159) / (2.0 * 3.14159);

      // Créer le gradient conic avec spread
      float gradientStart = mod(uStartAngle / (2.0 * 3.14159), 1.0);
      float diff = mod(normalizedAngle - gradientStart + 1.0, 1.0);
      float gradient = smoothstep(0.0, uSpread, diff) * (1.0 - smoothstep(uSpread, uSpread + 0.1, diff));

      // Falloff radial pour le blur
      float radialFalloff = smoothstep(0.5, 0.5 - uBlur, dist);

      // Combiner
      float alpha = gradient * radialFalloff * uOpacity;

      gl_FragColor = vec4(uColor, alpha);
    }
  `,
};

// Composant pour un disque d'accrétion
interface VortexRingProps {
  radius: number;
  opacity: number;
  speed: number;
  blur: number;
  startAngle?: number;
  spread?: number;
  color?: THREE.Color;
  reverse?: boolean;
  reducedMotion: boolean;
}

function VortexRing({
  radius,
  opacity,
  speed,
  blur,
  startAngle = 0,
  spread = 0.4,
  color = TECH_ACCENT,
  reverse = false,
  reducedMotion,
}: VortexRingProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uOpacity: { value: opacity },
      uStartAngle: { value: startAngle },
      uSpread: { value: spread },
      uColor: { value: color },
      uBlur: { value: blur },
    }),
    [opacity, startAngle, spread, color, blur]
  );

  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (meshRef.current) {
      const direction = reverse ? -1 : 1;
      meshRef.current.rotation.z += delta * speed * direction;
    }
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 0]}>
      <planeGeometry args={[radius * 2, radius * 2]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={conicGradientShader.vertexShader}
        fragmentShader={conicGradientShader.fragmentShader}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// Composant pour le trou noir central
function BlackHole({ radius }: { radius: number }) {
  return (
    <mesh position={[0, 0, 0.1]}>
      <circleGeometry args={[radius, 64]} />
      <meshBasicMaterial color="#000000" />
    </mesh>
  );
}

// Composant pour les étoiles attirées par le trou noir
interface AttractedStarsProps {
  count: number;
  blackHoleRadius: number;
  attractionRadius: number;
  reducedMotion: boolean;
}

function AttractedStars({
  count,
  blackHoleRadius,
  attractionRadius,
  reducedMotion,
}: AttractedStarsProps) {
  const pointsRef = useRef<THREE.Points>(null);
  const dataRef = useRef<{
    velocities: Float32Array;
    initialized: boolean;
  }>({
    velocities: new Float32Array(count * 3),
    initialized: false,
  });

  useFrame((_, delta) => {
    if (reducedMotion) return;
    if (!pointsRef.current) return;

    const posAttr = pointsRef.current.geometry.attributes
      .position as THREE.BufferAttribute;
    const posArray = posAttr.array as Float32Array;
    const { velocities } = dataRef.current;

    // Initialiser les positions au premier frame
    if (!dataRef.current.initialized) {
      dataRef.current.initialized = true;
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance =
          blackHoleRadius +
          0.5 +
          Math.random() * (attractionRadius - blackHoleRadius);
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        const z = (Math.random() - 0.5) * 2;

        posArray[i * 3] = x;
        posArray[i * 3 + 1] = y;
        posArray[i * 3 + 2] = z;

        // Vélocité orbitale initiale (lente pour effet subtil)
        const orbitalSpeed = 0.12 / Math.sqrt(distance);
        velocities[i * 3] = -Math.sin(angle) * orbitalSpeed;
        velocities[i * 3 + 1] = Math.cos(angle) * orbitalSpeed;
        velocities[i * 3 + 2] = 0;
      }
      posAttr.needsUpdate = true;
      return;
    }

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const iy = i * 3 + 1;
      const iz = i * 3 + 2;

      const x = posArray[ix]!;
      const y = posArray[iy]!;

      const distance = Math.sqrt(x * x + y * y);

      // Force gravitationnelle vers le centre (réduite pour effet subtil)
      if (distance > 0.1) {
        const gravityStrength = 0.15 / (distance * distance);
        const dirX = -x / distance;
        const dirY = -y / distance;

        velocities[ix]! += dirX * gravityStrength * delta;
        velocities[iy]! += dirY * gravityStrength * delta;
      }

      // Appliquer la vélocité
      posArray[ix] = posArray[ix]! + velocities[ix]! * delta;
      posArray[iy] = posArray[iy]! + velocities[iy]! * delta;
      posArray[iz] = posArray[iz]! + velocities[iz]! * delta;

      // Si l'étoile est aspirée (trop proche), la respawn
      const newDistance = Math.sqrt(
        posArray[ix]! * posArray[ix]! + posArray[iy]! * posArray[iy]!
      );
      if (newDistance < blackHoleRadius * 0.8) {
        // Respawn à la périphérie
        const newAngle = Math.random() * Math.PI * 2;
        const newDist = attractionRadius * (0.7 + Math.random() * 0.3);
        posArray[ix] = Math.cos(newAngle) * newDist;
        posArray[iy] = Math.sin(newAngle) * newDist;
        posArray[iz] = (Math.random() - 0.5) * 2;

        // Nouvelle vélocité orbitale (lente pour effet subtil)
        const orbitalSpeed = 0.12 / Math.sqrt(newDist);
        velocities[ix] = -Math.sin(newAngle) * orbitalSpeed;
        velocities[iy] = Math.cos(newAngle) * orbitalSpeed;
        velocities[iz] = 0;
      }
    }

    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[new Float32Array(count * 3), 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color={TECH_ACCENT}
        size={0.04}
        transparent
        opacity={0.8}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// Composant pour la trainée de flare diagonale
function FlareTrail({ reducedMotion }: { reducedMotion: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (reducedMotion) return;
    if (meshRef.current && meshRef.current.material) {
      const mat = meshRef.current.material as THREE.MeshBasicMaterial;
      // Légère pulsation
      mat.opacity = 0.15 + Math.sin(Date.now() * 0.001) * 0.05;
    }
  });

  return (
    <mesh ref={meshRef} rotation={[0, 0, Math.PI / 4]} position={[0, 0, -0.1]}>
      <planeGeometry args={[20, 0.02]} />
      <meshBasicMaterial
        color={TECH_ACCENT}
        transparent
        opacity={0.2}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

// Composant principal de la scène
interface VortexSceneProps {
  reducedMotion: boolean;
  isMobile: boolean;
}

function VortexScene({ reducedMotion, isMobile }: VortexSceneProps) {
  const { invalidate } = useThree();

  // Forcer le re-render pour les animations
  useFrame(() => {
    if (!reducedMotion) {
      invalidate();
    }
  });

  return (
    <>
      {/* Fond */}
      <color attach="background" args={[TECH_BLACK]} />

      {/* Étoiles - réduites sur mobile */}
      <Stars
        radius={100}
        depth={50}
        count={isMobile ? 1500 : 3000}
        factor={3}
        saturation={0}
        fade
        speed={reducedMotion ? 0 : 0.5}
      />

      {/* Groupe du vortex centré */}
      <group position={[0, 0, 0]}>
        {/* Disque externe - Poussière diffuse */}
        <VortexRing
          radius={6}
          opacity={0.08}
          speed={0.1}
          blur={0.3}
          spread={0.35}
          reducedMotion={reducedMotion}
        />

        {/* Disque intermédiaire - La Lueur (contre-rotation) */}
        <VortexRing
          radius={4.8}
          opacity={0.15}
          speed={0.14}
          blur={0.25}
          spread={0.45}
          reverse
          reducedMotion={reducedMotion}
        />

        {/* Horizon des événements interne */}
        <VortexRing
          radius={2.4}
          opacity={0.4}
          speed={0.2}
          blur={0.15}
          spread={0.5}
          color={new THREE.Color('#ffffff')}
          reducedMotion={reducedMotion}
        />

        {/* Bord interne en contre-rotation */}
        <VortexRing
          radius={2.5}
          opacity={0.25}
          speed={0.18}
          blur={0.12}
          spread={0.3}
          startAngle={Math.PI}
          reverse
          reducedMotion={reducedMotion}
        />

        {/* Trou noir central */}
        <BlackHole radius={1.5} />

        {/* Étoiles attirées par le trou noir */}
        <AttractedStars
          count={isMobile ? 80 : 150}
          blackHoleRadius={1.5}
          attractionRadius={8}
          reducedMotion={reducedMotion}
        />

        {/* Trainée de flare diagonale */}
        <FlareTrail reducedMotion={reducedMotion} />
      </group>

      {/* Optimisations */}
      <AdaptiveDpr pixelated />
      <Preload all />
    </>
  );
}

// Hook pour détecter prefers-reduced-motion
function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  return reducedMotion;
}

// Hook pour détecter mobile
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      window.innerWidth < 768
    );
  });

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
          window.innerWidth < 768
      );
    };
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

// Composant exporté
export default function CosmicBackground() {
  const reducedMotion = useReducedMotion();
  const isMobile = useIsMobile();

  return (
    <div
      className="absolute inset-0 z-0 overflow-hidden bg-tech-black pointer-events-none"
      aria-hidden="true"
    >
      <Canvas
        frameloop={reducedMotion ? 'demand' : 'always'}
        dpr={[1, isMobile ? 1.5 : 2]}
        gl={{
          antialias: false,
          powerPreference: 'high-performance',
          alpha: false,
        }}
        camera={{ position: [0, 0, 10], fov: 50 }}
      >
        <VortexScene reducedMotion={reducedMotion} isMobile={isMobile} />
      </Canvas>
    </div>
  );
}