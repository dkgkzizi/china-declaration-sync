import { NextRequest, NextResponse } from 'next/server';
import { matchProducts } from '@/lib/matcher';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { items, fileName } = body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, message: '유효한 데이터가 없습니다.' }, { status: 400 });
    }

    // 1. 매칭 엔진 실행
    const matchedItems = await matchProducts(items);

    return NextResponse.json({ 
      success: true, 
      items: matchedItems,
      fileName: fileName || 'unknown_file'
    });

  } catch (err: any) {
    console.error('API_ROUTE_ERROR:', err);
    // 에러 발생 시에도 200으로 응답하되 success: false를 주어 프론트에서 핸들링하게 함
    return NextResponse.json({ 
      success: false, 
      message: `서버 오류: ${err.message}`,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    }, { status: 200 });
  }
}
