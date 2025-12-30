'use client';

import { useRef } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import { Plane, shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Memoized colors (avoid recreating on each render)
const COLOR_BASE = new THREE.Color('#201c19');
const COLOR_PRIMARY = new THREE.Color('#f4cf8b');
const COLOR_SECONDARY = new THREE.Color('#311c35');

// Define the shader material
const NebulaMaterial = shaderMaterial(
    {
        uTime: 0,
        uColorBase: COLOR_BASE,
        uColorPrimary: COLOR_PRIMARY,
        uColorSecondary: COLOR_SECONDARY,
    },
    // Vertex Shader
    /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    // Fragment Shader - Optimized
    /* glsl */ `
    precision mediump float; // Mobile-friendly precision

    uniform float uTime;
    uniform vec3 uColorBase;
    uniform vec3 uColorPrimary;
    uniform vec3 uColorSecondary;
    varying vec2 vUv;

    // Optimized hash-based noise (faster than simplex for this use case)
    // Single noise function with FBM built-in
    vec3 hash3(vec3 p) {
      p = vec3(
        dot(p, vec3(127.1, 311.7, 74.7)),
        dot(p, vec3(269.5, 183.3, 246.1)),
        dot(p, vec3(113.5, 271.9, 124.6))
      );
      return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
    }

    float noise(vec3 p) {
      vec3 i = floor(p);
      vec3 f = fract(p);
      vec3 u = f * f * (3.0 - 2.0 * f); // Smoothstep

      return mix(
        mix(
          mix(dot(hash3(i + vec3(0.0, 0.0, 0.0)), f - vec3(0.0, 0.0, 0.0)),
              dot(hash3(i + vec3(1.0, 0.0, 0.0)), f - vec3(1.0, 0.0, 0.0)), u.x),
          mix(dot(hash3(i + vec3(0.0, 1.0, 0.0)), f - vec3(0.0, 1.0, 0.0)),
              dot(hash3(i + vec3(1.0, 1.0, 0.0)), f - vec3(1.0, 1.0, 0.0)), u.x), u.y),
        mix(
          mix(dot(hash3(i + vec3(0.0, 0.0, 1.0)), f - vec3(0.0, 0.0, 1.0)),
              dot(hash3(i + vec3(1.0, 0.0, 1.0)), f - vec3(1.0, 0.0, 1.0)), u.x),
          mix(dot(hash3(i + vec3(0.0, 1.0, 1.0)), f - vec3(0.0, 1.0, 1.0)),
              dot(hash3(i + vec3(1.0, 1.0, 1.0)), f - vec3(1.0, 1.0, 1.0)), u.x), u.y), u.z
      );
    }

    // Combined FBM noise (2 octaves in single call)
    float fbmNoise(vec2 uv, float t) {
      float n1 = noise(vec3(uv * 2.0, t));
      float n2 = noise(vec3(uv * 4.0 + t * 0.5, t * 0.5));
      return n1 * 0.6 + n2 * 0.4;
    }

    void main() {
      float t = uTime * 0.15;

      // Single combined noise call
      float fluid = fbmNoise(vUv, t);

      // Precompute shared values
      float topGlow = smoothstep(1.2, -0.2, vUv.y + fluid * 0.2);

      // Optimized color mixing (fewer mix calls)
      vec3 color = uColorBase;
      color = mix(color, uColorSecondary, topGlow * 0.4);
      color = mix(color, uColorPrimary, smoothstep(0.4, 0.8, fluid + topGlow * 0.5) * 0.3);
      color = mix(color, uColorBase, smoothstep(0.3, 1.0, vUv.y) * 0.9);

      gl_FragColor = vec4(color, 1.0);
    }
  `
);

extend({ NebulaMaterial });

// R3F v9: Type augmentation via ThreeElements
declare module '@react-three/fiber' {
    interface ThreeElements {
        nebulaMaterial: React.JSX.IntrinsicElements['shaderMaterial'] & {
            uTime?: number;
            uColorBase?: THREE.Color;
            uColorPrimary?: THREE.Color;
            uColorSecondary?: THREE.Color;
        };
    }
}

export default function NebulaShader() {
    const materialRef = useRef<THREE.ShaderMaterial & { uTime: number }>(null);

    useFrame(({ clock }) => {
        if (materialRef.current) {
            materialRef.current.uTime = clock.getElapsedTime();
        }
    });

    return (
        <Plane args={[20, 10]} position={[0, 0, -2]} scale={[2, 2, 1]}>
            <nebulaMaterial
                ref={materialRef}
                transparent
            />
        </Plane>
    );
}
