import { NextRequest, NextResponse } from 'next/server';
import { matchItems } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { items, fileName } = await req.json();
    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, message: '데이터 없음' });
    }

    const matched = await matchItems(items);
    const originalTotal = items.reduce((acc: number, i: any) => acc + (i.qty || 0), 0);
    const matchedTotal = matched.filter((i: any) => i.isMatched).reduce((acc: number, i: any) => acc + (i.qty || 0), 0);

    return NextResponse.json({ success: true, items: matched, originalTotal, matchedTotal, fileName });
  } catch (err: any) {
    console.error('CONVERT_ERROR:', err);
    return NextResponse.json({ success: false, message: err.message || '처리 오류' });
  }
}
