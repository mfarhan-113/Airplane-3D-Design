'use client';

import { Environment, Lightformer, OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { CanvasTexture, Color, Mesh, MeshStandardMaterial, SRGBColorSpace, Spherical, Vector3, type Group } from 'three';
import { useBooking } from '@/lib/booking-store';
import { seatById } from '@/lib/flight';
import { CabinEnclosure, CabinModel } from './cabin-model';
import type { CameraAction } from './flight-experience';

const modelPath = '/models/aeriform-widebody.glb';
const defaultCamera: [number, number, number] = [21.3, 6.8, -13.4];
const exteriorTarget = new Vector3(0, .15, -.3);
const cabinTarget = new Vector3(0, .1, -.15);
const cabinCamera = new Vector3(4.4, 27.5, .45);
const cabinWidth = .255;
const cabinHeight = .42;
const cabinFloor = -.25;
const cabinLength = .88;
const cabinOffset = -.28;

function Aircraft({ onReady, reveal }: { onReady: () => void; reveal: { value: number } }) {
  const { scene } = useGLTF(modelPath, false, false);
  const model = useMemo(() => {
    const object = scene.clone(true);
    const materials: MeshStandardMaterial[] = [];
    const branding = document.createElement('canvas');
    branding.width = 512;
    branding.height = 100;
    const ink = branding.getContext('2d')!;
    ink.fillStyle = '#172c43';
    ink.font = 'italic 70px Georgia';
    ink.textBaseline = 'middle';
    ink.textAlign = 'center';
    ink.fillText('aeriform.', 256, 54);
    const logo = new CanvasTexture(branding);
    logo.colorSpace = SRGBColorSpace;
    object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      const part = child.parent?.name ?? child.name;
      if (/gear|wheel/i.test(`${part} ${child.name}`)) { child.visible = false; return; }
      const fuselage = /fuselage/i.test(`${part} ${child.name}`);
      const cut = fuselage || /Cabin.windows|Door.seams|Lights/i.test(`${part} ${child.name}`);
      const adapt = (source: MeshStandardMaterial) => {
        const material = new MeshStandardMaterial().copy(source);
        materials.push(material);
        if (source.name === 'Deep blue livery paint') material.color = new Color('#c3ad85');
        if (!cut) return material;
        material.onBeforeCompile = (shader) => {
          shader.uniforms.cabinReveal = reveal;
          shader.uniforms.airlineLogo = { value: logo };
          shader.vertexShader = `varying vec3 hullPosition;\n${shader.vertexShader}`.replace('#include <begin_vertex>', '#include <begin_vertex>\nhullPosition = position;');
          shader.fragmentShader = `uniform float cabinReveal;\nuniform sampler2D airlineLogo;\nvarying vec3 hullPosition;\n${shader.fragmentShader}`.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
            if (abs(hullPosition.x) < 3.2 && hullPosition.y > 5.45 && hullPosition.z < -4.7 && hullPosition.z > mix(-4.7, -58.0, cabinReveal)) discard;`);
          if (fuselage && source.name === 'White airliner paint') shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
            vec2 logoUV = vec2(.5 - sign(hullPosition.x) * (hullPosition.z + 14.2) / 10.4, (hullPosition.y - 7.12) / 1.34);
            if (abs(hullPosition.x) > 1.5 && logoUV.x > 0.0 && logoUV.x < 1.0 && logoUV.y > 0.0 && logoUV.y < 1.0) {
              vec4 lettering = texture2D(airlineLogo, logoUV);
              diffuseColor.rgb = mix(diffuseColor.rgb, lettering.rgb, lettering.a);
            }`);
        };
        material.customProgramCacheKey = () => fuselage && source.name === 'White airliner paint' ? 'widebody-cut-and-livery' : 'widebody-cut';
        return material;
      };
      child.material = Array.isArray(child.material) ? child.material.map(adapt) : adapt(child.material);
    });
    const scale = 20.6 / 63.6;
    object.scale.setScalar(scale);
    object.position.set(0, -5.75 * scale, 31.8 * scale);
    return { object, materials, logo };
  }, [scene, reveal]);

  useEffect(() => {
    onReady();
    return () => { model.materials.forEach((material) => material.dispose()); model.logo.dispose(); };
  }, [model, onReady]);

  return <group rotation={[0, Math.PI, 0]}><primitive object={model.object} /></group>;
}

function SceneContent({ action, onReady, onError }: { action: CameraAction; onReady: () => void; onError: () => void }) {
  const view = useBooking((state) => state.view);
  const selectedId = useBooking((state) => state.selectedId);
  const input = useRef<ComponentRef<typeof OrbitControls>>(null);
  const animation = useRef<gsap.core.Timeline | gsap.core.Tween | null>(null);
  const actionProcessed = useRef(0);
  const framed = useRef(false);
  const active = useRef<'aircraft' | 'cabin'>('aircraft');
  const interior = useRef<Group>(null);
  const enclosure = useRef<Group>(null);
  const reveal = useRef({ value: 0 }).current;
  const [loaded, setLoaded] = useState(false);
  const { camera, gl, scene, size, invalidate, events, setDpr, viewport } = useThree();
  const restDpr = viewport.initialDpr;
  const reducedMotion = useRef(false);
  const loadedCallback = useCallback(() => setLoaded(true), []);

  useEffect(() => {
    if (!loaded || !interior.current || !enclosure.current) return;
    const cabin = interior.current;
    const roof = enclosure.current;
    const wasVisible = cabin.visible;
    const wasEnclosed = roof.visible;
    cabin.visible = true;
    roof.visible = false;
    let active = true;
    const overhead = gl.compileAsync(scene, camera);
    roof.visible = true;
    const seatView = gl.compileAsync(scene, camera);
    cabin.visible = wasVisible;
    roof.visible = wasEnclosed;
    void Promise.allSettled([overhead, seatView]).then(() => { if (active) onReady(); });
    return () => { active = false; };
  }, [loaded, scene, camera, gl, onReady]);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { reducedMotion.current = query.matches; };
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onError(); };
    gl.domElement.addEventListener('webglcontextlost', lost);
    return () => gl.domElement.removeEventListener('webglcontextlost', lost);
  }, [gl, onError]);

  useLayoutEffect(() => {
    if (!loaded || !input.current) return;
    const controls = input.current;
    const nextStage = view === 'aircraft' ? 'aircraft' : 'cabin';
    const isCabin = nextStage === 'cabin';
    const fit = Math.max(1, 1.46 / (size.width / Math.max(size.height, 1)));
    const exteriorPosition = new Vector3(...defaultCamera).multiplyScalar(fit);
    const homePosition = cabinCamera.clone().sub(cabinTarget).multiplyScalar(Math.min(fit, 2.1)).add(cabinTarget);
    const newAction = action.serial !== actionProcessed.current ? action.type : undefined;
    actionProcessed.current = action.serial;
    const seat = (!newAction || newAction === 'seat') && selectedId && isCabin ? seatById.get(selectedId) : undefined;
    const seatZ = seat ? seat.z * cabinLength + cabinOffset : 0;
    const target = seat ? new Vector3(seat.x * cabinWidth, .22, seatZ) : (isCabin ? cabinTarget.clone() : exteriorTarget.clone());
    let position = seat ? new Vector3(seat.x * cabinWidth + 1.7, 2.4, seatZ - 2.2 * Math.min(fit, 1.4)) : (isCabin ? homePosition : exteriorPosition);

    controls.minDistance = isCabin ? 1.15 : 10;
    const eyeLevel = Boolean(seat && newAction === 'seat');
    if (seat && eyeLevel) {
      const x = seat.x * cabinWidth;
      const forward = seat.row < 10 ? 1 : -1;
      position.set(x * .69, .34, seatZ + forward * .2);
      target.set(seat.position === 'Window' ? Math.sign(x) * .70 : x * -.43, .24, seatZ + forward * (seat.position === 'Window' ? .62 : 2.8));
    }

    if (isCabin && (newAction === 'business' || newAction === 'economy')) {
      const z = newAction === 'business' ? -6.45 : 1.3;
      target.set(0, .43, z);
      position.set(3.4, newAction === 'business' ? 5.7 : 11, z - 1.5);
    }
    if (newAction === 'in' || newAction === 'out') {
      target.copy(controls.target);
      const offset = camera.position.clone().sub(target);
      const distance = Math.max(isCabin ? 1.6 : 10, Math.min(isCabin ? 35 : 49, offset.length() * (newAction === 'in' ? .78 : 1.28)));
      position = offset.setLength(distance).add(target);
    }

    function update() {
      controls.update();
      invalidate();
    }

    function switchStage() {
      active.current = nextStage;
      controls.maxPolarAngle = isCabin ? Math.PI * .495 : Math.PI * .76;
      events.update?.();
    }

    animation.current?.kill();
    const changingStage = active.current !== nextStage;
    const firstFrame = !framed.current;
    framed.current = true;
    const finish = () => {
      controls.enabled = true;
      interior.current!.visible = isCabin;
      setDpr(restDpr);
      update();
    };
    const roof = enclosure.current!;
    roof.visible = eyeLevel;
    roof.position.y = eyeLevel ? 2.5 : 0;
    if (firstFrame || reducedMotion.current || view === 'map') {
      if (changingStage) switchStage();
      reveal.value = isCabin ? 1 : 0;
      camera.position.copy(position);
      controls.target.copy(target);
      roof.position.y = 0;
      finish();
      return;
    }

    controls.enabled = false;
    const startTarget = controls.target.clone();
    const from = new Spherical().setFromVector3(camera.position.clone().sub(startTarget));
    const to = new Spherical().setFromVector3(position.clone().sub(target));
    const angle = Math.atan2(Math.sin(to.theta - from.theta), Math.cos(to.theta - from.theta));
    const orbit = new Spherical();
    const travel = { progress: 0 };
    const timeline = gsap.timeline({ paused: true, onUpdate: () => {
      const t = travel.progress;
      controls.target.copy(startTarget).lerp(target, t);
      orbit.set(from.radius + (to.radius - from.radius) * t, from.phi + (to.phi - from.phi) * t, from.theta + angle * t);
      camera.position.setFromSpherical(orbit).add(controls.target);
      update();
    }, onComplete: finish });
    animation.current = timeline;
    if (changingStage) switchStage();
    if (isCabin) interior.current!.visible = true;
    const revealing = reveal.value !== (isCabin ? 1 : 0);
    const duration = changingStage || revealing ? 1.85 : eyeLevel ? 1.55 : newAction === 'in' || newAction === 'out' ? .38 : 1.05;
    timeline.to(travel, { progress: 1, duration, ease: 'sine.inOut' }, 0);
    if (revealing) timeline.to(reveal, { value: isCabin ? 1 : 0, duration: 1.30, ease: 'sine.inOut' }, .21);
    if (eyeLevel) timeline.to(roof.position, { y: 0, duration: .72, ease: 'sine.inOut' }, .80);
    setDpr(Math.min(restDpr, .80));
    const start = performance.now();
    const length = timeline.duration();
    let frame: number;
    const renderFrame = (now: number) => {
      const elapsed = Math.min((now - start) / 1000, length);
      timeline.time(elapsed);
      if (elapsed < length) frame = requestAnimationFrame(renderFrame);
    };
    frame = requestAnimationFrame(renderFrame);
    return () => { cancelAnimationFrame(frame); timeline.kill(); controls.enabled = true; };
  }, [view, selectedId, size.width, size.height, loaded, action, camera, invalidate, reveal, events, restDpr, setDpr]);

  return <>
    <group>
      <Environment resolution={96} frames={1} environmentIntensity={.66}>
        <color attach="background" args={['#b6c5d4']} />
        <Lightformer intensity={2.4} color="#ffd5a1" position={[3, 6, 4]} scale={7} target={[0, 0, 0]} />
        <Lightformer intensity={1.45} color="#c0ddff" position={[-4, 1, -4]} scale={5} target={[0, 0, 0]} />
      </Environment>
      <hemisphereLight args={['#e5edff', '#a08062', .7]} />
      <directionalLight position={[5, 8, 4]} intensity={2.35} color="#fff2dc" />
      <directionalLight position={[-6, 3, -7]} intensity={.8} color="#bddaff" />
      <Suspense fallback={null}><Aircraft onReady={loadedCallback} reveal={reveal} /></Suspense>
    </group>
    <group ref={interior} visible={false} position={[0, cabinFloor, cabinOffset]} scale={[cabinWidth, cabinHeight, cabinLength]}>
      <CabinModel visible={view === 'cabin'} />
      <group ref={enclosure} visible={false}><CabinEnclosure /></group>
    </group>
    <OrbitControls ref={input} makeDefault enableDamping dampingFactor={.12} enablePan={false} rotateSpeed={.5} zoomSpeed={.65} minDistance={10} maxDistance={58} />
  </>;
}

class SceneBoundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { useGLTF.clear(modelPath); this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function FlightScene({ action, onReady, onError }: { action: CameraAction; onReady: () => void; onError: () => void }) {
  return <SceneBoundary onError={onError}>
      <Canvas dpr={[1.12, 1.4]} frameloop="demand" camera={{ fov: 38, position: defaultCamera, near: .065, far: 120 }} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}>
        <SceneContent action={action} onReady={onReady} onError={onError} />
      </Canvas>
    </SceneBoundary>;
}
