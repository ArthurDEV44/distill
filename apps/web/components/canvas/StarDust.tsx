'use client';

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COUNT = 1500;
const DUST_COLOR = '#f4cf8b'; // Nebula Primary (Gold)

export default function StarDust() {
    const mesh = useRef<THREE.InstancedMesh>(null);

    const dummy = useMemo(() => new THREE.Object3D(), []);

    // Initialize particles
    const particles = useMemo(() => {
        const temp = [];
        for (let i = 0; i < COUNT; i++) {
            const t = Math.random() * 100;
            const factor = 20 + Math.random() * 100;
            const speed = 0.01 + Math.random() / 200;
            const xFactor = -50 + Math.random() * 100;
            const yFactor = -50 + Math.random() * 100;
            const zFactor = -50 + Math.random() * 100;
            temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 });
        }
        return temp;
    }, []);

    useFrame(() => {
        if (!mesh.current) return;

        particles.forEach((particle, i) => {
            const { factor, speed, xFactor, yFactor, zFactor } = particle;

            // Update time
            const t = particle.t += speed / 2;

            // Drift position
            // We add existing position to create a flow field effect
            const s = Math.cos(t);

            // Base circular motion + drift
            dummy.position.set(
                (particle.mx / 10) + Math.cos(t) + mathRandom(i) * 0.5 + xFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 1) * factor) / 10,
                (particle.my / 10) + Math.sin(t) + mathRandom(i) * 0.5 + yFactor + Math.sin((t / 10) * factor) + (Math.cos(t * 2) * factor) / 10,
                (particle.my / 10) + Math.cos(t) + mathRandom(i) * 0.5 + zFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 3) * factor) / 10
            );

            // Scale pulse
            const sScale = Math.max(0.2, Math.cos(t) * 0.5 + 0.5);
            dummy.scale.set(sScale, sScale, sScale);

            // Rotation
            dummy.rotation.set(s * 5, s * 5, s * 5);

            // Update matrix
            dummy.updateMatrix();

            mesh.current!.setMatrixAt(i, dummy.matrix);
        });

        mesh.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]}>
            <dodecahedronGeometry args={[0.02, 0]} />
            <meshBasicMaterial color={DUST_COLOR} transparent opacity={0.6} blending={THREE.AdditiveBlending} />
        </instancedMesh>
    );
}

// Deterministic random for stable visuals
function mathRandom(n: number) {
    return Math.sin(n) * 10000;
}
