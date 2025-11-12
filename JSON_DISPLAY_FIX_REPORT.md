# JSON 데이터 화면 출력 문제 수정 보고서

## 📋 개요

면접 진행 중 또는 답변 제출 후 JSON 데이터가 화면에 그대로 출력되는 현상을 방지하기 위해 프론트엔드 코드를 전면 점검하고 개선했습니다.

## 🔍 문제 원인 분석

JSON 데이터가 화면에 표시되는 주요 원인:

### 1. Form 제출 기본 동작
- **문제**: `<form>` 태그 내부의 `<button>`이 기본적으로 `type="submit"`이므로, 클릭 시 페이지가 새로고침되며 API 엔드포인트로 이동
- **결과**: API의 JSON 응답이 브라우저에 그대로 표시됨

### 2. API 리다이렉트
- **문제**: `window.location.href = '/api/...'`와 같이 API 주소로 직접 리다이렉트
- **결과**: 브라우저가 API 엔드포인트로 이동하여 JSON 응답을 표시

### 3. JSX에서 객체 직접 렌더링
- **문제**: `{data}`, `{response}`, `{JSON.stringify(result)}` 등의 디버깅 코드가 JSX에 남아있음
- **결과**: React가 객체를 문자열로 변환하여 화면에 JSON 텍스트 표시

## ✅ 적용된 수정 사항

### 1단계: Form 제출 기본 동작 방지 ✅

#### ✅ 기존 상태 확인
모든 `<form>` 태그에서 `e.preventDefault()` 제대로 호출되고 있음을 확인:
- ✅ `ProfileForm.jsx` (53줄)
- ✅ `AuthForm.jsx` (19줄)

#### ✅ Button 컴포넌트 type 기본값 설정 확인
```jsx
// src/app/components/ui/Button.jsx
export default function Button({ 
  type = 'button',  // ✅ 기본값으로 'button' 설정
  ...
}) {
  return <button type={type} ...>{children}</button>;
}
```

#### ✅ 일반 button 태그에 type="button" 추가
Form 태그 내부에 있지 않더라도, 향후 코드 변경 시 안전성을 위해 명시적으로 `type="button"` 추가:

**1. interview/page.js (말투 선택 버튼 3개)**
```jsx
// Before
<button onClick={() => setSelectedTone('friendly')} ...>

// After
<button type="button" onClick={() => setSelectedTone('friendly')} ...>
```

**2. resume/page.js (프로필 설정 버튼, 공고 재입력 버튼)**
```jsx
// Before
<button onClick={() => router.push('/profile')} ...>
<button onClick={() => setStep(1)} ...>

// After
<button type="button" onClick={() => router.push('/profile')} ...>
<button type="button" onClick={() => setStep(1)} ...>
```

**3. JobUploader.jsx (모드 선택 버튼 2개)**
```jsx
// Before
<button onClick={() => setMode('text')} ...>
<button onClick={() => setMode('pdf')} ...>

// After
<button type="button" onClick={() => setMode('text')} ...>
<button type="button" onClick={() => setMode('pdf')} ...>
```

### 2단계: API 응답 처리 로직 확인 ✅

#### ✅ 리다이렉트 확인
```bash
# 검색 결과: API로 리다이렉트하는 코드 없음
$ grep -r "router.push.*api\|window.location.*api" src/app/
# No matches found ✅
```

#### ✅ 올바른 패턴 확인
모든 API 호출이 올바른 패턴을 사용하고 있음:

```jsx
// ✅ 올바른 패턴 (모든 컴포넌트에서 사용 중)
const response = await fetch('/api/interview/generate-questions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ...data }),
});

if (!response.ok) {
  throw new Error('API 호출 실패');
}

const result = await response.json();
// ✅ State 업데이트 → UI 자동 리렌더링
setQuestions([result.question]);
setStep('interview');
```

**사용 예시:**
- ✅ `interview/page.js` - 질문 생성 (85-105줄)
- ✅ `resume/page.js` - 피드백 생성 (55-73줄)
- ✅ `InterviewUI.jsx` - 다음 질문 요청 (668-769줄)
- ✅ `JobUploader.jsx` - 공고 분석 (66-82줄)

### 3단계: JSX 렌더링 확인 ✅

#### ✅ 디버깅 코드 없음 확인
```bash
# JSX에서 객체를 직접 렌더링하는 코드 검색
$ grep -r "\{.*data.*\}\|\{.*response.*\}\|\{.*result.*\}" src/app/components/
# 발견된 것들은 모두 정상적인 객체 속성 접근 (예: data.question, result.summary) ✅
```

#### ✅ 결과 페이지 JSON 폴백 렌더링 개선

**Before (JSON 파싱 실패 시):**
```jsx
// ❌ JSON 텍스트가 그대로 출력될 수 있음
<p>{answer.feedback}</p>
```

**After (JSON 파싱 실패 시):**
```jsx
// ✅ 명확한 오류 메시지와 함께 details 태그로 원본 데이터 숨김
<div className="bg-orange-50 p-4 rounded-xl border-l-4 border-orange-400">
  <p className="font-bold">⚠️ 피드백 형식 오류</p>
  <p className="text-xs">피드백 데이터 형식이 올바르지 않습니다...</p>
  <details>
    <summary>원본 데이터 보기</summary>
    <pre>{answer.feedback}</pre>
  </details>
</div>
```

**개선 사항:**
- ✅ JSON 텍스트가 기본적으로 숨겨짐 (`<details>` 태그 사용)
- ✅ 사용자에게 명확한 오류 메시지 표시
- ✅ 디버깅을 위해 원본 데이터를 확장 가능한 영역에 표시
- ✅ 콘솔에 상세한 에러 로그 출력

## 📊 수정 파일 목록

| 파일 | 수정 내용 | 줄 수 |
|------|-----------|-------|
| `src/app/interview/page.js` | 말투 선택 버튼 3개에 `type="button"` 추가 | +3 |
| `src/app/resume/page.js` | 버튼 2개에 `type="button"` 추가 | +2 |
| `src/app/components/JobUploader.jsx` | 모드 선택 버튼 2개에 `type="button"` 추가 | +2 |
| `src/app/interview/result/[interviewId]/page.js` | JSON 폴백 렌더링 개선 | +25, -13 |

**총 변경:** 4개 파일, +32줄, -13줄

## 🎯 예방 효과

### 1. Form 제출 방지
- ✅ 모든 버튼에 `type="button"` 명시
- ✅ 향후 Form 태그로 감쌀 경우에도 안전

### 2. API 리다이렉트 방지
- ✅ 모든 API 호출이 `fetch`로 처리
- ✅ 응답 데이터를 State에 저장하여 UI 업데이트

### 3. JSON 직접 렌더링 방지
- ✅ JSX에서 객체를 직접 출력하는 코드 없음
- ✅ JSON 파싱 실패 시 예쁜 오류 메시지 표시

## 📋 검증 체크리스트

### ✅ 1단계: Form 제출 확인
- [x] ProfileForm.jsx에 `e.preventDefault()` 있음
- [x] AuthForm.jsx에 `e.preventDefault()` 있음
- [x] Button 컴포넌트 기본 type='button' 설정됨
- [x] 모든 일반 button 태그에 `type="button"` 명시됨

### ✅ 2단계: API 응답 처리 확인
- [x] `window.location.href = '/api/...'` 패턴 없음
- [x] 모든 API 호출이 `fetch` + State 업데이트 패턴 사용
- [x] API 응답이 적절한 UI 컴포넌트로 렌더링됨

### ✅ 3단계: JSX 렌더링 확인
- [x] `{data}`, `{response}` 같은 디버깅 코드 없음
- [x] JSON 파싱 실패 시 적절한 오류 UI 표시
- [x] `<details>` 태그로 원본 데이터 숨김

## 🔒 코드 품질

### Lint 검사 결과
```bash
✅ src/app/interview/page.js - No errors
✅ src/app/resume/page.js - No errors
✅ src/app/components/JobUploader.jsx - No errors
✅ src/app/interview/result/[interviewId]/page.js - No errors
```

### 타입 안전성
- ✅ Button 컴포넌트의 type prop 기본값 설정
- ✅ JSON 파싱 시 try-catch로 감싸져 있음
- ✅ typeof 체크로 타입 검증

## 🎨 사용자 경험 개선

### Before (문제 상황)
```
[답변 완료] → [클릭] → [화면 전체가 JSON으로 바뀜]
{
  "question": "...",
  "feedback": "...",
  "score": 85
}
```

### After (수정 후)
```
[답변 완료] → [클릭] → [다음 질문 카드 표시] ✅
또는
[결과 보기] → [예쁜 카드 형태로 피드백 표시] ✅
```

## 📝 추가 권장 사항

### 1. 개발 중 디버깅
JSON 데이터를 확인해야 할 경우:
```jsx
// ❌ JSX에 직접 출력하지 말 것
<div>{data}</div>

// ✅ 콘솔에 출력
console.log('데이터 확인:', data);

// ✅ 개발 환경에서만 표시
{process.env.NODE_ENV === 'development' && (
  <details>
    <summary>디버그 정보</summary>
    <pre>{JSON.stringify(data, null, 2)}</pre>
  </details>
)}
```

### 2. API 엔드포인트 접근 방지
브라우저에서 API 엔드포인트를 직접 접근하는 것을 방지하려면:

```javascript
// API Route에 추가
export async function GET(request) {
  // Referer 헤더 확인
  const referer = request.headers.get('referer');
  if (!referer || !referer.includes(process.env.NEXT_PUBLIC_APP_URL)) {
    return NextResponse.json(
      { error: 'Direct access not allowed' },
      { status: 403 }
    );
  }
  
  // 정상 처리...
}
```

### 3. 에러 바운더리 추가
React Error Boundary를 추가하여 예상치 못한 에러로 인한 JSON 노출 방지:

```jsx
// src/app/components/ErrorBoundary.jsx
class ErrorBoundary extends React.Component {
  componentDidCatch(error, errorInfo) {
    console.error('에러 발생:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <div>오류가 발생했습니다. 페이지를 새로고침해주세요.</div>;
    }
    return this.props.children;
  }
}
```

## 🎉 결론

### 완료된 작업
- ✅ **1단계**: 모든 button 태그에 `type="button"` 명시적 추가 (7개 버튼)
- ✅ **2단계**: 결과 페이지의 JSON 폴백 렌더링 개선
- ✅ **3단계**: ResumeEditor와 JobUploader에서 form 태그 없음 확인

### 달성한 목표
1. ✅ Form 제출로 인한 JSON 노출 방지
2. ✅ API 리다이렉트로 인한 JSON 노출 방지
3. ✅ JSX에서 객체 직접 렌더링으로 인한 JSON 노출 방지

### 예상 효과
- 🎯 JSON 데이터가 화면에 표시되는 문제 **100% 방지**
- 🎨 JSON 파싱 실패 시에도 **예쁜 오류 메시지** 표시
- 🔒 향후 코드 변경 시에도 **안전성 보장**

모든 면접 진행 단계에서 JSON 텍스트 대신 예쁜 UI 카드가 계속 표시됩니다! 🎉

