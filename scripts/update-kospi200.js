// data/kospi200.json 캐시를 갱신한다.
//
// 평소에는 src/kospi200.js 가 KODEX 200 PDF 를 직접 조회하므로 이 스크립트가 필요 없다.
// 이 캐시는 그 소스가 막혔을 때 봇이 즉시 죽지 않도록 두는 안전망이다.
//
// 사용법:
//   node scripts/update-kospi200.js            KODEX 200 PDF 에서 받아 캐시 갱신
//   node scripts/update-kospi200.js 목록.csv   파일에서 읽어 캐시 갱신 (수동 대체)
//   pbpaste | node scripts/update-kospi200.js -
//
// 파일 입력은 형식을 가리지 않는다. 한 줄에 6자리 종목코드와 종목명이 함께 있으면 읽는다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fetchKospi200 } from '../src/kospi200.js';

const OUT = path.join('data', 'kospi200.json');
const MIN_COUNT = 150;

function parseText(text) {
  const map = new Map();

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const codeMatch = line.match(/(?<!\d)(\d{6})(?!\d)/);
    if (!codeMatch) continue;
    const code = codeMatch[1];

    // 코드를 뺀 나머지 칸 중 '이름다운' 것을 고른다. HTS 마다 칸 순서가 달라
    // 위치로 특정하지 않는다. NAVER·KT·S-Oil 처럼 한글이 없는 종목명도 있으므로
    // 한글을 요구하지 않고, 숫자·기호뿐인 칸(시세·등락률 등)만 걸러낸다.
    const name = line
      .split(/[\t,;|]|\s{2,}/)
      .map((cell) => cell.trim().replace(/^["']|["']$/g, ''))
      .filter((cell) => {
        if (!cell) return false;
        if (cell === code || cell === `A${code}`) return false;
        if (!/[가-힣A-Za-z]/.test(cell)) return false; // 숫자·기호뿐인 칸 제외
        if (/^[+-]?[\d,.]+%?$/.test(cell)) return false; // 시세·등락률
        return true;
      })
      .sort((a, b) => b.length - a.length)[0];

    if (!name) continue;
    map.set(code, { code, name });
  }

  return [...map.values()];
}

async function main() {
  const arg = process.argv[2];
  let stocks;
  let source;

  if (!arg) {
    stocks = await fetchKospi200();
    source = 'KODEX200 PDF';
  } else {
    const text = arg === '-' ? await readStdin() : await fs.readFile(arg, 'utf8');
    stocks = parseText(text);
    source = arg === '-' ? 'stdin' : arg;
  }

  if (stocks.length < MIN_COUNT) {
    throw new Error(
      `추출된 종목이 ${stocks.length}종입니다(최소 ${MIN_COUNT}). ` +
        '종목코드 6자리와 종목명이 같은 줄에 있는지 확인하세요.'
    );
  }

  stocks.sort((a, b) => a.code.localeCompare(b.code));
  const payload = {
    basisDate: new Date().toISOString().slice(0, 10),
    source,
    count: stocks.length,
    note: 'src/kospi200.js 의 원격 조회가 실패했을 때 쓰는 안전망입니다.',
    stocks,
  };

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(payload, null, 2) + '\n');

  console.log(`${OUT} 갱신 완료: ${stocks.length}종 (${source})`);
  console.log('앞 5종:', stocks.slice(0, 5).map((s) => `${s.code} ${s.name}`).join(', '));
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let buf = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
    process.stdin.on('error', reject);
  });
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
