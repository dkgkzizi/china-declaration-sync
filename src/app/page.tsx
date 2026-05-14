'use client';

import { useState, useRef, useEffect } from 'react'
import { 
  FileUp, 
  Calculator, 
  Download, 
  RefreshCcw, 
  ChevronRight, 
  TrendingUp, 
  DollarSign, 
  Ship, 
  ShieldCheck,
  Package,
  Table as TableIcon,
  Database,
  ArrowRight,
  History,
  LayoutDashboard
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
import { supabase } from '@/lib/supabase'

interface PackingItem {
  id: string;
  name: string;
  color: string;
  size: string;
  qty: number;
  unitPriceCNY: number;
  landedCostKRW: number;
  totalCostKRW: number;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState<PackingItem[]>([])
  const [exchangeRate, setExchangeRate] = useState(190)
  const [shippingCost, setShippingCost] = useState(500000)
  const [customsRate, setCustomsRate] = useState(13)
  const [isDragging, setIsDragging] = useState(false)
  const [dbStatus, setDbStatus] = useState<'connected' | 'disconnected' | 'idle'>('idle')
  const [logs, setLogs] = useState<any[]>([])
  
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setLoading(true);
    try {
      const buffer = await f.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
      
      const extracted: PackingItem[] = [];
      let nameCol = -1, colorCol = -1, qtyCol = -1, priceCol = -1;

      jsonData.forEach((row) => {
        if (nameCol !== -1) return;
        const rowStr = row.map(c => String(c || "").trim()).join("|");
        if (rowStr.includes("품명") || rowStr.includes("ITEM") || rowStr.includes("상품명")) {
          row.forEach((cell, cIdx) => {
            const c = String(cell || "").trim();
            if (c.includes("품명") || c.includes("ITEM") || c.includes("상품명")) nameCol = cIdx;
            if (c.includes("색상") || c.includes("칼라") || c.includes("COLOR")) colorCol = cIdx;
            if (c.includes("수량") || c.includes("QTY") || c.includes("합계")) qtyCol = cIdx;
            if (c.includes("단가") || c.includes("PRICE") || c.includes("CNY")) priceCol = cIdx;
          });
        }
      });

      const startIdx = jsonData.findIndex(row => row.map(c => String(c || "").trim()).join("|").includes("품명")) + 1;
      
      for (let i = startIdx; i < jsonData.length; i++) {
        const row = jsonData[i];
        const name = String(row[nameCol] || "").trim();
        const qty = parseInt(String(row[qtyCol] || "0").replace(/[^0-9]/g, ''));
        const price = parseFloat(String(row[priceCol] || "0").replace(/[^0-9.]/g, ''));

        if (name && qty > 0) {
          extracted.push({
            id: Math.random().toString(36).substr(2, 9),
            name,
            color: colorCol !== -1 ? String(row[colorCol] || "").trim() : "-",
            size: "-",
            qty,
            unitPriceCNY: price || 0,
            landedCostKRW: 0,
            totalCostKRW: 0
          });
        }
      }

      setItems(extracted);

      if (dbStatus === 'connected') {
        const { data: newLog } = await supabase.from('upload_logs').insert({
            file_name: f.name,
            item_count: extracted.length,
            total_qty: extracted.reduce((acc, i) => acc + i.qty, 0)
        }).select().single();
        
        if (newLog) setLogs([newLog, ...logs.slice(0, 4)]);
      }

    } catch (err) {
      console.error(err);
      alert("파일 파싱 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('신고단가결과');

    worksheet.columns = [
      { header: '상품명', key: 'name', width: 30 },
      { header: '색상', key: 'color', width: 15 },
      { header: '수량', key: 'qty', width: 10 },
      { header: '신고단가(CNY)', key: 'unitPriceCNY', width: 15 },
      { header: '원화환산가(KRW)', key: 'landedCostKRW', width: 15 },
      { header: '신고합계(KRW)', key: 'totalCostKRW', width: 20 },
    ];

    items.forEach(item => worksheet.addRow(item));
    
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FF3B82F6'} };

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `신고단가_${file?.name || '결과'}.xlsx`);
  };

  const totalQty = items.reduce((acc, i) => acc + i.qty, 0);
  const totalValueKRW = items.reduce((acc, i) => acc + i.totalCostKRW, 0);

  return (
    <div className="relative min-h-screen">
      <div className="bg-mesh" />
      
      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass border-x-0 border-t-0 rounded-none py-4 px-8 flex justify-between items-center mb-12">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <LayoutDashboard className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-black tracking-tighter">CHINA DECLARATION</span>
        </div>
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              <Database className={`w-3 h-3 ${dbStatus === 'connected' ? 'text-emerald-500' : 'text-slate-600'}`} /> 
              {dbStatus === 'connected' ? 'Cloud Active' : 'Local Storage'}
            </div>
            <div className="h-4 w-[1px] bg-white/10" />
            <button className="text-xs font-bold text-slate-400 hover:text-white transition-colors">Documentation</button>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-8 pb-20">
        <header className="mb-16">
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mb-6"
          >
            <span className="px-3 py-1 rounded-full bg-blue-500/10 text-blue-500 text-[10px] font-black uppercase tracking-widest border border-blue-500/20">
              Platform v2.1
            </span>
            <ChevronRight className="w-4 h-4 text-slate-600" />
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AI Extraction Engine</span>
          </motion.div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-end">
            <div>
              <h1 className="premium-title mb-6">
                SMART <span className="text-blue-500">SYNC.</span><br/>
                INSTANT PRICE.
              </h1>
              <p className="text-slate-400 text-lg max-w-xl leading-relaxed">
                중국 패킹리스트에서 세관 신고용 단가를 자동으로 추출하고 관리하세요. 
                복잡한 엑셀 수식 없이 1초 만에 원화 환산 및 세금 계산이 완료됩니다.
              </p>
            </div>
            
            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-4">
               {[
                 { label: 'Active Items', value: items.length || 0, icon: Package },
                 { label: 'Total Units', value: totalQty.toLocaleString(), icon: TableIcon },
                 { label: 'Total Value', value: `₩${(totalValueKRW / 1000000).toFixed(1)}M`, icon: TrendingUp },
               ].map((stat, i) => (
                 <motion.div 
                   key={i}
                   initial={{ opacity: 0, scale: 0.9 }}
                   animate={{ opacity: 1, scale: 1 }}
                   transition={{ delay: 0.2 + i * 0.1 }}
                   className="glass-card p-6"
                 >
                   <stat.icon className="w-4 h-4 text-blue-400 mb-4" />
                   <div className="text-[10px] font-bold text-slate-500 uppercase mb-1">{stat.label}</div>
                   <div className="stat-value">{stat.value}</div>
                 </motion.div>
               ))}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          <div className="xl:col-span-3 space-y-8">
            {!file ? (
              <motion.div 
                className={`glass p-20 text-center cursor-pointer upload-zone ${isDragging ? 'border-blue-500 bg-blue-500/5' : ''}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
                whileHover={{ scale: 1.005 }}
              >
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                  accept=".xlsx, .xls"
                />
                <div className="flex flex-col items-center gap-6">
                  <div className="w-20 h-20 rounded-3xl bg-blue-500/10 text-blue-500 flex items-center justify-center floating">
                    <FileUp className="w-10 h-10" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold mb-2">파일을 업로드하세요</h3>
                    <p className="text-slate-500">엑셀 파일을 드래그하거나 클릭하여 시작하세요</p>
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Controls */}
                <div className="glass p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[
                      { label: '기준 환율 (CNY/KRW)', icon: DollarSign, val: exchangeRate, set: setExchangeRate },
                      { label: '비례 배분 물류비 (KRW)', icon: Ship, val: shippingCost, set: setShippingCost },
                      { label: '신고 관세율 (%)', icon: ShieldCheck, val: customsRate, set: setCustomsRate },
                    ].map((cfg, i) => (
                      <div key={i} className="flex flex-col gap-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                          <cfg.icon className="w-3 h-3" /> {cfg.label}
                        </label>
                        <input 
                          className="bg-white/5 border border-white/5 p-4 rounded-2xl text-white outline-none focus:border-blue-500/50 focus:bg-blue-500/5 transition-all text-lg font-bold"
                          type="number" 
                          value={cfg.val} 
                          onChange={(e) => cfg.set(Number(e.target.value))}
                        />
                      </div>
                    ))}
                </div>

                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    <div className="w-2 h-8 bg-blue-500 rounded-full" />
                    추출 결과 데이터
                  </h2>
                  <div className="flex gap-3">
                    <button className="glass-card px-6 py-3 flex items-center gap-2 text-sm font-bold" onClick={() => { setFile(null); setItems([]); }}>
                      <RefreshCcw className="w-4 h-4 text-slate-400" /> 재설정
                    </button>
                    <button className="btn-primary px-8 py-3 rounded-2xl font-bold flex items-center gap-2 text-sm" onClick={handleExport}>
                      <Download className="w-4 h-4" /> 엑셀 다운로드
                    </button>
                  </div>
                </div>

                {/* Modern Table */}
                <div className="glass overflow-hidden">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-white/[0.02]">
                        <th className="p-5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">상품 정보</th>
                        <th className="p-5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">색상</th>
                        <th className="p-5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">수량</th>
                        <th className="p-5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">단가 (CNY)</th>
                        <th className="p-5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">환산가 (KRW)</th>
                        <th className="p-5 text-[10px] font-bold text-slate-500 uppercase tracking-widest">합계 (KRW)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence mode="popLayout">
                        {items.map((item, idx) => (
                          <motion.tr 
                            key={item.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.01 }}
                            className="table-row"
                          >
                            <td className="p-5">
                              <div className="font-bold text-slate-200">{item.name}</div>
                              <div className="text-[10px] text-slate-500 mt-1 uppercase">Ref: {item.id.slice(0, 4)}</div>
                            </td>
                            <td className="p-5"><span className="px-3 py-1 rounded-lg bg-white/5 text-slate-400 text-[11px] font-bold border border-white/5">{item.color}</span></td>
                            <td className="p-5 font-medium">{item.qty.toLocaleString()}</td>
                            <td className="p-5 text-slate-400">¥ {item.unitPriceCNY.toFixed(2)}</td>
                            <td className="p-5">
                               <div className="text-blue-400 font-bold">₩ {item.landedCostKRW.toLocaleString()}</div>
                            </td>
                            <td className="p-5 text-slate-200 font-bold">₩ {item.totalCostKRW.toLocaleString()}</td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <div className="glass p-6">
              <h3 className="text-sm font-bold mb-6 flex items-center gap-2">
                <History className="w-4 h-4 text-blue-500" />
                최근 작업 이력
              </h3>
              <div className="space-y-4">
                {logs.length > 0 ? logs.map((log, i) => (
                  <div key={i} className="flex gap-4 items-start p-3 rounded-xl hover:bg-white/5 transition-colors group">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <FileUp className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-200 truncate w-32 group-hover:text-blue-400 transition-colors">{log.file_name}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{new Date(log.created_at).toLocaleDateString()} · {log.item_count} items</div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-8">
                    <div className="text-[10px] text-slate-600 uppercase font-bold">No history available</div>
                  </div>
                )}
              </div>
              <button className="w-full mt-6 py-3 rounded-xl border border-white/5 text-[10px] font-bold text-slate-400 hover:bg-white/5 transition-all flex items-center justify-center gap-2">
                View All Activity <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="glass-card p-6 overflow-hidden relative group">
              <div className="relative z-10">
                <h3 className="text-sm font-bold mb-2">Cloud Backup</h3>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">모든 작업 내역은 Supabase 클라우드에 안전하게 보관됩니다.</p>
                <div className="flex -space-x-2">
                  {[1,2,3].map(i => <div key={i} className="w-6 h-6 rounded-full border-2 border-slate-900 bg-slate-800" />)}
                  <div className="w-6 h-6 rounded-full border-2 border-slate-900 bg-blue-500 flex items-center justify-center text-[8px] font-bold">+12</div>
                </div>
              </div>
              <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-blue-500/10 blur-2xl rounded-full group-hover:bg-blue-500/20 transition-all" />
            </div>
          </aside>
        </section>
      </main>

      <footer className="py-20 border-t border-white/5 bg-black/20">
        <div className="max-w-7xl mx-auto px-8 flex justify-between items-center text-slate-500 text-[10px] font-bold uppercase tracking-widest">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="w-3 h-3" /> China Declaration Platform
          </div>
          <div className="flex gap-8">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Support</a>
          </div>
          <div>© 2026 Antigravity AI</div>
        </div>
      </footer>
    </div>
  )
}
