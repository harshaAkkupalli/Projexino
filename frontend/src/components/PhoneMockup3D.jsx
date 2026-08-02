import { Canvas, useFrame } from "@react-three/fiber";
import { Float, RoundedBox, Html } from "@react-three/drei";
import { Suspense, useRef } from "react";

function Phone({ children, tilt = 0 }) {
  const group = useRef();
  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.getElapsedTime();
    group.current.position.y = Math.sin(t * 1.1) * 0.08;
    group.current.rotation.y = tilt + Math.sin(t * 0.6) * 0.05;
  });

  return (
    <group ref={group} rotation={[0, tilt, 0]}>
      <Float speed={1.4} rotationIntensity={0.2} floatIntensity={0.4}>
        {/* phone body */}
        <RoundedBox args={[2.2, 4.5, 0.18]} radius={0.18} smoothness={8} castShadow>
          <meshStandardMaterial color="#0a0d14" metalness={0.8} roughness={0.3} />
        </RoundedBox>
        {/* screen recess */}
        <mesh position={[0, 0, 0.095]}>
          <planeGeometry args={[2.0, 4.3]} />
          <meshStandardMaterial color="#0F2042" emissive="#1E3A8A" emissiveIntensity={0.35} />
        </mesh>
        {/* camera notch */}
        <mesh position={[0, 2.0, 0.11]}>
          <circleGeometry args={[0.06, 24]} />
          <meshStandardMaterial color="#000" />
        </mesh>
        {/* speaker */}
        <mesh position={[0.4, 2.0, 0.11]}>
          <boxGeometry args={[0.4, 0.04, 0.01]} />
          <meshStandardMaterial color="#111" />
        </mesh>
        {/* HTML screen content */}
        <Html
          transform
          distanceFactor={4.4}
          position={[0, 0, 0.105]}
          style={{ width: 240, height: 510, pointerEvents: "none" }}
        >
          {children}
        </Html>
      </Float>
    </group>
  );
}

export function PhoneCanvas({ children, tilt = 0 }) {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 36 }}
      dpr={[1, 1.6]}
      gl={{ antialias: true, alpha: true }}
      style={{ background: "transparent" }}
    >
      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} />
      <pointLight position={[-3, -2, 3]} intensity={1.1} color="#F97316" />
      <Suspense fallback={null}>
        <Phone tilt={tilt}>{children}</Phone>
      </Suspense>
    </Canvas>
  );
}

/* ---------- Screen content components ---------- */

export function LeadKanbanScreen() {
  return (
    <div className="phone-screen-grad h-full w-full overflow-hidden rounded-[18px] p-3 text-[10px] text-white">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="font-display text-[13px] font-semibold">Lead Funnel</div>
          <div className="text-[8px] text-slate-300">142 active leads</div>
        </div>
        <div className="rounded-full bg-[#F97316] px-2 py-0.5 text-[8px] font-bold">+12</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { t: "New", c: "#3B82F6", n: 24 },
          { t: "Qualified", c: "#10B981", n: 18 },
          { t: "Proposal", c: "#F97316", n: 11 },
          { t: "Won", c: "#A855F7", n: 7 },
        ].map((col) => (
          <div key={col.t} className="rounded-md bg-white/5 p-1.5">
            <div className="flex items-center justify-between text-[8px]">
              <span style={{ color: col.c }}>● {col.t}</span>
              <span className="text-slate-400">{col.n}</span>
            </div>
            <div className="mt-1.5 space-y-1">
              {[0, 1].map((i) => (
                <div key={i} className="rounded bg-white/10 p-1">
                  <div className="text-[9px] font-semibold">Acme {i + 1}</div>
                  <div className="text-[7px] text-slate-300">$12.4k</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-lg bg-white/5 p-2">
        <div className="mb-1 flex justify-between">
          <span className="text-[8px] text-slate-300">Conversion</span>
          <span className="text-[9px] font-semibold text-[#F97316]">42%</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-[42%] rounded-full bg-[#F97316]" />
        </div>
      </div>
    </div>
  );
}

export function TaskStreamScreen() {
  return (
    <div className="phone-screen-grad h-full w-full overflow-hidden rounded-[18px] p-3 text-[10px] text-white">
      <div className="mb-2 flex items-center justify-between">
        <div className="font-display text-[13px] font-semibold">Team Stream</div>
        <div className="flex -space-x-1.5">
          {["#F97316", "#3B82F6", "#10B981"].map((c, i) => (
            <div key={i} className="h-4 w-4 rounded-full border border-[#0F2042]" style={{ background: c }} />
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        {[
          { u: "Maya", c: "#F97316", t: "Closed lead • Acme Corp", p: 100 },
          { u: "Jules", c: "#3B82F6", t: "Pushed 3 tickets to QA", p: 72 },
          { u: "Tess", c: "#10B981", t: "Drafting Q2 roadmap", p: 38 },
          { u: "Rio", c: "#A855F7", t: "Reviewing PR #482", p: 60 },
        ].map((a, i) => (
          <div key={i} className="flex items-center gap-1.5 rounded-md bg-white/5 p-1.5">
            <div className="h-5 w-5 shrink-0 rounded-full text-center text-[8px] font-bold leading-5" style={{ background: a.c }}>
              {a.u[0]}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[8.5px] font-semibold">{a.u}</div>
              <div className="truncate text-[7.5px] text-slate-300">{a.t}</div>
              <div className="mt-0.5 h-0.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-[#F97316]" style={{ width: `${a.p}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        {["12", "47", "98%"].map((v, i) => (
          <div key={i} className="rounded-md bg-white/5 p-1 text-center">
            <div className="text-[10px] font-bold text-[#F97316]">{v}</div>
            <div className="text-[6.5px] text-slate-400">{["LIVE", "DONE", "SLA"][i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
