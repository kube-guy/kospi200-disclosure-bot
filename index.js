// 코스피200 주요공시 -> 카드 이미지 -> Threads 게시
//
// 두 단계로 나뉘어 있다. Threads API는 로컬 파일 업로드를 지원하지 않고
// 공개 URL만 받기 때문에, 이미지를 먼저 리포지토리에 커밋해 raw URL을 만든 뒤 게시해야 한다.
//
//   node index.js build   # 수집 -> 선별 -> 카드 렌더 -> out/post.json 기록
//   (워크플로가 docs/cards/*.png 커밋 & 푸시)
//   node index.js post    # raw URL 확인 후 Threads 게시
import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveTargetDates } from './src/dates.js';
import { fetchKospi200 } from './src/kospi200.js';
import { fetchDartDays } from './src/dart.js';
import { selectMajor } from './src/select.js';
import { renderCard } from './src/card.js';
import { buildCaption } from './src/caption.js';
import { publishImagePost } from './src/threads.js';

const OUT_DIR = 'out';
const CARD_DIR = path.join('docs', 'cards');
const STATE_FILE = path.join(OUT_DIR, 'post.json');
const LIMIT = Number(process.env.CARD_LIMIT || 14);

async function build() {
  const { lastTradingDay, dates } = await resolveTargetDates();
  console.log(`[build] 직전 거래일 ${lastTradingDay}, 수집 대상 ${dates.join(', ')}`);

  const [kospi200, disclosures] = await Promise.all([fetchKospi200(), fetchDartDays(dates)]);
  console.log(`[build] 코스피200 ${kospi200.length}종, DART 전체 ${disclosures.length}건`);

  const { matched, major, picked } = selectMajor(disclosures, kospi200, LIMIT);
  console.log(`[build] 매칭 ${matched.length}건, 주요 ${major.length}건, 게재 ${picked.length}건`);

  await fs.mkdir(OUT_DIR, { recursive: true });

  if (picked.length === 0) {
    console.log('[build] 게재할 주요공시가 없습니다. 게시를 건너뜁니다.');
    await fs.writeFile(STATE_FILE, JSON.stringify({ skip: true, reason: 'no-major-disclosure' }, null, 2));
    return;
  }

  const meta = {
    dates,
    lastTradingDay,
    total: disclosures.length,
    matched: matched.length,
    major: major.length,
  };

  await fs.mkdir(CARD_DIR, { recursive: true });
  const cardName = `${dates[dates.length - 1]}.png`;
  const cardPath = path.join(CARD_DIR, cardName);
  const { width, height } = await renderCard({ picked, meta, outPath: cardPath });
  console.log(`[build] 카드 생성 ${cardPath} (${width}x${height})`);

  const caption = buildCaption({ picked, meta });
  console.log(`[build] 본문 ${[...caption].length}자\n---\n${caption}\n---`);

  const repo = process.env.GITHUB_REPOSITORY; // owner/repo
  const branch = process.env.GITHUB_REF_NAME || 'main';
  const imageUrl = repo
    ? `https://raw.githubusercontent.com/${repo}/${branch}/${CARD_DIR.replace(/\\/g, '/')}/${cardName}`
    : null;

  await fs.writeFile(
    STATE_FILE,
    JSON.stringify({ skip: false, caption, cardPath, cardName, imageUrl, meta, picked }, null, 2)
  );
  console.log(`[build] 상태 기록 ${STATE_FILE}`);
}

async function waitForImage(url, tries = 12, delayMs = 10000) {
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
      if (res.ok || res.status === 206) {
        console.log(`[post] 이미지 URL 확인 완료 (${i}회차)`);
        return true;
      }
      console.log(`[post] 이미지 URL 아직 준비 안 됨 (${res.status}), ${i}/${tries}`);
    } catch (e) {
      console.log(`[post] 이미지 URL 조회 오류: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

async function post() {
  const state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
  if (state.skip) {
    console.log(`[post] 건너뜀: ${state.reason}`);
    return;
  }

  if (process.env.DRY_RUN === 'true') {
    console.log('[post] DRY_RUN=true 이므로 실제 게시하지 않습니다.');
    console.log(`[post] image_url=${state.imageUrl}`);
    console.log(`[post] text=\n${state.caption}`);
    return;
  }

  const userId = process.env.THREADS_USER_ID;
  const token = process.env.THREADS_ACCESS_TOKEN;
  const topicTag = process.env.THREADS_TOPIC_TAG || '주식';
  if (!userId || !token) throw new Error('THREADS_USER_ID / THREADS_ACCESS_TOKEN 이 필요합니다');
  if (!state.imageUrl) throw new Error('imageUrl 이 없습니다 (GITHUB_REPOSITORY 미설정?)');

  const ok = await waitForImage(state.imageUrl);
  if (!ok) throw new Error(`이미지 URL에 접근할 수 없습니다: ${state.imageUrl}`);

  const { creationId, postId } = await publishImagePost({
    userId,
    token,
    text: state.caption,
    imageUrl: state.imageUrl,
    topicTag,
  });
  console.log(`[post] 게시 완료 creation_id=${creationId} post_id=${postId}`);
}

const step = process.argv[2];
if (step === 'build') await build();
else if (step === 'post') await post();
else {
  console.error('사용법: node index.js <build|post>');
  process.exit(1);
}
