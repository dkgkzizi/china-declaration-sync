'use client';

import { useState, useRef, useEffect } from 'react'
import { 
  FileUp, 
  Download, 
  RefreshCcw, 
  DollarSign, 
  Ship, 
  ShieldCheck,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  Globe
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
  unitPriceCNY: number;
  landedCostKRW: number;
  totalCostKRW: number;
  originSheet?: string;
  isMatched?: boolean;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PackingItem[]>([])
  const [exchangeRate, setExchangeRate] = useState(190)
  const [shippingCost, setShippingCost] = useState(500000)
  const [customsRate, setCustomsRate] = useState(13)
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'idle'>('idle')
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const checkConn = async () => {
      try {
        const { error } = await supabase.from('upload_logs').select('count', { count: 'exact', head: true });
        if (error) throw error;
        setDbStatus('connected');
      } catch (err) {
        setDbStatus('disconnected');
      }
    };
    checkConn();
  }, []);

  // Calculate Costs
  useEffect(() => {
    if (items.length === 0) return;
    const totalQty = items.reduce((acc, item) => acc + item.qty, 0);
    const shippingPerItem = totalQty > 0 ? shippingCost / totalQty : 0;
    const updatedItems = items.map(item => {
      const baseKRW = item.unitPriceCNY * exchangeRate;
      const customs = baseKRW * (customsRate / 100);
      const landed = baseKRW + customs + shippingPerItem;
      return {
        ...item,
        landedCostKRW: Math.round(landed),
        totalCostKRW: Math.round(landed * item.qty)
      };
    });
    setItems(updatedItems);
  }, [exchangeRate, shippingCost, customsRate, items.length]);

  const handleProcess = async (f: File) => {
    setFile(f);
    setLoading(true);
    setItems([]);
    
    try {
      const buffer = await f.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      let clientExtractedData: any[] = [];
      const targetSheets = workbook.SheetNames.filter(name => 
          ['OZ', 'OH', '오즈', '매칭', '패킹'].some(k => name.includes(k))
      );
      const sheetsToProcess = targetSheets.length > 0 ? targetSheets : [workbook.SheetNames[0]];

      sheetsToProcess.forEach(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          if (jsonData.length === 0) return;

          let nameCol = -1, colorCol = -1, totalCol = -1, sizeStartCol = -1, priceCol = -1;
          jsonData.forEach((row) => {
              if (nameCol !== -1) return;
              const rowStr = row.map(c => String(c || "").trim()).join("|");
              if (rowStr.includes('품명') && (rowStr.includes('합계') || rowStr.includes('수량'))) {
                  row.forEach((cell, cellIdx) => {
                      const c = String(cell || "").trim().toUpperCase();
                      if (c === '품명' || c.includes('ITEM')) nameCol = cellIdx;
                      else if (c === '칼라' || c === '색상' || c === 'COLOR') colorCol = cellIdx;
                      else if (c === '합계' || c === '총계' || c === '수량' || c === 'TOTAL') totalCol = cellIdx;
                      else if (c === '사이즈' || c === 'SIZE') sizeStartCol = cellIdx;
                      else if (c.includes('단가') || c.includes('PRICE') || c.includes('CNY')) priceCol = cellIdx;
                  });
              }
          });
          if (nameCol === -1) return;
          const startIdx = jsonData.findIndex(row => row.map(c => String(c || "").trim()).join("|").includes('품명')) + 1;
          for (let i = startIdx; i < jsonData.length; i++) {
              const row = jsonData[i];
              const name = String(row[nameCol] || "").trim();
              const qty = parseInt(String(row[totalCol] || "0").replace(/[^0-9]/g, ''));
              const price = parseFloat(String(row[priceCol] || "0").replace(/[^0-9.]/g, '')) || 0;
              if (name && qty > 0) {
                  clientExtractedData.push({
                      id: Math.random().toString(36).substr(2, 9),
                      style: name,
                      color: colorCol !== -1 ? String(row[colorCol] || "").trim() : "-",
                      size: sizeStartCol !== -1 ? String(row[sizeStartCol] || "FREE").trim() : "FREE",
                      qty, unitPriceCNY: price, originSheet: sheetName
                  });
              }
          }
      });

      const res = await fetch('/api/china/convert', { 
          method: 'POST', 
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: clientExtractedData, fileName: f.name })
      });
      const data = await res.json();
      if (data.success) {
          setItems(data.items);
          if (dbStatus === 'connected') {
            await supabase.from('upload_logs').insert({
                file_name: f.name,
                item_count: data.items.length,
                total_qty: data.items.reduce((acc: number, i: any) => acc + i.qty, 0)
            });
          }
      }
    } catch (e: any) { alert(e.message || 'Error'); }
    finally { setLoading(false); }
  };

  const handleExport = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('신고단가결과');
    worksheet.columns = [
      { header: '상품코드', key: 'matchedCode', width: 20 },
      { header: '상품명', key: 'matchedName', width: 40 },
      { header: '색상', key: 'color', width: 15 },
      { header: '사이즈', key: 'size', width: 12 },
      { header: '수량', key: 'qty', width: 10 },
      { header: '신고단가(CNY)', key: 'unitPriceCNY', width: 15 },
      { header: '원화환산가(KRW)', key: 'landedCostKRW', width: 15 },
      { header: '합계(KRW)', key: 'totalCostKRW', width: 20 },
    ];
    items.forEach(item => worksheet.addRow(item));
    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `신고단가_${file?.name || '결과'}.xlsx`);
  };

  return (
    <div className="relative min-h-screen selection:bg-blue-500/30 overflow-x-hidden">
      <div className="aurora" />
      
      <nav className="sticky top-0 z-50 px-8 py-4 flex justify-between items-center bg-black/40 backdrop-blur-xl border-b border-white/5">
        <div className="flex items-center gap-3">
          <Globe className="h-6 w-6 text-blue-500" />
          <span className="text-xl font-black tracking-tighter text-white uppercase">China Declaration Sync</span>
        </div>
        <div className="flex items-center gap-3">
           <div className={`h-2 w-2 rounded-full ${dbStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
           <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">DB {dbStatus}</span>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-8 pt-16 pb-32">
        <div className="space-y-12">
            
            <header className="text-center space-y-4">
                <h1 className="title-hero text-gradient">EXTRACT & SYNC.</h1>
                <p className="text-slate-400 max-w-xl mx-auto font-medium">중국 패킹리스트 엑셀 파일을 업로드하여 상품 매칭과 단가 추출을 시작하세요.</p>
            </header>

            {!file ? (
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="hyper-card p-24 flex flex-col items-center justify-center cursor-pointer hover:bg-white/[0.05]"
                >
                    <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => e.target.files?.[0] && handleProcess(e.target.files[0])} />
                    <div className="h-20 w-20 rounded-3xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-500 mb-8">
                        {loading ? <Loader2 className="h-8 w-8 animate-spin" /> : <FileUp className="h-8 w-8" />}
                    </div>
                    <h2 className="text-2xl font-bold mb-2">파일 업로드</h2>
                    <p className="text-slate-500 font-medium">드래그하거나 클릭하여 시작</p>
                </div>
            ) : (
                <div className="space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-500">
                    
                    {/* Compact Config */}
                    <div className="hyper-card p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                        {[
                            { label: '환율 (CNY/KRW)', icon: DollarSign, val: exchangeRate, set: setExchangeRate },
                            { label: '물류비 (KRW)', icon: Ship, val: shippingCost, set: setShippingCost },
                            { label: '관세율 (%)', icon: ShieldCheck, val: customsRate, set: setCustomsRate },
                        ].map((cfg, i) => (
                            <div key={i} className="space-y-3">
                                <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase">
                                    <cfg.icon className="h-3 w-3" /> {cfg.label}
                                </label>
                                <input 
                                    type="number" 
                                    value={cfg.val} 
                                    onChange={(e) => cfg.set(Number(e.target.value))}
                                    className="input-hyper"
                                />
                            </div>
                        ))}
                    </div>

                    {/* Results Table Header */}
                    <div className="flex justify-between items-end px-2">
                        <div>
                            <h3 className="text-xl font-bold">Matching Results</h3>
                            <p className="text-slate-500 text-xs mt-1">{file.name} · {items.length} items</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => {setFile(null); setItems([])}} className="px-5 py-3 rounded-xl border border-white/5 font-bold text-[11px] hover:bg-white/5 transition-all uppercase">Reset</button>
                            <button onClick={handleExport} className="btn-hyper !py-3">
                                <Download className="h-4 w-4" /> Export Result
                            </button>
                        </div>
                    </div>
                    
                    {/* Simple Clean Table */}
                    <div className="overflow-x-auto">
                        <table className="custom-table">
                            <thead>
                                <tr>
                                    <th>Status</th>
                                    <th>Product Info</th>
                                    <th>Specs</th>
                                    <th>Qty</th>
                                    <th>Price (CNY)</th>
                                    <th>Total (KRW)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            {item.isMatched ? (
                                                <span className="badge-success">Matched</span>
                                            ) : (
                                                <span className="badge-warning">Pending</span>
                                            )}
                                        </td>
                                        <td>
                                            <div className="font-bold text-slate-100">{item.matchedName}</div>
                                            <div className="text-[10px] font-bold text-blue-500 mt-0.5 uppercase">{item.matchedCode}</div>
                                        </td>
                                        <td>
                                            <div className="flex gap-2">
                                                <span className="text-[10px] text-slate-500 uppercase">{item.color}</span>
                                                <span className="text-[10px] text-slate-500 uppercase">{item.size}</span>
                                            </div>
                                        </td>
                                        <td className="font-bold">{item.qty}</td>
                                        <td className="text-slate-400">¥ {item.unitPriceCNY.toFixed(2)}</td>
                                        <td className="text-white font-black">₩ {item.totalCostKRW.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
      </main>

      <footer className="py-12 text-center border-t border-white/5">
         <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">© 2026 China Declaration Sync</span>
      </footer>
    </div>
  )
}
