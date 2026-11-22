import { NextResponse } from 'next/server';
import { availability, reserve } from '@/lib/demo-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const reference = new URL(request.url).searchParams.get('reference');
    return NextResponse.json(await availability(reference), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Demo availability is temporarily unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (typeof body?.seatId !== 'string' || typeof body.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(body.requestId)) {
    return NextResponse.json({ error: 'Invalid checkout request.' }, { status: 400 });
  }
  try {
    const { status, ...result } = await reserve(body.seatId, body.requestId);
    return NextResponse.json(result, { status });
  } catch {
    return NextResponse.json({ error: 'The demo booking could not be saved. Try again.' }, { status: 503 });
  }
}
