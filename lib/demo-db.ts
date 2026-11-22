import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { flight, seatById, seats, type Reservation } from './flight';

type Entry = Reservation & { requestId: string };
const directory = resolve(/* turbopackIgnore: true */ process.env.AERIFORM_DATA_DIR ?? '.demo-data');
const filename = join(directory, 'bookings.json');
const initialOccupied = seats.filter((seat) => seat.occupied).map((seat) => seat.id);
const shared = globalThis as typeof globalThis & { aeriformWrites?: Promise<unknown> };

async function readBookings(): Promise<Entry[]> {
  try {
    return JSON.parse(await readFile(filename, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

function publicReceipt({ reference, seatId, total, createdAt }: Entry): Reservation {
  return { reference, seatId, total, createdAt };
}

export async function availability(reference: string | null) {
  const entries = await readBookings();
  const receipt = reference ? entries.find((entry) => entry.reference === reference) : undefined;
  return { occupiedIds: [...initialOccupied, ...entries.map((entry) => entry.seatId)], receipt: receipt ? publicReceipt(receipt) : null };
}

export function reserve(seatId: string, requestId: string) {
  const write = (shared.aeriformWrites ?? Promise.resolve()).then(async () => {
    const seat = seatById.get(seatId);
    if (!seat) return { status: 400, error: 'Choose a valid seat.' } as const;

    const entries = await readBookings();
    const existing = entries.find((entry) => entry.requestId === requestId);
    if (existing?.seatId === seatId) return { status: 200, receipt: publicReceipt(existing) } as const;
    if (existing) return { status: 409, error: 'This checkout belongs to another seat.' } as const;
    if (seat.occupied || entries.some((entry) => entry.seatId === seatId)) {
      return { status: 409, error: 'That seat has been booked. Choose another seat.' } as const;
    }

    const entry = { requestId, seatId, reference: `AF-${randomBytes(6).toString('hex').toUpperCase()}`, total: flight.fare + seat.price, createdAt: new Date().toISOString() };
    await mkdir(directory, { recursive: true });
    const temporary = join(directory, `${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify([...entries, entry], null, 2));
      await rename(temporary, filename);
    } finally {
      await rm(temporary, { force: true });
    }
    return { status: 201, receipt: publicReceipt(entry) } as const;
  });

  shared.aeriformWrites = write.catch(() => undefined);
  return write;
}
