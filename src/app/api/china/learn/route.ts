import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
    try {
        const { originalStyle, matchedName, productCode, color, size } = await req.json();

        const { error } = await supabase
            .from('matching_history')
            .upsert({
                original_style: originalStyle,
                matched_name: matchedName,
                product_code: productCode,
                color: color || null,
                size: size || null,
                created_at: new Date().toISOString()
            }, { onConflict: 'original_style' });

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err: any) {
        return NextResponse.json({ success: false, error: err.message });
    }
}
