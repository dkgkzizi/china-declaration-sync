'use client';

import { useState, useRef, useEffect } from 'react'
import { 
  FileUp, 
  Download, 
  RefreshCcw, 
  CheckCircle2, 
  AlertCircle,
  Database,
  ArrowRightLeft,
  Printer,
  FileSpreadsheet,
  PackageCheck
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { supabase } from '@/lib/supabase'

interface PackingItem {
  id: string;
  style: string;
  matchedCode: string;
  matchedName: string;
  color: string;
  size: string;
  qty: number;
  isMatched?: boolean;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PackingItem[]>([])
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'idle'>('idle')
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const checkConn = async () => {
      try {
        const { error } = await supabase.from('upload_logs').select('count', { count: 'exact', head: true });
        if (error) throw error;
        setDbStatus('connected');
      } catch (err) { setDbStatus('disconnected'); }
    };
    checkConn();
  }, []);

  const handleProcess = async (f: File) => {
    setFile(f);
    setLoading(true);
    setItems([]);
    
    try {
      const buffer = await f.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      let extractedData: any[] = [];

      const targetSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(targetSheet, { header: 1 }) as any[][];

      let nameCol = -1, colorCol = -1, sizeStartCol = -1, sizeEndCol = -1;
      const sizeHeaderRow = jsonData.find(row => 
        row.some(c => String(c || "").includes('사이즈별수량') || String(c || "").includes('품명'))
      );

      if (!sizeHeaderRow) throw new Error("유효한 패킹리스트 형식이 아닙니다.");

      sizeHeaderRow.forEach((cell, idx) => {
        const c = String(cell || "").trim();
        if (c.includes('품명')) nameCol = idx;
        if (c.includes('칼라') || c.includes('색상')) colorCol = idx;
        // 사이즈 숫자가 시작되는 지점 찾기 (보통 90, 100... 또는 120, 130...)
        if (!isNaN(parseInt(c)) && sizeStartCol === -1) sizeStartCol = idx;
        if (sizeStartCol !== -1 && !isNaN(parseInt(c))) sizeEndCol = idx;
        // S, M, L, FREE 등도 사이즈로 인식
        if (['S', 'M', 'L', 'FREE'].includes(c.toUpperCase()) && sizeStartCol === -1) sizeStartCol = idx;
        if (sizeStartCol !== -1 && ['S', 'M', 'L', 'FREE'].includes(c.toUpperCase())) sizeEndCol = idx;
      });

      const startIdx = jsonData.indexOf(sizeHeaderRow) + 1;
      
      for (let i = startIdx; i < jsonData.length; i++) {
        const row = jsonData[i];
        const name = String(row[nameCol] || "").trim();
        const color = String(row[colorCol] || "").trim();

        if (name && name !== '합계' && color) {
          for (let sIdx = sizeStartCol; sIdx <= sizeEndCol; sIdx++) {
            const qty = parseInt(String(row[sIdx] || "0").replace(/[^0-9]/g, ''));
            const sizeLabel = String(sizeHeaderRow[sIdx] || "").trim();

            if (qty > 0) {
              extractedData.push({
                id: Math.random().toString(36).substr(2, 9),
                style: name,
                color: color,
                size: sizeLabel,
                qty: qty
              });
            }
          }
        }
      }

      // 서버 매칭 API 호출
      const res = await fetch('/api/china/convert', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: extractedData, fileName: f.name })
      });
      const data = await res.json();
      if (data.success) setItems(data.items);

    } catch (e: any) { alert(e.message); }
    finally { setLoading(false); }
  };

  const totalQty = items.reduce((acc, i) => acc + i.qty, 0);

  return (
    <div className="min-h-screen bg-[#F8F9FD] text-[#1A1C21] font-sans selection:bg-blue-500/10">
      <div className="flex h-screen overflow-hidden">
        
        {/* LEFT SIDEBAR */}
        <aside className="w-80 bg-white border-r border-slate-200 flex flex-col p-8 gap-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-red-500/20">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight uppercase">China Sync</h1>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data Integrity v3.0</div>
            </div>
          </div>

          <div className="flex-1 space-y-6">
             <div className="rounded-3xl border-2 border-dashed border-slate-200 p-8 flex flex-col items-center justify-center text-center gap-4 group hover:border-blue-500/50 transition-all cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => e.target.files?.[0] && handleProcess(e.target.files[0])} />
                <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-blue-50 transition-colors">
                  {loading ? <RefreshCcw className="w-8 h-8 text-blue-500 animate-spin" /> : <FileUp className="w-8 h-8 text-slate-400 group-hover:text-blue-500" />}
                </div>
                <div>
                  <div className="font-bold text-sm">{file ? 'Excel Loaded' : 'Upload Excel'}</div>
                  <div className="text-[10px] text-slate-400 font-medium mt-1 truncate w-40">{file ? file.name : 'Drag or Click'}</div>
                </div>
             </div>

             <div className="space-y-3">
                <button className="w-full py-4 px-6 rounded-2xl bg-[#1A1C21] text-white font-bold text-sm flex items-center justify-center gap-3 shadow-xl shadow-black/10 hover:scale-[1.02] transition-all">
                  <ArrowRightLeft className="w-4 h-4" /> SYNC CHINA DATA
                </button>
                <button className="w-full py-4 px-6 rounded-2xl bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-3 shadow-xl shadow-red-500/20 hover:scale-[1.02] transition-all uppercase">
                  <Download className="w-4 h-4" /> Download Final Excel
                </button>
                <button className="w-full py-4 px-6 rounded-2xl bg-white border border-slate-200 text-[#1A1C21] font-bold text-sm flex items-center justify-center gap-3 hover:bg-slate-50 transition-all uppercase">
                  <Printer className="w-4 h-4" /> Print Pallet Labels
                </button>
             </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            <div className={`w-2 h-2 rounded-full ${dbStatus === 'connected' ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">DB {dbStatus}</span>
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 overflow-y-auto p-12 space-y-10">
          
          {/* HEADER SUMMARY */}
          <section className="bg-white rounded-[2.5rem] p-10 border border-slate-200 shadow-sm flex items-center gap-12">
            <div className="w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center text-red-500">
               <ArrowRightLeft className="w-8 h-8" />
            </div>
            <div className="flex gap-16">
              <div className="space-y-1">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">China Integrity Summary</div>
                <div className="flex gap-8 items-end">
                   <div>
                      <div className="text-[9px] font-bold text-red-400 uppercase mb-1">Original Qty</div>
                      <div className="text-3xl font-black">{totalQty.toLocaleString()}</div>
                   </div>
                   <div>
                      <div className="text-[9px] font-bold text-red-400 uppercase mb-1">DB Matched</div>
                      <div className="text-3xl font-black text-red-500">{items.filter(i => i.isMatched).reduce((acc, i) => acc + i.qty, 0).toLocaleString()}</div>
                   </div>
                </div>
              </div>
            </div>
            <div className="ml-auto flex flex-col items-end gap-2">
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs">
                <CheckCircle2 className="w-4 h-4" /> VERIFIED
              </div>
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest italic">Factory-to-Cloud Stream...</div>
            </div>
          </section>

          {/* LIST SECTION */}
          <section className="space-y-6">
            <div className="flex items-center justify-between px-4">
              <div className="flex items-center gap-3">
                <PackageCheck className="w-5 h-5 text-red-500" />
                <span className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">China Production Stream</span>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400"><RefreshCcw className="w-4 h-4" /></div>
                <button className="px-4 py-2 bg-red-50 text-red-500 text-[10px] font-black rounded-lg uppercase">오즈키즈</button>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Master SKU</th>
                    <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Detail Matrix</th>
                    <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qty Score</th>
                    <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Valid</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {items.length > 0 ? items.map((item, idx) => (
                      <motion.tr 
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.01 }}
                        className="group hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0"
                      >
                        <td className="px-10 py-8">
                          <div className={`text-sm font-bold ${item.isMatched ? 'text-slate-700' : 'text-slate-400'}`}>
                            {item.isMatched ? item.matchedCode : '미매칭'}
                          </div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="space-y-1">
                            <div className="inline-block px-2 py-0.5 bg-red-50 text-red-500 text-[9px] font-black rounded uppercase">Ref: {item.style}</div>
                            <div className="text-lg font-black text-slate-800 tracking-tight">{item.isMatched ? item.matchedName : item.style}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase">{item.size} / {item.color}</div>
                          </div>
                        </td>
                        <td className="px-10 py-8 text-center">
                          <div className="text-lg font-black text-slate-800">{item.qty}</div>
                        </td>
                        <td className="px-10 py-8">
                          <div className="flex justify-end gap-3">
                             <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${item.isMatched ? 'border-emerald-100 text-emerald-500' : 'border-red-100 text-red-500'}`}>
                                {item.isMatched ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                             </div>
                             <div className="w-8 h-8 rounded-full flex items-center justify-center border border-slate-100 text-slate-300">
                                <RefreshCcw className="w-4 h-4" />
                             </div>
                          </div>
                        </td>
                      </motion.tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="py-40 text-center">
                          <div className="text-slate-300 font-bold text-sm uppercase tracking-widest">No Data Available</div>
                        </td>
                      </tr>
                    )}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
