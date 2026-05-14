'use client';

import { useState, useRef } from 'react';
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
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // 수동 매칭 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const parseAndMatch = async (f: File) => {
    setFile(f); setError(''); setItems([]); setLoading(true);
    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      let headerRowIdx = -1, nameCol = -1, colorCol = -1;
      let sizeCols: { col: number; label: string }[] = [];

      for (let r = 0; r < raw.length; r++) {
        const rowStr = raw[r].map((c: any) => String(c ?? '').trim());
        const nameIdx = rowStr.findIndex((c: any) => {
          if (!c) return false;
          const str = String(c).replace(/\s/g, '');
          return str === '품명' || str === 'ITEM' || str.includes('품명');
        });

        if (nameIdx !== -1) {
          headerRowIdx = r; nameCol = nameIdx;
          colorCol = rowStr.findIndex((c: any) => {
            if (!c) return false;
            const str = String(c).replace(/\s/g, '');
            return str.includes('칼라') || str.includes('색상') || str.includes('COLOR');
          });

          // 1. 현재 행에서 사이즈 컬럼(숫자 또는 S/M/L) 찾기
          for (let c = nameIdx + 1; c < rowStr.length; c++) {
            const v = String(rowStr[c] ?? '').trim();
            if (!v) continue;
            if (/^\d{2,3}$/.test(v) || ['S','M','L','XL','FREE', 'F'].includes(v.toUpperCase())) {
              sizeCols.push({ col: c, label: v });
            }
          }

          // 2. 현재 행에서 사이즈를 못 찾았다면, 다음 행 확인 (2줄 병합 헤더인 경우)
          if (sizeCols.length === 0 && r + 1 < raw.length) {
            const nextRowStr = raw[r + 1].map((c: any) => String(c ?? '').trim());
            for (let c = 0; c < nextRowStr.length; c++) {
              const v = String(nextRowStr[c] ?? '').trim();
              if (!v) continue;
              if (/^\d{2,3}$/.test(v) || ['S','M','L','XL','FREE', 'F'].includes(v.toUpperCase())) {
                sizeCols.push({ col: c, label: v });
              }
            }
            if (sizeCols.length > 0) {
              headerRowIdx = r + 1; // 데이터는 다음 행부터 시작
            }
          }
          break;
        }
      }

      if (headerRowIdx === -1) throw new Error('"품명" 컬럼을 찾지 못했습니다. 엑셀 형식을 확인해주세요.');

      const extracted: any[] = [];
      for (let r = headerRowIdx + 1; r < raw.length; r++) {
        const row = raw[r];
        if (!row) continue;
        const name = String(row[nameCol] ?? '').trim();
        const color = colorCol >= 0 ? String(row[colorCol] ?? '').trim() : '';
        if (!name || name === '합계' || name.includes('TOTAL')) continue;
        
        if (sizeCols.length > 0) {
          sizeCols.forEach(({ col, label }) => {
            const cellValue = String(row[col] ?? '0').replace(/[^\d]/g, '');
            const qty = parseInt(cellValue || '0', 10);
            if (qty > 0) {
              extracted.push({ style: name, color, size: label, qty });
            }
          });
        }
      }

      if (extracted.length === 0) throw new Error('유효한 데이터를 추출하지 못했습니다.');

      const res = await fetch('/api/china/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: extracted, fileName: f.name })
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
    items.forEach(item => ws.addRow(item));
    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf]), `신고단가_${file?.name || '결과'}.xlsx`);
  };

  const totalQty = items.reduce((s, r) => s + r.qty, 0);
  const matchedQty = items.filter(i => i.isMatched).reduce((s, r) => s + r.qty, 0);

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
                    onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) parseAndMatch(f); }}
                    onClick={() => fileRef.current?.click()}
                    className={`relative h-72 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all duration-300 cursor-pointer ${
                      isDragging ? 'border-red-500 bg-red-50/30' : file ? 'border-red-100 bg-red-50/10' : 'border-slate-100 bg-slate-50 hover:bg-red-50/50'
                    }`}
                  >
                    <input ref={fileRef} type="file" className="hidden" accept=".xlsx,.xls" onChange={e => e.target.files?.[0] && parseAndMatch(e.target.files[0])} />
                    <div className="flex flex-col items-center text-center p-6">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all duration-500 ${file ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-white border border-slate-100 text-slate-300'}`}>
                        {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <FileSpreadsheet className="w-8 h-8" />}
                      </div>
                      <h4 className="text-slate-900 font-black text-base tracking-tight mb-1">{file ? 'Excel Loaded' : 'Upload China List'}</h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 italic truncate max-w-full">{file ? file.name : 'XLSX OR XLS FILE'}</p>
                    </div>
                  </div>
                  <div className="mt-6 space-y-3">
                    <button onClick={() => fileRef.current?.click()} className="w-full py-4 px-6 rounded-2xl bg-[#1a1c21] text-white font-black text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-[#2d3139] transition-all">
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
              <div className="lg:col-span-8 space-y-6">
                {/* 요약 */}
                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50">
                  <div className="flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center text-red-500">
                      <ArrowRightLeft className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-2">China Integrity Summary</div>
                      <div className="flex items-end gap-10">
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Original Qty</div>
                          <div className="text-3xl font-black text-slate-800">{totalQty.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">DB Matched</div>
                          <div className="text-3xl font-black text-red-600">{matchedQty.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                    {items.length > 0 && totalQty === matchedQty && (
                      <div className="ml-auto flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5 text-emerald-500 font-black text-xs">
                          <CheckCircle2 className="w-4 h-4" /> VERIFIED
                        </div>
                        <div className="text-[9px] text-slate-400 uppercase italic tracking-wider">Factory-to-Cloud Str...</div>
                      </div>
                    )}
                  </div>
                </div>

                {error && (
                  <div className="bg-red-50 border border-red-100 rounded-2xl p-5 flex items-center gap-3 text-red-600 font-semibold text-sm">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" /> {error}
                  </div>
                )}

                {/* 결과 테이블 */}
                <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-xl shadow-slate-200/50 overflow-hidden">
                  <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-red-500" />
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">China Production Stream</span>
                    </div>
                    {items.length > 0 && <span className="text-[10px] font-bold text-slate-400">{items.length}개 항목</span>}
                  </div>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-slate-50">
                        {['Master SKU', 'Detail Matrix', 'Qty Score', 'Valid'].map(h => (
                          <th key={h} className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr><td colSpan={4} className="px-8 py-32 text-center text-slate-300 text-sm font-bold uppercase tracking-widest">좌측에서 패킹리스트 파일을 업로드하세요</td></tr>
                      ) : items.map((item, idx) => (
                        <tr key={item.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                          <td className="px-8 py-5">
                            <span className={`text-sm font-bold ${item.isMatched ? 'text-slate-700' : 'text-red-400'}`}>
                              {item.isMatched ? item.matchedCode : '미매칭'}
                            </span>
                          </td>
                          <td className="px-8 py-5">
                            <div className="inline-block px-2 py-0.5 bg-red-50 text-red-400 text-[9px] font-black rounded mb-1 uppercase">REF: {item.style}</div>
                            <div className="text-base font-black text-slate-800 leading-tight">{item.matchedName}</div>
                            <div className="text-[10px] text-slate-400 font-medium mt-0.5 uppercase">{item.size} / {item.color || '-'}</div>
                          </td>
                          <td className="px-8 py-5"><span className="text-lg font-black text-slate-700">{item.qty}</span></td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-2">
                              {item.isMatched
                                ? <div className="w-7 h-7 rounded-full border border-emerald-200 flex items-center justify-center text-emerald-500"><CheckCircle2 className="w-4 h-4" /></div>
                                : <div className="w-7 h-7 rounded-full border border-red-200 flex items-center justify-center text-red-400"><AlertCircle className="w-4 h-4" /></div>
                              }
                              <button
                                onClick={() => { setEditIdx(idx); setModalOpen(true); setSearchTerm(''); setSearchResults([]); }}
                                className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-300 hover:border-blue-300 hover:text-blue-500 transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
