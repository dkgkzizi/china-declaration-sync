import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeStr(s: any) {
    if (!s) return "";
    return s.toString().replace(/[^0-9A-Z가-힣]/gi, '').toUpperCase();
}

const COLOR_MAP: Record<string, string[]> = {
    'IVORY': ['아이보리', '화이트', '크림'],
    'WHITE': ['화이트', '아이보리'],
    'BLACK': ['블랙', '검정'],
    'PINK': ['핑크', '분홍'],
    'YELLOW': ['옐로우', '노랑'],
    'GRAY': ['그레이', '회색', '멜란지'],
    'BEIGE': ['베이지'],
    'BLUE': ['블루', '파랑'],
    'NAVY': ['네이비', '남색'],
    'RED': ['레드', '빨강'],
    'GREEN': ['그린', '초록'],
    'MINT': ['민트'],
    'PURPLE': ['퍼플', '보라'],
};

export async function matchItems(rawItems: any[]): Promise<any[]> {
    try {
        const uniqueStyles = Array.from(new Set(
            rawItems.map(r => r.style || r.name).filter(s => s && s.length >= 2)
        ));

        if (uniqueStyles.length === 0) {
            return rawItems.map(r => ({ ...r, matchedCode: '미매칭', matchedName: r.style || r.name, isMatched: false }));
        }

        // 1. matching_history 조회
        const { data: historyRows } = await supabase
            .from('matching_history')
            .select('original_style, product_code, matched_name, color, size')
            .in('original_style', uniqueStyles);

        // 2. mapping_data (기존 매핑 데이터) 조회
        const { data: mappingRows } = await supabase
            .from('mapping_data')
            .select('상품명, 상품코드, 바코드, 옵션')
            .or(uniqueStyles.slice(0, 40).map(s => `상품명.ilike.%${normalizeStr(s)}%,상품코드.ilike.%${normalizeStr(s)}%`).join(','));

        // 3. products 테이블 조회 (백업)
        const { data: productRows } = await supabase
            .from('products')
            .select('상품명, 상품코드, 바코드, 옵션')
            .or(uniqueStyles.slice(0, 30).map(s => `상품명.ilike.%${s}%,상품코드.ilike.%${s}%`).join(','));

        const dbRows = [...(mappingRows || []), ...(productRows || [])];

        const results = rawItems.map(record => {
            const style = record.style || record.name;
            const nStyle = normalizeStr(style);

            // AI 학습 데이터 확인
            const learned = (historyRows || []).find(h =>
                h.original_style === style &&
                (h.color === record.color || (!h.color && !record.color)) &&
                (h.size === record.size || (!h.size && !record.size))
            ) || (historyRows || []).find(h => h.original_style === style);

            let bestMatch: any = null;
            let bestScore = -1;

            dbRows.forEach(row => {
                let score = 0;
                const dbName = normalizeStr(row['상품명']);
                const dbCode = normalizeStr(row['상품코드']);
                const dbBarcode = normalizeStr(row['바코드'] || '');
                const dbOption = normalizeStr(row['옵션'] || '');

                // AI 학습 가중치
                if (learned) {
                    if (row['상품명'] === learned.matched_name) score += 50;
                    const isExact = learned.color === record.color && learned.size === record.size;
                    if (row['상품코드'] === learned.product_code && isExact) score += 100;
                }

                // 기본 이름/코드 매칭
                let isBaseMatch = false;
                if (dbName === nStyle || dbCode === nStyle || dbBarcode === nStyle) {
                    score += 30; isBaseMatch = true;
                } else if (dbName.includes(nStyle) || dbCode.includes(nStyle) || dbBarcode.includes(nStyle)) {
                    score += 10; isBaseMatch = true;
                } else {
                    const cleaned = nStyle.replace(/슈즈|신발|샌들|장화|구두/g, '');
                    if (cleaned.length >= 2 && (dbName.includes(cleaned) || dbCode.includes(cleaned))) {
                        score += 8; isBaseMatch = true;
                    }
                }

                const isLearnedCode = learned && row['상품코드'] === learned.product_code;
                if (!isLearnedCode && !isBaseMatch) return;

                // 사이즈 매칭
                if (record.size) {
                    const nSize = normalizeStr(record.size);
                    if (nSize && (dbBarcode.includes(nSize) || dbOption.includes(nSize))) score += 40;
                }

                // 색상 매칭
                if (record.color) {
                    const nColor = normalizeStr(record.color);
                    const upper = record.color.trim().toUpperCase();
                    if (nColor && (dbBarcode.includes(nColor) || dbOption.includes(nColor))) {
                        score += 30;
                    } else if (COLOR_MAP[upper]) {
                        for (const syn of COLOR_MAP[upper]) {
                            if (dbBarcode.includes(normalizeStr(syn)) || dbOption.includes(normalizeStr(syn))) {
                                score += 15; break;
                            }
                        }
                    }
                }

                if (score > bestScore) { bestScore = score; bestMatch = row; }
            });

            const isValid = bestMatch && bestScore >= 25;

            return {
                ...record,
                matchedCode: isValid ? bestMatch['상품코드'] : '미매칭',
                matchedName: isValid ? bestMatch['상품명'] : (style || '코드누락'),
                isMatched: !!isValid,
            };
        });

        return results;
    } catch (err) {
        console.error('MATCH_ENGINE_ERROR:', err);
        return rawItems.map(r => ({ ...r, matchedCode: '엔진오류', matchedName: r.style || r.name, isMatched: false }));
    }
}
