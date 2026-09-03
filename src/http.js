// 재시도 포함 fetch
// GitHub Actions 러너(해외 IP)에서 DART/네이버가 간헐적으로 연결을 끊는 경우가 있어
// 지수 백오프 재시도와 브라우저에 가까운 헤더를 기본으로 둔다.

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function fetchRetry(url, options = {}, { tries = 5, baseDelay = 1500, label = '' } = {}) {
  let lastError;

  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) },
        signal: AbortSignal.timeout(30000),
      });

      // 5xx / 429 는 재시도 대상
      if (res.status >= 500 || res.status === 429) {
        throw new Error(`HTTP ${res.status}`);
      }
      return res;
    } catch (e) {
      lastError = e;
      const cause = e.cause?.code || e.name || '';
      console.warn(`[http] ${label || url} 실패 (${attempt}/${tries}): ${e.message} ${cause}`);
      if (attempt < tries) await sleep(baseDelay * 2 ** (attempt - 1));
    }
  }

  throw new Error(`요청 실패: ${label || url} — ${lastError?.message}`);
}
