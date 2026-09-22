// 코스피200 구성종목
//
// 원래는 네이버 finance.naver.com/sise/entryJongmok.naver 를 긁었으나 2026-09 에
// HTTP 410(Gone) 으로 폐지됐다. 네이버 신규 API 는 "지수의 구성종목을 서비스하지 않는
// 지수입니다" 를 반환하고, KRX 정보데이터시스템은 봇 트래픽을 차단한다(실제 브라우저로도
// 에러 페이지). KRX 공식 OpenAPI 에도 지수 구성종목 API 가 없다.
//
// 대신 KODEX 200 ETF 의 PDF(Portfolio Deposit File, 납입자산구성내역)를 쓴다.
// KODEX 200 은 코스피200 을 추종하므로 보유종목이 곧 구성종목이고, 매 영업일 갱신된다.
//
// 지수 자체가 아니라 추종 ETF 의 보유내역이라는 점은 감안해야 한다. 정기변경 전후로
// 지수와 며칠 어긋날 수 있고, 현금성 자산이 섞여 들어온다(코드 길이로 걸러낸다).
//
// 원격 조회가 실패하면 마지막으로 저장해둔 data/kospi200.json 으로 넘어간다.
// 소스가 또 막혀도 봇이 즉시 죽지 않게 하기 위한 것이다.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRetry } from './http.js';

const PDF_URL = 'https://m.samsungfund.com/api/v1/kodex/product/2ETF01.do';
const CACHE_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'data',
  'kospi200.json'
);
const MIN_COUNT = 150;
/// 캐시가 이 기간을 넘기면 정기변경을 놓쳤을 수 있어 경고한다.
const STALE_DAYS = 14;

/// PDF 목록에서 종목만 골라낸다. 현금성 자산은 itmNo 가 'KRD010010001' 처럼 길다.
/// 분할 신설법인의 임시코드('0126Z0')도 6자리라 함께 통과한다.
function toStocks(list) {
  const map = new Map();
  for (const row of list || []) {
    const code = String(row?.itmNo || '').trim();
    const name = String(row?.secNm || '').trim();
    if (code.length !== 6 || !name) continue;
    map.set(code, { code, name });
  }
  return [...map.values()];
}

async function fetchFromPdf() {
  const res = await fetchRetry(PDF_URL, { headers: { Referer: 'https://www.samsungfund.com/' } }, {
    label: 'KODEX200 PDF',
  });
  if (!res.ok) throw new Error(`KODEX200 PDF 조회 실패: HTTP ${res.status}`);

  const data = await res.json();
  const stocks = toStocks(data?.pdf?.list);
  if (stocks.length < MIN_COUNT) {
    throw new Error(`KODEX200 PDF 종목 수가 비정상입니다: ${stocks.length}종`);
  }
  return { stocks, basisDate: String(data?.pdf?.gijunYMD || '') };
}

async function readCache() {
  const payload = JSON.parse(await fs.readFile(CACHE_FILE, 'utf8'));
  const stocks = (payload.stocks || []).filter((s) => s?.code?.length === 6 && s?.name);
  if (stocks.length < MIN_COUNT) {
    throw new Error(`캐시 종목 수가 비정상입니다: ${stocks.length}종`);
  }
  return { stocks, basisDate: String(payload.basisDate || payload.updatedAt || '') };
}

export async function fetchKospi200() {
  try {
    const { stocks, basisDate } = await fetchFromPdf();
    console.log(`[kospi200] KODEX200 PDF ${basisDate} 기준 ${stocks.length}종`);
    return stocks;
  } catch (e) {
    console.warn(`[kospi200] 원격 조회 실패(${e.message}). 저장된 목록으로 진행합니다.`);
  }

  const { stocks, basisDate } = await readCache().catch((e) => {
    throw new Error(
      `코스피200 목록을 원격·캐시 모두에서 얻지 못했습니다: ${e.message}\n` +
        'scripts/update-kospi200.js 로 목록을 갱신하세요.'
    );
  });

  const parsed = Date.parse(
    /^\d{8}$/.test(basisDate)
      ? `${basisDate.slice(0, 4)}-${basisDate.slice(4, 6)}-${basisDate.slice(6)}`
      : basisDate
  );
  const ageDays = Number.isFinite(parsed) ? Math.floor((Date.now() - parsed) / 86400000) : null;
  if (ageDays !== null && ageDays > STALE_DAYS) {
    console.warn(`[kospi200] 저장된 목록이 ${ageDays}일 전(${basisDate}) 기준입니다.`);
  }
  console.log(`[kospi200] 저장된 목록 ${basisDate} 기준 ${stocks.length}종`);
  return stocks;
}

// 회사명 정규화: 공백/(주)/주식회사 제거해 매칭 정확도를 높인다
export function normalizeName(name) {
  return name
    .replace(/\(주\)|주식회사/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export const __test = { toStocks };
