'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { RefreshCcw, Download, FileSpreadsheet, CheckCircle2, XCircle, TrendingUp } from 'lucide-react';

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

      if (result.length === 0) setError('데이터를 추출하지 못했습니다. 파일을 확인해주세요.');
      else setRows(result);
    } catch (e: any) {
      setError(`오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="flex h-screen bg-[#f5f6fa] overflow-hidden">

      {/* ── 좌측 패널 ── */}
      <aside className="w-72 flex-shrink-0 bg-white border-r border-slate-100 flex flex-col p-8 gap-6">
        {/* 브랜드 */}
        <div className="pb-6 border-b border-slate-100">
          <div className="text-2xl font-black text-red-500 tracking-tight leading-none">ozkiz</div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Declaration Sync</div>
        </div>

        {/* 업로드 카드 */}
        <div
          onClick={() => fileRef.current?.click()}
          className="rounded-3xl border-2 border-dashed border-slate-200 hover:border-red-400 transition-all cursor-pointer p-8 flex flex-col items-center gap-4 text-center"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          <div className="w-16 h-16 bg-red-500 rounded-2xl flex items-center justify-center shadow-lg shadow-red-500/25">
            {loading
              ? <RefreshCcw className="w-7 h-7 text-white animate-spin" />
              : <FileSpreadsheet className="w-7 h-7 text-white" />
            }
          </div>
          <div>
            <div className="font-bold text-slate-700 text-sm">
              {fileName ? '파일 업로드 완료' : '패킹리스트 업로드'}
            </div>
            <div className="text-[10px] text-slate-400 mt-1 font-medium break-all">
              {fileName || '클릭하여 엑셀 파일 선택'}
            </div>
          </div>
        </div>

        {/* 다운로드 버튼 */}
        <button
          disabled={rows.length === 0}
          className="w-full py-4 rounded-2xl bg-red-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-red-500/20 hover:bg-red-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" /> 결과 엑셀 다운로드
        </button>

        {/* 파일 다시 선택 */}
        {fileName && (
          <button
            onClick={() => { setRows([]); setFileName(''); setError(''); }}
            className="w-full py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-500 font-bold text-xs flex items-center justify-center gap-2 hover:bg-slate-100 transition-all"
          >
            <RefreshCcw className="w-3.5 h-3.5" /> 초기화
          </button>
        )}
      </aside>

      {/* ── 메인 콘텐츠 ── */}
      <main className="flex-1 overflow-y-auto p-10 space-y-6">

        {/* 페이지 제목 */}
        <div>
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <TrendingUp className="w-3 h-3 text-red-500" /> 중국 신고단가 추출 시스템
          </div>
          <h1 className="text-4xl font-black text-slate-800 tracking-tight">
            CHINA <span className="text-red-500">DECLARATION</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2">
            중국 패킹리스트 엑셀을 업로드하면 품명 · 색상 · 사이즈 · 수량을 자동 추출합니다.
          </p>
        </div>

        {/* 요약 카드 */}
        <div className="bg-white rounded-3xl border border-slate-100 p-8 flex items-center gap-12">
          <div>
            <div className="text-[9px] font-black text-red-400 uppercase tracking-widest mb-3">추출 요약</div>
            <div className="flex items-end gap-10">
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">총 라인 수</div>
                <div className="text-3xl font-black text-slate-800">{rows.length.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[9px] font-bold text-slate-400 uppercase mb-1">총 수량</div>
                <div className="text-3xl font-black text-red-500">{totalQty.toLocaleString()}</div>
              </div>
            </div>
          </div>
          {rows.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-emerald-500 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" /> 추출 완료
            </div>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-red-600 text-sm font-semibold">
            {error}
          </div>
        )}

        {/* 결과 테이블 */}
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <TrendingUp className="w-3.5 h-3.5 text-red-500" /> 추출 데이터 목록
            </div>
            <div className="text-[10px] font-bold text-slate-400">{rows.length > 0 ? `${rows.length}개 항목` : ''}</div>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-50">
                {['#', '품명', '색상', '사이즈', '수량'].map(h => (
                  <th key={h} className="px-8 py-4 text-[9px] font-black text-slate-400 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-8 py-32 text-center text-slate-300 text-sm font-bold uppercase tracking-widest">
                    좌측에서 엑셀 파일을 업로드하세요
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                    <td className="px-8 py-4 text-xs text-slate-300 font-bold">{idx + 1}</td>
                    <td className="px-8 py-4 font-bold text-slate-800">{row.name}</td>
                    <td className="px-8 py-4 text-slate-500 text-sm">{row.color || '-'}</td>
                    <td className="px-8 py-4">
                      <span className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 uppercase">{row.size}</span>
                    </td>
                    <td className="px-8 py-4 font-black text-red-500 text-base">{row.qty.toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50">
                  <td colSpan={4} className="px-8 py-5 font-black text-slate-600 text-right text-sm uppercase tracking-wider">합계</td>
                  <td className="px-8 py-5 font-black text-red-600 text-lg">{totalQty.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </main>
    </div>
  );
}
