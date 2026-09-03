// 코스피200 매칭 + 주요공시 선별
//
// 화이트리스트 방식이다. 아래 PRIORITY 에 걸리는 공시만 채택하고 나머지는 버린다.
// 블랙리스트로만 거르면 매번 새로운 정형 공시가 카드에 섞여 들어와 품질이 흔들린다.
import { normalizeName } from './kospi200.js';

// 앞에 있을수록 중요. 여러 개에 걸리면 먼저 걸린 것이 적용된다.
const PRIORITY = [
  { tag: '실적', re: /영업\(잠정\)실적|매출액또는손익구조/ },
  { tag: '배당', re: /현금ㆍ현물배당|현금·현물배당|배당결정|이익소각|주식소각/ },
  { tag: 'M&A', re: /합병|분할합병|회사분할|영업양수|영업양도|주식교환|주식이전|포괄적/ },
  { tag: '증자', re: /유상증자결정|무상증자결정|감자결정/ },
  { tag: '자사주', re: /자기주식(취득|처분|소각)|자기주식취득신탁/ },
  { tag: '수주', re: /단일판매ㆍ공급계약|단일판매·공급계약|공급계약체결/ },
  {
    tag: '리스크',
    re: /중대재해|소송등의(제기|판결|결정)|회생절차|파산|상장폐지|주권매매거래정지|감사의견|회계처리기준위반|횡령|배임/,
  },
  { tag: '지배구조', re: /최대주주변경|경영권/ },
  { tag: '투자', re: /신규시설투자|유형자산(양수|양도|취득|처분)|특허권|기술이전|국책과제/ },
  { tag: '지분', re: /타법인주식및출자증권(취득|처분)/ },
  { tag: '사채', re: /전환사채|신주인수권부사채|교환사채|조건부자본증권/ },
  { tag: '해명', re: /풍문또는보도에대한해명|조회공시/ },
  { tag: '주요사항', re: /주요사항보고서/ },
  { tag: '자율', re: /기타\s*경영사항\(자율공시\)|수시공시의무관련사항\(공정공시\)/ },
];

// PRIORITY 에 걸리더라도 뉴스성이 낮아 버리는 것들
const DROP = [
  /정기주주총회|주주총회소집/,
  /타인에대한채무보증/,
  /금전대여|단기차입금증가|특수관계인|동일인등출자계열회사/,
  /증권발행실적보고서|증권발행결과/,
  /반기보고서|분기보고서|사업보고서|감사보고서/,
  /기타안내사항|기타시장안내/,
  /최대주주등소유주식변동신고서/,
  /임원ㆍ주요주주특정증권등소유상황보고서|임원·주요주주특정증권등소유상황보고서/,
  /기업설명회|대규모기업집단현황공시/,
  /증권신고서|투자설명서|일괄신고/,
  /가격제한폭/,
];

export function classify(title) {
  if (DROP.some((re) => re.test(title))) return null;
  for (let i = 0; i < PRIORITY.length; i++) {
    if (PRIORITY[i].re.test(title)) return { rank: i, tag: PRIORITY[i].tag };
  }
  return null; // 화이트리스트 미매칭 -> 채택하지 않음
}

/**
 * @param {Array} disclosures DART 전체공시
 * @param {Array} kospi200    코스피200 구성종목
 * @param {number} limit      카드에 실을 최대 건수
 */
export function selectMajor(disclosures, kospi200, limit = 14) {
  const byName = new Map();
  for (const s of kospi200) byName.set(normalizeName(s.name), s);

  const matched = [];
  for (const d of disclosures) {
    const stock = byName.get(normalizeName(d.corp));
    if (!stock) continue;
    matched.push({ ...d, code: stock.code, stockName: stock.name });
  }

  const major = [];
  for (const d of matched) {
    const c = classify(d.title);
    if (!c) continue;
    major.push({ ...d, ...c, isFix: /^\[기재정정\]/.test(d.title) });
  }

  // 중요도 -> 정정 아닌 것 우선 -> 최신순
  const picked = [...major]
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(a.isFix) - Number(b.isFix) ||
        (b.date + b.time).localeCompare(a.date + a.time)
    )
    .slice(0, limit);

  return { matched, major, picked };
}
