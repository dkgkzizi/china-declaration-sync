import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q') || '';
    if (!query || query.length < 2) return NextResponse.json({ success: true, items: [] });

    let client;
    try {
        const cleanQ = query.replace(/[^a-zA-Z0-9가-힣\u4E00-\u9FFF]/g, '%');
        const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.qsqtoufuwplgmzyvzwvd:openhan1234db@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';
        
        client = new Client({ connectionString });
        await client.connect();

        let items: any[] = [];
        
        try {
            const { rows } = await client.query(`
                SELECT "상품코드", "상품명", "옵션" 
                FROM mapping_data 
                WHERE "상품명" ILIKE $1 OR "상품코드" ILIKE $1 
                LIMIT 50
            `, [`%${cleanQ}%`]);
            items = rows;
        } catch (e) {
            // mapping_data might not exist silently ignore
        }

        if (items.length < 5) {
            const { rows: productData } = await client.query(`
                SELECT * 
                FROM products 
                WHERE "상품명" ILIKE $1 OR "상품코드" ILIKE $1 
                LIMIT 30
            `, [`%${cleanQ}%`]);
            
            if (productData) {
                const enhancedProducts = productData.map(r => {
                    const rawCat = r['카테고리'] || r['분류'] || r['대분류'] || r['category'] || r['Category'] || r['상품분류'] || r['상품분류명'] || r['카테고리명'] || r['상품군'] || r['중분류'];
                    let finalName = r['상품명'];
                    
                    if (rawCat) {
                        const parts = rawCat.split('>');
                        let cleanCat = parts[parts.length - 1].trim();
                        cleanCat = cleanCat.replace(/\(.*?\)/g, '').trim();
                        
                        const hasCategoryPrefix = /^[가-힣a-zA-Z0-9]+-/.test(finalName) || /^\([가-힣a-zA-Z0-9]+\)[가-힣a-zA-Z0-9]+-/.test(finalName);
                        if (cleanCat && !hasCategoryPrefix && !finalName.includes(cleanCat)) {
                            finalName = `${cleanCat}-${finalName}`;
                        }
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
        console.error("Search Error:", err);
        return NextResponse.json({ success: false, error: err.message });
    } finally {
        if (client) await client.end();
    }
}
