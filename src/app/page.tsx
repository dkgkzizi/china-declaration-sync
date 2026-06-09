'use client';

import { useState, useRef, useMemo } from 'react';
import { FileSpreadsheet, ChevronRight, TrendingUp, Download, RefreshCcw, Loader2, ArrowRightLeft, CheckCircle2, AlertCircle, Lock, Search, X, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

interface MatchedItem {
  id: string;
  style: string;
  matchedCode: string;
  matchedName: string;
  color: string;
  size: string;
  qty: number;
  isMatched: boolean;
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MatchedItem[]>([]);
  const [invoiceData, setInvoiceData] = useState<{name: string, qty: number, unitPrice: number}[]>([]);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 수동 매칭 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const pivotItems = useMemo(() => {
    const isNameMatch = (pName: string, iName: string) => {
      if (!pName || !iName) return false;
      if (pName.includes(iName) || iName.includes(pName)) return true;
      for (let i = 0; i <= iName.length - 2; i++) {
        if (pName.includes(iName.substring(i, i + 2))) return true;
      }
      return false;
    };

    const isPackingNoMatch = (pNo: string, boxNoStr: string) => {
      if (!pNo || !boxNoStr) return false;
      const s1 = String(pNo).replace(/\s/g, '');
      const s2 = String(boxNoStr).replace(/\s/g, '');
      if (s1 === s2) return true;
      
      const parseRange = (str: string) => {
        if (str.includes('-') || str.includes('~')) {
          const parts = str.split(/[-~]/);
          return { s: parseInt(parts[0], 10), e: parseInt(parts[1], 10) };
        }
        const val = parseInt(str.replace(/[^0-9]/g, ''), 10);
        return { s: val, e: val };
      };

      if (s2.includes(',')) {
        const parts = s2.split(',');
        const pRange = parseRange(s1);
        for (const p of parts) {
          const bRange = parseRange(p);
          if (!isNaN(pRange.s) && !isNaN(bRange.s)) {
            if (pRange.s >= bRange.s && pRange.s <= bRange.e) return true;
          }
        }
        return false;
      }

      const pRange = parseRange(s1);
      const bRange = parseRange(s2);

      if (!isNaN(pRange.s) && !isNaN(pRange.e) && !isNaN(bRange.s) && !isNaN(bRange.e)) {
         if (pRange.s >= bRange.s && pRange.s <= bRange.e) return true;
      }

      return false;
    };

    const summaryData: Record<string, any> = {};

    items.forEach(item => {
      const key = item.style;
      if (!summaryData[key]) {
        summaryData[key] = {
          style: item.style,
          matchedName: item.matchedName || item.style,
          qty: 0,
          packingNos: new Set<string>()
        };
      }
      if (item.packingNo) {
        summaryData[key].packingNos.add(item.packingNo);
      }
      summaryData[key].qty += item.qty;
    });

    const invoiceGrouped: { name: string, qty: number, unitPrice: number, boxNo: string }[] = [];
    invoiceData.forEach(inv => {
      invoiceGrouped.push({ ...inv });
    });

    return Object.values(summaryData).map((pItem: any) => {
      const pNos = Array.from(pItem.packingNos) as string[];
      
      let matches = invoiceGrouped.filter(g => pNos.some(pNo => isPackingNoMatch(pNo, g.boxNo)));
      
      if (matches.length === 0) {
        matches = invoiceGrouped.filter(g => isNameMatch(pItem.matchedName, g.name));
      }

      let unitPrice = 0;
      
      if (matches.length === 1) {
        unitPrice = matches[0].unitPrice;
      } else if (matches.length > 1) {
        const nameMatch = matches.filter(g => isNameMatch(pItem.matchedName, g.name));
        if (nameMatch.length === 1) {
           unitPrice = nameMatch[0].unitPrice;
        } else if (nameMatch.length > 1) {
           unitPrice = nameMatch[0].unitPrice;
        } else {
           const groupedMatches: Record<string, any> = {};
           matches.forEach(m => {
             if (!groupedMatches[m.name]) groupedMatches[m.name] = { ...m, qty: 0 };
             groupedMatches[m.name].qty += m.qty;
           });
           const exactQtyMatch = Object.values(groupedMatches).find(g => g.qty === pItem.qty);
           unitPrice = exactQtyMatch ? exactQtyMatch.unitPrice : matches[0].unitPrice;
        }
      }

      return {
        ...pItem,
        unitPrice,
        totalPrice: unitPrice > 0 ? pItem.qty * unitPrice : 0
      };
    });
  }, [items, invoiceData]);

  const totalQty = items.reduce((s, r) => s + r.qty, 0);
  const matchedQty = items.filter(i => i.isMatched).reduce((s, r) => s + r.qty, 0);
  const grandTotalPrice = pivotItems.reduce((acc, curr) => acc + curr.totalPrice, 0);

  const parseAndMatch = async (f: File) => {
    setError(''); setItems([]); setInvoiceData([]); setLoading(true);
    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      
      let invoiceExtracted: { name: string, qty: number, unitPrice: number, boxNo: string }[] = [];
      try {
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const firstSheetData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as any[][];
        let nameCol = -1, qtyCol = -1, priceCol = -1, boxNoCol = -1;
        let lastName = "";
        let lastPrice = NaN;
        let lastBoxNo = "";
        
        for (let i = 0; i < firstSheetData.length; i++) {
          const row = firstSheetData[i];
          if (!Array.isArray(row)) continue;
          
          if (nameCol === -1) {
            row.forEach((cell, idx) => {
              const cStr = String(cell || "").replace(/\s/g, '');
              if (cStr === '품명') nameCol = idx;
              else if (cStr === '총수량' || cStr === '수량') qtyCol = idx;
              else if (cStr === '신고단가') priceCol = idx;
              else if (cStr === '박스번호' || cStr === '패킹NO.' || cStr === '패킹번호') boxNoCol = idx;
            });
            continue;
          }

          if (nameCol !== -1 && qtyCol !== -1 && priceCol !== -1) {
            let name = String(row[nameCol] || "").trim();
            const qtyStr = String(row[qtyCol] || "0").replace(/[^0-9]/g, '');
            const qty = parseInt(qtyStr, 10);
            
            const priceStr = String(row[priceCol] || "");
            let price = parseFloat(priceStr.replace(/[^0-9.]/g, ''));
            let boxNo = boxNoCol !== -1 ? String(row[boxNoCol] || "").trim() : "";
            
            if (qty > 0) {
              if (!name && lastName) name = lastName;
              else if (name) lastName = name;

              if (isNaN(price) && !isNaN(lastPrice)) price = lastPrice;
              else if (!isNaN(price)) lastPrice = price;

              if (!boxNo && lastBoxNo) boxNo = lastBoxNo;
              else if (boxNo) lastBoxNo = boxNo;
            } else {
              if (name && !name.includes('품명') && !name.includes('합계')) lastName = name;
              if (!isNaN(price) && price > 0) lastPrice = price;
              if (boxNo) lastBoxNo = boxNo;
            }

            if (name && qty > 0 && !isNaN(price)) {
              if (!name.includes('품명') && !name.includes('합계') && !name.includes('TOTAL')) {
                invoiceExtracted.push({ name, qty, unitPrice: price, boxNo });
              }
            }
          }
        }
      } catch (e) {
        console.error("첫번째 시트 파싱 에러:", e);
      }
      setInvoiceData(invoiceExtracted);

      let clientExtractedData: any[] = [];
      const sheetsToProcess = wb.SheetNames.slice(1);
      const allTableData: { hasPackingNo: boolean, data: any[] }[] = [];

      sheetsToProcess.forEach(sheetName => {
          const worksheet = wb.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          if (jsonData.length === 0) return;

          const headerRows: { rowIdx: number, nameCol: number, colorCol: number, totalCol: number, sizeStartCol: number, sizeEndCol: number, isMatrix: boolean, packingNoCol: number }[] = [];
          
          jsonData.forEach((row, idx) => {
              if (!Array.isArray(row)) return;
              const rowStr = row.join('|');
              if (rowStr.includes('품명') && (rowStr.includes('합계') || rowStr.includes('수량') || rowStr.includes('TOTAL'))) {
                  let nameCol = -1, colorCol = -1, totalCol = -1, sizeStartCol = -1, sizeEndCol = -1, packingNoCol = -1;
                  row.forEach((cell, cellIdx) => {
                      const c = String(cell || "").trim().toUpperCase().replace(/\s/g, '');
                      if (c === '품명' || c === 'ITEM' || c.includes('품명')) nameCol = cellIdx;
                      else if (c === '칼라' || c === '색상' || c.includes('COLOR')) colorCol = cellIdx;
                      else if (c === '합계' || c === '소계' || c === '총계' || c === '수량' || c === '총수량' || c === 'TOTAL') totalCol = cellIdx;
                      else if (c.includes('사이즈')) sizeStartCol = cellIdx;
                      else if (c === '패킹NO.' || c === '박스번호' || c === '패킹번호' || c === '패킹NO') packingNoCol = cellIdx;
                  });
                  
                  let isMatrix = false;
                  let matrixSizeStart = -1;
                  const nextRow = jsonData[idx + 1] || [];
                  
                  if (colorCol !== -1) {
                      for (let i = colorCol + 1; i < Math.max(row.length, nextRow.length); i++) {
                          if (i === totalCol) continue;
                          const hStr = String(row[i] || "").trim();
                          const nStr = String(nextRow[i] || "").trim();
                          if ((hStr.match(/[0-9]/) || nStr.match(/[0-9]/)) && !hStr.includes('수량') && !nStr.includes('수량') && !hStr.includes('합계') && !nStr.includes('합계')) {
                              matrixSizeStart = i;
                              isMatrix = true;
                              break;
                          }
                      }
                  }
                  
                  if (isMatrix) {
                      sizeStartCol = matrixSizeStart;
                      sizeEndCol = 200; 
                      if (totalCol !== -1 && sizeStartCol < totalCol) {
                          sizeEndCol = totalCol - 1;
                      }
                  } else {
                      sizeEndCol = sizeStartCol;
                  }
                  
                  if (nameCol !== -1) {
                      headerRows.push({ rowIdx: idx, nameCol, colorCol, totalCol, sizeStartCol, sizeEndCol, isMatrix, packingNoCol });
                  }
              }
          });

          headerRows.forEach((header: any, hIdx: number) => {
              let lastName = "";
              let lastColor = "";
              let lastPackingNo = "";
              
              const headerRowData = jsonData[header.rowIdx];
              const nextRow = jsonData[header.rowIdx + 1];
              const currentHeaderHasSizes = headerRowData.slice(header.sizeStartCol).some(c => String(c).match(/[0-9]/));
              const isTwoStepHeader = !currentHeaderHasSizes && nextRow && nextRow.slice(header.sizeStartCol).some(c => String(c).match(/[0-9]/));
              
              const sizeHeaderRowIdx = isTwoStepHeader ? header.rowIdx + 1 : header.rowIdx;
              const dataStartRowIdx = isTwoStepHeader ? header.rowIdx + 2 : header.rowIdx + 1;
              const nextHeaderRowIdx = hIdx + 1 < headerRows.length ? headerRows[hIdx + 1].rowIdx : jsonData.length;

              const tableItems: any[] = [];

              for (let rIdx = dataStartRowIdx; rIdx < nextHeaderRowIdx; rIdx++) {
                  const row = jsonData[rIdx];
                  if (!row || !Array.isArray(row)) break;
                  
                  const rowStrAll = row.join('|');
                  if (rIdx > dataStartRowIdx && rowStrAll.includes('품명') && rowStrAll.includes('칼라') && (rowStrAll.includes('합계') || rowStrAll.includes('수량'))) {
                      continue; 
                  }

                  const fullRowStr = row.join('|');
                  if (fullRowStr.includes('합계') || fullRowStr.includes('TOTAL') || fullRowStr.includes('소계') || fullRowStr.includes('총계') || fullRowStr.includes('총수량')) {
                      continue; 
                  }
                  
                  let nameOriginal = String(row[header.nameCol] || "").trim();
                  let colorOriginal = String(row[header.colorCol] || "").trim();

                  if (!nameOriginal && !colorOriginal) {
                      const hasTotalQty = header.totalCol !== -1 && parseInt(String(row[header.totalCol] || "0").replace(/[^0-9]/g, '')) > 0;
                      if (hasTotalQty) continue;
                  }

                  let currentName = nameOriginal;
                  if (!currentName && lastName) {
                      currentName = lastName;
                  } else if (currentName) {
                      if (currentName !== lastName) lastColor = "";
                      lastName = currentName;
                  }

                  if (!currentName) continue;

                  let packingNo = header.packingNoCol !== -1 ? String(row[header.packingNoCol] || "").trim() : "";
                  if (!packingNo && lastPackingNo) {
                      packingNo = lastPackingNo;
                  } else if (packingNo) {
                      lastPackingNo = packingNo;
                  }
                  
                  let color = String(row[header.colorCol] || "").trim();
                  if (!color && lastColor) {
                      color = lastColor;
                  } else {
                      lastColor = color;
                  }
                  
                  let totalQty = header.totalCol !== -1 ? (parseInt(String(row[header.totalCol] || "0").replace(/[^0-9]/g, '')) || 0) : 0;
                  
                  if (totalQty > 0 || row.slice(header.sizeStartCol, header.sizeEndCol + 1).some(c => parseInt(String(c||'0').replace(/[^0-9]/g,''))>0)) {
                      if (header.isMatrix) {
                          let foundSizes = false;
                          for (let sIdx = header.sizeStartCol; sIdx <= header.sizeEndCol; sIdx++) {
                              const sVal = parseInt(String(row[sIdx] || "0").replace(/[^0-9]/g, ''));
                              if (sVal > 0) {
                                  let sHeader = String(jsonData[sizeHeaderRowIdx]?.[sIdx] || "").trim();
                                  if (!sHeader || sHeader.includes('사이즈')) sHeader = "FREE";
                                  
                                  tableItems.push({ 
                                      style: currentName, 
                                      color: color, 
                                      size: sHeader, 
                                      qty: sVal,
                                      packingNo
                                  });
                                  foundSizes = true;
                              }
                          }
                          
                          if (!foundSizes && totalQty > 0) {
                              tableItems.push({ 
                                  style: currentName, 
                                  color: color, 
                                  size: "FREE", 
                                  qty: totalQty,
                                  packingNo
                              });
                          }
                      } else {
                          const sizeStr = header.sizeStartCol !== -1 ? String(row[header.sizeStartCol] || "FREE").trim() : "FREE";
                          tableItems.push({ 
                              style: currentName, 
                              color: color, 
                              size: sizeStr, 
                              qty: totalQty,
                              packingNo
                          });
                      }
                  }
              }
              if (tableItems.length > 0) {
                  allTableData.push({ hasPackingNo: header.packingNoCol !== -1, data: tableItems });
              }
          });
      });

      const hasAnyPackingNo = allTableData.some(t => t.hasPackingNo);
      allTableData.forEach(t => {
          if (hasAnyPackingNo && !t.hasPackingNo) return;
          clientExtractedData.push(...t.data);
      });

      if (clientExtractedData.length === 0) {
          throw new Error("엑셀 파일의 탭에서 유효한 데이터를 찾지 못했습니다.");
      }

      const res = await fetch('/api/china/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: clientExtractedData, fileName: f.name })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || '매칭 실패');
      setItems(data.items.map((item: any, i: number) => ({ ...item, id: `item-${i}` })));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (val: string) => {
    setSearchTerm(val);
    if (val.length < 2) { setSearchResults([]); return; }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/china/search?q=${encodeURIComponent(val)}`);
      const data = await res.json();
      if (data.success) setSearchResults(data.items);
    } catch (e) { console.error(e); }
    finally { setSearchLoading(false); }
  };

  const selectProduct = async (selected: any) => {
    if (editIdx === null) return;
    const targetStyle = items[editIdx].style;
    const updated = items.map((item, idx) => {
      if (item.style !== targetStyle) return item;
      return { ...item, matchedCode: selected.productCode, matchedName: selected.matchedName, isMatched: true };
    });
    setItems(updated);
    setModalOpen(false); setSearchTerm(''); setSearchResults([]);

    // AI 학습
    fetch('/api/china/learn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalStyle: targetStyle,
        matchedName: selected.matchedName,
        productCode: selected.productCode,
        color: items[editIdx].color,
        size: items[editIdx].size
      })
    }).catch(console.error);
  };

  const handleDownload = async () => {
    const wb = new ExcelJS.Workbook();
    
    // 1. 피벗 테이블 형태의 요약 시트 추가
    const summaryWs = wb.addWorksheet('Sheet1');
    summaryWs.columns = [
      { header: '행 레이블', key: 'productName', width: 30 },
      { header: '합계 : 수량', key: 'totalQty', width: 15 },
      { header: '신고단가', key: 'unitPrice', width: 15 },
      { header: '신고금액', key: 'totalPrice', width: 15 },
    ];
    summaryWs.getRow(1).font = { bold: true };

    pivotItems.forEach(pItem => {
      const row = summaryWs.addRow({ 
        productName: pItem.matchedName, 
        totalQty: pItem.qty,
        unitPrice: pItem.unitPrice > 0 ? pItem.unitPrice : null,
        totalPrice: pItem.totalPrice > 0 ? pItem.totalPrice : null
      });

      if (pItem.unitPrice > 0) {
        row.getCell('unitPrice').numFmt = '"$"#,##0.00';
        row.getCell('totalPrice').numFmt = '"$"#,##0.00';
      }
    });

    const totalRow = summaryWs.addRow({ 
      productName: '총합계', 
      totalQty: totalQty,
      unitPrice: null,
      totalPrice: grandTotalPrice > 0 ? grandTotalPrice : null
    });
    totalRow.font = { bold: true };
    if (grandTotalPrice > 0) {
      totalRow.getCell('totalPrice').numFmt = '"$"#,##0.00';
    }

    // 2. 상세 데이터 시트 (신고단가결과)
    const ws = wb.addWorksheet('신고단가결과');
    ws.columns = [
      { header: '상품코드', key: 'matchedCode', width: 20 },
      { header: '상품명', key: 'matchedName', width: 40 },
      { header: '색상', key: 'color', width: 15 },
      { header: '사이즈', key: 'size', width: 12 },
      { header: '수량', key: 'qty', width: 10 },
    ];
    const hRow = ws.getRow(1);
    hRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE53E3E' } };
    
    items.forEach(item => {
      ws.addRow({
        ...item,
        matchedName: item.matchedName || item.style
      });
    });

    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf]), `신고단가_${file?.name || '결과'}.xlsx`);
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-red-100 selection:text-red-900 overflow-x-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-red-100/30 blur-[180px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-rose-200/20 blur-[180px] rounded-full" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* 사이드바 */}
        <nav className="w-80 border-r border-slate-200 sticky top-0 h-screen p-10 flex flex-col bg-white/70 backdrop-blur-2xl">
          <div className="mb-16">
            <h1 className="text-5xl font-black tracking-[-0.05em] text-red-600 leading-none">ozkiz</h1>
            <span className="text-[10px] font-black text-slate-400 tracking-[0.4em] uppercase mt-3 ml-0.5 block">Declaration Sync</span>
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-1">Declaration System</p>
            <div className="w-full flex items-center gap-4 p-4 rounded-2xl bg-red-50 border border-slate-200 shadow-sm">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white text-red-600 shadow-md">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-black text-slate-900 tracking-tight leading-none mb-1">중국 신고단가</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">China Declaration</span>
              </div>
              <div className="ml-auto"><ChevronRight className="w-4 h-4 text-red-600" /></div>
            </div>
          </div>
          <div className="mt-auto space-y-4">
            <button className="w-full flex items-center gap-3 p-4 rounded-2xl border font-bold text-[10px] uppercase tracking-[0.2em] bg-slate-100 text-slate-400 border-slate-200">
              <Lock className="w-3 h-3" /> Update Locked
            </button>
            <div className="p-6 bg-slate-950 rounded-3xl shadow-xl border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none mb-1">Production: Active</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">OZ-Integrity Secured</span>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* 메인 */}
        <section className="flex-1 p-16 overflow-y-auto">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="px-3 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest border border-red-100">CATEGORY 1</div>
                <ChevronRight className="w-4 h-4 text-slate-300" />
                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <TrendingUp className="w-3 h-3 text-red-600" /> China Declaration Sync
                </div>
              </div>
              <h1 className="text-4xl font-black tracking-tighter text-gray-900 mb-2">
                CHINA <span className="text-red-600">DECLARATION</span>
              </h1>
              <p className="text-slate-400 font-bold max-w-2xl leading-relaxed text-sm">
                중국 패킹리스트를 AI가 실시간으로 교정하고<br />
                <span className="text-red-600 font-black">Supabase 매핑 데이터</span>와 자동 매칭하여 신고단가를 산출합니다.
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* 업로드 카드 */}
              <div className="lg:col-span-4">
                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 hover:shadow-2xl transition-all">
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) setFile(f); }}
                    onClick={() => fileRef.current?.click()}
                    className={`relative h-72 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all duration-300 cursor-pointer ${
                      isDragging ? 'border-red-500 bg-red-50/30' : file ? 'border-red-100 bg-red-50/10' : 'border-slate-100 bg-slate-50 hover:bg-red-50/50'
                    }`}
                  >
                    <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={e => e.target.files?.[0] && setFile(e.target.files[0])} />
                    <div className="flex flex-col items-center text-center p-6">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all duration-500 ${file ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-white border border-slate-100 text-slate-300'}`}>
                        {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <FileSpreadsheet className="w-8 h-8" />}
                      </div>
                      <h4 className="text-slate-900 font-black text-base tracking-tight mb-1">{file ? 'Excel Loaded' : 'Upload China List'}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 italic truncate max-w-full">{file ? file.name : 'XLSX OR XLS FILE'}</p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-3">
                    <button onClick={() => file && parseAndMatch(file)} disabled={!file || loading} className="w-full py-4 px-6 rounded-2xl bg-[#1a1c21] text-white font-black text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-[#2d3139] transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                      <ArrowRightLeft className="w-4 h-4" /> START EXTRACTION
                    </button>
                    <button onClick={handleDownload} disabled={items.length === 0} className="w-full py-4 px-6 rounded-2xl bg-red-600 text-white font-black text-xs tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-red-200 hover:bg-red-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                      <Download className="w-4 h-4" /> DOWNLOAD FINAL EXCEL
                    </button>
                    {file && (
                      <button onClick={() => { setFile(null); setItems([]); setError(''); }} className="w-full py-4 px-6 rounded-2xl border border-slate-200 text-slate-500 font-black text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-slate-50 transition-all">
                        <RefreshCcw className="w-4 h-4" /> RESET
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 결과 패널 */}
              <div className="lg:col-span-8 space-y-4">
                {/* 요약 */}
                <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-lg shadow-slate-200/50">
                  <div className="flex items-center gap-5">
                    <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-500">
                      <ArrowRightLeft className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1.5">China Integrity Summary</div>
                      <div className="flex items-end gap-8">
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Original Qty</div>
                          <div className="text-2xl font-black text-slate-800">{totalQty.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">DB Matched</div>
                          <div className="text-2xl font-black text-red-600">{matchedQty.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                    {items.length > 0 && totalQty === matchedQty && (
                      <div className="ml-auto flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5 text-emerald-500 font-black text-[10px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED
                        </div>
                        <div className="text-[8px] text-slate-400 uppercase italic tracking-wider">Factory-to-Cloud Str...</div>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-4 flex items-center gap-3 text-red-600 font-semibold text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" /> {error}
                  </div>
                )}

                {/* 결과 테이블 */}
                <div className="bg-white border border-slate-200 rounded-[2rem] shadow-lg shadow-slate-200/50 overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-red-500" />
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">China Production Stream</span>
                    </div>
                    {items.length > 0 && <span className="text-[9px] font-bold text-slate-400">{items.length}개 항목</span>}
                  </div>
                  <div className="max-h-[600px] overflow-y-auto relative styled-scrollbar">
                    <table className="w-full text-left">
                      <thead className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 shadow-sm border-b border-slate-100">
                        <tr>
                          {['Product Name', 'Total Qty', 'Unit Price', 'Total Price'].map(h => (
                            <th key={h} className="px-5 py-2.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pivotItems.length === 0 ? (
                          <tr><td colSpan={4} className="px-5 py-24 text-center text-slate-300 text-xs font-bold uppercase tracking-widest">좌측에서 패킹리스트 파일을 업로드하세요</td></tr>
                        ) : pivotItems.map((item, idx) => (
                          <tr key={item.style} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                            <td className="px-5 py-3">
                              <div className="inline-block px-1.5 py-0.5 bg-red-50 text-red-400 text-[8px] font-black rounded mb-0.5 uppercase">REF: {item.style}</div>
                              <div className="text-sm font-black text-slate-800 leading-tight">{item.matchedName}</div>
                            </td>
                            <td className="px-5 py-3"><span className="text-base font-black text-slate-700">{item.qty}</span></td>
                            <td className="px-5 py-3">
                              {item.unitPrice > 0 ? (
                                <span className="text-sm font-bold text-slate-600">${item.unitPrice.toFixed(2)}</span>
                              ) : (
                                <span className="text-xs font-medium text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-5 py-3">
                              {item.totalPrice > 0 ? (
                                <span className="text-sm font-black text-slate-800">${item.totalPrice.toFixed(2)}</span>
                              ) : (
                                <span className="text-xs font-medium text-slate-300">-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                        {pivotItems.length > 0 && (
                          <tr className="bg-slate-50/80 border-t-2 border-slate-200">
                            <td className="px-5 py-4 text-right text-xs font-black text-slate-500 uppercase tracking-widest">TOTAL</td>
                            <td className="px-5 py-4"><span className="text-lg font-black text-slate-800">{totalQty.toLocaleString()}</span></td>
                            <td className="px-5 py-4"></td>
                            <td className="px-5 py-4"><span className="text-lg font-black text-red-600">${grandTotalPrice.toFixed(2)}</span></td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* 수동 매칭 모달 */}
      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-3xl p-10 max-w-lg w-full shadow-2xl border border-slate-200 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">수동 상품 매칭</h3>
                {editIdx !== null && <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">REF: {items[editIdx]?.style}</p>}
              </div>
              <button onClick={() => setModalOpen(false)} className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text" value={searchTerm} onChange={e => handleSearch(e.target.value)}
                placeholder="상품명, 상품코드, 옵션 검색..."
                className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 bg-slate-50 font-semibold text-sm focus:outline-none focus:border-red-300 focus:bg-white transition-all"
                autoFocus
              />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {searchLoading ? (
                <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> 검색 중...</div>
              ) : searchResults.length === 0 ? (
                <div className="text-center py-10 text-slate-300 text-sm font-bold uppercase tracking-widest">{searchTerm.length < 2 ? '검색어를 입력하세요' : '검색 결과 없음'}</div>
              ) : searchResults.map((r, i) => (
                <button key={i} onClick={() => selectProduct(r)}
                  className="w-full text-left p-4 rounded-2xl border border-slate-100 hover:border-red-200 hover:bg-red-50/50 transition-all group"
                >
                  <div className="font-black text-slate-800 group-hover:text-red-600 transition-colors">{r.matchedName}</div>
                  <div className="flex gap-3 mt-1">
                    <span className="text-[10px] font-bold text-blue-500 uppercase">{r.productCode}</span>
                    {r.option && <span className="text-[10px] font-bold text-slate-400 uppercase">{r.option}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
