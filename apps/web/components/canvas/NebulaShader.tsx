'use client';

import React, { useRef } from 'react';
import { useFrame, extend } from '@react-three/fiber';
import { Plane, shaderMaterial } from '@react-three/drei';
import * as THREE from 'three';

// Define the shader material
const NebulaMaterial = shaderMaterial(
    {
        uTime: 0,
        uColorBase: new THREE.Color('#201c19'),
        uColorPrimary: new THREE.Color('#f4cf8b'),
        uColorSecondary: new THREE.Color('#311c35'),
        uResolution: new THREE.Vector2(),
    },
    // Vertex Shader
    `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
    // Fragment Shader
    `
    uniform float uTime;
    uniform vec3 uColorBase;
    uniform vec3 uColorPrimary;
    uniform vec3 uColorSecondary;
    varying vec2 vUv;

    // Simplex 3D Noise 
    // by Ian McEwan, Ashima Arts
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}

    float snoise(vec3 v){ 
      const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

      // First corner
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;

      // Other corners
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );

      //  x0 = x0 - 0.0 + 0.0 * C 
      vec3 x1 = x0 - i1 + 1.0 * C.xxx;
      vec3 x2 = x0 - i2 + 2.0 * C.xxx;
      vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;

      // Permutations
      i = mod(i, 289.0 ); 
      vec4 p = permute( permute( permute( 
                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
               + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

      // Gradients
      // ( N*N points uniformly over a square, mapped onto an octahedron.)
      float n_ = 1.0/7.0; // N=7
      vec3  ns = n_ * D.wyz - D.xzx;

      vec4 j = p - 49.0 * floor(p * ns.z *ns.z);  //  mod(p,N*N)

      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);

      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );

      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));

      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);

      //Normalise gradients
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;

      // Mix final noise value
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                    dot(p2,x2), dot(p3,x3) ) );
    }

    void main() {
      // Slow down time for liquid feel
      float t = uTime * 0.15;
      
      // Coordinates
      vec2 uv = vUv;
      
      // Create organic movement with multiple noise layers
      float noise1 = snoise(vec3(uv * 2.0, t));
      float noise2 = snoise(vec3(uv * 4.0 + vec2(t * 0.5), t * 0.5));
      
      // Fluid warping
      float fluid = noise1 * 0.6 + noise2 * 0.4;
      
      // Define mixing regions
      // Top area (nebula source)
      float topGlow = smoothstep(1.2, -0.2, uv.y + fluid * 0.2);
      
      // Primary color blending
      vec3 color = mix(uColorBase, uColorSecondary, topGlow * 0.4); // Reduced from 0.8
      
      // Highlights (Golden Stardust) inside the nebula
      float highlight = smoothstep(0.4, 0.8, fluid + topGlow * 0.5);
      color = mix(color, uColorPrimary, highlight * 0.3); // Reduced from 0.6
      
      // Vignette / Deepen bottom
      float vignette = smoothstep(0.3, 1.0, uv.y);
      color = mix(color, uColorBase, vignette * 0.9);

      gl_FragColor = vec4(color, 1.0);
    }
  `
);

extend({ NebulaMaterial });

// Add types for the custom shader material
declare module '@react-three/fiber' {
    interface ThreeElements {
        nebulaMaterial: React.JSX.IntrinsicElements['shaderMaterial'] & {
            uTime?: number;
            uColorBase?: THREE.Color;
            uColorPrimary?: THREE.Color;
            uColorSecondary?: THREE.Color;
            uResolution?: THREE.Vector2;
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
