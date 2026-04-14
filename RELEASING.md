# Releasing

이 문서는 현재 릴리즈 절차를 정리한다.

작업 기록이나 과거 rollout 메모는 포함하지 않는다.

## 브랜치

- `master`: stable
- `next`: preview

## 버전 규칙

stable과 preview 모두 숫자 버전만 사용한다.

예:

- `3.2.0`
- `3.2.1`
- `3.3.0`

사용하지 않는 형식:

- `3.2.0-alpha.1`
- `3.2.0-beta.1`

VS Code Marketplace preview는 다음 제약이 있다.

1. 버전은 `major.minor.patch` 형식이어야 한다
2. preview publish는 `--pre-release`로 해야 한다

또한 preview에서 이미 사용한 버전은 stable에서 다시 쓰면 안 된다.

참고:

- https://code.visualstudio.com/api/working-with-extensions/publishing-extension#pre-release-extensions

## 채널

stable:

- 브랜치: `master`
- workflow input: `channel=stable`

preview:

- 브랜치: `next`
- workflow input: `channel=preview`

Open VSX는 Marketplace와 같은 preview 채널 모델을 명확히 문서화하지 않는다. preview 배포는 Marketplace를 기준으로 보고, Open VSX는 선택적 보조 채널로 다룬다.

참고:

- https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions

## 배포 전 검증

기본 검증:

```bash
pnpm install
pnpm release:verify
pnpm test:extension-host
pnpm --dir examples exec tsc -p tsconfig.json --noEmit
pnpm --dir examples build
pnpm exec vsce package --no-dependencies
```

`pnpm release:verify`는 다음을 수행한다.

1. `SERVER_VERSION` 동기화
2. `pnpm check`
3. `pnpm test`
4. `pnpm build`

## Publish Extension workflow

배포는 GitHub Actions의 `Publish Extension` workflow로 한다.

입력값:

- `ref`
- `channel`
- `publish_marketplace`
- `publish_openvsx`
- `create_github_release`

workflow는 다음을 수행한다.

1. 지정한 ref checkout
2. dependency install
3. `./scripts/publish-extension.sh`
4. VSIX package
5. Marketplace / Open VSX publish
6. GitHub release 생성 옵션 처리

## stable 배포 절차

1. release branch를 `master`에 머지
2. `Publish Extension` 실행
3. 입력:
   - `ref=master`
   - `channel=stable`
   - `publish_marketplace=true`
   - `publish_openvsx=true` 또는 `false`
   - `create_github_release=true`

## preview 배포 절차

1. preview 작업을 `next`에 머지
2. preview 버전 반영
3. `Publish Extension` 실행
4. 입력:
   - `ref=next`
   - `channel=preview`
   - `publish_marketplace=true`
   - `publish_openvsx=false` 또는 `true`
   - `create_github_release=true`

## changeset

사용자 영향이 있는 PR은 changeset을 포함하는 것이 원칙이다.

다음만 바꾸는 PR은 `changeset:skip`으로 처리할 수 있다.

- docs
- tests
- CI
- `examples/`

## compat deprecation

현재 path alias deprecation 정책:

- legacy key: `cssModules.pathAlias`
- replacement key: `cssModuleExplainer.pathAlias`
- warning starts: `3.1.x`
- planned removal: `4.0.0`

제거 시 같이 수정해야 하는 곳:

- `server/src/settings.ts`
- `README.md`
- `package.json` configuration metadata
- changelog / release notes

## 로컬 publish

```bash
pnpm release:publish
```

사용 환경 변수:

- `RELEASE_CHANNEL=stable|preview`
- `PUBLISH_MARKETPLACE=true|false`
- `PUBLISH_OPENVSX=true|false`
- `VSCE_PAT`
- `OVSX_PAT`

repo root의 `.env`가 있으면 publish script가 같이 읽는다.
