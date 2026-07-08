import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qsqtoufuwplgmzyvzwvd.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy';
export const supabase = createClient(supabaseUrl, supabaseKey);

const COLOR_MAP: Record<string, string[]> = {
    "BLACK": ["블랙", "검정", "검은색", "BK", "BLK", "검정색"],
    "WHITE": ["화이트", "하양", "흰색", "WH", "WHT", "백색", "아이보리", "IVORY"],
    "RED": ["레드", "빨강", "빨간색", "RD", "빨강색"],
    "BLUE": ["블루", "파랑", "파란색", "BL", "파랑색", "네이비", "NAVY"],
    "YELLOW": ["옐로우", "노랑", "노란색", "YE", "YW", "노랑색"],
    "GREEN": ["그린", "초록", "초록색", "GR", "GN", "녹색"],
    "PINK": ["핑크", "분홍", "분홍색", "PK", "핫핑크", "연핑크"],
    "PURPLE": ["퍼플", "보라", "보라색", "PR", "PP"],
    "BROWN": ["브라운", "갈색", "BR"],
    "GRAY": ["그레이", "회색", "GY", "GRY"],
    "ORANGE": ["오렌지", "주황", "주황색", "OR"],
    "BEIGE": ["베이지", "BE"]
};

function normalizeStr(s: string): string {
    if (!s) return '';
    return s.toString().replace(/[\s\-_\[\]\(\)]/g, '').toLowerCase();
}

export async function matchItems(rawItems: any[]) {
    if (!rawItems || rawItems.length === 0) return [];

    let pgClient;
    try {
        const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.qsqtoufuwplgmzyvzwvd:openhan1234db@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres';
        pgClient = new Client({ connectionString });
        await pgClient.connect();

        const uniqueStyles = Array.from(new Set(rawItems.map(item => item.style || item.name).filter(Boolean)));
        
        let mappingRows: any[] = [];
        let productRows: any[] = [];
        let historyRows: any[] = [];

        try {
            const { rows } = await pgClient.query('SELECT * FROM matching_history ORDER BY created_at DESC LIMIT 1000');
            historyRows = rows;
        } catch(e) {}

        for (let i = 0; i < uniqueStyles.length; i += 20) {
            const chunk = uniqueStyles.slice(i, i + 20);
            
            const conditions = chunk.map(s => {
                const cleanS = s.toString().replace(/[^a-zA-Z0-9가-힣\u4E00-\u9FFF]/g, '%');
                return `"상품명" ILIKE '%${cleanS}%' OR "상품코드" ILIKE '%${cleanS}%'`;
            }).join(' OR ');

            if (conditions) {
                try {
                    const { rows: mRows } = await pgClient.query(`SELECT * FROM mapping_data WHERE ${conditions}`);
                    if (mRows) mappingRows.push(...mRows);
                } catch(e) {}

                try {
                    const { rows: pRows } = await pgClient.query(`SELECT * FROM products WHERE ${conditions}`);
                    if (pRows) productRows.push(...pRows);
                } catch(e) {}
            }
        }

        const dbRows = [...mappingRows, ...productRows];

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
                    score += 25; isBaseMatch = true; // 부분 일치 점수 상향 (카테고리명 포함 고려)
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

            let finalMatchedName = style || '코드누락';
            if (isValid) {
                const dbProdName = bestMatch['상품명'] || '';
                const rawCat = bestMatch['카테고리'] || bestMatch['분류'] || bestMatch['대분류'] || bestMatch['category'] || bestMatch['Category'] || bestMatch['상품분류'] || bestMatch['상품분류명'] || bestMatch['카테고리명'] || bestMatch['상품군'] || bestMatch['중분류'];
                
                if (rawCat) {
                    const parts = rawCat.split('>');
                    let cleanCat = parts[parts.length - 1].trim();
                    cleanCat = cleanCat.replace(/\(.*?\)/g, '').trim();
                    
                    const hasCategoryPrefix = /^[가-힣a-zA-Z0-9]+-/.test(dbProdName) || /^\([가-힣a-zA-Z0-9]+\)[가-힣a-zA-Z0-9]+-/.test(dbProdName);
                    if (cleanCat && !hasCategoryPrefix && !dbProdName.includes(cleanCat)) {
                        finalMatchedName = `${cleanCat}-${dbProdName}`;
                    } else {
                        finalMatchedName = dbProdName;
                    }
                } else {
                    finalMatchedName = dbProdName;
                }
            }

            return {
                ...record,
                matchedCode: isValid ? bestMatch['상품코드'] : '미매칭',
                matchedName: finalMatchedName,
                isMatched: !!isValid,
                error: errors.length > 0 ? errors[0] : null
            };
        });

        return results;
    } catch (err: any) {
        console.error('MATCH_ENGINE_ERROR:', err);
        return rawItems.map(r => ({ ...r, matchedCode: '엔진오류', matchedName: r.style || r.name, isMatched: false, error: err.message || String(err) }));
    }
}
