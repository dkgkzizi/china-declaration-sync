import { supabase } from './supabase';

function normalizeStr(s: any) {
    if (!s) return "";
    return s.toString().replace(/[^0-9A-Z가-힣]/gi, '').toUpperCase();
}

export async function matchProducts(rawItems: any[]) {
    try {
        const uniqueStyles = Array.from(new Set(rawItems.map(r => r.style || r.name).filter(s => s && s.length >= 2)));
        
        if (uniqueStyles.length === 0) return rawItems.map(r => ({ ...r, matchedCode: '미매칭', matchedName: r.style || r.name, isMatched: false }));

        // 1. matching_history 조회
        const { data: historyRows, error: hError } = await supabase
            .from('matching_history')
            .select('*')
            .in('original_style', uniqueStyles);

        if (hError) console.warn('matching_history table might be missing:', hError.message);

        // 2. products 조회 (최적화된 쿼리)
        // 스타일이 너무 많을 경우를 대비해 쪼개거나 단순화
        const query = uniqueStyles.slice(0, 50).map(s => `상품명.ilike.%${s}%,상품코드.ilike.%${s}%,바코드.ilike.%${s}%`).join(',');
        
        const { data: dbRows, error: pError } = await supabase
            .from('products')
            .select('상품명, 상품코드, 바코드, 옵션')
            .or(query);

        if (pError) console.warn('products table might be missing:', pError.message);

        const results = rawItems.map(record => {
            const style = record.style || record.name;
            const nStyle = normalizeStr(style);
            
            const learned = historyRows?.find(h => h.original_style === style);
            
            let bestMatch = null;
            let bestScore = -1;

            dbRows?.forEach(row => {
                let score = 0;
                const dbName = normalizeStr(row['상품명']);
                const dbCode = normalizeStr(row['상품코드']);
                const dbBarcode = normalizeStr(row['바코드']);
                const dbOption = normalizeStr(row['옵션'] || '');

                if (learned) {
                    if (row['상품명'] === learned.matched_name) score += 50;
                    if (row['상품코드'] === learned.product_code) score += 100;
                }

                if (dbName === nStyle || dbCode === nStyle || dbBarcode === nStyle) score += 30;
                else if (dbName.includes(nStyle) || dbCode.includes(nStyle)) score += 10;

                if (record.color) {
                    const nColor = normalizeStr(record.color);
                    if (dbBarcode.includes(nColor) || dbOption.includes(nColor)) score += 30;
                }

                if (record.size) {
                    const nSize = normalizeStr(record.size);
                    if (dbBarcode.includes(nSize) || dbOption.includes(nSize)) score += 40;
                }

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = row;
                }
            });

            const isValid = bestMatch && (bestScore >= 25);

            return {
                ...record,
                matchedCode: isValid ? bestMatch['상품코드'] : '미매칭',
                matchedName: isValid ? bestMatch['상품명'] : (style || '코드누락'),
                isMatched: !!isValid
            };
        });

        return results;
    } catch (err) {
        console.error('MATCH_ENGINE_CRASH:', err);
        return rawItems.map(r => ({ ...r, matchedCode: '엔진오류', matchedName: r.style || r.name, isMatched: false }));
    }
}
