'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, CreditCard, LoaderCircle, Plane, TicketCheck, X } from 'lucide-react';
import { currency, flight, seatById, type Reservation, type Seat } from '@/lib/flight';

function Dialog({ children, title, onClose, busy = false }: { children: ReactNode; title: string; onClose: () => void; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const bodyOverflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close();
      document.body.style.overflow = bodyOverflow;
    };
  }, []);

  return (
    <dialog ref={dialog} className="dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <button type="button" className="icon-button dialog-close" aria-label="Close dialog" onClick={onClose} disabled={busy}><X size={20} /></button>
      {children}
    </dialog>
  );
}

function TripTicket({ seatId, cabin }: { seatId: string; cabin?: string }) {
  return <div className="trip-ticket">
    <div className="ticket-strip"><span><Plane size={15} aria-hidden /> Aeriform</span><span>{flight.number} · Simulated flight</span></div>
    <div className="checkout-route"><span>{flight.from.code} <span aria-hidden>→</span> {flight.to.code}<small>{flight.from.city} to {flight.to.city}</small></span><span>{seatId}<small>{cabin}</small></span></div>
  </div>;
}

export function Checkout({ seat, onClose, onBook, onConflict }: { seat: Seat; onClose: () => void; onBook: (receipt: Reservation) => void; onConflict: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const requestId = useRef<string | undefined>(undefined);

  async function book() {
    setBusy(true);
    setError('');
    try {
      requestId.current ??= crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(18)), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const response = await fetch('/api/demo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seatId: seat.id, requestId: requestId.current }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(result.error);
      }
      onBook(result.receipt);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The booking could not be saved. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Demo checkout" onClose={conflict ? onConflict : onClose} busy={busy}>
      <span className="dialog-icon"><CreditCard size={24} aria-hidden /></span>
      <h2>Review your trip</h2>
      <p className="dialog-description">Confirm your seat with a simulated payment.</p>
      <TripTicket seatId={seat.id} cabin={seat.cabin} />
      <dl className="checkout-cost"><div><dt>Flight fare</dt><dd>{currency(flight.fare)}</dd></div><div><dt>Seat selection</dt><dd>{currency(seat.price)}</dd></div><div><dt>Total <small>USD</small></dt><dd>{currency(flight.fare + seat.price)}</dd></div></dl>
      {error && <p role="alert" className="error-text">{error}</p>}
      <button className="primary-button w-full" disabled={busy} onClick={conflict ? onConflict : book}>
        {busy && <LoaderCircle className="spinner" size={17} aria-hidden />}{conflict ? 'Choose another seat' : busy ? 'Confirming…' : 'Confirm demo booking'}
      </button>
      <p className="dialog-note"><Check size={14} aria-hidden /> Demo payment · No charge</p>
    </Dialog>
  );
}

export function Receipt({ receipt, onClose }: { receipt: Reservation; onClose: () => void }) {
  return (
    <Dialog title="Booking confirmation" onClose={onClose}>
      <span className="dialog-icon"><TicketCheck size={25} aria-hidden /></span>
      <h2>You’re on board.</h2>
      <p className="dialog-description">Your demo booking is confirmed.</p>
      <TripTicket seatId={receipt.seatId} cabin={seatById.get(receipt.seatId)?.cabin} />
      <dl className="checkout-cost"><div><dt>Booking reference</dt><dd>{receipt.reference}</dd></div><div><dt>Simulated total</dt><dd>{currency(receipt.total)}</dd></div></dl>
      <button className="primary-button w-full" onClick={onClose}>Back to experience</button>
      <p className="dialog-note">Demo receipt · No travel or payment</p>
    </Dialog>
  );
}
