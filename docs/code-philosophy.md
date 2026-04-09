# Readable Flow Architecture

_A Coding Manifesto by Yongseok_

> 코드는 사고의 흐름이다.
> 읽는 사람이 자연스럽게 따라갈 수 있어야 하고, 새로운 참여자가 길을 잃지 않아야 한다.

---

## 하나의 목표: 인지 부하를 낮춰라

이 문서의 모든 원칙은 하나의 목표로 수렴한다 — **코드를 읽는 사람의 인지 부하(Cognitive Load)를 최소화하는 것.**

코드는 작성하는 시간보다 읽히는 시간이 압도적으로 길다. 좋은 코드는 읽는 사람이 머릿속에 올려야 하는 것의 양을 줄여주고, 나쁜 코드는 그 양을 늘린다. 모든 설계 판단 — 파일을 나눌지 합칠지, 추상화를 도입할지 말지, 어떤 패러다임을 쓸지 — 은 이 하나의 기준으로 평가한다.

기존의 SICP(Abstraction Barrier), Kent Beck(Simple Design), Gary Bernhardt(Functional Core, Imperative Shell), Domain-Driven Design, Colocation Principle 등 여러 사상이 이 철학에 영향을 주었다. 이 문서의 고유한 축은, **"인지 부하 최소화"라는 단일 렌즈로 모든 설계 판단을 통합한다**는 데 있다.

---

## 4대 원칙

### 1. Cognitive Flow — 위에서 아래로 읽히게 하라

코드는 위에서 아래로 읽었을 때 "그래서 다음엔 뭘 하지?"라는 질문에 코드 자체가 답해야 한다. 주석이 아니라, 구조와 이름이 그 역할을 한다.

- 함수 이름은 **의도(what)**를 드러내고, 내부 구현은 **방법(how)**을 숨긴다.
- 한 파일을 읽을 때 다른 파일 3개를 동시에 열어야 이해되는 구조는 실패한 구조다.
- 코드의 흐름은 독자의 자연스러운 질문 순서를 따라야 한다.

```typescript
// ❌ 흐름이 끊기는 코드 — 중간 상태를 추적하느라 의도를 놓친다
let items = cart.getItems();
let filtered = [];
for (const item of items) {
  if (!item.deleted && item.quantity > 0) {
    filtered.push(item);
  }
}
let total = 0;
for (const item of filtered) {
  const discount = getDiscount(item, user.membership);
  total += item.price * item.quantity * (1 - discount);
}
total = Math.round(total * 100) / 100;

// ✅ 흐름이 유지되는 코드 — 각 단계가 비즈니스 의도를 선언한다
const total = cart
  .getItems()
  .filter(isValidCartItem)
  .map(applyMembershipDiscount(user.membership))
  .reduce(sumLineTotal, 0)
  .toFixed(2);
// "유효한 항목 → 할인 적용 → 합산"
// 전체 흐름이 한눈에 읽히고, 더 깊이 보고 싶으면 각 함수를 들여다보면 된다.
```

이것이 이 문서의 핵심 아이디어다. 파이프라인 형태로 표현할 수 있는 로직은 함수형 스타일로 작성하면 일련의 과정이 **목차처럼** 드러난다. 전체 그림은 파이프라인이 보여주고, 세부 구현은 각 함수 안에 숨어 있다. 읽는 사람은 필요한 깊이만큼만 파고들면 된다.

### 2. Contextual Locality — 맥락은 가까이, 그러나 뒤섞지 마라

하나의 흐름을 이해하기 위해 필요한 맥락은 **코드 안에서** 가까이 있어야 한다. 읽는 사람이 "이게 뭐지?" 하고 다른 곳으로 점프하는 순간마다 인지 부하가 쌓인다.

```typescript
// ❌ 맥락이 흩어진 코드 — 읽다가 validateOrder, enrichWithStock, toConfirmation을
//    각각 찾아가야 흐름이 이해된다. 그런데 정작 이 함수들은 여기서만 쓰인다.
function processOrder(order: Order) {
  const validated = validateOrder(order); // ← 200줄 아래에 정의
  const enriched = enrichWithStock(validated); // ← 다른 파일
  return toConfirmation(enriched); // ← 또 다른 파일
}

// ✅ 맥락이 응집된 코드 — 이 흐름에서만 쓰이는 로직은 가까이 둔다
function processOrder(order: Order) {
  const validated = applyValidationRules(order, [
    hasRequiredFields,
    hasValidQuantities,
    isWithinCreditLimit(order.customer),
  ]);

  const enriched = {
    ...validated,
    stock: await lookupStock(validated.items),
    estimatedDelivery: calculateDelivery(validated.address),
  };

  return { orderId: generate(), ...enriched, status: "confirmed" };
}
// 흐름 전체가 한 곳에서 읽힌다.
// 공용 로직(lookupStock, calculateDelivery)만 외부에 있고, 나머지는 여기에 있다.
```

**"가까이"는 모든 것을 한 곳에 넣으라는 뜻이 아니다.** 서로 다른 관심사를 한 함수나 한 파일에 억지로 모아두는 것은 응집이 아니라 혼잡이다. 응집의 기준은 **"같은 이유로 함께 변경되고, 함께 읽혀야 의미가 통하는 것들"**이다. 여러 곳에서 독립적으로 쓰이는 로직은 분리하는 것이 맞고, 이 흐름에서만 의미를 갖는 로직은 이 흐름 가까이에 두는 것이 맞다.

이 원칙은 파일과 폴더 구조에도 그대로 적용된다:

```
❌ 기술 중심 분류 — 한 기능의 맥락이 5개 파일로 흩어진다
src/
  hooks/usePayment.ts
  components/PaymentForm.tsx
  utils/paymentValidation.ts
  types/payment.ts
  constants/payment.ts

✅ 도메인 중심 응집 — 한 기능의 맥락이 한 곳에 모인다
src/features/payment/
  PaymentForm.tsx          ← UI + 이 폼에서만 쓰이는 로직
  payment.model.ts         ← 도메인 로직, 타입, 검증 규칙
  index.ts                 ← 외부에 노출할 인터페이스
```

항상 자문하라: **"이 코드를 읽는 사람이 흐름을 따라가기 위해 몇 번의 점프를 해야 하는가?"**

### 3. Abstraction as a Wall — 추상화는 벽이지 미로가 아니다

추상화의 진짜 가치는 복잡성을 제거하는 것이 아니라, **호출하는 쪽의 인지 부하를 줄이는 것**이다. 벽 앞에 선 사람은 벽 너머를 몰라도 자기 일을 할 수 있어야 한다. 하지만 벽이 너무 많으면 미로가 된다.

나쁜 추상화는 복잡성을 이동시킬 뿐이고, 거기에 indirection 비용까지 추가한다. 추상화 레이어는 **필요할 때만** 도입한다. "나중에 필요할 수 있으니까"는 근거가 아니다.

**추상화 도입의 3가지 테스트:**

1. **Peek-Free Test** — 호출자가 내부 구현을 들여다보지 않아도 올바르게 사용할 수 있는가? 소스를 열어봐야 쓸 수 있다면, 그 추상화는 벽이 아니라 커튼이다.
2. **Hop Justification** — 이 레이어가 추가하는 indirection만큼, 호출자의 코드가 단순해지는가? hop이 늘어난 만큼의 인지 비용을 상쇄하지 못하면 추상화가 아니라 우회다.
3. **Change Propagation** — 내부 구현을 변경했을 때 호출자가 영향을 받지 않는가? 벽 안쪽의 변경이 벽 바깥으로 새어나오면 벽이 아니다.

```typescript
// ❌ 미로형 추상화 — 레이어를 따라가다 길을 잃는다
const service = new PaymentServiceFactory()
  .createService(config)
  .withMiddleware(loggingMiddleware)
  .build();

// ✅ 벽형 추상화 — 사용하는 쪽은 내부를 몰라도 된다
const result = await processPayment({ amount, method, userId });
```

### 4. Declarative by Default — 기본은 선언적으로, 교조적이진 않게

코드는 가능한 한 **"무엇을 하는가"**를 표현해야 하고, **"어떻게 하는가"**는 한 단계 안쪽에 숨겨야 한다. 선언적 코드는 읽는 사람이 실행 과정을 머릿속에서 시뮬레이션하지 않아도 전체 그림을 파악할 수 있게 해준다.

단, 이것은 교조가 아니다. 순서가 곧 의미인 절차, 조건 분기가 복잡한 로직 등에서는 명령형이 더 직관적일 수 있다. 핵심은 **읽는 사람에게 가장 자연스러운 표현**을 선택하는 것이다.

```typescript
// 선언적이 자연스러운 경우: 데이터 변환 파이프라인
const activeUsers = users
  .filter(isActive)
  .filter(hasRecentLogin(threshold))
  .map(withCalculatedTier);

// 명령형이 더 명확한 경우: 순서가 곧 로직인 초기화 절차
async function initializeApp(config: AppConfig) {
  const db = await connectDatabase(config.db);
  await runMigrations(db);
  const cache = createCache(config.cache);
  await cache.warm(db);
  const server = createServer({ db, cache });
  await server.listen(config.port);
  logger.info(`Ready on :${config.port}`);
}
```

---

## Pragmatic Pluralism — 문제가 도구를 결정한다

특정 패러다임에 교조적으로 따르지 않는다. 문제의 성격이 도구를 결정한다.

**함수형이 어울리는 곳** — 데이터의 변환과 흐름이 핵심인 곳. 입력 → 변환 → 출력의 파이프라인 구조, 부수효과 없는 순수 비즈니스 로직, 선언적 UI 렌더링. 파이프라인의 각 단계가 의도를 선언하고, 더 깊이 보고 싶으면 각 함수 안을 보면 된다.

```typescript
const dashboardData = pipe(
  rawTransactions,
  groupByCategory,
  calculateCategorySummary,
  sortByAmount("desc"),
  takeTop(10),
);
```

**클래스 기반이 어울리는 곳** — 상태와 생명주기를 캡슐화해야 하는 곳. 연결, 세션, 캐시처럼 명확한 생명주기가 있는 객체, 내부 상태를 보호하면서 일관된 인터페이스를 제공해야 할 때.

```typescript
class WebSocketConnection {
  private socket: WebSocket;
  private reconnectAttempts = 0;
  connect(url: string): void {
    /* ... */
  }
  send(message: Message): void {
    /* ... */
  }
  disconnect(): void {
    /* ... */
  }
}
```

**명령형/절차적이 어울리는 곳** — 순서가 곧 로직인 절차. 초기화, 설정, 마이그레이션, 외부 시스템과의 상호작용(CLI, 스크립트 등).

| 질문               | 함수형                | 클래스 기반        | 명령형/절차적             |
| ------------------ | --------------------- | ------------------ | ------------------------- |
| 핵심이 무엇인가?   | 데이터 변환           | 상태·생명주기 관리 | 순서가 곧 로직            |
| 부수효과의 위치는? | 격리 가능 (경계에서)  | 내부에 캡슐화      | 절차의 본질               |
| 동작 간 관계는?    | 독립적 조합           | 상태 공유          | 순차적 의존               |
| 대표적 용례        | 파이프라인, 렌더 로직 | 연결 관리, 캐시    | 초기화, 마이그레이션, CLI |

확신이 없으면 가장 단순한 형태로 시작하고, 복잡성이 드러날 때 리팩터링한다.

---

## 진단 도구

### 설계 판단의 체크리스트

1. **3-File Rule** — 이 기능을 이해하기 위해 3개 이상의 파일을 동시에 열어야 하는가? 그렇다면 응집도를 재검토한다.
2. **Narration Test** — 이 코드를 위에서 아래로 읽으며 동료에게 자연스럽게 설명할 수 있는가?
3. **Naming Sufficiency** — 함수/변수 이름만으로 주석 없이 의도가 전달되는가?
4. **Grep Friendliness** — 특정 기능이 어디에 있는지 폴더 구조만으로 추측할 수 있는가?

### 경계해야 할 안티패턴

- **이른 추상화(Premature Abstraction)** — 반복이 2~3번 발생하기 전에 추상화하지 않는다.
- **맥락 없는 재사용** — `utils/`에 무분별하게 쌓이는 함수들. 맥락 없이 존재하는 코드는 발견되지 않는다.
- **기술 중심 분류** — `hooks/`, `components/`, `utils/`로 나누는 것보다 도메인/기능 중심으로 나누는 것이 맥락을 보존한다.
- **과도한 DRY** — 중복 제거가 응집도를 해칠 때가 있다. 두 코드가 우연히 비슷한 것인지 본질적으로 같은 것인지 구분한다.
- **혼잡한 응집** — 서로 다른 관심사를 한 파일에 억지로 모아두는 것은 응집이 아니라 혼잡이다. 파일과 폴더를 적절하게 분리하되, 같은 맥락 안에서 나눈다.

### 건강한 코드의 신호

- **Feature Trace** — 하나의 기능을 진입점부터 끝까지 따라갈 때, 열어야 하는 파일이 3개 이하다.
- **Change Radius** — 하나의 요구사항 변경이 영향을 주는 파일 수가 직관적으로 예측 가능하다.
- **Onboarding Grep** — 새 팀원이 "결제 로직 어디 있어요?"라고 물었을 때 폴더명만으로 답할 수 있다.
- **Framework Invisibility** — 코드를 읽으면 비즈니스 로직이 보이고, 프레임워크 boilerplate가 시야를 지배하지 않는다.

---

## 확장 구조

이 문서는 언어와 프레임워크에 독립적인 **핵심 원칙 레이어**다. 도메인별 적용은 별도 문서로 확장한다:

```
readable-flow-architecture.md         ← 핵심 원칙 (이 문서)
extensions/
  frontend.md                         ← 컴포넌트 경계, 상태 관리, 렌더링 최적화
  claude-context.md                   ← AI 코딩 에이전트에 주입하기 위한 압축 버전
```

핵심 원칙의 범용성을 유지하면서, 각 도메인의 고유한 긴장 관계는 확장 문서에서 다룬다.

---

_"읽는 사람의 인지 부하를 최소화하라. 나머지는 전부 이것의 결과다."_
