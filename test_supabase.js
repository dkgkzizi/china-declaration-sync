require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
    const s = '아쿠아-퐁퐁베어';
    const s1 = s.replace(/[^a-zA-Z0-9가-힣]/g, '');
    const orQuery = `상품명.ilike.%${s}%,상품코드.ilike.%${s}%,상품명.ilike.%${s1}%`;
    
    console.log("orQuery:", orQuery);

    const { data: mRows, error: mErr } = await supabase.from('mapping_data').select('상품명, 상품코드, 바코드, 옵션').or(orQuery);
    console.log("mapping_data:", mRows?.length, mErr);

    const { data: pRows, error: pErr } = await supabase.from('products').select('상품명, 상품코드, 바코드, 옵션').or(orQuery);
    console.log("products:", pRows?.length, pErr);
}

test();
