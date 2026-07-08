import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    if (!query || query.length < 2) return NextResponse.json({ success: true, items: [] });

    try {
        const cleanQ = query.replace(/[^a-zA-Z0-9가-힣\u4E00-\u9FFF]/g, '%');
        const orQuery = `상품명.ilike.%${cleanQ}%,상품코드.ilike.%${cleanQ}%`;

        // mapping_data might not exist, ignore error silently
        const { data } = await supabase
            .from('mapping_data')
            .select('상품코드, 상품명, 옵션')
            .or(orQuery)
            .limit(50);

        let items = data || [];
        if (items.length < 5) {
            const { data: productData } = await supabase
                .from('products')
                .select('*')
                .or(orQuery)
                .limit(30);
            
            if (productData) {
                const enhancedProducts = productData.map(r => {
                    const category = r['카테고리'] || r['분류'] || r['대분류'] || r['category'] || r['Category'] || r['상품분류'] || r['상품분류명'] || r['카테고리명'] || r['상품군'] || r['중분류'];
                    let finalName = r['상품명'];
                    if (category && !finalName.includes(category)) {
                        finalName = `${category}-${finalName}`;
                    }
                    return { ...r, 상품명: finalName };
                });
                items = [...items, ...enhancedProducts];
            }
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
