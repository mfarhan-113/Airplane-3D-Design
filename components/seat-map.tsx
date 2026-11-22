'use client';

import { useRef, type KeyboardEvent } from 'react';
import { ArrowUp, DoorOpen, X } from 'lucide-react';
import { useBooking } from '@/lib/booking-store';
import { currency, rows, seats, type SeatClass } from '@/lib/flight';

const rowSeats = new Map(rows.map((row) => [row, seats.filter((seat) => seat.row === row)]));

export function SeatMap({ cabinFilter }: { cabinFilter: SeatClass | 'All' }) {
  const selected = useBooking((state) => state.selectedId);
  const occupied = useBooking((state) => state.occupiedIds);
  const select = useBooking((state) => state.select);
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const visibleRows = rows.filter((row) => cabinFilter === 'All' || (row < 10 ? 'Business' : 'Economy') === cabinFilter);

  function move(event: KeyboardEvent, id: string) {
    const seat = seats.find((item) => item.id === id)!;
    const rowIndex = visibleRows.indexOf(seat.row);
    const direction = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (direction) {
      const next = rowSeats.get(visibleRows[rowIndex + direction]);
      const closest = next?.reduce((a, b) => Math.abs(a.column - seat.column) <= Math.abs(b.column - seat.column) ? a : b);
      event.preventDefault();
      if (closest) refs.current.get(closest.id)?.focus();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const current = rowSeats.get(seat.row)!;
      event.preventDefault();
      const target = current[current.indexOf(seat) + (event.key === 'ArrowLeft' ? -1 : 1)];
      if (target) refs.current.get(target.id)?.focus();
    }
  }

  return (
    <div className="map-scroll" tabIndex={0} aria-label="Scrollable seat map">
      <div className="map-shell">
        <p className="map-nose"><ArrowUp size={14} aria-hidden /> Front of aircraft</p>
        {visibleRows.map((row) => (
          <div key={row}>
            {(row === 1 || row === 10) && (
              <div className="map-section"><DoorOpen size={14} aria-hidden /> {row === 1 ? 'Business cabin' : 'Economy cabin'}</div>
            )}
            <div className="map-row" role="group" aria-label={`Row ${row}`}>
              <span className="row-number" aria-hidden>{row.toString().padStart(2, '0')}</span>
              {rowSeats.get(row)!.map((seat) => {
                const unavailable = occupied.includes(seat.id);
                const active = selected === seat.id;
                return (
                  <button
                    key={seat.id}
                    ref={(node) => { if (node) refs.current.set(seat.id, node); else refs.current.delete(seat.id); }}
                    className={`map-seat ${seat.cabin.toLowerCase()} ${unavailable ? 'taken' : ''} ${active ? 'picked' : ''}`}
                    style={{ gridColumn: seat.column + 2 + (seat.column >= 3 ? 1 : 0) + (seat.column >= 6 ? 1 : 0) }}
                    aria-label={`${seat.id}, ${seat.cabin}, ${seat.position}, ${unavailable ? 'occupied' : currency(seat.price)}`}
                    aria-disabled={unavailable}
                    aria-pressed={active}
                    data-seat={seat.id}
                    onKeyDown={(event) => move(event, seat.id)}
                    onClick={() => select(seat.id)}
                  >{unavailable ? <X size={12} aria-hidden /> : seat.letter}</button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
