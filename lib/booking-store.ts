import { create } from 'zustand';
import { seats, type Reservation } from './flight';

export type View = 'aircraft' | 'cabin' | 'map';

type BookingState = {
  view: View;
  selectedId: string | null;
  occupiedIds: string[];
  receipt: Reservation | null;
  setView: (view: View) => void;
  select: (id: string | null) => void;
  setOccupied: (ids: string[]) => void;
  setReceipt: (receipt: Reservation) => void;
};

export const useBooking = create<BookingState>((set, get) => ({
  view: 'aircraft',
  selectedId: null,
  occupiedIds: seats.filter((seat) => seat.occupied).map((seat) => seat.id),
  receipt: null,
  setView: (view) => set({ view }),
  select: (id) => {
    if (id === null || !get().occupiedIds.includes(id)) set({ selectedId: id });
  },
  setOccupied: (occupiedIds) => set((state) => ({
    occupiedIds,
    selectedId: state.selectedId && !occupiedIds.includes(state.selectedId) ? state.selectedId : null,
  })),
  setReceipt: (receipt) => set({ receipt }),
}));
