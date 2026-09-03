// 카드 이미지 렌더링 (Playwright + Chromium)
// Threads 이미지 사양: PNG/JPEG, 너비 320~1440px, 최대 8MB, 화면비 10:1 이내.
// -> CSS 폭 1400px + deviceScaleFactor 1 로 렌더해서 결과물을 1400px에 맞춘다.
import { chromium } from 'playwright';
import { formatKo } from './dates.js';

const CARD_WIDTH = 1400;

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const TAG_COLOR = {
  실적: 'up',
  배당: 'up',
  자사주: 'up',
  수주: 'up',
  'M&A': 'mid',
  증자: 'mid',
  지분: 'mid',
  사채: 'mid',
  지배구조: 'mid',
  자산: 'mid',
  주요사항: 'mid',
  리스크: 'dn',
  해명: 'dn',
  기타: 'mid',
};

export function buildHtml({ picked, meta }) {
  const rows = picked
    .map(
      (d) => `<tr>
      <td class="time">${esc(d.time)}</td>
      <td class="nm">${esc(d.stockName)}</td>
      <td class="tt">${esc(d.title)}${d.extra ? `<span class="extra">${esc(d.extra)}</span>` : ''}</td>
      <td class="tag ${TAG_COLOR[d.tag] || 'mid'}">${esc(d.tag)}</td>
    </tr>`
    )
    .join('');

  const dateLabel = meta.dates.length > 1
    ? `${formatKo(meta.dates[0])} ~ ${formatKo(meta.dates[meta.dates.length - 1])}`
    : formatKo(meta.dates[0]);

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
@import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css');
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Pretendard,-apple-system,'Apple SD Gothic Neo',sans-serif;background:#0b1020;padding:26px;width:${CARD_WIDTH}px}
.card{background:linear-gradient(160deg,#141b30 0%,#0e1424 60%,#111a2e 100%);border:1px solid #24304d;border-radius:24px;padding:30px 34px 22px;box-shadow:0 20px 50px rgba(0,0,0,.5)}
.hd{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:4px}
h1{font-size:34px;font-weight:800;color:#f2f5ff;letter-spacing:-.8px}
h1 .accent{background:linear-gradient(90deg,#6ea8ff,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.sub{font-size:14px;color:#8b98b8;margin-top:7px}
.badge{font-size:12px;font-weight:700;color:#0b1020;background:linear-gradient(90deg,#7dd3fc,#a78bfa);padding:6px 12px;border-radius:999px;white-space:nowrap}
table{width:100%;border-collapse:collapse;margin-top:16px}
th{font-size:12px;font-weight:600;color:#7d8aab;text-align:left;padding:0 0 9px;border-bottom:1px solid #263251}
th.r{text-align:right}
td{padding:9px 0;border-bottom:1px solid #1a2340;font-size:16px;color:#dbe3f7;vertical-align:middle}
tr:last-child td{border-bottom:none}
.time{width:64px;color:#93a2c4;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums}
.nm{width:180px;font-weight:800;color:#9dc0ff;font-size:16px;letter-spacing:-.3px}
.tt{padding-right:16px;font-size:15.5px;color:#e4eaf8;letter-spacing:-.3px;line-height:1.4}
.extra{display:block;font-size:13px;color:#8b98b8;margin-top:2px}
.tag{width:80px;text-align:right;font-size:13px;font-weight:800}
.up{color:#4ade80}.dn{color:#f87171}.mid{color:#93a2c4}
.ft{margin-top:18px;padding-top:12px;border-top:1px solid #1a2340;display:flex;justify-content:space-between;font-size:12px;color:#5f6d90}
</style></head><body>
<div class="card">
  <div class="hd">
    <div>
      <h1>코스피200 <span class="accent">주요공시</span></h1>
      <div class="sub">${esc(dateLabel)} 접수 · 전체 ${meta.total}건 중 코스피200 ${meta.matched}건, 주요 ${picked.length}건</div>
    </div>
    <div class="badge">DART · ${meta.dates[meta.dates.length - 1].replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}</div>
  </div>
  <table>
    <tr><th>시각</th><th>종목</th><th>공시 제목</th><th class="r">구분</th></tr>
    ${rows}
  </table>
  <div class="ft"><span>자료 : DART 전자공시시스템</span><span>정형·경미 공시 제외 · 정보 제공 목적</span></div>
</div></body></html>`;
}

export async function renderCard({ picked, meta, outPath }) {
  const browser = await chromium.launch({ args: ['--font-render-hinting=none'] });
  try {
    const page = await browser.newPage({
      viewport: { width: CARD_WIDTH, height: 1200 },
      deviceScaleFactor: 1, // Threads 이미지 너비 상한(1440px) 때문에 2x를 쓰지 않는다
    });
    await page.setContent(buildHtml({ picked, meta }), { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200); // 웹폰트 로딩 여유
    const buf = await page.locator('.card').screenshot({ type: 'png', path: outPath });

    const box = await page.locator('.card').boundingBox();
    if (box.width > 1440) throw new Error(`카드 폭이 Threads 상한을 넘습니다: ${box.width}px`);
    if (box.height / box.width > 10) throw new Error('카드 화면비가 10:1을 넘습니다');

    return { buffer: buf, width: Math.round(box.width), height: Math.round(box.height) };
  } finally {
    await browser.close();
  }
}
