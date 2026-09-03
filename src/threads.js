// Threads Graph API 게시
// 문서: https://developers.facebook.com/docs/threads/posts
// 1) POST /{user-id}/threads          -> 미디어 컨테이너 생성 (creation_id 반환)
// 2) 약 30초 대기 (서버가 image_url을 가져가 처리할 시간)
// 3) POST /{user-id}/threads_publish  -> 발행

const BASE = process.env.THREADS_API_BASE || 'https://graph.threads.net/v1.0';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, params, method = 'POST') {
  const body = new URLSearchParams(params);
  const url = method === 'GET' ? `${BASE}${path}?${body}` : `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    ...(method === 'POST'
      ? { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body }
      : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Threads API 응답 파싱 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  if (!res.ok || json.error) {
    throw new Error(
      `Threads API 오류 (${res.status}): ${json.error?.message || text.slice(0, 300)}`
    );
  }
  return json;
}

/**
 * 이미지 1장 + 텍스트 게시
 * @param {string} opts.userId    THREADS_USER_ID
 * @param {string} opts.token     장기 액세스 토큰
 * @param {string} opts.text      본문 (500자 이내)
 * @param {string} opts.imageUrl  공개 접근 가능한 이미지 URL (로컬 업로드 불가)
 * @param {string} [opts.topicTag] 주제 태그 (1~50자, '.'와 '&' 불가, 게시물당 1개)
 */
export async function publishImagePost({ userId, token, text, imageUrl, topicTag, waitMs = 35000 }) {
  if (text && [...text].length > 500) {
    throw new Error(`본문이 500자를 넘습니다: ${[...text].length}자`);
  }

  const createParams = {
    media_type: 'IMAGE',
    image_url: imageUrl,
    text,
    access_token: token,
  };
  if (topicTag) createParams.topic_tag = topicTag;

  const created = await call(`/${userId}/threads`, createParams);
  const creationId = created.id;
  if (!creationId) throw new Error('creation_id를 받지 못했습니다');

  await sleep(waitMs);

  const published = await call(`/${userId}/threads_publish`, {
    creation_id: creationId,
    access_token: token,
  });

  return { creationId, postId: published.id };
}

// 24시간 게시 한도 사용량 확인
export async function publishingLimit({ userId, token }) {
  return call(
    `/${userId}/threads_publishing_limit`,
    { fields: 'quota_usage,config', access_token: token },
    'GET'
  );
}

// 장기 토큰 갱신 (발급 24시간 후 ~ 만료 전 사이에 호출 가능, 갱신 시점부터 60일 연장)
export async function refreshLongLivedToken(token) {
  const res = await fetch(
    `${BASE}/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(token)}`
  );
  const json = await res.json();
  if (!res.ok || json.error) {
    throw new Error(`토큰 갱신 실패: ${json.error?.message || JSON.stringify(json)}`);
  }
  return json; // { access_token, token_type, expires_in }
}
