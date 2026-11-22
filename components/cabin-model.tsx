'use client';

import { Html, useTexture } from '@react-three/drei';
import { useThree, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useLayoutEffect, useRef, useState } from 'react';
import { BoxGeometry, Color, DoubleSide, Matrix4, Shape, ShapeGeometry, SphereGeometry, type BufferGeometry, type InstancedMesh } from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useBooking } from '@/lib/booking-store';
import { currency, seatById, seats, type Seat } from '@/lib/flight';

type Part = [width: number, height: number, depth: number, x: number, y: number, z: number, radius?: number, tilt?: number];

function shapeParts(parts: Part[]) {
  const pieces = parts.map(([w, h, d, x, y, z, radius, tilt]) => {
    const piece = radius ? new RoundedBoxGeometry(w, h, d, 1, radius) : new BoxGeometry(w, h, d).toNonIndexed();
    if (tilt) piece.rotateX(tilt);
    return piece.translate(x, y, z);
  });
  const geometry = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  return geometry;
}

const economySeats = seats.filter((seat) => seat.cabin === 'Economy');
const businessSeats = seats.filter((seat) => seat.cabin === 'Business');

function cushions(parts: Part[]) {
  const soften = (value: number) => Math.sign(value) * Math.abs(value) ** .48;
  const pieces = parts.map(([w, h, d, x, y, z, , tilt]) => {
    const shape = new SphereGeometry(1, 14, 10);
    const position = shape.attributes.position;
    for (let index = 0; index < position.count; index++) {
      const height = soften(position.getY(index));
      position.setXYZ(index, soften(position.getX(index)) * w * .5 * (1 - .12 * height), height * h * .5, soften(position.getZ(index)) * d * .5);
    }
    shape.computeVertexNormals();
    const result = shape.toNonIndexed();
    shape.dispose();
    if (tilt) result.rotateX(tilt);
    return result.translate(x, y, z);
  });
  const geometry = mergeGeometries(pieces);
  pieces.forEach((piece) => piece.dispose());
  return geometry;
}

function seatParts(business: boolean) {
  const half = business ? .38 : .248;
  const width = half * 2;
  const arm = half + (business ? .045 : .009);
  return {
    upholstery: cushions([
      [width - .036, .13, business ? .70 : .58, 0, .47, -.12],
      [width - .071, .61, .17, 0, .80, .212, 0, .16],
      [width - .133, .45, .09, 0, .79, .128, 0, .16],
      [width - .091, .22, .168, 0, 1.11, .235, 0, .13],
    ]),
    shell: shapeParts([
      [width, .76, .13, 0, .84, .302, .064, .15],
      [width + .016, .13, .64, 0, .395, -.075, .033],
      [.085, .072, business ? .61 : .44, arm, .63, -.09, .025],
      [.085, .072, business ? .61 : .44, -arm, .63, -.09, .025],
      ...(business ? [[.16, .70, 1.08, arm + .028, .50, -.11, .079], [.15, .46, .88, -arm - .035, .39, -.11, .071], [.24, .08, .73, -arm - .018, .66, -.19, .034], [width + .11, .27, .135, 0, 1.025, .365, .065, .15]] as Part[] : []),
    ]),
    mount: shapeParts([
      [.055, .31, .065, .15, .2, -.14, .014], [.055, .31, .065, -.15, .2, -.14, .014],
      [.06, .1, .46, .15, .064, -.015, .017], [.06, .1, .46, -.15, .064, -.015, .017],
    ]),
    headrest: cushions([[width - .17, .125, .037, 0, 1.13, .149, 0, .12], [.075, .17, .098, width * .33, 1.078, .178], [.075, .17, .098, -width * .33, 1.078, .178]]),
    screen: shapeParts([[width - .136, .199, .05, 0, .946, .366, .022, .15], [width - .139, .136, .023, 0, .68, .35, .01, .15]]),
  };
}

const economyParts = seatParts(false);
const businessParts = seatParts(true);
const pickParts = {
  business: new BoxGeometry(.94, 1.2, .69).translate(0, .63, -.015),
  economy: new BoxGeometry(.54, 1.2, .69).translate(0, .63, -.015),
};
const worldMatrix = new Matrix4();
const color = new Color();

function SeatInstances({ group, parts, onHover, enabled }: { group: Seat[]; parts: ReturnType<typeof seatParts>; onHover: (id: string | null) => void; enabled: boolean }) {
  const selected = useBooking((state) => state.selectedId);
  const occupied = useBooking((state) => state.occupiedIds);
  const select = useBooking((state) => state.select);
  const upholstery = useRef<InstancedMesh>(null);
  const shell = useRef<InstancedMesh>(null);
  const base = useRef<InstancedMesh>(null);
  const headrest = useRef<InstancedMesh>(null);
  const screen = useRef<InstancedMesh>(null);
  const picking = useRef<InstancedMesh>(null);
  const invalidate = useThree((state) => state.invalidate);
  const business = group === businessSeats;
  const pickGeometry = business ? pickParts.business : pickParts.economy;

  useLayoutEffect(() => {
    const instances = [upholstery.current!, shell.current!, base.current!, headrest.current!, screen.current!, picking.current!];
    group.forEach((seat, index) => {
      worldMatrix.makeScale(1, 1, business ? .81 : .74).setPosition(seat.x, .025, seat.z);
      instances.forEach((instance) => instance.setMatrixAt(index, worldMatrix));
    });
    instances.forEach((instance) => {
      instance.instanceMatrix.needsUpdate = true;
      instance.computeBoundingSphere();
    });
  }, [group, business]);

  useLayoutEffect(() => {
    group.forEach((seat, index) => {
      const active = seat.id === selected;
      const unavailable = occupied.includes(seat.id);
      upholstery.current!.setColorAt(index, color.set(active ? '#ba7846' : unavailable ? '#585653' : business ? '#7d5947' : '#857b71'));
      headrest.current!.setColorAt(index, color.set(active ? '#f7cb9f' : unavailable ? '#9a958a' : business ? '#ddd2bf' : '#cdc5b8'));
    });
    upholstery.current!.instanceColor!.needsUpdate = true;
    headrest.current!.instanceColor!.needsUpdate = true;
    invalidate();
  }, [group, business, occupied, selected, invalidate]);

  function picked(event: ThreeEvent<PointerEvent | MouseEvent>) {
    event.stopPropagation();
    return event.instanceId === undefined ? undefined : group[event.instanceId];
  }

  return <group>
    <instancedMesh ref={upholstery} args={[parts.upholstery, undefined, group.length]}><meshStandardMaterial roughness={.87} /></instancedMesh>
    <instancedMesh ref={shell} args={[parts.shell, undefined, group.length]}><meshStandardMaterial color={business ? '#d0bc9c' : '#b1a99a'} roughness={.48} /></instancedMesh>
    <instancedMesh ref={base} args={[parts.mount, undefined, group.length]}><meshStandardMaterial color="#7a8387" metalness={.3} roughness={.58} /></instancedMesh>
    <instancedMesh ref={headrest} args={[parts.headrest, undefined, group.length]}><meshStandardMaterial roughness={.98} /></instancedMesh>
    <instancedMesh ref={screen} args={[parts.screen, undefined, group.length]}><meshStandardMaterial color="#19222b" metalness={.12} roughness={.33} /></instancedMesh>
    <instancedMesh ref={picking} args={[pickGeometry, undefined, group.length]}
      onPointerMove={enabled ? (event) => { const seat = picked(event); if (seat) onHover(seat.id); } : undefined}
      onPointerOut={enabled ? () => onHover(null) : undefined}
      onClick={enabled ? (event) => { const seat = picked(event); if (seat && event.delta < 6) select(seat.id); } : undefined}>
      <meshBasicMaterial visible={false} />
    </instancedMesh>
  </group>;
}

const floorShape = new Shape();
floorShape.moveTo(0, 9.8);
floorShape.bezierCurveTo(-2.45, 9.8, -3.12, 8.9, -3.15, 7.45);
floorShape.lineTo(-3.15, -7.6);
floorShape.bezierCurveTo(-3.12, -8.95, -2.45, -9.1, 0, -9.1);
floorShape.bezierCurveTo(2.45, -9.1, 3.12, -8.95, 3.15, -7.6);
floorShape.lineTo(3.15, 7.45);
floorShape.bezierCurveTo(3.12, 8.9, 2.45, 9.8, 0, 9.8);

const carpets = shapeParts([[-.96, .006, .62], [.96, .006, .62]].map(([x, y, width]) => [width, .015, 16.7, x, y, -.23]));
const rails = shapeParts([
  [.16, .29, 15.8, -3.13, .13, .05, .068],
  [.16, .29, 15.8, 3.13, .13, .05, .068],
  [.08, .04, 15.65, 3.13, .299, .05, .018],
]);
const panels = shapeParts([
  [.14, 1.72, 16.6, -3.12, .92, -.15, .05],
  [.34, .36, 16.25, -3.018, 1.93, -.12, .13],
  [.60, .32, 15.8, -2.82, 2.17, .03, .12],
  [.12, 1.3, 2.2, -1.93, .66, -4.73, .05],
  [.12, 1.3, 2.2, 1.93, .66, -4.73, .05],
  [4.88, 1.82, .17, 0, .9, 8.1, .08],
  [4.55, .56, .35, 0, .26, -8.55, .14],
]);
const trim = shapeParts([
  [.055, .03, 15.77, -2.826, 1.92, .03, .011],
  [.04, .024, 15.64, 3.083, .273, .03, .01],
  [4.81, .045, .05, 0, .97, 7.99, .015],
]);
const windowRows = Array.from({ length: 15 }, (_, index) => -7.55 + index * 1.06);

function windowLayer(width: number, height: number, radius: number, x: number, y: number) {
  const w = width / 2;
  const h = height / 2;
  const shape = new Shape();
  shape.moveTo(-w + radius, -h);
  shape.lineTo(w - radius, -h);
  shape.quadraticCurveTo(w, -h, w, -h + radius);
  shape.lineTo(w, h - radius);
  shape.quadraticCurveTo(w, h, w - radius, h);
  shape.lineTo(-w + radius, h);
  shape.quadraticCurveTo(-w, h, -w, h - radius);
  shape.lineTo(-w, -h + radius);
  shape.quadraticCurveTo(-w, -h, -w + radius, -h);
  const panes = windowRows.map((z) => {
    const geometry = new ShapeGeometry(shape, 9);
    const points = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let index = 0; index < uv.count; index++) uv.setXY(index, .5 + points.getX(index) / (width * 1.9), .53 + points.getY(index) / height * .76);
    return geometry.rotateY(x < 0 ? Math.PI / 2 : -Math.PI / 2).translate(x, y, z);
  });
  const geometry = mergeGeometries(panes);
  panes.forEach((pane) => pane.dispose());
  return geometry;
}

const windowFrames = windowLayer(.51, .68, .19, -3.038, 1.31);
const windowGaskets = windowLayer(.437, .593, .163, -3.030, 1.31);
const windowGlass = windowLayer(.351, .489, .131, -3.021, 1.31);
const door = shapeParts([[.59, 1.47, .032, 0, .81, 7.999, .015]]);
const seatShadows = shapeParts(seats.map(({ x, z, cabin }) => [cabin === 'Business' ? .88 : .49, .006, .65, x, .014, z, .003]));

const crown = new Shape();
crown.moveTo(-3.17, 1.82);
crown.bezierCurveTo(-3.08, 2.8, -2.25, 3.58, 0, 3.63);
crown.bezierCurveTo(2.25, 3.58, 3.08, 2.8, 3.17, 1.82);
crown.lineTo(3.04, 1.82);
crown.bezierCurveTo(2.96, 2.68, 2.12, 3.47, 0, 3.49);
crown.bezierCurveTo(-2.12, 3.47, -2.96, 2.68, -3.04, 1.82);
crown.closePath();
const innerWall = shapeParts([[.14, 1.76, 16.6, 3.12, .95, -.15, .05], [5.4, 2.85, .13, 0, 1.46, -8.45, .055], [5.1, 1.57, .12, 0, 2.4, 8.08, .045]]);
const bins = shapeParts([-1, 1].flatMap((side) => Array.from({ length: 11 }, (_, index): Part => [1.04, .49, 1.41, side * 2.28, 2.61, -7.54 + index * 1.50, .21])));
const cabinLight = shapeParts([-1, 1].map((side) => [.045, .055, 16.55, side * 1.68, 2.84, -.14, .02]));
const nearFrames = windowLayer(.59, .76, .21, 3.038, 1.31);
const nearReveal = windowLayer(.487, .652, .18, 3.029, 1.31);
const nearGlass = windowLayer(.391, .54, .149, 3.019, 1.31);

function WindowSky({ geometry }: { geometry: BufferGeometry }) {
  const sky = useTexture('/images/cloudscape.webp');
  return <mesh geometry={geometry}><meshBasicMaterial map={sky} color="#fff3db" toneMapped={false} /></mesh>;
}

export function CabinEnclosure() {
  return <>
    <mesh position={[0, 0, -8.47]}><extrudeGeometry args={[crown, { depth: 16.57, bevelEnabled: false, curveSegments: 14 }]} /><meshStandardMaterial side={DoubleSide} color="#d6c7ac" roughness={.65} /></mesh>
    <pointLight position={[0, 2.95, -4.5]} color="#ffc589" intensity={1.08} distance={6.2} />
    <pointLight position={[0, 2.95, 3.1]} color="#ffd1a0" intensity={1.02} distance={6.2} />
    <Surface geometry={innerWall} color="#e4d7c2" />
    <Surface geometry={bins} color="#d9cdb9" />
    <Surface geometry={cabinLight} color="#fff0d3" emissive="#ffd6a3" />
    <Surface geometry={nearFrames} color="#e6ddcc" />
    <Surface geometry={nearReveal} color="#9f8b71" />
    <Suspense fallback={<Surface geometry={nearGlass} color="#b9d5ea" />}><WindowSky geometry={nearGlass} /></Suspense>
  </>;
}

function Surface({ geometry, color, emissive }: { geometry: BufferGeometry; color: string; emissive?: string }) {
  return <mesh geometry={geometry}><meshStandardMaterial color={color} roughness={.78} emissive={emissive} emissiveIntensity={emissive ? .38 : 0} /></mesh>;
}

export function CabinModel({ visible }: { visible: boolean }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const selectedId = useBooking((state) => state.selectedId);
  const occupied = useBooking((state) => state.occupiedIds);
  const badgeSeat = seatById.get(hoveredId ?? selectedId ?? '');
  const badgeOccupied = badgeSeat && occupied.includes(badgeSeat.id);

  return <>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.16, 0]}><extrudeGeometry args={[floorShape, { depth: .16, bevelEnabled: true, bevelSegments: 2, bevelSize: .07, bevelThickness: .055, curveSegments: 8 }]} /><meshStandardMaterial color="#675747" roughness={.88} /></mesh>
    <Surface geometry={carpets} color="#786855" />
    <Surface geometry={rails} color="#9fadb2" />
    <Surface geometry={seatShadows} color="#4b5152" />
    <Surface geometry={panels} color="#e5ddd0" />
    <Surface geometry={trim} color="#ffe5c1" emissive="#ffd4a0" />
    <Surface geometry={windowFrames} color="#ece8df" />
    <Surface geometry={windowGaskets} color="#9aafb8" />
    <Suspense fallback={<Surface geometry={windowGlass} color="#b7daee" />}><WindowSky geometry={windowGlass} /></Suspense>
    <Surface geometry={door} color="#a9b5b8" />
    <SeatInstances group={economySeats} parts={economyParts} onHover={setHoveredId} enabled={visible} />
    <SeatInstances group={businessSeats} parts={businessParts} onHover={setHoveredId} enabled={visible} />
    {visible && badgeSeat && <Html position={[badgeSeat.x, 1.52, badgeSeat.z]} center zIndexRange={[4, 3]} style={{ pointerEvents: 'none' }}>
      <div className={`seat-float ${selectedId === badgeSeat.id ? 'active' : ''}`} data-seat-preview={badgeSeat.id}><strong>{badgeSeat.id}</strong><span>{badgeOccupied ? 'Occupied' : currency(badgeSeat.price)}</span></div>
    </Html>}
  </>;
}
