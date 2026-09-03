// DART 전체공시 (하루치) 수집
// https://dart.fss.or.kr/dsac001/mainAll.do 는 API 키 없이 조회 가능한 공개 목록 페이지다.
// 한 페이지 100건, 평일 하루 300~500건 수준.

import { fetchRetry } from './http.js';

const MAX_PAGES = 12;
const PAGE_DELAY_MS = 400;

const clean = (s) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

export async function fetchDartDay(yyyymmdd) {
  const out = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url =
      `https://dart.fss.or.kr/dsac001/mainAll.do?selectDate=${yyyymmdd}` +
      `&sort=&series=&mdayCnt=0&currentPage=${page}`;
    const res = await fetchRetry(
      url,
      { headers: { Referer: 'https://dart.fss.or.kr/dsac001/mainAll.do' } },
      { label: `DART ${yyyymmdd} p${page}` }
    );
    if (!res.ok) throw new Error(`DART 조회 실패 (${yyyymmdd} p${page}): HTTP ${res.status}`);
    const html = await res.text();

    let added = 0;
    for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const tds = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
      if (tds.length < 4) continue;

      // 회사명 앞의 시장구분(유/코/넥/기) 접두와 뒤의 " IR" 접미를 제거
      const corp = clean(tds[1])
        .replace(/^(유|코|넥|기)\s+/, '')
        .replace(/\s+IR$/, '')
        .trim();

      out.push({
        date: yyyymmdd,
        time: clean(tds[0]),
        corp,
        title: clean(tds[2]),
        submitter: clean(tds[3]),
        rcp: (tr[1].match(/rcpNo=(\d+)/) || [])[1] || null,
      });
      added++;
    }

    if (added === 0) break;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }

  return out;
}

export async function fetchDartDays(dates) {
  const all = [];
  for (const d of dates) {
    all.push(...(await fetchDartDay(d)));
  }
  return all;
}

export function dartUrl(rcp) {
  return `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${rcp}`;
}
