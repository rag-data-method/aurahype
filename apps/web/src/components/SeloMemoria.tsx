import { useEffect, useRef, useState } from "react";

/**
 * SeloMemoria — a representação visual da memória viva da Tríade.
 * Grid hexagonal 3D animado, cada hexágono é uma skill acumulada.
 * Cores nativas da marca: Luna violeta, Terra verde, Sol âmbar, Zênite branco.
 *
 * DORMANT: componente montado mas só renderiza quando `active === true`.
 * Uso previsto: aparecer fullscreen enquanto o worker gera o site
 * (status === "gerando" no App).
 *
 * Carrega Three.js sob demanda via CDN pra não pesar o bundle principal.
 * Se falhar, degrada silenciosamente (retorna null).
 */

interface SeloMemoriaProps {
  active: boolean;
  legend?: string;
  speed?: number;         // 0..3, default 1
  amplitude?: number;     // 0.1..4, default 1.8
  onReady?: () => void;
}

const THREE_CDN = "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js";
const GRID_DIMENSION = 11; // menor que 15 do original → melhor pra celular
const HEX_RADIUS = 0.45;

// Paleta Tríade — Luna violeta → Zênite branco → Terra verde → Sol âmbar
const TRIADE_HEX = [
  "#2a1f4d", // sombra profunda (base)
  "#4a3891", // luna escura
  "#a78bfa", // Luna
  "#e8dfff", // luna clara
  "#c9edd6", // terra clara
  "#34d399", // Terra
  "#fbbf24", // Sol
];

let threeLoadingPromise: Promise<unknown> | null = null;

function loadThree(): Promise<unknown> {
  if (threeLoadingPromise) return threeLoadingPromise;
  if (typeof window !== "undefined" && (window as unknown as { THREE?: unknown }).THREE) {
    threeLoadingPromise = Promise.resolve((window as unknown as { THREE: unknown }).THREE);
    return threeLoadingPromise;
  }
  threeLoadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = THREE_CDN;
    script.async = true;
    script.onload = () => resolve((window as unknown as { THREE: unknown }).THREE);
    script.onerror = () => reject(new Error("Falha ao carregar Three.js"));
    document.head.appendChild(script);
  });
  return threeLoadingPromise;
}

export function SeloMemoria({ active, legend, speed = 1, amplitude = 1.8, onReady }: SeloMemoriaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!active || !containerRef.current) return;
    let cancelled = false;

    loadThree().then((THREEany) => {
      if (cancelled || !containerRef.current) return;
      // Three.js sem tipagem — carregado via CDN, usamos any pra não puxar @types/three no bundle
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const THREE = THREEany as any;
      const container = containerRef.current;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050505);
      scene.fog = new THREE.FogExp2(0x050505, 0.04);

      const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 100);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      container.appendChild(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.6));
      const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
      dirLight.position.set(10, 20, 10);
      scene.add(dirLight);
      const glow = new THREE.PointLight(0xa78bfa, 2, 50);
      glow.position.set(0, 10, 0);
      scene.add(glow);

      const colors = TRIADE_HEX.map((hex) => new THREE.Color(hex));

      const geometry = new THREE.CylinderGeometry(HEX_RADIUS * 0.92, HEX_RADIUS * 0.92, 1, 6);
      geometry.rotateY(Math.PI / 6);
      geometry.translate(0, 0.5, 0);
      const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.8, flatShading: true });
      const TOTAL = GRID_DIMENSION * GRID_DIMENSION;
      const hexMesh = new THREE.InstancedMesh(geometry, material, TOTAL);

      const wireGeometry = new THREE.CylinderGeometry(HEX_RADIUS * 0.94, HEX_RADIUS * 0.94, 1, 6);
      wireGeometry.rotateY(Math.PI / 6);
      wireGeometry.translate(0, 0.5, 0);
      const wireMaterial = new THREE.MeshBasicMaterial({ color: 0xffbb46, wireframe: true, transparent: true, opacity: 0.15 });
      const wireMesh = new THREE.InstancedMesh(wireGeometry, wireMaterial, TOTAL);

      scene.add(hexMesh);
      scene.add(wireMesh);

      const hexWidth = Math.sqrt(3) * HEX_RADIUS * 1.05;
      const hexHeight = 2 * HEX_RADIUS * 1.05;
      const gridOffsetX = (GRID_DIMENSION * hexWidth) / 2;
      const gridOffsetZ = (GRID_DIMENSION * hexHeight * 0.75) / 2;

      camera.position.set(gridOffsetX * 1.5, 12, gridOffsetZ * 2.5);
      camera.lookAt(gridOffsetX, 0, gridOffsetZ);

      const dummy = new THREE.Object3D();
      let time = 0;
      let angle = 0;
      let rafId = 0;

      function animate() {
        rafId = requestAnimationFrame(animate);
        time += speed * 0.02;
        let index = 0;
        const minZ = 0.15;
        const maxZ = 3.5 + amplitude * 2.0;

        for (let q = 0; q < GRID_DIMENSION; q++) {
          for (let r = 0; r < GRID_DIMENSION; r++) {
            const xAbs = hexWidth * (q + 0.5 * (r & 1));
            const zAbs = hexHeight * 0.75 * r;
            const modX = q * 0.45;
            const modY = r * 0.45;
            const superficie = 3.5 + amplitude * (
              Math.sin(modX * 2.2 + time) * Math.cos(modY * 1.8 + time * 0.8)
              + Math.sin((modX - modY) * 1.5 - time * 1.2)
            );
            const zParam = Math.max(minZ, superficie);

            dummy.position.set(xAbs, 0, zAbs);
            dummy.scale.set(1, zParam, 1);
            dummy.updateMatrix();
            hexMesh.setMatrixAt(index, dummy.matrix);
            wireMesh.setMatrixAt(index, dummy.matrix);

            let norm = (zParam - minZ) / (maxZ - minZ);
            norm = Math.max(0, Math.min(1, norm));
            const arrayIndex = Math.floor(norm * (colors.length - 1));
            hexMesh.setColorAt(index, colors[arrayIndex]);
            index++;
          }
        }

        hexMesh.instanceMatrix.needsUpdate = true;
        if (hexMesh.instanceColor) hexMesh.instanceColor.needsUpdate = true;
        wireMesh.instanceMatrix.needsUpdate = true;

        angle += speed * 0.003;
        camera.position.x = gridOffsetX + Math.cos(angle) * 18;
        camera.position.z = gridOffsetZ + Math.sin(angle) * 18;
        camera.position.y = 10 + Math.sin(time * 0.5) * 2;
        camera.lookAt(gridOffsetX, 0, gridOffsetZ);

        renderer.render(scene, camera);
      }

      function onResize() {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
      }
      window.addEventListener("resize", onResize);

      animate();
      onReady?.();

      cleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        window.removeEventListener("resize", onResize);
        if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
        renderer.dispose();
        geometry.dispose();
        wireGeometry.dispose();
        material.dispose();
        wireMaterial.dispose();
      };
    }).catch(() => setFailed(true));

    return () => {
      cancelled = true;
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [active, speed, amplitude, onReady]);

  if (!active || failed) return null;

  return (
    <div className="selo-memoria" role="img" aria-label="Memória da Tríade sendo compilada">
      <div className="selo-canvas" ref={containerRef} />
      <div className="selo-scanline" aria-hidden="true" />
      <div className="selo-hud">
        <p className="selo-title">SELO CRIADOR · <span>TRÍADE 56</span></p>
        <p className="selo-sub">Compilando sua memória. Luna → Terra → Sol → Zênite.</p>
        {legend && <p className="selo-legend">{legend}</p>}
      </div>
    </div>
  );
}
