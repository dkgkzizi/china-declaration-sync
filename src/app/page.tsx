'use client';

import { useState, useRef, useEffect, useCallback } from 'react'
import { 
  FileUp, 
  Download, 
  RefreshCcw, 
  ChevronRight, 
  TrendingUp, 
  DollarSign, 
  Ship, 
  ShieldCheck,
  Package,
  Database,
  ArrowRight,
  History,
  LayoutDashboard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Zap,
  Globe,
  Plus
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
  const [logs, setLogs] = useState<any[]>([])
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  useEffect(() => {
    const checkConn = async () => {
      try {
        const { data, error } = await supabase
          .from('upload_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(5);
        if (error) throw error;
        setLogs(data || []);
        setDbStatus('connected');
      } catch (err) {
        setDbStatus('disconnected');
      }
    };
    checkConn();
  }, []);

  // Calculate Landed Cost
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
    if (JSON.stringify(updatedItems) !== JSON.stringify(items)) {
        setItems(updatedItems);
    }
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
          name.includes('OZ') || name.includes('OH') || name.includes('오즈') || name.includes('매칭') || name.includes('패킹')
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
              if (!row || !Array.isArray(row)) continue;
              const name = String(row[nameCol] || "").trim();
              const qty = parseInt(String(row[totalCol] || "0").replace(/[^0-9]/g, ''));
              const price = parseFloat(String(row[priceCol] || "0").replace(/[^0-9.]/g, '')) || 0;
              if (name && qty > 0) {
                  clientExtractedData.push({
                      id: Math.random().toString(36).substr(2, 9),
                      style: name,
                      color: colorCol !== -1 ? String(row[colorCol] || "").trim() : "-",
                      size: sizeStartCol !== -1 ? String(row[sizeStartCol] || "FREE").trim() : "FREE",
                      qty: qty,
                      unitPriceCNY: price,
                      originSheet: sheetName
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
    } catch (e: any) { alert(e.message || 'Error processing file'); }
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

  const totalQty = items.reduce((acc, i) => acc + i.qty, 0);
  const totalValueKRW = items.reduce((acc, i) => acc + i.totalCostKRW, 0);

  return (
    <div className="relative min-h-screen selection:bg-blue-500/30 overflow-x-hidden">
      <div className="aurora" />
      
      {/* Dynamic Cursor Light */}
      <div 
        className="pointer-events-none fixed z-[9999] h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-30 blur-[120px]"
        style={{ 
          background: 'radial-gradient(circle, rgba(59, 130, 246, 0.4) 0%, transparent 70%)',
          left: mousePos.x, top: mousePos.y 
        }}
      />

      <nav className="sticky top-0 z-50 px-10 py-6 flex justify-between items-center bg-black/20 backdrop-blur-md border-b border-white/5">
        <div className="flex items-center gap-4 group cursor-pointer">
          <div className="relative">
             <div className="absolute -inset-1 rounded-lg bg-blue-500 opacity-20 blur group-hover:opacity-40 transition duration-500"></div>
             <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-black border border-white/10">
                <Globe className="h-5 w-5 text-blue-500" />
             </div>
          </div>
          <span className="text-2xl font-black tracking-tighter text-white">CHINA SYNC <span className="text-blue-500 font-normal">v3</span></span>
        </div>
        
        <div className="flex items-center gap-8">
            <div className="hidden md:flex gap-6 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                <a href="#" className="hover:text-white transition-colors">Extraction</a>
                <a href="#" className="hover:text-white transition-colors">Matching</a>
                <a href="#" className="hover:text-white transition-colors">History</a>
            </div>
            <div className="h-4 w-[1px] bg-white/10" />
            <div className="flex items-center gap-3">
               <div className={`h-2 w-2 rounded-full ${dbStatus === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
               <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cloud Database</span>
            </div>
        </div>
      </nav>

      <main className="max-w-[1400px] mx-auto px-10 pt-20 pb-40">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-20 items-start">
          
          <div className="lg:col-span-8 space-y-24">
            <section>
                <motion.h1 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="title-hero mb-8 text-gradient"
                >
                    GLOBAL<br/>DECLARATION<br/><span className="text-blue-500 italic">AUTOMATION.</span>
                </motion.h1>
                <motion.p 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="text-xl text-slate-400 max-w-2xl leading-relaxed"
                >
                    패킹리스트에서 세관 신고용 단가를 자동으로 추출하고 매칭 데이터를 즉시 생성합니다. 
                    이제 복잡한 작업 없이 몇 번의 클릭만으로 모든 과정이 완료됩니다.
                </motion.p>
            </section>

            <section className="space-y-12">
                {!file ? (
                    <motion.div 
                        onMouseMove={handleMouseMove}
                        onClick={() => fileInputRef.current?.click()}
                        whileHover={{ scale: 1.01 }}
                        className="hyper-card p-32 flex flex-col items-center justify-center cursor-pointer group"
                        style={{ '--mouse-x': `${mousePos.x}px`, '--mouse-y': `${mousePos.y}px` } as any}
                    >
                        <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => e.target.files?.[0] && handleProcess(e.target.files[0])} />
                        <div className="relative mb-10">
                            <div className="absolute -inset-4 rounded-full bg-blue-500 opacity-20 blur-2xl group-hover:opacity-40 transition-all duration-500" />
                            <div className="relative h-24 w-24 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform duration-500">
                                {loading ? <Loader2 className="h-10 w-10 animate-spin" /> : <FileUp className="h-10 w-10" />}
                            </div>
                        </div>
                        <h2 className="text-3xl font-bold mb-4">패킹리스트 업로드</h2>
                        <p className="text-slate-500 font-medium">XLSX, XLS 파일을 드래그하거나 클릭하세요</p>
                    </motion.div>
                ) : (
                    <div className="space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
                        {/* Stats Panel */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[
                                { label: 'Active Items', value: items.length, icon: Package, color: 'text-blue-500' },
                                { label: 'Total Quantity', value: totalQty.toLocaleString(), icon: Zap, color: 'text-amber-500' },
                                { label: 'Total Cost (KRW)', value: `₩${(totalValueKRW / 1000000).toFixed(2)}M`, icon: TrendingUp, color: 'text-emerald-500' },
                            ].map((stat, i) => (
                                <div key={i} className="hyper-card p-8 group">
                                    <div className={`mb-6 rounded-xl w-10 h-10 flex items-center justify-center bg-white/5 border border-white/10 ${stat.color}`}>
                                        <stat.icon className="h-5 w-5" />
                                    </div>
                                    <div className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">{stat.label}</div>
                                    <div className="text-3xl font-black">{stat.value}</div>
                                </div>
                            ))}
                        </div>

                        {/* Config Panel */}
                        <div className="hyper-card p-10 grid grid-cols-1 lg:grid-cols-3 gap-10">
                            {[
                                { label: 'Exchange Rate', icon: DollarSign, val: exchangeRate, set: setExchangeRate, suffix: 'CNY/KRW' },
                                { label: 'Logistics Cost', icon: Ship, val: shippingCost, set: setShippingCost, suffix: 'KRW' },
                                { label: 'Customs Rate', icon: ShieldCheck, val: customsRate, set: setCustomsRate, suffix: '%' },
                            ].map((cfg, i) => (
                                <div key={i} className="space-y-4">
                                    <label className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        <cfg.icon className="h-3 w-3" /> {cfg.label}
                                    </label>
                                    <div className="relative group">
                                        <input 
                                            type="number" 
                                            value={cfg.val} 
                                            onChange={(e) => cfg.set(Number(e.target.value))}
                                            className="input-hyper pr-20"
                                        />
                                        <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-600 uppercase">{cfg.suffix}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Results Table */}
                        <div className="space-y-8">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h3 className="text-2xl font-bold mb-2">Extraction Results</h3>
                                    <p className="text-slate-500 text-sm">Supabase와 실시간 매칭된 데이터입니다.</p>
                                </div>
                                <div className="flex gap-4">
                                    <button onClick={() => {setFile(null); setItems([])}} className="px-6 py-4 rounded-2xl border border-white/5 font-bold text-xs hover:bg-white/5 transition-all">RESTART</button>
                                    <button onClick={handleExport} className="btn-hyper">
                                        <Download className="h-4 w-4" /> EXPORT EXCEL
                                    </button>
                                </div>
                            </div>
                            
                            <div className="overflow-x-auto">
                                <table className="custom-table">
                                    <thead>
                                        <tr>
                                            <th>Match Status</th>
                                            <th>Matched Product</th>
                                            <th>Original Style</th>
                                            <th>Specs</th>
                                            <th>Qty</th>
                                            <th>Landed Cost (KRW)</th>
                                            <th>Total (KRW)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map((item, idx) => (
                                            <motion.tr 
                                                key={item.id}
                                                initial={{ opacity: 0, x: -20 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.02 }}
                                            >
                                                <td>
                                                    {item.isMatched ? (
                                                        <span className="badge-success"><CheckCircle2 className="h-2 w-2" /> Matched</span>
                                                    ) : (
                                                        <span className="badge-warning"><AlertCircle className="h-2 w-2" /> Pending</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="font-bold text-slate-100">{item.matchedName}</div>
                                                    <div className="text-[10px] font-bold text-blue-500 mt-1 uppercase tracking-tighter">{item.matchedCode}</div>
                                                </td>
                                                <td><span className="text-xs text-slate-500 font-medium">{item.style}</span></td>
                                                <td>
                                                    <div className="flex gap-2">
                                                        <span className="px-2 py-0.5 rounded-lg bg-white/5 text-slate-400 text-[10px] font-bold border border-white/5 uppercase">{item.color}</span>
                                                        <span className="px-2 py-0.5 rounded-lg bg-white/5 text-slate-400 text-[10px] font-bold border border-white/5 uppercase">{item.size}</span>
                                                    </div>
                                                </td>
                                                <td className="font-bold">{item.qty.toLocaleString()}</td>
                                                <td className="text-blue-400 font-black">₩ {item.landedCostKRW.toLocaleString()}</td>
                                                <td className="text-white font-black">₩ {item.totalCostKRW.toLocaleString()}</td>
                                            </motion.tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </section>
          </div>

          <aside className="lg:col-span-4 space-y-10 lg:sticky lg:top-32">
             <div className="hyper-card p-8">
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-sm font-black flex items-center gap-2 tracking-widest text-slate-400 uppercase">
                        <History className="h-4 w-4 text-blue-500" /> Recent History
                    </h3>
                    <button className="text-[10px] font-bold text-blue-500 hover:underline">VIEW ALL</button>
                </div>
                <div className="space-y-6">
                    {logs.map((log, i) => (
                        <div key={i} className="group flex gap-5 items-start cursor-pointer">
                            <div className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-blue-500/50 transition-colors">
                                <FileUp className="h-4 w-4 text-slate-500 group-hover:text-blue-500" />
                            </div>
                            <div className="space-y-1">
                                <div className="text-xs font-bold text-slate-200 truncate w-40">{log.file_name}</div>
                                <div className="text-[10px] font-bold text-slate-600 uppercase">{new Date(log.created_at).toLocaleDateString()} · {log.item_count} items</div>
                            </div>
                        </div>
                    ))}
                </div>
             </div>

             <div className="hyper-card p-8 bg-blue-600/5 border-blue-500/20">
                <Zap className="h-6 w-6 text-blue-500 mb-6" />
                <h3 className="text-lg font-bold mb-3">Instant Mapping</h3>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                    현재 `mapping_data` 테이블의 수천 개의 데이터를 활용하여 실시간 매칭 중입니다.
                </p>
                <div className="flex -space-x-3">
                    {[1,2,3,4].map(i => <div key={i} className="h-8 w-8 rounded-full border-2 border-slate-950 bg-slate-800" />)}
                    <div className="h-8 w-8 rounded-full border-2 border-slate-950 bg-blue-500 flex items-center justify-center text-[10px] font-bold">+2k</div>
                </div>
             </div>
          </aside>

        </div>
      </main>

      <footer className="border-t border-white/5 py-20 bg-black/20">
        <div className="max-w-[1400px] mx-auto px-10 flex flex-col md:flex-row justify-between items-center gap-10">
            <div className="flex items-center gap-4">
                <Globe className="h-4 w-4 text-slate-600" />
                <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">China Declaration Sync Platform</span>
            </div>
            <div className="flex gap-10 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                <a href="#" className="hover:text-white transition-colors">Documentation</a>
                <a href="#" className="hover:text-white transition-colors">Privacy</a>
                <a href="#" className="hover:text-white transition-colors">Support</a>
            </div>
            <div className="text-[10px] font-black text-slate-700 uppercase tracking-widest">© 2026 Antigravity Labs</div>
        </div>
      </footer>
    </div>
  )
}
