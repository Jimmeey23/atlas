import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RotateCcw, RotateCw, Minus, Plus, RefreshCw } from 'lucide-react';
import type { EvidenceMatrix } from '../../../report/visual-evidence';
import { matrixDomain } from '../../../report/visual-evidence';
import { reportFmt as fmt } from '../../../report/definitions';

type Pick = { group: number; period: number };
const COLORS = ['#99a8c3', '#22a69b', '#7565e9'];

/** WebGL scene renders only while visible; the adjacent HTML table is the keyboard/data equivalent. */
export default function ThreeEvidenceScene({ matrix, selected, onSelect }: { matrix: EvidenceMatrix; selected: Pick | null; onSelect: (pick: Pick) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const commands = useRef<(action: string) => void>(() => {});
  const select = useRef(onSelect); select.current = onSelect;
  const [visible, setVisible] = useState(false), [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState<Pick | null>(null);
  const selectedRef = useRef(selected); selectedRef.current = selected;
  const repaint = useRef<() => void>(() => {});
  useEffect(() => { repaint.current(); }, [selected]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '100px' });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = host.current;
    if (!element || !visible) return;
    setFailed(false);
    let renderer: THREE.WebGLRenderer;
    try { const canvas = document.createElement("canvas"); const context = canvas.getContext("webgl2", { antialias: true, alpha: true }); if (!context) { setFailed(true); return; } renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: true }); }
    catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute('aria-label', 'Interactive 3D evidence chart. Use the rotation controls or the exact-value table.');
    renderer.domElement.setAttribute('role', 'img');
    renderer.domElement.dataset.chart3d = 'true';
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-8, 8, 6, -6, .1, 120);
    const target = new THREE.Vector3(0, 1.3, 0);
    camera.position.set(9, 8, 11); camera.lookAt(target);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target); controls.enablePan = false; controls.enableDamping = false;
    controls.minPolarAngle = .3; controls.maxPolarAngle = Math.PI / 2.05;
    controls.minZoom = .65; controls.maxZoom = 2.4;
    controls.saveState();
    scene.add(new THREE.AmbientLight(0xffffff, 2));
    const light = new THREE.DirectionalLight(0xffffff, 3); light.position.set(4, 12, 8); scene.add(light);
    const fill = new THREE.DirectionalLight(0xd4deff, 1.2); fill.position.set(-5, 5, -8); scene.add(fill);
    const domain = matrixDomain(matrix), scale = 4 / (Math.max(Math.abs(domain.min), Math.abs(domain.max)) || 1);
    controls.target.y = (domain.min + domain.max) * scale / 2; controls.update(); controls.saveState();
    const width = Math.max(3, matrix.categories.length * 1.1), depth = Math.max(2, matrix.periods.length * 1.15);
    const dark = element.closest('[data-report-theme]')?.getAttribute('data-report-theme') === 'dark';
    const gridMaterial = new THREE.LineBasicMaterial({ color: dark ? '#4e6384' : '#dce4f0', transparent: true, opacity: .9 });
    const geometries: THREE.BufferGeometry[] = [], materials: THREE.Material[] = [];
    const bars: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
    const labels: { node: HTMLSpanElement; point: THREE.Vector3 }[] = [];
    const label = (text: string, x: number, y: number, z: number, kind: string) => {
      const node = document.createElement('span'); node.className = `rp-3d-label ${kind}`; node.textContent = text; element.appendChild(node);
      labels.push({ node, point: new THREE.Vector3(x, y, z) });
    };
    const line = (points: THREE.Vector3[]) => { const geometry = new THREE.BufferGeometry().setFromPoints(points); geometries.push(geometry); scene.add(new THREE.Line(geometry, gridMaterial)); };
    const lower = domain.min < 0 ? domain.min * scale : 0;
    for (let i = 0; i <= 4; i++) {
      const value = domain.min + (domain.max - domain.min || 1) * i / 4;
      const y = value * scale;
      line([new THREE.Vector3(-width / 2 - .5, y, -depth / 2 - .5), new THREE.Vector3(width / 2, y, -depth / 2 - .5)]);
      label(fmt(matrix.metric, value), -width / 2 - .85, y, -depth / 2 - .5, 'value');
    }
    line([new THREE.Vector3(-width / 2 - .5, lower, -depth / 2 - .5), new THREE.Vector3(-width / 2 - .5, (domain.max || (domain.min === 0 ? 1 : 0)) * scale, -depth / 2 - .5)]);
    matrix.categories.forEach((name, g) => {
      const x = (g - (matrix.categories.length - 1) / 2) * 1.1;
      label(String(g + 1), x, 0, depth / 2 + .45, 'category');
      matrix.periods.forEach((period, p) => {
        const value = period.values[g]; if (value == null || value === 0) return;
        const h = Math.abs(value) * scale, z = (p - (matrix.periods.length - 1) / 2) * 1.15;
        const geometry = new THREE.BoxGeometry(.62, h, .62);
        const color = COLORS[(p + 3 - matrix.periods.length) % 3];
        const material = new THREE.MeshStandardMaterial({ color, roughness: .36, metalness: .12 });
        const bar = new THREE.Mesh(geometry, material); bar.position.set(x, value * scale / 2, z); bar.userData = { group: g, period: p, color };
        scene.add(bar); bars.push(bar); geometries.push(geometry); materials.push(material);
      });
    });
    matrix.periods.forEach((period, p) => label(period.label, width / 2 + .45, 0, (p - (matrix.periods.length - 1) / 2) * 1.15, 'period'));
    const render = () => {
      const selected = selectedRef.current;
      bars.forEach(bar => { bar.material.emissive.set(selected?.group === bar.userData.group && selected?.period === bar.userData.period ? '#3c316e' : '#000000'); });
      renderer.domElement.dataset.camera = [camera.position.x, camera.position.y, camera.position.z, camera.zoom].map(value => value.toFixed(3)).join(',');
      renderer.render(scene, camera);
      const w = element.clientWidth, h = element.clientHeight;
      labels.forEach(({ node, point }) => { const projected = point.clone().project(camera); node.style.left = `${(projected.x + 1) * w / 2}px`; node.style.top = `${(1 - projected.y) * h / 2}px`; node.hidden = projected.z < -1 || projected.z > 1; });
    };
    repaint.current = render;
    const resize = () => { const w = element.clientWidth, h = element.clientHeight; const span = Math.max(5.5, width * .72 + 2.3); camera.left = -span; camera.right = span; camera.top = span * h / Math.max(w, 1); camera.bottom = -camera.top; camera.updateProjectionMatrix(); renderer.setSize(w, h); render(); };
    const observer = new ResizeObserver(resize); observer.observe(element);
    controls.addEventListener('change', render);
    let start = { x: 0, y: 0 };
    const down = (event: PointerEvent) => { start = { x: event.clientX, y: event.clientY }; };
    const pick = (event: PointerEvent, commit: boolean) => {
      const rect = renderer.domElement.getBoundingClientRect();
      const point = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      const ray = new THREE.Raycaster(); ray.setFromCamera(point, camera);
      const object = ray.intersectObjects(bars)[0]?.object;
      const hit = object ? { group: object.userData.group as number, period: object.userData.period as number } : null;
      setHovered(hit); if (commit && hit) select.current(hit);
    };
    const up = (event: PointerEvent) => { if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6) pick(event, true); };
    const move = (event: PointerEvent) => pick(event, false);
    const leave = () => setHovered(null);
    const lost = (event: Event) => { event.preventDefault(); setFailed(true); };
    renderer.domElement.addEventListener('pointerdown', down); renderer.domElement.addEventListener('pointerup', up); renderer.domElement.addEventListener('pointermove', move); renderer.domElement.addEventListener('pointerleave', leave); renderer.domElement.addEventListener('webglcontextlost', lost);
    commands.current = action => {
      if (action === 'reset') controls.reset();
      else if (action === 'in' || action === 'out') { camera.zoom = Math.min(2.4, Math.max(.65, camera.zoom * (action === 'in' ? 1.2 : 1 / 1.2))); camera.updateProjectionMatrix(); }
      else { const offset = camera.position.clone().sub(controls.target); offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), action === 'left' ? .25 : -.25); camera.position.copy(controls.target).add(offset); }
      controls.update(); render();
    };
    resize();
    return () => {
      commands.current = () => {}; repaint.current = () => {};
      observer.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', down); renderer.domElement.removeEventListener('pointerup', up); renderer.domElement.removeEventListener('pointermove', move); renderer.domElement.removeEventListener('pointerleave', leave); renderer.domElement.removeEventListener('webglcontextlost', lost);
      labels.forEach(({ node }) => node.remove()); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); gridMaterial.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [matrix, visible]);
  const active = hovered ?? selected;
  return <div className="rp-3d">
    <div className="rp-3d-actions" role="group" aria-label="3D camera controls">
      <button type="button" aria-label="Rotate chart left" onClick={() => commands.current('left')}><RotateCcw size={14}/></button><button type="button" aria-label="Rotate chart right" onClick={() => commands.current('right')}><RotateCw size={14}/></button><button type="button" aria-label="Zoom into 3D chart" onClick={() => commands.current('in')}><Plus size={14}/></button><button type="button" aria-label="Zoom out of 3D chart" onClick={() => commands.current('out')}><Minus size={14}/></button><button type="button" aria-label="Reset 3D camera" onClick={() => commands.current('reset')}><RefreshCw size={14}/></button>
    </div>
    <div ref={host} className="rp-3d-scene" data-3d-state={failed ? 'unavailable' : visible ? 'active' : 'paused'}>{failed && <p className="rp-3d-fallback">3D rendering is unavailable on this device. Use the exact-value table below or switch to 2D.</p>}</div>
    <div className="rp-3d-inspect" role="status">{active ? <><b>{matrix.categories[active.group]}</b><span>{matrix.periods[active.period]?.label} · {fmt(matrix.metric, matrix.periods[active.period]?.values[active.group])}</span></> : <><b>Explore the evidence</b><span>Drag to rotate · scroll to zoom · select a bar or table value</span></>}</div>
  </div>;
}
