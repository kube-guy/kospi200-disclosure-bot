// 코스피200 구성종목 (네이버 금융)
// 응답이 euc-kr 이라 반드시 TextDecoder('euc-kr')로 디코딩해야 한다.

const PAGES = 21; // 페이지당 10종목

export async function fetchKospi200() {
  const map = new Map();

  for (let page = 1; page <= PAGES; page++) {
    const res = await fetch(`https://finance.naver.com/sise/entryJongmok.naver?&page=${page}`, {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com/' },
    });
    if (!res.ok) throw new Error(`코스피200 조회 실패 (page ${page}): HTTP ${res.status}`);
    const html = new TextDecoder('euc-kr').decode(Buffer.from(await res.arrayBuffer()));

    // 주의: /code=(\d{6})">/ 처럼 `">`를 강제하면 0건이 나온다. `"[^>]*>` 를 쓸 것.
    for (const m of html.matchAll(/code=(\d{6})"[^>]*>([^<]+)<\/a>/g)) {
      map.set(m[1], { code: m[1], name: m[2].trim() });
    }
  }

  const list = [...map.values()];
  if (list.length < 150) {
    throw new Error(`코스피200 종목 수가 비정상입니다: ${list.length}종`);
  }
  return list;
}

// 회사명 정규화: 공백/(주)/주식회사 제거해 매칭 정확도를 높인다
export function normalizeName(name) {
  return name
    .replace(/\(주\)|주식회사/g, '')
    .replace(/\s+/g, '')
    .trim();
}
