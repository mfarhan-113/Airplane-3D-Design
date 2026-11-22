export const flight = {
  number: 'AF 028',
  from: { code: 'LHR', city: 'London' },
  to: { code: 'NRT', city: 'Tokyo' },
  aircraft: 'Wide-body twinjet',
  duration: '13h 45m',
  fare: 685,
};

export type SeatClass = 'Business' | 'Economy';
export type Seat = {
  id: string;
  row: number;
  letter: string;
  column: number;
  x: number;
  z: number;
  cabin: SeatClass;
  position: 'Window' | 'Aisle' | 'Middle';
  price: number;
  occupied: boolean;
};
export type Reservation = { reference: string; seatId: string; total: number; createdAt: string };

export const cabins = {
  Business: { name: 'Business', pitch: '78″', amenities: ['Lie-flat seat', 'AC and USB power', 'Priority boarding'] },
  Economy: { name: 'Economy', pitch: '32″', amenities: ['Reclining seat', 'USB power', 'Seatback entertainment'] },
};

const businessColumns = [[0, -2.36, 'A'], [3, -.72, 'D'], [5, .72, 'F'], [8, 2.36, 'K']] as const;
const economyColumns = [-2.5, -1.92, -1.34, -.58, 0, .58, 1.34, 1.92, 2.5].map(
  (x, index) => [index, x, 'ABCDEFGHK'[index]] as const,
);
const initiallyOccupied = new Set(['1K', '2D', '10A', '10G', '11C', '11H', '12B', '12D', '12K', '13E', '14A', '14F', '15D', '15E', '16G', '17B', '17K', '18A', '18H', '19F']);

export const rows = [1, 2, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
export const seats: Seat[] = rows.flatMap((row) => {
  const business = row < 10;
  return (business ? businessColumns : economyColumns).map(([column, x, letter]) => {
    const position = column === 0 || column === 8 ? 'Window' : [2, 3, 5, 6].includes(column) ? 'Aisle' : 'Middle';
    const id = `${row}${letter}`;
    return {
      id, row, letter, column, x, z: business ? -7.4 + (row - 1) * 1.75 : -3.7 + (row - 10) * 1.14,
      cabin: business ? 'Business' : 'Economy', position,
      price: business ? (position === 'Window' ? 295 : 275) : (row === 10 ? 52 : position === 'Middle' ? 24 : 36),
      occupied: initiallyOccupied.has(id),
    };
  });
});

export const seatById = new Map(seats.map((seat) => [seat.id, seat]));
export const currency = (number: number) => `$${number.toLocaleString('en-US')}`;
