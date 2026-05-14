'use client';

import { useState, useRef } from 'react';
import { 
  FileSpreadsheet, ChevronRight, TrendingUp, Download, 
  RefreshCcw, Loader2, ArrowRightLeft, CheckCircle2, AlertCircle,
  Lock
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface RowItem {
  id: string;
  name: string;
  color: string;
  size: string;
  qty: number;
}

export default function Page() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RowItem[]>([]);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parseAndLoad = async (f: File) => {
    setFile(f);
    setError('');
    setRows([]);
    setLoading(true);
    try {
      const buffer = await f.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      let headerRowIdx = -1, nameCol = -1, colorCol = -1;
      let sizeStartCol = -1;
      let sizeLabels: string[] = [];

      for (let r = 0; r < raw.length; r++) {
        const rowStr = raw[r].map((c: any) => String(c ?? '').trim());
        const nameIdx = rowStr.indexOf('품명');
        if (nameIdx !== -1) {
          headerRowIdx = r; nameCol = nameIdx;
          const colorIdx = rowStr.findIndex((c: string) => c === '칼라' || c === '색상');
          colorCol = colorIdx;
          for (let c = nameIdx + 1; c < rowStr.length; c++) {
            const v = rowStr[c];
            if (/^\d{2,3}$/.test(v) || ['S','M','L','XL','FREE'].includes(v.toUpperCase())) {
              if (sizeStartCol === -1) sizeStartCol = c;
              sizeLabels.push(v);
            }
          }
          break;
        }
      }

      if (headerRowIdx === -1) throw new Error('"품명" 컬럼을 찾지 못했습니다.');

      const result: RowItem[] = [];
      for (let r = headerRowIdx + 1; r < raw.length; r++) {
        const row = raw[r];
        const name = String(row[nameCol] ?? '').trim();
        const color = colorCol >= 0 ? String(row[colorCol] ?? '').trim() : '';
        if (!name || name === '합계') continue;
        if (sizeStartCol !== -1 && sizeLabels.length > 0) {
          sizeLabels.forEach((size, i) => {
            const qty = parseInt(String(row[sizeStartCol + i] ?? '0').replace(/[^\d]/g, ''));
            if (qty > 0) result.push({ id: `${r}-${i}`, name, color, size, qty });
          });
        }
      }
      if (result.length === 0) throw new Error('유효한 데이터를 추출하지 못했습니다. 파일 형식을 확인해주세요.');
      setRows(result);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-red-100 selection:text-red-900 overflow-x-hidden">
      {/* Background Soft Gradients - 원본과 동일 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-red-100/30 blur-[180px] rounded-full" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-rose-200/20 blur-[180px] rounded-full" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* ── 사이드바 (원본과 동일한 구조) ── */}
        <nav className="w-80 border-r border-slate-200 sticky top-0 h-screen p-10 flex flex-col bg-white/70 backdrop-blur-2xl">
          <div className="mb-16">
            <div className="flex items-center gap-3 mb-1 px-1">
              <div className="flex flex-col">
                <h1 className="text-5xl font-black tracking-[-0.05em] text-red-600 leading-none">
                  ozkiz
                </h1>
                <span className="text-[10px] font-black text-slate-400 tracking-[0.4em] uppercase mt-3 ml-0.5">Declaration Sync</span>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-2">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 px-1">Declaration System</p>

            {/* 활성 메뉴 - 중국 신고단가만 */}
            <div className="w-full flex items-center gap-4 p-4 rounded-2xl bg-red-50 border border-slate-200 shadow-sm scale-[1.02]">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-white text-red-600 shadow-md">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-sm font-black text-slate-900 tracking-tight leading-none mb-1">중국 신고단가</span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">China Declaration</span>
              </div>
              <div className="ml-auto">
                <ChevronRight className="w-4 h-4 text-red-600" />
              </div>
            </div>
          </div>

          <div className="mt-auto space-y-4">
            <button className="w-full flex items-center gap-3 p-4 rounded-2xl border transition-all font-bold text-[10px] uppercase tracking-[0.2em] bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-200">
              <Lock className="w-3 h-3" /> Update Locked
            </button>
            <div className="p-6 bg-slate-950 rounded-3xl shadow-xl shadow-slate-200 border border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none mb-1">Production: Active</span>
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest leading-none">OZ-Integrity Secured</span>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* ── 메인 콘텐츠 (원본과 동일한 구조) ── */}
        <section className="flex-1 p-16 max-w-7xl mx-auto overflow-y-auto">
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* 페이지 헤더 */}
            <header className="mb-12">
              <div className="flex items-center gap-3 mb-4">
                <div className="px-3 py-1 rounded-full bg-red-50 text-red-600 text-[10px] font-black uppercase tracking-widest border border-red-100">
                  CATEGORY 1
                </div>
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

              {/* ── 업로드 카드 (원본과 동일한 스타일) ── */}
              <div className="lg:col-span-4">
                <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 transition-all hover:shadow-2xl">
                  <div
                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={e => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files?.[0]; if (f) parseAndLoad(f); }}
                    onClick={() => fileRef.current?.click()}
                    className={`relative h-72 border-2 border-dashed rounded-[2rem] flex flex-col items-center justify-center transition-all duration-300 cursor-pointer ${
                      isDragging ? 'border-red-500 bg-red-50/30' :
                      file ? 'border-red-100 bg-red-50/10' : 'border-slate-100 bg-slate-50 hover:bg-red-50/50'
                    }`}
                  >
                    <input
                      ref={fileRef} type="file" className="hidden"
                      accept=".xlsx,.xls"
                      onChange={e => e.target.files?.[0] && parseAndLoad(e.target.files[0])}
                    />
                    <div className="flex flex-col items-center text-center p-6">
                      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-all duration-500 ${
                        file ? 'bg-red-600 text-white shadow-lg shadow-red-200' : 'bg-white border border-slate-100 text-slate-300'
                      }`}>
                        {loading ? <Loader2 className="w-8 h-8 animate-spin" /> : <FileSpreadsheet className="w-8 h-8" />}
                      </div>
                      <h4 className="text-slate-900 font-black text-base tracking-tight mb-1">
                        {file ? 'Excel Loaded' : 'Upload China List'}
                      </h4>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-4 italic truncate max-w-full">
                        {file ? file.name : 'XLSX OR XLS FILE'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 space-y-3">
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-full py-4 px-6 rounded-2xl bg-[#1a1c21] text-white font-black text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-[#2d3139] transition-all"
                    >
                      <ArrowRightLeft className="w-4 h-4" /> START EXTRACTION
                    </button>
                    <button
                      disabled={rows.length === 0}
                      className="w-full py-4 px-6 rounded-2xl bg-red-600 text-white font-black text-xs tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-red-200 hover:bg-red-700 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Download className="w-4 h-4" /> DOWNLOAD FINAL EXCEL
                    </button>
                    {file && (
                      <button
                        onClick={() => { setFile(null); setRows([]); setError(''); }}
                        className="w-full py-4 px-6 rounded-2xl border border-slate-200 text-slate-500 font-black text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-slate-50 transition-all"
                      >
                        <RefreshCcw className="w-4 h-4" /> RESET
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ── 결과 패널 ── */}
              <div className="lg:col-span-8 space-y-6">

                {/* 요약 카드 */}
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
                          <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Extracted Lines</div>
                          <div className="text-3xl font-black text-red-600">{rows.length.toLocaleString()}</div>
                        </div>
                      </div>
                    </div>
                    {rows.length > 0 && (
                      <div className="ml-auto flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5 text-emerald-500 font-black text-xs">
                          <CheckCircle2 className="w-4 h-4" /> VERIFIED
                        </div>
                        <div className="text-[9px] text-slate-400 uppercase italic tracking-wider">Factory-to-Cloud Str...</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* 에러 */}
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
                    {rows.length > 0 && (
                      <span className="text-[10px] font-bold text-slate-400">{rows.length}개 항목</span>
                    )}
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
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="px-8 py-32 text-center text-slate-300 text-sm font-bold uppercase tracking-widest">
                            좌측에서 패킹리스트 파일을 업로드하세요
                          </td>
                        </tr>
                      ) : (
                        rows.map(row => (
                          <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                            <td className="px-8 py-5 text-sm font-bold text-slate-400">미매칭</td>
                            <td className="px-8 py-5">
                              <div className="inline-block px-2 py-0.5 bg-red-50 text-red-400 text-[9px] font-black rounded mb-1 uppercase">
                                REF: {row.name}
                              </div>
                              <div className="text-base font-black text-slate-800 leading-tight">{row.name}</div>
                              <div className="text-[10px] text-slate-400 font-medium mt-0.5 uppercase">{row.size} / {row.color || '-'}</div>
                            </td>
                            <td className="px-8 py-5">
                              <span className="text-lg font-black text-slate-700">{row.qty}</span>
                            </td>
                            <td className="px-8 py-5">
                              <div className="flex items-center gap-2">
                                <button className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-300 hover:border-red-300 hover:text-red-500 transition-colors">
                                  <CheckCircle2 className="w-4 h-4" />
                                </button>
                                <button className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-300 hover:border-slate-400 transition-colors">
                                  ×
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
