import { supabase } from './supabase';

function normalizeStr(s: any) {
    if (!s) return "";
    return s.toString().replace(/[^0-9A-Z가-힣]/gi, '').toUpperCase();
}

const COLOR_MAP: Record<string, string[]> = {
    'IVORY': ['아이보리', '화이트', '크림', '백아이보리'],
    'WHITE': ['화이트', '아이보리', '백아이보리'],
    'BLACK': ['블랙', '검정'],
    'PINK': ['핑크', '분홍'],
    'YELLOW': ['옐로우', '노랑'],
    'MELANGE': ['멜란지', '회색', '그레이'],
    'GRAY': ['그레이', '회색', '멜란지'],
    'BEIGE': ['베이지'],
    'BLUE': ['블루', '파랑'],
    'NAVY': ['네이비', '남색'],
    'RED': ['레드', '빨강'],
    'GREEN': ['그린', '초록'],
    'MINT': ['민트'],
    'PURPLE': ['퍼플', '보라'],
    'CHARCOAL': ['차콜', '먹색'],
    'CORAL': ['코랄'],
    'PEACH': ['피치'],
    'BROWN': ['브라운', '갈색']
};

export async function matchProducts(rawItems: any[]) {
    const uniqueStyles = Array.from(new Set(rawItems.map(r => r.style || r.name).filter(s => s && s.length >= 2)));
    
    // 1. matching_history 조회 (AI 학습 데이터)
    const { data: historyRows } = await supabase
        .from('matching_history')
        .select('*')
        .in('original_style', uniqueStyles);

    // 2. products 조회 (마스터 데이터)
    // ILIKE ANY 대신 Supabase text search 또는 다중 OR 사용
    // 여기서는 간단하게 모든 스타일을 포함하는 상품들을 대량으로 가져와서 메모리에서 매칭합니다.
    const { data: dbRows } = await supabase
        .from('products')
        .select('상품명, 상품코드, 바코드, 옵션')
        .or(uniqueStyles.map(s => `상품명.ilike.%${s}%,상품코드.ilike.%${s}%,바코드.ilike.%${s}%`).join(','));

    const results = rawItems.map(record => {
        const style = record.style || record.name;
        const nStyle = normalizeStr(style);
        
        // 학습 데이터 우선 확인
        const learned = historyRows?.find(h => h.original_style === style);
        
        let bestMatch = null;
        let bestScore = -1;

        dbRows?.forEach(row => {
            let score = 0;
            const dbName = normalizeStr(row['상품명']);
            const dbCode = normalizeStr(row['상품코드']);
            const dbBarcode = normalizeStr(row['바코드']);
            const dbOption = normalizeStr(row['옵션'] || '');

            // AI 학습 가중치
            if (learned) {
                if (row['상품명'] === learned.matched_name) score += 50;
                if (row['상품코드'] === learned.product_code) score += 100;
            }

            // 이름/코드 매칭
            if (dbName === nStyle || dbCode === nStyle || dbBarcode === nStyle) {
                score += 30;
            } else if (dbName.includes(nStyle) || dbCode.includes(nStyle)) {
                score += 10;
            }

            // 색상 매칭
            if (record.color) {
                const nColor = normalizeStr(record.color);
                if (dbBarcode.includes(nColor) || dbOption.includes(nColor)) score += 30;
            }

            // 사이즈 매칭
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
}
