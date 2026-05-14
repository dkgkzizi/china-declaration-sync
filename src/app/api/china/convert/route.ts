import { NextRequest, NextResponse } from 'next/server';
import { matchProducts } from '@/lib/matcher';

export async function POST(req: NextRequest) {
  try {
    const { items, fileName } = await req.json();
    
    if (!items || items.length === 0) {
      return NextResponse.json({ success: false, message: '데이터가 없습니다.' }, { status: 400 });
    }

    // 1. 매칭 엔진 실행
    const matchedItems = await matchProducts(items);

    return NextResponse.json({ 
      success: true, 
      items: matchedItems,
      fileName: fileName
    });

  } catch (err: any) {
    console.error('CONVERT_ERROR:', err);
    return NextResponse.json({ success: false, message: err.message || '처리 중 오류 발생' }, { status: 500 });
  }
}
