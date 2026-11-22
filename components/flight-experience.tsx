'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Armchair, Box, Check, ChevronRight, CircleHelp, Clock3, Grid2X2, LoaderCircle, Maximize,
  Minus, Mouse, Plane, Plus, RotateCcw, Ticket, UsersRound, X, Zap,
} from 'lucide-react';
import { Checkout, Receipt } from './checkout';
import { SeatMap } from './seat-map';
import { useBooking, type View } from '@/lib/booking-store';
import { cabins, currency, flight, seatById, seats, type Reservation, type SeatClass } from '@/lib/flight';

export type CameraAction = { type: 'in' | 'out' | 'reset' | 'business' | 'economy' | 'seat'; serial: number };

const Scene = dynamic(() => import('./flight-scene'), { ssr: false });
const bookingReferenceKey = 'aeriform-reference';

function Brand() {
  return <><span className="brand-mark"><Plane size={21} fill="currentColor" strokeWidth={1.4} aria-hidden /></span><span>aeriform<span className="brand-period">.</span></span></>;
}

export function FlightExperience() {
  const { view, selectedId, occupiedIds, receipt, setView, select, setOccupied, setReceipt } = useBooking();
  const selected = selectedId ? seatById.get(selectedId) : undefined;
  const [modal, setModal] = useState<'checkout' | 'receipt' | null>(null);
  const [availability, setAvailability] = useState<'loading' | 'ready' | 'error'>('loading');
  const [scene, setScene] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sceneVersion, setSceneVersion] = useState(0);
  const [filter, setFilter] = useState<SeatClass | 'All'>('All');
  const [cameraAction, setCameraAction] = useState<CameraAction>({ type: 'reset', serial: 0 });
  const [canFullscreen, setCanFullscreen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const viewer = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const bookingButton = useRef<HTMLButtonElement>(null);
  const help = useRef<HTMLDetailsElement>(null);

  const loadAvailability = useCallback(async (signal?: AbortSignal) => {
    setAvailability('loading');
    try {
      let reference: string | null = null;
      try { reference = localStorage.getItem(bookingReferenceKey); } catch { /* Storage can be disabled. */ }
      const response = await fetch(`/api/demo${reference ? `?reference=${encodeURIComponent(reference)}` : ''}`, { cache: 'no-store', signal });
      if (!response.ok) throw new Error('Availability unavailable');
      const data = await response.json();
      setOccupied(data.occupiedIds);
      if (data.receipt) setReceipt(data.receipt);
      setAvailability('ready');
    } catch {
      if (!signal?.aborted) setAvailability('error');
    }
  }, [setOccupied, setReceipt]);

  useEffect(() => {
    const abort = new AbortController();
    void loadAvailability(abort.signal);
    return () => abort.abort();
  }, [loadAvailability]);

  useEffect(() => {
    setCanFullscreen(Boolean(document.fullscreenEnabled));
    const onChange = () => setExpanded(document.fullscreenElement === viewer.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const ready = useCallback(() => setScene('ready'), []);
  const sceneFailed = useCallback(() => setScene('error'), []);

  function move(next: View, focus = false) {
    setView(next);
    if (next === 'aircraft') setFilter('All');
    if (focus) requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  }

  function enterCabin() {
    move(scene === 'error' ? 'map' : 'cabin', true);
    if (window.matchMedia('(max-width: 760px)').matches) viewer.current?.scrollIntoView({ block: 'start' });
  }

  function camera(type: CameraAction['type']) {
    setCameraAction((current) => ({ type, serial: current.serial + 1 }));
  }

  function showClass(next: SeatClass | 'All') {
    setFilter(next);
    if (view === 'cabin') camera(next === 'Business' ? 'business' : next === 'Economy' ? 'economy' : 'reset');
  }

  function retryScene() {
    setScene('loading');
    setSceneVersion((value) => value + 1);
  }

  async function fullscreen() {
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
    else if (viewer.current?.requestFullscreen) await viewer.current.requestFullscreen().catch(() => undefined);
  }

  function complete(newReceipt: Reservation) {
    try { localStorage.setItem(bookingReferenceKey, newReceipt.reference); } catch { /* The in-memory receipt remains available. */ }
    setReceipt(newReceipt);
    setOccupied([...new Set([...useBooking.getState().occupiedIds, newReceipt.seatId])]);
    setModal('receipt');
  }

  function closeModal() {
    setModal(null);
    requestAnimationFrame(() => (modal === 'checkout' ? bookingButton.current : heading.current)?.focus({ preventScroll: true }));
  }

  const inCabin = view !== 'aircraft';
  const map = view === 'map';

  return (
    <div className={`site-shell cinematic-shell ${map ? 'mode-map' : inCabin ? 'mode-cabin' : 'mode-flight'}`}>
      <header className="masthead">
        <div className="masthead-inner">
          <button className="brand" onClick={() => move('aircraft')} aria-label="Aeriform home"><Brand /></button>
          <nav aria-label="Booking steps" className="steps">
            <button onClick={() => move('aircraft')} aria-current={!inCabin ? 'step' : undefined}><span>{inCabin ? <Check size={13} /> : '1'}</span>Aircraft</button>
            <span className="step-rule" aria-hidden />
            <button onClick={enterCabin} aria-current={inCabin && !modal ? 'step' : undefined}><span>2</span>Seat selection</button>
            <span className="step-rule" aria-hidden />
            <button onClick={() => setModal(selected && availability === 'ready' ? 'checkout' : 'receipt')} disabled={!receipt && (!selected || availability !== 'ready')} aria-current={modal ? 'step' : undefined}><span>3</span>Checkout</button>
          </nav>
          <div className="masthead-tools">
            {receipt && <button className="icon-button receipt-button" aria-label="View demo receipt" title="View demo receipt" onClick={() => setModal('receipt')}><Ticket size={17} /></button>}
            <span className="demo-badge"><i /> <span>Demo experience</span></span>
          </div>
        </div>
      </header>

      <main className="main-content">
        <section className="intro" aria-labelledby="title">
          <div>
            <p className="eyebrow"><span /> {inCabin ? 'AERIFORM CABIN' : 'THE AERIFORM EXPERIENCE'}</p>
            <h1 id="title" ref={heading} tabIndex={-1}>{inCabin ? <>Find your <em>seat.</em></> : <>A place in <em>the sky.</em></>}</h1>
            {!inCabin && <p className="intro-copy">London to Tokyo, from a new perspective.</p>}
          </div>
          <div className="itinerary" aria-label={`Flight ${flight.number}, ${flight.from.city} to ${flight.to.city}`}>
            <p className="eyebrow route-label">YOUR FLIGHT <span>{flight.number}</span></p>
            <div className="route-cities">
              <div><strong>{flight.from.code}</strong><small>{flight.from.city}</small></div>
              <div className="route-line" aria-hidden><Plane size={16} /></div>
              <div><strong>{flight.to.code}</strong><small>{flight.to.city}</small></div>
            </div>
          </div>
        </section>

        <div className="experience-grid">
          <section ref={viewer} className={`viewer-card ${expanded ? 'expanded' : ''}`} aria-label={map ? '2D seat map' : inCabin ? 'Interactive cabin viewer' : 'Interactive aircraft viewer'}>
            <div className={`viewport ${map ? 'map-viewport' : 'sky-viewport'}`}>
              <div className={`scene-layer ${map ? 'scene-hidden' : ''}`} aria-hidden>
                <Scene key={sceneVersion} action={cameraAction} onReady={ready} onError={sceneFailed} />
              </div>
              {map && <SeatMap cabinFilter={filter} />}
              {!map && scene === 'loading' && <div className="viewer-status" role="status"><LoaderCircle size={18} className="spinner" /> Loading 3D scene</div>}
              {!map && scene === 'error' && <div className="viewer-status viewer-error" role="status"><strong>3D viewer unavailable</strong><button className="text-button" onClick={retryScene}>Retry 3D</button><button className="text-button" onClick={() => move('map')}>Open seat map</button></div>}
              <div className="viewport-top">
                <div className="view-tag"><i /> {map ? '2D SEAT MAP' : inCabin ? 'CABIN VIEW' : 'EXTERIOR VIEW'}</div>
                <div className="view-switch" role="group" aria-label="View options">
                  <button aria-pressed={!map} onClick={() => move(inCabin ? 'cabin' : 'aircraft')}><Box size={15} aria-hidden /> 3D View</button>
                  <button aria-pressed={map} onClick={() => move('map')}><Grid2X2 size={14} aria-hidden /> Seat map</button>
                </div>
              </div>
              {!map && scene !== 'error' && <>
                <div className="viewport-caption"><Mouse size={15} aria-hidden /><span>Drag to rotate</span><i /><span>Scroll to zoom</span></div>
                <div className="viewport-controls" role="group" aria-label="Camera controls">
                  <button aria-label="Zoom in" title="Zoom in" onClick={() => camera('in')}><Plus size={19} /></button>
                  <button aria-label="Zoom out" title="Zoom out" onClick={() => camera('out')}><Minus size={19} /></button>
                  <button aria-label="Reset camera" title="Reset camera" onClick={() => camera('reset')}><RotateCcw size={16} /></button>
                  {canFullscreen && <button className="fullscreen-button" aria-label={expanded ? 'Exit fullscreen' : 'Fullscreen'} title={expanded ? 'Exit fullscreen' : 'Fullscreen'} onClick={fullscreen}>{expanded ? <X size={16} /> : <Maximize size={16} />}</button>}
                </div>
              </>}
              {map && expanded && <button className="icon-button map-fullscreen" aria-label="Exit fullscreen" onClick={fullscreen}><X size={18} /></button>}
            </div>
            {inCabin ? (
              <div className="viewer-footer seat-key" aria-label="Seat status legend">
                <span><i className="key-economy" /> Economy</span><span><i className="key-business" /> Business</span><span><i className="key-taken"><X size={10} /></i> Occupied</span><span><i className="key-picked" /> Selected</span>
              </div>
            ) : (
              <div className="viewer-footer aircraft-meta">
                <span><Plane size={17} aria-hidden /> <span><strong>{flight.aircraft}</strong><small>Aircraft</small></span></span>
                <span><Clock3 size={17} aria-hidden /> <span><strong>{flight.duration}</strong><small>Flight time</small></span></span>
                <span><UsersRound size={17} aria-hidden /> <span><strong>1 passenger</strong><small>One way</small></span></span>
              </div>
            )}
          </section>

          <aside className="side-card" aria-label={inCabin ? 'Seat details' : 'Flight overview'}>
            {!inCabin ? <>
              <div className="flight-fare"><span>London to Tokyo<small>One way · USD per passenger</small></span><strong>{currency(flight.fare)}</strong></div>
              <button className="primary-button" onClick={enterCabin}><Armchair size={19} strokeWidth={1.8} aria-hidden /> Explore the cabin <ChevronRight className="end-icon" size={19} aria-hidden /></button>
              <button className="side-link" onClick={() => move('map', true)}>Open the 2D seat map</button>
            </> : <>
              <div className="cabin-panel-heading"><p className="eyebrow side-kicker">SEAT SELECTION</p>{selected && <button className="icon-button" aria-label="Clear selected seat" title="Clear selected seat" onClick={() => select(null)}><X size={17} /></button>}</div>
              <div className="seat-title" aria-live="polite">
                <h2>{selected ? `Seat ${selected.id}` : 'Choose a seat.'}</h2>
                {selected ? <p className="side-copy">{selected.cabin} · {selected.position} seat</p> : <p className="side-copy">Select an available seat to see its price and amenities.</p>}
              </div>
              {selected ? (
                <><ul className="amenities" aria-label="Seat amenities">
                  <li><Armchair size={16} aria-hidden /> {cabins[selected.cabin].pitch} seat pitch</li>
                  {cabins[selected.cabin].amenities.map((item) => <li key={item}>{item.includes('power') ? <Zap size={16} aria-hidden /> : <Check size={16} aria-hidden />}{item}</li>)}
                </ul>
                {view === 'cabin' && scene === 'ready' && <div className="cabin-filters seat-angles" role="group" aria-label="Seat camera angles"><button onClick={() => camera('seat')}>Seat view</button><button onClick={() => camera('reset')}>Overhead</button></div>}</>
              ) : (
                <div className="cabin-filters" role="group" aria-label="Jump to cabin">
                  {(['All', 'Business', 'Economy'] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => showClass(value)}>{value === 'All' ? 'All seats' : value}</button>)}
                </div>
              )}
              <div className="flight-fare"><span>{selected ? 'Seat selection' : 'Available seats'}<small>{selected ? `Trip total ${currency(flight.fare + selected.price)} USD` : 'Across both cabins'}</small></span><strong>{selected ? currency(selected.price) : availability === 'ready' ? seats.length - occupiedIds.length : '—'}</strong></div>
              {availability === 'error' && <div className="inventory-error" role="alert">Availability is temporarily unavailable. <button className="text-button" onClick={() => loadAvailability()}>Try again</button></div>}
              {availability === 'loading' && <p className="inventory-error" role="status">Updating availability…</p>}
              <button ref={bookingButton} className="primary-button" disabled={!selected || availability !== 'ready'} onClick={() => setModal('checkout')}><Ticket size={18} aria-hidden /> Continue to checkout <ChevronRight className="end-icon" size={19} aria-hidden /></button>
              <button className="side-link" onClick={() => move('aircraft', true)}>Back to aircraft</button>
              <p className="model-note">Procedural demo cabin</p>
            </>}
          </aside>
        </div>

        <footer className="footer">
          <p><span className="footer-dot" /> Simulated flight, seat availability, and payment.</p>
          <div><a href="https://www.innerscene.com/tools/library/3d-parts/wide-body-airliner-0560b943" target="_blank" rel="noreferrer">Aircraft by Innerscene</a><details ref={help} className="help"><summary><CircleHelp size={14} aria-hidden /> Viewer help</summary><div><p>Drag or use two fingers to inspect the model. Use the view controls to zoom or reset.</p><p>In the seat map, use Tab or arrow keys to move and Enter to select.</p><button className="text-button" onClick={() => { if (help.current) { help.current.open = false; help.current.querySelector('summary')?.focus(); } }}>Close help</button></div></details></div>
        </footer>
      </main>
      {modal === 'checkout' && selected && <Checkout seat={selected} onClose={closeModal} onBook={complete} onConflict={() => { setModal(null); select(null); void loadAvailability(); heading.current?.focus(); }} />}
      {modal === 'receipt' && receipt && <Receipt receipt={receipt} onClose={closeModal} />}
    </div>
  );
}
