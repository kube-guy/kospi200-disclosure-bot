// Threads 장기 액세스 토큰 갱신 후 GitHub Secret 을 업데이트한다.
//
// 장기 토큰은 60일 유효이고 만료 알림이 없다. 갱신하지 않으면 어느 날 갑자기 게시가 실패한다.
// 필요 환경변수:
//   THREADS_ACCESS_TOKEN  현재 장기 토큰
//   GH_PAT                Secrets 쓰기 권한이 있는 GitHub 토큰 (fine-grained: Secrets read/write)
//   GITHUB_REPOSITORY     owner/repo (Actions가 자동 주입)
import sodium from 'libsodium-wrappers';
import { refreshLongLivedToken } from '../src/threads.js';

const SECRET_NAME = 'THREADS_ACCESS_TOKEN';

async function main() {
  const current = process.env.THREADS_ACCESS_TOKEN;
  const pat = process.env.GH_PAT;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!current) throw new Error('THREADS_ACCESS_TOKEN 이 없습니다');

  const refreshed = await refreshLongLivedToken(current);
  const days = Math.round((refreshed.expires_in || 0) / 86400);
  console.log(`토큰 갱신 성공. 새 만료까지 약 ${days}일`);

  if (!pat) {
    console.warn(
      'GH_PAT 이 없어 Secret 을 자동 업데이트하지 못했습니다. ' +
        '새 토큰을 수동으로 THREADS_ACCESS_TOKEN 에 저장하세요.'
    );
    process.exitCode = 1;
    return;
  }

  const api = async (path, init = {}) => {
    const res = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
    if (!res.ok) throw new Error(`GitHub API ${path} 실패 (${res.status}): ${await res.text()}`);
    return res.status === 204 ? null : res.json();
  };

  const key = await api(`/repos/${repo}/actions/secrets/public-key`);

  await sodium.ready;
  const sealed = sodium.crypto_box_seal(
    sodium.from_string(refreshed.access_token),
    sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL)
  );

  await api(`/repos/${repo}/actions/secrets/${SECRET_NAME}`, {
    method: 'PUT',
    body: JSON.stringify({
      encrypted_value: sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL),
      key_id: key.key_id,
    }),
  });

  console.log(`Secret ${SECRET_NAME} 업데이트 완료`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
