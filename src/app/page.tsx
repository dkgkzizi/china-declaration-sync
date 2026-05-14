'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';

interface RowItem {
  id: string;
  name: string;
  color: string;
  size: string;
  qty: number;
}

export default function Home() {
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

      // 1) 헤더 행 찾기: "품명" 이 있는 행
      let headerRowIdx = -1;
      let nameCol = -1, colorCol = -1;
      let sizeStartCol = -1;
      let sizeLabels: string[] = [];

      for (let r = 0; r < raw.length; r++) {
        const row = raw[r];
        const rowStr = row.map((c: any) => String(c ?? '').trim());
        const nameIdx = rowStr.indexOf('품명');
        if (nameIdx !== -1) {
          headerRowIdx = r;
          nameCol = nameIdx;
          // 칼라 컬럼 찾기
          const colorIdx = rowStr.findIndex((c: string) => c === '칼라' || c === '색상');
          colorCol = colorIdx;

          // 사이즈 컬럼 찾기 (숫자 or S/M/L/FREE)
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

      if (headerRowIdx === -1 || nameCol === -1) {
        setError('엑셀에서 "품명" 컬럼을 찾지 못했습니다. 파일 형식을 확인해주세요.');
        setLoading(false);
        return;
      }

      // 2) 데이터 행 파싱
      const result: RowItem[] = [];
      for (let r = headerRowIdx + 1; r < raw.length; r++) {
        const row = raw[r];
        const name = String(row[nameCol] ?? '').trim();
        const color = colorCol >= 0 ? String(row[colorCol] ?? '').trim() : '';

        if (!name) continue;

        if (sizeStartCol !== -1 && sizeLabels.length > 0) {
          // 사이즈별 수량 파싱
          sizeLabels.forEach((size, i) => {
            const qty = parseInt(String(row[sizeStartCol + i] ?? '0').replace(/[^\d]/g, ''));
            if (qty > 0) {
              result.push({ id: `${r}-${i}`, name, color, size, qty });
            }
          });
        } else {
          // 합계 컬럼만 있는 경우
          const totalCol = raw[headerRowIdx].findIndex((c: any) => String(c ?? '').includes('합계'));
          const qty = parseInt(String(row[totalCol] ?? '0').replace(/[^\d]/g, ''));
          if (qty > 0) {
            result.push({ id: `${r}`, name, color, size: 'FREE', qty });
          }
        }
      }

      if (result.length === 0) {
        setError('데이터를 추출하지 못했습니다. 파일을 확인해주세요.');
      } else {
        setRows(result);
      }
    } catch (e: any) {
      setError(`오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* 헤더 */}
        <div>
          <h1 className="text-3xl font-black text-slate-800">중국 신고단가 추출</h1>
          <p className="text-slate-500 mt-1">중국 패킹리스트 엑셀 파일을 업로드하면 상품 데이터를 자동으로 추출합니다.</p>
        </div>

        {/* 업로드 영역 */}
        <div
          onClick={() => fileRef.current?.click()}
          className="bg-white rounded-2xl border-2 border-dashed border-slate-300 hover:border-blue-500 transition-colors cursor-pointer p-16 flex flex-col items-center gap-4"
        >
          <input
            type="file"
            ref={fileRef}
            accept=".xlsx,.xls"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
          {loading ? (
            <p className="text-blue-500 font-bold text-lg animate-pulse">파일 분석 중...</p>
          ) : (
            <>
              <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center text-3xl">📂</div>
              <p className="text-xl font-bold text-slate-700">엑셀 파일 클릭하여 업로드</p>
              <p className="text-sm text-slate-400">.xlsx 또는 .xls 파일 지원</p>
              {fileName && <p className="text-sm text-blue-500 font-semibold">✓ {fileName}</p>}
            </>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-red-600 font-semibold">
            {error}
          </div>
        )}

        {/* 결과 */}
        {rows.length > 0 && (
          <div className="space-y-4">
            {/* 요약 */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-800">추출 결과</h2>
                <p className="text-sm text-slate-500">{fileName} · 총 {rows.length}행 · 합계 {totalQty.toLocaleString()}개</p>
              </div>
            </div>

            {/* 테이블 */}
            <div className="bg-white rounded-2xl overflow-hidden border border-slate-200">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">#</th>
                    <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">품명</th>
                    <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">색상</th>
                    <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider">사이즈</th>
                    <th className="px-6 py-4 font-bold text-slate-600 uppercase text-xs tracking-wider text-right">수량</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 text-slate-400 text-xs">{idx + 1}</td>
                      <td className="px-6 py-3 font-semibold text-slate-800">{row.name}</td>
                      <td className="px-6 py-3 text-slate-600">{row.color || '-'}</td>
                      <td className="px-6 py-3 text-slate-600">{row.size}</td>
                      <td className="px-6 py-3 text-right font-bold text-blue-600">{row.qty.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 border-t border-slate-200">
                    <td colSpan={4} className="px-6 py-4 font-bold text-slate-700 text-right">합계</td>
                    <td className="px-6 py-4 font-black text-blue-700 text-right">{totalQty.toLocaleString()}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
