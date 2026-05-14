import { supabase } from './supabase';

function normalizeStr(s: any) {
    if (!s) return "";
    return s.toString().replace(/[^0-9A-Z가-힣]/gi, '').toUpperCase();
}

export async function matchProducts(rawItems: any[]) {
    try {
        const uniqueStyles = Array.from(new Set(rawItems.map(r => r.style || r.name).filter(s => s && s.length >= 2)));
        
        if (uniqueStyles.length === 0) return rawItems.map(r => ({ ...r, matchedCode: '미매칭', matchedName: r.style || r.name, isMatched: false }));

        // 1. mapping_data 조회 (사용자가 말씀하신 풍부한 데이터 소스)
        // 스타일명과 상품명이 일치하는 데이터를 찾습니다.
        const { data: mappingRows, error: mError } = await supabase
            .from('mapping_data')
            .select('상품명, 상품코드')
            .or(uniqueStyles.map(s => `상품명.ilike.%${s}%`).join(','));

        if (mError) console.warn('mapping_data table might be missing or error:', mError.message);

        // 2. products 조회 (백업 마스터 데이터)
        const { data: dbRows, error: pError } = await supabase
            .from('products')
            .select('상품명, 상품코드, 바코드, 옵션')
            .or(uniqueStyles.slice(0, 50).map(s => `상품명.ilike.%${s}%,상품코드.ilike.%${s}%`).join(','));

        if (pError) console.warn('products table might be missing:', pError.message);

        const results = rawItems.map(record => {
            const style = record.style || record.name;
            const nStyle = normalizeStr(style);
            
            let bestMatch = null;
            let bestScore = -1;

            // 우선 mapping_data에서 매칭 시도
            mappingRows?.forEach(row => {
                const mapName = normalizeStr(row['상품명']);
                let score = 0;
                
                if (mapName === nStyle) score += 100; // 정확히 일치
                else if (mapName.includes(nStyle) || nStyle.includes(mapName)) score += 50; // 부분 일치

                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = { '상품명': row['상품명'], '상품코드': row['상품코드'] };
                }
            });

            // mapping_data에서 만족스러운 결과를 못 찾았다면 products에서 시도
            if (bestScore < 50) {
                dbRows?.forEach(row => {
                    let score = 0;
                    const dbName = normalizeStr(row['상품명']);
                    const dbCode = normalizeStr(row['상품코드']);

                    if (dbName === nStyle || dbCode === nStyle) score += 30;
                    else if (dbName.includes(nStyle)) score += 10;

                    if (score > bestScore) {
                        bestScore = score;
                        bestMatch = row;
                    }
                });
            }

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
