// 영업일 판정 및 대상 기간 계산
// 거래일 여부는 삼성전자(005930) 일봉에 해당 날짜 캔들이 존재하는지로 판정한다.
// 공휴일 캘린더를 따로 관리하지 않아도 되고, 임시 휴장에도 자동으로 대응된다.

import { fetchRetry } from './http.js';

const KST = 'Asia/Seoul';

export function nowKst() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: KST }));
}

export function ymd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function formatKo(yyyymmdd) {
  const y = +yyyymmdd.slice(0, 4);
  const m = +yyyymmdd.slice(4, 6);
  const d = +yyyymmdd.slice(6, 8);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일(${dow})`;
}

// 최근 거래일 목록을 네이버 일봉에서 가져온다 (최신순)
export async function recentTradingDays(days = 30) {
  const end = ymd(nowKst());
  const start = ymd(addDays(nowKst(), -(days + 20)));
  const url = `https://api.finance.naver.com/siseJson.naver?symbol=005930&requestType=1&startTime=${start}&endTime=${end}&timeframe=day`;
  const res = await fetchRetry(
    url,
    { headers: { Referer: 'https://finance.naver.com/' } },
    { label: '거래일 조회' }
  );
  if (!res.ok) throw new Error(`거래일 조회 실패: HTTP ${res.status}`);
  const rows = JSON.parse((await res.text()).replace(/'/g, '"')).slice(1);
  return rows.map((r) => String(r[0])).sort().reverse();
}

/**
 * 수집 대상 날짜 목록을 정한다.
 * - 오늘(실행일) 이전의 가장 최근 거래일을 찾는다
 * - 그 거래일부터 어제까지의 모든 달력 날짜를 대상으로 한다
 *   (월요일 실행 -> 금/토/일, 화요일 실행 -> 월, 연휴 뒤 -> 직전 거래일~어제)
 */
export async function resolveTargetDates() {
  const today = ymd(nowKst());
  const trading = await recentTradingDays();
  const lastTradingDay = trading.find((d) => d < today);
  if (!lastTradingDay) throw new Error('직전 거래일을 찾지 못했습니다');

  const dates = [];
  let cur = new Date(
    +lastTradingDay.slice(0, 4),
    +lastTradingDay.slice(4, 6) - 1,
    +lastTradingDay.slice(6, 8)
  );
  const yesterday = addDays(nowKst(), -1);
  while (ymd(cur) <= ymd(yesterday)) {
    dates.push(ymd(cur));
    cur = addDays(cur, 1);
  }
  return { lastTradingDay, dates, today };
}
