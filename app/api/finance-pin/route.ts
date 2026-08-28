import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const { pin } = await req.json();
  const valid = pin === process.env.FINANCE_PIN;
  return NextResponse.json({ ok: valid });
}
