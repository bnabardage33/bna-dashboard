import { NextRequest, NextResponse } from 'next/server';
import { verifierSession } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  const { pin } = await req.json();
  const valid = pin === process.env.FINANCE_PIN;
  return NextResponse.json({ ok: valid });
}
