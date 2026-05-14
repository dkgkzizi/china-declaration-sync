import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    if (!query || query.length < 2) return NextResponse.json({ success: true, items: [] });

    try {
        const { data, error } = await supabase
            .from('mapping_data')
            .select('상품코드, 상품명, 옵션')
            .or(`상품명.ilike.%${query}%,상품코드.ilike.%${query}%,옵션.ilike.%${query}%`)
            .limit(50);

        if (error) throw error;

        // mapping_data에서 못 찾으면 products도 검색
        let items = data || [];
        if (items.length < 5) {
            const { data: productData } = await supabase
                .from('products')
                .select('상품코드, 상품명, 옵션')
                .or(`상품명.ilike.%${query}%,상품코드.ilike.%${query}%`)
                .limit(30);
            items = [...items, ...(productData || [])];
        }

        return NextResponse.json({
            success: true,
            items: items.map(r => ({
                productCode: r['상품코드'],
                matchedName: r['상품명'],
                option: r['옵션'] || ''
            }))
        });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message });
    }
}
