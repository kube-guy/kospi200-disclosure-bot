// 스레드 본문 생성 (규칙 기반, LLM 불필요)
// 제약: 500자 이내, '#' 문자 사용 금지(주제 태그는 API의 topic_tag로 따로 지정)
import { formatKo } from './dates.js';

const SHORT = [
  [/영업\(잠정\)실적|연결재무제표기준영업\(잠정\)실적/, '잠정실적'],
  [/매출액또는손익구조/, '손익구조 변동'],
  [/현금ㆍ현물배당|현금·현물배당|배당결정/, '배당 결정'],
  [/단일판매ㆍ공급계약|단일판매·공급계약|공급계약체결/, '공급계약 체결'],
  [/자기주식취득/, '자사주 취득'],
  [/자기주식처분/, '자사주 처분'],
  [/자기주식/, '자사주 관련'],
  [/유상증자/, '유상증자'],
  [/무상증자/, '무상증자'],
  [/감자결정/, '감자'],
  [/합병/, '합병'],
  [/분할/, '분할'],
  [/영업양수|영업양도/, '영업 양수도'],
  [/타법인주식및출자증권취득/, '타법인 지분 취득'],
  [/타법인주식및출자증권처분/, '타법인 지분 처분'],
  [/전환사채/, '전환사채 발행'],
  [/신주인수권부사채/, 'BW 발행'],
  [/교환사채/, '교환사채 발행'],
  [/조건부자본증권/, '조건부자본증권 발행'],
  [/최대주주변경/, '최대주주 변경'],
  [/풍문또는보도에대한해명/, '풍문·보도 해명'],
  [/조회공시/, '조회공시 답변'],
  [/소송/, '소송'],
  [/유형자산/, '유형자산 거래'],
  [/주요사항보고서/, '주요사항보고서'],
];

function shortTitle(title) {
  for (const [re, label] of SHORT) if (re.test(title)) return label;
  return title.replace(/^\[기재정정\]\s*/, '').slice(0, 18);
}

export function buildCaption({ picked, meta }) {
  const dateLabel =
    meta.dates.length > 1
      ? `${formatKo(meta.dates[0])}~${formatKo(meta.dates[meta.dates.length - 1])}`
      : formatKo(meta.dates[0]);

  const head = `코스피200 주요공시 (${dateLabel} 접수)`;

  // 상위 5건을 종목명 + 축약 공시명으로
  const lines = picked.slice(0, 5).map((d) => {
    const fix = /^\[기재정정\]/.test(d.title) ? ' (정정)' : '';
    return `· ${d.stockName} ${shortTitle(d.title)}${fix}`;
  });

  // 구분별 건수 요약
  const counts = {};
  for (const d of picked) counts[d.tag] = (counts[d.tag] || 0) + 1;
  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag, n]) => `${tag} ${n}건`)
    .join(', ');

  const tail = [
    `전체 ${meta.total}건 중 코스피200 ${meta.matched}건, 이 중 주요 ${picked.length}건을 골랐습니다.`,
    top ? `구분별로는 ${top}이 많았습니다.` : '',
    '전체 목록은 이미지를 참고하세요. 정보 제공 목적이며 투자 판단의 책임은 본인에게 있습니다.',
  ]
    .filter(Boolean)
    .join(' ');

  let text = `${head}\n\n${lines.join('\n')}\n\n${tail}`;

  // 500자 초과 시 목록부터 줄인다
  let n = lines.length;
  while ([...text].length > 500 && n > 1) {
    n -= 1;
    text = `${head}\n\n${lines.slice(0, n).join('\n')}\n\n${tail}`;
  }
  if ([...text].length > 500) text = [...text].slice(0, 497).join('') + '...';

  if (text.includes('#')) throw new Error("본문에 '#' 이 포함되면 안 됩니다");
  return text;
}
