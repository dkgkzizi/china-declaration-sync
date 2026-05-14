'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { RefreshCcw, Download, Printer, CheckCircle2, XCircle, ArrowRightLeft, Globe, Package, Home } from 'lucide-react';

interface RowItem {
  id: string;
  name: string;
  color: string;
  size: string;
  qty: number;
}

export default function Page() {
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<RowItem[]>([]);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setError('');
    setRows([]);
    setFileName(file.name);
    setLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      let headerRowIdx = -1;
      let nameCol = -1, colorCol = -1;
      let sizeStartCol = -1;
      let sizeLabels: string[] = [];

      for (let r = 0; r < raw.length; r++) {
        const rowStr = raw[r].map((c: any) => String(c ?? '').trim());
        const nameIdx = rowStr.indexOf('품명');
        if (nameIdx !== -1) {
          headerRowIdx = r;
          nameCol = nameIdx;
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

      if (headerRowIdx === -1) {
        setError('"품명" 컬럼을 찾지 못했습니다. 파일을 확인해주세요.');
        setLoading(false);
        return;
      }

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

      if (result.length === 0) setError('데이터를 추출하지 못했습니다.');
      else setRows(result);
    } catch (e: any) {
      setError(`오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="flex h-screen bg-[#f8f9fc] overflow-hidden">

      {/* ─── 좌측 사이드바 ─── */}
      <aside className="w-56 bg-white border-r border-slate-100 flex flex-col flex-shrink-0">
        {/* 로고 */}
        <div className="px-6 pt-8 pb-6 border-b border-slate-100">
          <div className="text-2xl font-black text-red-500 tracking-tight">ozkiz</div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Logistics Center</div>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-4 py-6 space-y-1">
          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 mb-3">Logistic Management</p>

          <NavItem icon={<Home className="w-4 h-4" />} label="국내 패킹리스트" sub="LOCAL HUB" active={false} />
          <NavItem icon={<Package className="w-4 h-4" />} label="중국 패킹리스트" sub="CHINA BRANCH" active={true} />
          <NavItem icon={<Globe className="w-4 h-4" />} label="인도 패킹리스트" sub="GLOBAL MATCHER" active={false} />
        </nav>

        {/* 하단 버튼 */}
        <div className="p-4 border-t border-slate-100">
          <button className="w-full py-3 rounded-xl bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-widest">
            🔒 Update Locked
          </button>
        </div>
      </aside>

      {/* ─── 메인 영역 ─── */}
      <main className="flex-1 overflow-y-auto p-10">

        {/* 상단 헤더 */}
        <div className="mb-10">
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            <span>Category 2</span>
            <span>›</span>
            <span className="text-red-500">📈 AI China Sync</span>
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">
            CHINA <span className="text-red-500">PACKING</span>
          </h1>
          <p className="text-slate-500 text-sm mt-2">
            중국 제작 지시서를 AI가 신시간으로 교정하고<br />
            <strong>수량 정합성 검증</strong>을 마친 부불성 엑셀 파일을 생성합니다.
          </p>
        </div>

        <div className="flex gap-6 items-start">

          {/* ─── 좌측 패널: 업로드 + 버튼 ─── */}
          <div className="w-64 flex-shrink-0 space-y-3">
            {/* 파일 업로드 카드 */}
            <div
              onClick={() => fileRef.current?.click()}
              className="bg-white rounded-3xl border-2 border-dashed border-slate-200 hover:border-red-400 transition-all cursor-pointer p-8 flex flex-col items-center gap-3 text-center"
            >
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
              />
              <div className="w-16 h-16 bg-red-500 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/30">
                {loading
                  ? <RefreshCcw className="w-7 h-7 text-white animate-spin" />
                  : <span className="text-2xl">📋</span>
                }
              </div>
              <div>
                <div className="font-bold text-slate-700 text-sm">
                  {fileName ? 'Excel Loaded' : 'Upload Excel'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 font-medium truncate w-44">
                  {fileName || 'Click to select file'}
                </div>
              </div>
            </div>

            {/* 액션 버튼들 */}
            <button className="w-full py-4 rounded-2xl bg-[#1a1c21] text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#2d3139] transition-all">
              <ArrowRightLeft className="w-4 h-4" /> SYNC CHINA DATA
            </button>
            <button className="w-full py-4 rounded-2xl bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all">
              <Download className="w-4 h-4" /> DOWNLOAD FINAL EXCEL
            </button>
            <button className="w-full py-4 rounded-2xl bg-white border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-50 transition-all">
              <Printer className="w-4 h-4" /> PRINT PALLET LABELS
            </button>
          </div>

          {/* ─── 우측 패널: 결과 ─── */}
          <div className="flex-1 space-y-4">

            {/* 요약 카드 */}
            <div className="bg-white rounded-3xl p-6 border border-slate-100 flex items-center gap-8">
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center text-red-500">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-2">China Integrity Summary</div>
                <div className="flex items-end gap-10">
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">Original Qty</div>
                    <div className="text-3xl font-black text-slate-800">{totalQty.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">DB Matched</div>
                    <div className="text-3xl font-black text-red-500">{totalQty.toLocaleString()}</div>
                  </div>
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="flex items-center gap-1 text-emerald-500 font-bold text-xs justify-end">
                  <CheckCircle2 className="w-3.5 h-3.5" /> VERIFIED
                </div>
                <div className="text-[9px] text-slate-400 mt-1 uppercase italic tracking-wider">Factory-to-Cloud Str...</div>
              </div>
            </div>

            {/* 결과 테이블 카드 */}
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
              {/* 테이블 헤더 */}
              <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="text-red-500 text-sm">📈</span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">China Production Stream</span>
                </div>
                <div className="flex items-center gap-3">
                  <button className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center text-slate-400 hover:bg-slate-100">
                    <RefreshCcw className="w-3.5 h-3.5" />
                  </button>
                  <button className="px-4 py-1.5 bg-red-50 text-red-500 text-[10px] font-black rounded-lg uppercase hover:bg-red-100">
                    오즈키즈
                  </button>
                </div>
              </div>

              {error && (
                <div className="mx-8 my-4 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-sm font-semibold">
                  {error}
                </div>
              )}

              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-50">
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Master SKU</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">Detail Matrix</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Qty Score</th>
                    <th className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Valid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-24 text-center text-slate-300 text-sm font-bold uppercase tracking-widest">
                        No Data Available
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                        <td className="px-8 py-5 text-sm font-bold text-slate-500">미매칭</td>
                        <td className="px-8 py-5">
                          <div className="inline-block px-2 py-0.5 bg-red-50 text-red-400 text-[9px] font-black rounded mb-1 uppercase">
                            Ref: {row.name}
                          </div>
                          <div className="text-base font-black text-slate-800 leading-tight">{row.name}</div>
                          <div className="text-[10px] text-slate-400 font-medium mt-0.5">{row.size} / {row.color || '-'}</div>
                        </td>
                        <td className="px-8 py-5 text-center">
                          <span className="text-lg font-black text-slate-700">{row.qty}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center justify-center gap-2">
                            <button className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-300 hover:border-red-300 hover:text-red-500 transition-colors">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button className="w-7 h-7 rounded-full border border-slate-200 flex items-center justify-center text-slate-300 hover:border-slate-400 transition-colors">
                              <XCircle className="w-4 h-4" />
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
      </main>
    </div>
  );
}

function NavItem({ icon, label, sub, active }: { icon: React.ReactNode; label: string; sub: string; active: boolean }) {
  return (
    <div className={`flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all ${active ? 'bg-red-50' : 'hover:bg-slate-50'}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${active ? 'bg-red-500 text-white shadow-md shadow-red-500/30' : 'bg-slate-100 text-slate-400'}`}>
        {icon}
      </div>
      <div>
        <div className={`text-xs font-bold ${active ? 'text-red-500' : 'text-slate-600'}`}>{label}</div>
        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{sub}</div>
      </div>
      {active && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-red-500" />}
    </div>
  );
}
