# Architecture

이 문서는 현재 런타임 구조를 설명한다.

초점은 두 가지다.

1. 왜 이런 구조가 필요했는가
2. 지금 구조에서 각 레이어가 무엇을 맡고, 그 결과 무엇이 좋아졌는가

이 문서는 작업 계획이나 롤아웃 기록이 아니다. 현재 코드의 구조와 의도를 설명하는 문서다.

## 문제 설정

이 프로젝트가 처음부터 어려운 이유는, CSS Modules 기능이 단순한 문자열 매칭으로 끝나지 않기 때문이다.

우리가 실제로 풀어야 하는 문제는 다음과 같았다.

- source 쪽에서 `cx`, `styles.foo`, `styles["foo-bar"]`, `clsx(...)`, `classnames(...)`가 무엇을 가리키는지 알아야 한다
- style 쪽에서 selector가 실제로 어떻게 선언되었는지, nested selector나 `composes`가 어떤 의미를 가지는지 알아야 한다
- dynamic class expression은 정적 문자열이 아닐 수 있으므로, 가능한 값의 집합을 추론해야 한다
- hover, definition, references, rename, diagnostics가 각자 다른 방식으로 분석을 다시 하면 결과가 쉽게 어긋난다

초기 구조에서는 이 문제들을 기능별로 풀었다. 파서는 파서대로, provider는 provider대로, helper는 helper대로 의미를 조금씩 다시 계산했다. 이 방식은 기능을 빠르게 추가하는 데는 유리했지만, 구조적으로는 세 가지 문제가 있었다.

- 같은 질문을 여러 군데서 다시 풀었다
- source-side binding과 dynamic resolution이 heuristic에 많이 의존했다
- provider마다 semantic glue가 달라서, 기능 간 결과가 어긋날 수 있었다

예를 들면:

- source-side binding은 line range나 document order 같은 약한 규칙에 기대는 부분이 있었다
- dynamic class reasoning은 template, flow, type union이 서로 다른 경로를 탔다
- runtime invalidation도 handler 쪽에서 기능 단위로 조합하는 성격이 강했다

그래서 3.x 구조의 목표는 “기능 추가”가 아니라 “의미 해석 경로를 하나로 통일”하는 것이었다.

## 이전 구조에서 현재 구조로

이전 구조를 짧게 요약하면 이렇다.

```text
source/style parse
  -> HIR
  -> semantic helper / index
  -> provider별 판단
```

즉 HIR는 있었지만, 그 위에서 binding, dynamic reasoning, query shaping이 명확한 레이어로 나뉘지 않았다.

현재 구조는 다음처럼 바뀌었다.

```text
source/style text
  -> document facts
  -> source binding
  -> abstract class-value analysis
  -> read models
  -> provider / rewrite policy
  -> LSP
```

핵심 변화는 “한 단계 더 많은 레이어를 만들었다”가 아니다.  
각 레이어가 무엇을 절대 하지 말아야 하는지를 분명히 한 것이 핵심이다.

## 전체 구조

현재 런타임의 큰 흐름은 다음과 같다.

```text
Source AST -> SourceDocumentHIR ----\
                                     -> Binding Graph
Style AST  -> StyleDocumentHIR -----/        |
                                              v
                                     Abstract Value Layer
                                              |
                                              v
                                         Read Models
                                              |
                                              v
                                   Provider / Rewrite Policy
                                              |
                                              v
                                      LSP + Runtime Wiring
```

이 구조에서 중요한 점은 source와 style이 처음부터 하나의 AST나 하나의 HIR로 합쳐지지 않는다는 것이다.

대신:

- 문서 사실은 각자의 HIR에 남기고
- source-side binding은 binder가 맡고
- dynamic reasoning은 abstract value layer가 맡고
- provider는 read model을 읽는 쪽으로 한정한다

이 분리가 현재 구조의 중심이다.

## 1. Document Facts

문서 사실 계층은 다음 파일에 있다.

- `server/src/core/hir/source-types.ts`
- `server/src/core/hir/style-types.ts`

여기의 책임은 “문서가 어떻게 생겼는지”를 보존하는 것이다.

`SourceDocumentHIR`가 가지는 정보:

- class expression
- style import
- utility binding
- source range

`StyleDocumentHIR`가 가지는 정보:

- selector identity
- canonical name / view name
- range
- nested metadata
- BEM suffix metadata
- `composes` facts

이 레이어는 파싱 결과를 보존한다.  
하지만 이 레이어는 다음 질문에 답하지 않는다.

- 이 symbol이 어떤 declaration을 가리키는가
- 이 dynamic expression이 어떤 class value를 만들 수 있는가
- 이 selector를 rewrite해도 되는가

즉 HIR는 사실 계층이지, 의미 해석 계층이 아니다.

## 2. Source Binding

source-side 이름 해석은 binder가 맡는다.

- `server/src/core/binder/binder-builder.ts`
- `server/src/core/binder/source-binding-graph.ts`

이 레이어의 책임은:

- file / function / block scope 구성
- declaration / reference 수집
- import / local / param shadowing 처리
- call-site aware resolution

이 레이어가 authoritative source다.

즉 다음 질문은 binder가 답한다.

- 이 `cx`는 어느 bind helper를 가리키는가
- 이 `styles`는 어느 import를 가리키는가
- 같은 이름이 여러 스코프에 있을 때 현재 위치에서 보이는 선언은 무엇인가

이전 구조에서 provider나 helper가 line range나 document order로 유추하던 부분을 이 레이어가 가져갔다.

결과:

- source-side resolution이 기능마다 다르게 흔들리지 않는다
- shadowing 관련 버그를 한 곳에서 고칠 수 있다
- completion, hover, definition이 같은 binding 결과를 공유한다

## 3. Abstract Value Layer

dynamic class reasoning은 abstract value layer가 맡는다.

- `server/src/core/abstract-value/class-value-domain.ts`
- `server/src/core/abstract-value/selector-projection.ts`

여기서 중요한 건 “값을 정확히 계산한다”가 아니라 “값을 같은 모델로 다룬다”는 점이다.

현재 쓰는 도메인은 대략 다음 범주를 가진다.

- `exact`
- `finiteSet`
- `prefix`
- `top`
- `bottom`

이걸 통해 다음을 하나의 모델로 다룬다.

- local flow branch
- string-literal union
- template / concatenation
- non-finite dynamic case

예전에는 template, flow, union이 각자 다른 논리로 흩어져 있었다.  
지금은 provider가 “이건 template니까 이렇게”, “이건 union이니까 이렇게”를 알 필요가 없다.

결과:

- certainty 계산의 기반이 통일된다
- dynamic hover와 diagnostics가 같은 semantic source를 본다
- 새로운 dynamic case를 추가할 때도 provider가 아니라 domain/projection 쪽을 고치면 된다

## 4. Read Models

read model은 core semantic state를 provider가 읽기 좋은 형태로 바꾸는 계층이다.

- `server/src/core/query/*`
- `server/src/core/rewrite/*`

대표적인 예:

- `read-source-expression-resolution.ts`
- `read-expression-semantics.ts`
- `read-selector-usage.ts`
- `read-style-module-usage.ts`
- `read-selector-rewrite-safety.ts`
- `read-style-rewrite-policy.ts`

이 레이어의 목적은 두 가지다.

1. provider가 binder / semantic store / abstract-value internals를 직접 조립하지 않게 한다
2. hover, diagnostics, references, rename이 같은 semantic vocabulary를 보게 한다

즉 read model은 “query helper”라기보다 provider contract다.

예를 들어:

- expression이 어떤 selector 후보로 투영되는지
- 그 certainty가 무엇인지
- selector가 workspace에서 어떻게 쓰이는지
- rewrite가 가능한지

이런 질문을 provider는 read model을 통해 받는다.

결과:

- provider가 얇아진다
- 기능 간 semantic 차이가 줄어든다
- 새 기능을 추가할 때 provider보다 read model을 먼저 생각하게 된다

## 5. Rewrite / Provider Policy

rewrite와 provider는 semantic을 새로 계산하지 않는다. 이미 계산된 semantic을 사용한다.

rewrite entry:

- `server/src/core/rewrite/selector-rename.ts`
- `server/src/core/rewrite/text-rewrite-plan.ts`

provider entry:

- `server/src/providers/*`

역할 분리:

- core rewrite code
  - rewrite 가능 여부 판단
  - edit plan 생성
- provider
  - `WorkspaceEdit`, `Hover`, `CodeLens`, diagnostics 등 LSP shape로 변환

즉 provider는 transport adapter다.

이 구조 덕분에:

- rename legality와 LSP edit shaping이 분리된다
- 같은 semantic query를 다른 surface에서 재사용할 수 있다
- provider마다 별도 heuristic를 쌓지 않게 된다

## 6. Semantic Storage

workspace 차원의 semantic storage는 collection, storage, dependency lookup로 나뉜다.

- `server/src/core/semantic/reference-collector.ts`
- `server/src/core/semantic/workspace-reference-index.ts`
- `server/src/core/semantic/reference-dependencies.ts`
- `server/src/core/semantic/style-dependency-graph.ts`

역할:

- collector
  - 현재 analysis 결과에서 semantic contribution 생성
- reference store
  - selector reference site / module usage 저장
- dependency store
  - invalidation용 reverse lookup 저장
- style dependency graph
  - `composes` 관계 저장

이 레이어를 분리한 이유는 semantic query와 invalidation이 같은 저장소를 “다른 목적”으로 읽기 때문이다.

예전에는 collection과 storage가 한 덩어리에 가까웠다.  
지금은 storage가 incremental하고, dependency lookup도 별도 책임을 가진다.

결과:

- contribution update 비용을 줄일 수 있다
- invalidation이 query store 구조에 과도하게 묶이지 않는다
- `composes` 같은 style dependency도 별도 graph로 관리할 수 있다

## 7. Workspace Runtime

runtime은 workspace-root 단위로 구성된다.

- `server/src/workspace/workspace-registry.ts`
- `server/src/runtime/shared-runtime-caches.ts`
- `server/src/runtime/workspace-runtime.ts`
- `server/src/runtime/workspace-runtime-settings.ts`
- `server/src/runtime/workspace-analysis-runtime.ts`
- `server/src/runtime/workspace-style-runtime.ts`

이 구조를 만든 이유는 multi-root와 invalidation을 한 곳에서 설명하려면, runtime이 “폴더별 단위”를 가져야 하기 때문이다.

현재 runtime 분해:

- shared caches
  - process-wide cache
- workspace runtime settings
  - resource-scoped settings, alias resolver state
- workspace analysis runtime
  - analysis cache, semantic contribution ingestion
- workspace style runtime
  - style indexing, style cache, style dependency graph
- workspace runtime
  - 위 세 런타임을 조립하는 workspace 단위 orchestration
- workspace registry
  - file path -> owning workspace routing

`composition-root.ts`는 이 전체를 조립하는 top-level entry다.  
여기에는 기능별 semantic logic가 없어야 한다.

결과:

- multi-root를 무리 없이 설명할 수 있다
- source/style/runtime concerns를 파일 단위가 아니라 책임 단위로 분리할 수 있다
- handler나 provider가 workspace routing을 직접 알 필요가 없다

## 8. Invalidation

무효화는 별도 runtime contract로 모델링한다.

- `server/src/runtime/dependency-snapshot.ts`
- `server/src/runtime/watched-file-changes.ts`
- `server/src/runtime/invalidation-planner.ts`

흐름:

1. dependency snapshot 생성
2. settings change / watched-file change 분류
3. invalidation plan 계산
4. handler/runtime가 그 plan을 적용

핵심은 handler가 의미를 판단하지 않는다는 점이다.

즉:

- 어떤 변화가 semantic diff를 발생시키는가
- 어떤 URI를 다시 분석해야 하는가
- 어떤 workspace root를 다시 라우팅해야 하는가

이 판단은 runtime 쪽 contract가 맡는다.

결과:

- invalidation이 기능별 예외 처리 모음이 되지 않는다
- source dependency, style dependency, settings dependency를 같은 방식으로 다룰 수 있다
- runtime behavior를 테스트하기 쉬워진다

## 9. Transport Boundary

runtime은 incidental transport effect를 직접 알지 않는다.

- `server/src/runtime/runtime-sink.ts`

현재 sink가 감싸는 것:

- info / error logging
- diagnostics clear
- CodeLens refresh request

이 추상화가 필요한 이유는 runtime이 LSP transport type을 직접 알기 시작하면, 나중에 다른 consumer를 붙일 때 runtime이 다시 transport-specific code로 오염되기 때문이다.

결과:

- runtime은 orchestration에 집중한다
- transport effect는 composition root에서 바인딩한다
- 나중에 다른 소비자를 붙여도 runtime core는 덜 흔들린다

## 10. 왜 이런 구조가 유리한가

현재 구조의 가장 큰 장점은 “정확성”보다 “설명 가능성”이다.

무슨 뜻이냐면:

- 어떤 source expression이 어떤 selector를 가리키는지
- 왜 rename이 허용되거나 막히는지
- 왜 diagnostics가 발생하는지
- 왜 어떤 파일만 다시 분석하는지

이 질문을 레이어 단위로 설명할 수 있다.

이전 구조에서는 기능이 늘어날수록 provider별 보정 로직이 늘었다.  
지금은 새 기능을 붙일 때도 먼저 묻게 된다.

- 문서 사실의 문제인가
- binding의 문제인가
- abstract value의 문제인가
- read model의 문제인가
- runtime invalidation의 문제인가
- LSP adapter의 문제인가

이 질문이 가능해졌다는 것이, 현재 아키텍처의 가장 큰 개선점이다.

## 11. 현재 구조에서 지켜야 할 규칙

현재 구조를 유지하려면 다음 원칙이 깨지면 안 된다.

- HIR는 사실 계층으로 남아야 한다
- source-side resolution은 binder가 authoritative source여야 한다
- dynamic class reasoning은 abstract value layer에서 다뤄야 한다
- provider는 read model을 읽어야 한다
- rewrite legality는 core rewrite가 판단해야 한다
- invalidation은 runtime contract를 통해 설명돼야 한다
- transport-specific effect는 sink/provider에서 끝나야 한다

새 기능이 이 규칙을 깨고 들어오면, 그건 보통 기능이 어려운 게 아니라 레이어를 잘못 선택한 것이다.
