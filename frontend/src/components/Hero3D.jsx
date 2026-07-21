import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Environment, MeshDistortMaterial } from "@react-three/drei";
import { useRef, useState, useEffect, Suspense } from "react";

function PXKnot({ mouse }) {
  const group = useRef();
  const knot = useRef();
  const cube = useRef();
  const accent = useRef();

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    const targetX = mouse.current.y * 0.35;
    const targetY = mouse.current.x * 0.5;
    group.current.rotation.x += (targetX - group.current.rotation.x) * 0.05;
    group.current.rotation.y += (targetY + t * 0.15 - group.current.rotation.y) * 0.04;
    if (knot.current) knot.current.rotation.z = t * 0.3;
    if (cube.current) {
      cube.current.rotation.x = t * 0.6;
      cube.current.rotation.y = t * 0.4;
    }
    if (accent.current) accent.current.rotation.z = -t * 0.5;
  });

  return (
    <group ref={group}>
      <Float speed={1.4} rotationIntensity={0.5} floatIntensity={1.6}>
        <mesh ref={knot}>
          <torusKnotGeometry args={[1.15, 0.36, 200, 28, 2, 3]} />
          <MeshDistortMaterial
            color="#1E3A8A"
            metalness={0.7}
            roughness={0.2}
            distort={0.25}
            speed={1.4}
          />
        </mesh>
      </Float>
      <Float speed={2.2} rotationIntensity={1} floatIntensity={1.4}>
        <mesh ref={accent} position={[1.6, 0.8, 0.4]} rotation={[Math.PI / 4, 0, 0]}>
          <torusGeometry args={[0.55, 0.07, 24, 64]} />
          <meshStandardMaterial
            color="#F97316"
            emissive="#F97316"
            emissiveIntensity={0.9}
            metalness={0.4}
            roughness={0.25}
          />
        </mesh>
      </Float>
      <Float speed={1.8} rotationIntensity={2} floatIntensity={1.2}>
        <mesh ref={cube} position={[-1.7, -0.9, 0.2]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#F97316" metalness={0.5} roughness={0.3} />
        </mesh>
      </Float>
    </group>
  );
}

export default function Hero3D() {
  const mouse = useRef({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const handle = (e) => {
      mouse.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.current.y = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("mousemove", handle);
    setReady(true);
    return () => window.removeEventListener("mousemove", handle);
  }, []);

  if (!ready) return null;

  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 45 }}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={1.1} />
      <directionalLight position={[5, 5, 5]} intensity={1.4} color="#ffffff" />
      <pointLight position={[-5, -3, 2]} intensity={1.3} color="#F97316" />
      <pointLight position={[3, 4, 2]} intensity={0.8} color="#1E3A8A" />
      <Suspense fallback={null}>
        <PXKnot mouse={mouse} />
        <Environment preset="studio" />
      </Suspense>
    </Canvas>
  );
}
