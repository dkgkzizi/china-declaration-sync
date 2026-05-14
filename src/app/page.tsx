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
  Database
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
  
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Check Supabase connection
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

      // Log to Supabase if connected
      if (dbStatus === 'connected') {
        await supabase.from('upload_logs').insert({
            file_name: f.name,
            item_count: extracted.length,
            total_qty: extracted.reduce((acc, i) => acc + i.qty, 0)
        });
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
    
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = { type: 'pattern', pattern:'solid', fgColor:{argb:'FFE2E8F0'} };

    const buffer = await workbook.xlsx.writeBuffer();
    saveAs(new Blob([buffer]), `신고단가_${file?.name || '결과'}.xlsx`);
  };

  return (
    <div className="max-w-6xl mx-auto p-8">
      <header className="text-center py-16">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-3 mb-6"
        >
          <div className="badge badge-success">V2.0 CLOUD SYNC</div>
          <ChevronRight className="w-4 h-4 text-slate-500" />
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <Database className={`w-3 h-3 ${dbStatus === 'connected' ? 'text-emerald-500' : 'text-slate-600'}`} /> 
            {dbStatus === 'connected' ? 'Supabase Connected' : 'Local Mode'}
          </div>
        </motion.div>
        <motion.h1
          className="text-6xl font-black tracking-tighter mb-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
        >
          CHINA <span className="text-blue-500">DECLARATION</span> SYNC
        </motion.h1>
        <motion.p
          className="text-slate-400 text-xl max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          중국 패킹리스트에서 세관 신고용 단가를 자동으로 추출하고 관리하세요.
          실시간 클라우드 동기화와 원화 환산 기능을 제공합니다.
        </motion.p>
      </header>

      <main>
        {!file ? (
          <motion.div 
            className={`glass p-12 text-center cursor-pointer upload-card ${isDragging ? 'border-blue-500 bg-blue-500/10' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              accept=".xlsx, .xls"
            />
            <div className="flex flex-col items-center gap-4">
              <div className="p-6 rounded-3xl bg-blue-500/10 text-blue-500">
                <FileUp className="w-16 h-16" />
              </div>
              <div>
                <h3 className="text-2xl font-bold mb-1">엑셀 파일 업로드</h3>
                <p className="text-slate-400">신고 단가를 추출할 파일을 드래그하세요</p>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="space-y-8">
            <div className="glass p-8 grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase"><DollarSign className="w-3 h-3 inline mr-1" /> 기준 환율</label>
                  <input 
                    className="bg-slate-900/50 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-all"
                    type="number" 
                    value={exchangeRate} 
                    onChange={(e) => setExchangeRate(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase"><Ship className="w-3 h-3 inline mr-1" /> 비례 배분 물류비</label>
                  <input 
                    className="bg-slate-900/50 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-all"
                    type="number" 
                    value={shippingCost} 
                    onChange={(e) => setShippingCost(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-500 uppercase"><ShieldCheck className="w-3 h-3 inline mr-1" /> 신고 관세율 (%)</label>
                  <input 
                    className="bg-slate-900/50 border border-white/10 p-3 rounded-xl text-white outline-none focus:border-blue-500 transition-all"
                    type="number" 
                    value={customsRate} 
                    onChange={(e) => setCustomsRate(Number(e.target.value))}
                  />
                </div>
            </div>

            <div className="flex justify-between items-center">
              <div className="flex gap-4">
                <div className="glass px-4 py-2 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-bold">{items.length}개 상품</span>
                </div>
                <div className="glass px-4 py-2 flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-bold">
                    총 {items.reduce((acc, i) => acc + i.qty, 0).toLocaleString()}개
                  </span>
                </div>
              </div>
              <div className="flex gap-3">
                <button className="btn glass px-4 py-2 flex items-center gap-2" onClick={() => { setFile(null); setItems([]); }}>
                  <RefreshCcw className="w-4 h-4" /> 재업로드
                </button>
                <button className="btn-primary px-6 py-2 rounded-xl font-bold flex items-center gap-2" onClick={handleExport}>
                  <Download className="w-4 h-4" /> 엑셀 다운로드
                </button>
              </div>
            </div>

            <div className="glass overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-white/5">
                  <tr>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">상품 정보</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">색상</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">수량</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">신고 단가 (CNY)</th>
                    <th className="p-4 text-xs font-bold text-slate-500 uppercase">원화 환산가 (KRW)</th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence mode="popLayout">
                    {items.map((item, idx) => (
                      <motion.tr 
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.02 }}
                        className="border-t border-white/5 hover:bg-white/5 transition-colors"
                      >
                        <td className="p-4 font-bold">{item.name}</td>
                        <td className="p-4"><span className="badge glass">{item.color}</span></td>
                        <td className="p-4">{item.qty.toLocaleString()}</td>
                        <td className="p-4 text-slate-300">¥ {item.unitPriceCNY.toFixed(2)}</td>
                        <td className="p-4 text-blue-400 font-bold">
                          ₩ {item.landedCostKRW.toLocaleString()}
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-32 py-12 border-t border-white/5 text-center text-slate-500 text-sm">
        <p>© 2026 China Declaration Sync. Connected to Vercel & Supabase.</p>
      </footer>
    </div>
  )
}
