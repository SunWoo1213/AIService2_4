# 면접 데이터 스키마 표준화 가이드

**작성일**: 2025-11-12  
**목적**: 답변 데이터와 AI 피드백의 구조 불일치 해결

---

## 🎯 문제점

### 현재 상황
```javascript
// 문제 1: 답변 데이터 (InterviewUI에서 수집)
{
  transcript: "사용자 답변...",
  audioUrl: "https://...",
  duration: 45
}

// 문제 2: AI 피드백 (LLM API에서 반환)
"단순 텍스트 형태의 피드백..."
또는
{
  feedback: "...",
  strengths: "...",
  // 불규칙한 구조
}

// 문제 3: 병합 시도
❌ 구조가 달라서 깔끔하게 합쳐지지 않음
```

### 해결 목표
```javascript
// ✅ 표준화된 단일 구조
{
  questionText: "질문 내용",
  userAnswer: {
    transcript: "답변 텍스트",
    audioUrl: "오디오 URL",
    duration: 45,
    answeredAt: "2025-11-12T10:30:00Z"
  },
  aiFeedback: {
    content: "AI 피드백 내용",
    generatedAt: "2025-11-12T10:31:00Z"
  }
}
```

---

## 1단계: 통합 데이터 스키마 정의

### 파일: `src/types/interview.types.js` (새 파일)

```javascript
/**
 * 면접 질문 하나에 대한 전체 결과 데이터
 * (사용자 답변 + AI 피드백 통합)
 */
export const InterviewQuestionResult = {
  // ===== 질문 정보 =====
  id: Number,                    // 질문 순서 (1, 2, 3, 4, 5)
  questionId: String,            // 질문 ID ('q1', 'q2', ...)
  questionText: String,          // 질문 내용
  
  // ===== 사용자 답변 =====
  userAnswer: {
    transcript: String,          // STT 변환된 답변 텍스트
    audioUrl: String | null,     // Firebase Storage URL
    audioPath: String,           // Storage 저장 경로
    duration: Number,            // 녹음 시간 (초)
    answeredAt: String,          // 답변 시각 (ISO 8601)
  },
  
  // ===== AI 피드백 (선택적) =====
  aiFeedback: {
    content: String,             // 피드백 내용 (텍스트)
    generatedAt: String | null,  // 피드백 생성 시각
  } | null,                      // 개별 피드백을 생성하지 않으면 null
};

/**
 * 전체 면접 결과 문서 구조
 */
export const InterviewResultDocument = {
  // ===== 기본 정보 =====
  interviewId: String,
  userId: String,
  
  // ===== 메타데이터 =====
  resumeText: String,
  jobKeywords: Object,
  tonePreference: String,
  
  // ===== 종합 피드백 =====
  overallFeedback: {
    overallConsistency: String,
    strengths: String,
    weaknesses: String,
    improvements: String,
    summary: String,
  } | null,
  
  // ===== 개별 질문 결과 배열 =====
  questions: Array,              // InterviewQuestionResult[]
  
  // ===== 통계 =====
  totalQuestions: Number,
  completedQuestions: Number,
  totalDuration: Number,
  averageDuration: Number,
  
  // ===== 타임스탬프 =====
  createdAt: String,
  timestamp: Object,             // Firestore Timestamp
  completedAt: String | null,
  feedbackGeneratedAt: Object | null,
  updatedAt: String | null,
};
```

### TypeScript 버전 (선택)

```typescript
// src/types/interview.types.ts

/**
 * 사용자 답변 데이터
 */
export interface UserAnswer {
  transcript: string;            // STT 변환된 텍스트
  audioUrl: string | null;       // Firebase Storage URL
  audioPath: string;             // Storage 경로
  duration: number;              // 녹음 시간 (초)
  answeredAt: string;            // ISO 8601 날짜
}

/**
 * AI 피드백 데이터
 */
export interface AIFeedback {
  content: string;               // 피드백 내용
  generatedAt: string | null;    // 생성 시각 (ISO 8601)
}

/**
 * 통합된 질문 결과
 */
export interface InterviewQuestionResult {
  id: number;                    // 1, 2, 3, 4, 5
  questionId: string;            // 'q1', 'q2', ...
  questionText: string;          // 질문 내용
  userAnswer: UserAnswer;        // 사용자 답변
  aiFeedback: AIFeedback | null; // AI 피드백 (선택)
}

/**
 * 종합 피드백
 */
export interface OverallFeedback {
  overallConsistency: string;
  strengths: string;
  weaknesses: string;
  improvements: string;
  summary: string;
}

/**
 * 전체 면접 결과 문서
 */
export interface InterviewResultDocument {
  interviewId: string;
  userId: string;
  resumeText: string;
  jobKeywords: Record<string, any>;
  tonePreference: string;
  overallFeedback: OverallFeedback | null;
  questions: InterviewQuestionResult[];
  totalQuestions: number;
  completedQuestions: number;
  totalDuration: number;
  averageDuration: number;
  createdAt: string;
  timestamp: any; // Firestore Timestamp
  completedAt: string | null;
  feedbackGeneratedAt: any | null;
  updatedAt: string | null;
}
```

---

## 2단계: 데이터 매핑 유틸리티 함수

### 파일: `src/utils/interviewDataMapper.js` (새 파일)

```javascript
/**
 * 면접 데이터 매핑 유틸리티
 * 
 * 목적: 다양한 형태의 원시 데이터를 표준화된 스키마로 변환
 */

/**
 * 사용자 답변 데이터를 표준 형식으로 변환
 * 
 * @param {Object} rawAnswerData - 원시 답변 데이터
 * @param {string} rawAnswerData.transcript - STT 텍스트
 * @param {string|null} rawAnswerData.audioURL - 오디오 URL
 * @param {string} rawAnswerData.audioPath - Storage 경로
 * @param {number} rawAnswerData.duration - 녹음 시간
 * @param {string} userId - 사용자 ID
 * @param {string} interviewId - 면접 ID
 * @param {number} questionIndex - 질문 순서
 * @returns {Object} 표준화된 UserAnswer 객체
 */
export function mapUserAnswer(rawAnswerData, userId, interviewId, questionIndex) {
  console.log('[데이터 매핑] 📝 사용자 답변 매핑 시작');
  console.log('[데이터 매핑] - questionIndex:', questionIndex);
  
  // 타입 검증
  if (!rawAnswerData.transcript || typeof rawAnswerData.transcript !== 'string') {
    console.warn('[데이터 매핑] ⚠️ transcript가 없거나 문자열이 아님');
    rawAnswerData.transcript = '';
  }
  
  if (typeof rawAnswerData.duration !== 'number') {
    console.warn('[데이터 매핑] ⚠️ duration이 숫자가 아님, 0으로 설정');
    rawAnswerData.duration = 0;
  }
  
  const userAnswer = {
    transcript: rawAnswerData.transcript.trim(),
    audioUrl: rawAnswerData.audioURL || null,
    audioPath: rawAnswerData.audioPath || 
               `recordings/${userId}/${interviewId}/q${questionIndex}_${Date.now()}.webm`,
    duration: rawAnswerData.duration,
    answeredAt: new Date().toISOString(),
  };
  
  console.log('[데이터 매핑] ✅ 사용자 답변 매핑 완료');
  console.log('[데이터 매핑] - transcript 길이:', userAnswer.transcript.length);
  console.log('[데이터 매핑] - audioUrl 존재:', !!userAnswer.audioUrl);
  
  return userAnswer;
}

/**
 * LLM 응답을 표준 AI 피드백 형식으로 변환
 * 
 * @param {string|Object} llmResponse - LLM 원시 응답
 * @returns {Object|null} 표준화된 AIFeedback 객체
 */
export function mapAIFeedback(llmResponse) {
  console.log('[데이터 매핑] 🤖 AI 피드백 매핑 시작');
  console.log('[데이터 매핑] - LLM 응답 타입:', typeof llmResponse);
  
  // null/undefined 체크
  if (!llmResponse) {
    console.log('[데이터 매핑] ℹ️ LLM 응답 없음, null 반환');
    return null;
  }
  
  let feedbackContent;
  
  try {
    // 케이스 1: 이미 객체인 경우
    if (typeof llmResponse === 'object') {
      console.log('[데이터 매핑] 📦 객체 형태 응답');
      
      // 가능한 필드명들 체크
      feedbackContent = 
        llmResponse.feedback ||
        llmResponse.content ||
        llmResponse.evaluation ||
        llmResponse.analysis ||
        JSON.stringify(llmResponse); // 최후의 수단
      
      console.log('[데이터 매핑] - 추출된 필드:', 
        llmResponse.feedback ? 'feedback' :
        llmResponse.content ? 'content' :
        llmResponse.evaluation ? 'evaluation' :
        llmResponse.analysis ? 'analysis' : 'JSON.stringify');
    }
    // 케이스 2: 문자열인 경우
    else if (typeof llmResponse === 'string') {
      console.log('[데이터 매핑] 📄 문자열 형태 응답');
      
      // JSON 파싱 시도
      try {
        const parsed = JSON.parse(llmResponse);
        console.log('[데이터 매핑] ✅ JSON 파싱 성공');
        return mapAIFeedback(parsed); // 재귀 호출
      } catch (parseError) {
        console.log('[데이터 매핑] ℹ️ JSON이 아닌 일반 텍스트');
        feedbackContent = llmResponse;
      }
    }
    // 케이스 3: 예상치 못한 타입
    else {
      console.warn('[데이터 매핑] ⚠️ 예상치 못한 타입:', typeof llmResponse);
      feedbackContent = String(llmResponse);
    }
    
    // 빈 문자열 체크
    if (!feedbackContent || feedbackContent.trim() === '') {
      console.warn('[데이터 매핑] ⚠️ 피드백 내용이 비어있음');
      return null;
    }
    
    const aiFeedback = {
      content: feedbackContent.trim(),
      generatedAt: new Date().toISOString(),
    };
    
    console.log('[데이터 매핑] ✅ AI 피드백 매핑 완료');
    console.log('[데이터 매핑] - content 길이:', aiFeedback.content.length);
    
    return aiFeedback;
    
  } catch (error) {
    console.error('[데이터 매핑] ❌ AI 피드백 매핑 실패:', error);
    console.error('[데이터 매핑] - 원본 응답:', llmResponse);
    return null;
  }
}

/**
 * 사용자 답변과 AI 피드백을 병합하여 InterviewQuestionResult 생성
 * 
 * @param {number} questionIndex - 질문 순서 (1-based)
 * @param {string} questionText - 질문 내용
 * @param {Object} userAnswer - 표준화된 사용자 답변
 * @param {Object|null} aiFeedback - 표준화된 AI 피드백
 * @returns {Object} InterviewQuestionResult 객체
 */
export function mergeQuestionData(questionIndex, questionText, userAnswer, aiFeedback) {
  console.log('[데이터 매핑] 🔗 질문 데이터 병합 시작');
  console.log('[데이터 매핑] - questionIndex:', questionIndex);
  console.log('[데이터 매핑] - questionText:', questionText?.substring(0, 30) + '...');
  console.log('[데이터 매핑] - userAnswer 존재:', !!userAnswer);
  console.log('[데이터 매핑] - aiFeedback 존재:', !!aiFeedback);
  
  const mergedData = {
    id: questionIndex,
    questionId: `q${questionIndex}`,
    questionText: questionText || '',
    userAnswer: userAnswer,
    aiFeedback: aiFeedback,
  };
  
  console.log('[데이터 매핑] ✅ 질문 데이터 병합 완료');
  
  return mergedData;
}

/**
 * 전체 워크플로우: 원시 데이터 → 표준화된 InterviewQuestionResult
 * 
 * @param {Object} params - 파라미터 객체
 * @param {number} params.questionIndex - 질문 순서
 * @param {string} params.questionText - 질문 내용
 * @param {Object} params.rawAnswerData - 원시 답변 데이터
 * @param {string|Object|null} params.llmResponse - LLM 응답
 * @param {string} params.userId - 사용자 ID
 * @param {string} params.interviewId - 면접 ID
 * @returns {Object} 표준화된 InterviewQuestionResult
 */
export function createStandardizedQuestionResult({
  questionIndex,
  questionText,
  rawAnswerData,
  llmResponse,
  userId,
  interviewId
}) {
  console.log('========================================');
  console.log('[데이터 매핑] 🚀 표준화 프로세스 시작');
  console.log('[데이터 매핑] - questionIndex:', questionIndex);
  console.log('========================================');
  
  try {
    // Step 1: 사용자 답변 매핑
    const userAnswer = mapUserAnswer(rawAnswerData, userId, interviewId, questionIndex);
    
    // Step 2: AI 피드백 매핑 (선택적)
    const aiFeedback = llmResponse ? mapAIFeedback(llmResponse) : null;
    
    // Step 3: 병합
    const result = mergeQuestionData(questionIndex, questionText, userAnswer, aiFeedback);
    
    console.log('========================================');
    console.log('[데이터 매핑] ✅✅✅ 표준화 완료! ✅✅✅');
    console.log('[데이터 매핑] - 결과 구조:', {
      id: result.id,
      questionId: result.questionId,
      hasUserAnswer: !!result.userAnswer,
      hasAiFeedback: !!result.aiFeedback
    });
    console.log('========================================');
    
    return result;
    
  } catch (error) {
    console.error('========================================');
    console.error('[데이터 매핑] ❌ 표준화 실패:', error);
    console.error('========================================');
    throw error;
  }
}

/**
 * 전체 면접 결과 배열 검증
 * 
 * @param {Array} questions - InterviewQuestionResult 배열
 * @returns {boolean} 유효성 검증 결과
 */
export function validateQuestions(questions) {
  console.log('[데이터 매핑] 🔍 질문 배열 검증 시작');
  
  if (!Array.isArray(questions)) {
    console.error('[데이터 매핑] ❌ questions가 배열이 아님');
    return false;
  }
  
  if (questions.length === 0) {
    console.error('[데이터 매핑] ❌ questions가 비어있음');
    return false;
  }
  
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    
    if (!q.questionText) {
      console.error(`[데이터 매핑] ❌ questions[${i}]: questionText 없음`);
      return false;
    }
    
    if (!q.userAnswer || !q.userAnswer.transcript) {
      console.error(`[데이터 매핑] ❌ questions[${i}]: userAnswer.transcript 없음`);
      return false;
    }
  }
  
  console.log('[데이터 매핑] ✅ 질문 배열 검증 통과');
  return true;
}

/**
 * 기존 데이터를 새 스키마로 마이그레이션
 * 
 * @param {Object} oldData - 기존 데이터
 * @returns {Object} 새 스키마 데이터
 */
export function migrateToNewSchema(oldData) {
  console.log('[데이터 매핑] 🔄 스키마 마이그레이션 시작');
  
  // 기존 필드명 매핑
  const newData = {
    id: oldData.id,
    questionId: oldData.questionId,
    questionText: oldData.question || oldData.questionText, // 호환성
    userAnswer: {
      transcript: oldData.transcript || oldData.answer, // 호환성
      audioUrl: oldData.audioURL || oldData.audioUrl, // 대소문자 호환
      audioPath: oldData.audioPath || '',
      duration: oldData.duration || 0,
      answeredAt: oldData.answeredAt || oldData.createdAt || new Date().toISOString(),
    },
    aiFeedback: oldData.feedback ? {
      content: oldData.feedback,
      generatedAt: oldData.feedbackGeneratedAt || null,
    } : null,
  };
  
  console.log('[데이터 매핑] ✅ 스키마 마이그레이션 완료');
  
  return newData;
}
```

---

## 3단계: InterviewUI 통합 적용

### 파일: `src/app/components/InterviewUI.jsx` (수정)

```javascript
// 상단에 import 추가
import { 
  mapUserAnswer, 
  mapAIFeedback, 
  createStandardizedQuestionResult 
} from '@/utils/interviewDataMapper';

// saveAnswerInBackground 함수 수정
const saveAnswerInBackground = async (
  audioBlob,
  transcript,
  question,
  audioURL,
  duration
) => {
  try {
    console.log('========================================');
    console.log('[답변 저장] 🚀 표준화된 구조로 저장 시작');
    console.log('[답변 저장] - interviewId:', interviewId);
    console.log('[답변 저장] - questionCount:', questionCount + 1);
    console.log('========================================');
    
    // ===== [데이터 표준화] 원시 데이터 준비 =====
    const rawAnswerData = {
      transcript: transcript,
      audioURL: audioURL,
      audioPath: `recordings/${userId}/${interviewId}/q${questionCount + 1}_${Date.now()}.webm`,
      duration: duration,
    };
    
    // ===== [데이터 매핑] 표준화된 구조 생성 =====
    const standardizedQuestion = createStandardizedQuestionResult({
      questionIndex: questionCount + 1,
      questionText: question,
      rawAnswerData: rawAnswerData,
      llmResponse: null, // 개별 피드백은 사용하지 않음
      userId: userId,
      interviewId: interviewId
    });
    
    console.log('[답변 저장] ✅ 데이터 표준화 완료');
    console.log('[답변 저장] - 표준화된 구조:', {
      id: standardizedQuestion.id,
      questionId: standardizedQuestion.questionId,
      hasUserAnswer: !!standardizedQuestion.userAnswer,
      transcriptLength: standardizedQuestion.userAnswer.transcript.length
    });
    
    // ===== [Firestore 업데이트] arrayUnion으로 배열에 추가 =====
    const docRef = doc(db, 'interview_results', interviewId);
    
    await updateDoc(docRef, {
      questions: arrayUnion(standardizedQuestion), // 표준화된 객체 추가
      completedQuestions: increment(1),
      totalDuration: increment(duration),
      updatedAt: new Date().toISOString()
    });
    
    console.log('========================================');
    console.log('[답변 저장] ✅✅✅ 업데이트 성공! ✅✅✅');
    console.log('[답변 저장] - 현재까지 완료:', questionCount + 1, '/ 5');
    console.log('[답변 저장] - 저장 경로: interview_results/' + interviewId);
    console.log('========================================');
    
  } catch (error) {
    console.error('========================================');
    console.error('[답변 저장] ❌❌❌ 에러 발생! ❌❌❌');
    console.error('[답변 저장] - 에러:', error);
    console.error('[답변 저장] - error.message:', error.message);
    console.error('========================================');
  }
};
```

---

## 4단계: 종합 피드백 API 데이터 매핑

### 파일: `src/app/api/interview/generate-overall-feedback-v2/route.js` (수정)

```javascript
import { mapAIFeedback } from '@/utils/interviewDataMapper';

export async function POST(request) {
  try {
    // ... (기존 코드)
    
    // LLM 호출
    const completion = await openai.chat.completions.create({
      // ... (기존 설정)
    });

    const feedbackText = completion.choices[0].message.content;
    
    console.log('[종합 피드백 API] 📝 LLM 응답 수신');
    console.log('[종합 피드백 API] - 원본 응답 타입:', typeof feedbackText);
    
    // ===== [데이터 매핑] LLM 응답 표준화 =====
    let feedbackData;
    
    try {
      // JSON 파싱 시도
      const parsedData = JSON.parse(feedbackText);
      
      console.log('[종합 피드백 API] ✅ JSON 파싱 성공');
      console.log('[종합 피드백 API] - 필드:', Object.keys(parsedData).join(', '));
      
      // 표준 구조 검증 및 정리
      feedbackData = {
        overallConsistency: parsedData.overallConsistency || parsedData.consistency || '',
        strengths: parsedData.strengths || parsedData.strength || '',
        weaknesses: parsedData.weaknesses || parsedData.weakness || '',
        improvements: parsedData.improvements || parsedData.improvement || '',
        summary: parsedData.summary || ''
      };
      
      console.log('[종합 피드백 API] ✅ 표준 구조로 변환 완료');
      
    } catch (parseError) {
      console.warn('[종합 피드백 API] ⚠️ JSON 파싱 실패, 텍스트로 처리');
      
      // 텍스트 형태면 summary에 넣기
      feedbackData = {
        overallConsistency: '',
        strengths: '',
        weaknesses: '',
        improvements: '',
        summary: feedbackText
      };
    }
    
    // ===== [Firestore 업데이트] 표준화된 피드백 저장 =====
    await updateDoc(docRef, {
      overallFeedback: feedbackData,
      feedbackGeneratedAt: Timestamp.now(),
      updatedAt: new Date().toISOString()
    });
    
    console.log('[종합 피드백 API] ✅ 표준화된 피드백 저장 완료');
    
    return NextResponse.json({
      success: true,
      interviewId: interviewId,
      message: '종합 피드백이 성공적으로 생성되었습니다.'
    });
    
  } catch (error) {
    // ... (에러 처리)
  }
}
```

---

## 5단계: 데이터 검증 및 테스트

### 테스트 스크립트: `scripts/test-data-mapping.js`

```javascript
import {
  mapUserAnswer,
  mapAIFeedback,
  createStandardizedQuestionResult,
  validateQuestions
} from '../src/utils/interviewDataMapper.js';

console.log('========================================');
console.log('데이터 매핑 테스트 시작');
console.log('========================================');

// 테스트 1: 사용자 답변 매핑
console.log('\n[테스트 1] 사용자 답변 매핑');
const rawAnswer = {
  transcript: '저는 5년 경력의 백엔드 개발자입니다.',
  audioURL: 'https://storage.example.com/audio.mp3',
  audioPath: 'recordings/user123/interview_123/q1.webm',
  duration: 45
};

const userAnswer = mapUserAnswer(rawAnswer, 'user123', 'interview_123', 1);
console.log('✅ 결과:', JSON.stringify(userAnswer, null, 2));

// 테스트 2: AI 피드백 매핑 (텍스트)
console.log('\n[테스트 2] AI 피드백 매핑 (텍스트)');
const llmText = '답변이 명확하고 구체적입니다.';
const feedback1 = mapAIFeedback(llmText);
console.log('✅ 결과:', JSON.stringify(feedback1, null, 2));

// 테스트 3: AI 피드백 매핑 (JSON)
console.log('\n[테스트 3] AI 피드백 매핑 (JSON)');
const llmJson = {
  feedback: '기술 스택이 명확합니다.',
  strengths: '경험이 풍부합니다.'
};
const feedback2 = mapAIFeedback(llmJson);
console.log('✅ 결과:', JSON.stringify(feedback2, null, 2));

// 테스트 4: 전체 워크플로우
console.log('\n[테스트 4] 전체 워크플로우');
const standardized = createStandardizedQuestionResult({
  questionIndex: 1,
  questionText: '자기소개를 해주세요.',
  rawAnswerData: rawAnswer,
  llmResponse: llmText,
  userId: 'user123',
  interviewId: 'interview_123'
});
console.log('✅ 결과:', JSON.stringify(standardized, null, 2));

// 테스트 5: 배열 검증
console.log('\n[테스트 5] 배열 검증');
const questions = [standardized];
const isValid = validateQuestions(questions);
console.log('✅ 검증 결과:', isValid);

console.log('\n========================================');
console.log('모든 테스트 완료!');
console.log('========================================');
```

---

## 📊 데이터 흐름 다이어그램

```
[사용자 녹음 완료]
         ↓
[원시 데이터 수집]
   - transcript (STT)
   - audioBlob
   - duration
         ↓
[mapUserAnswer()]
   ✅ 표준화된 userAnswer 객체 생성
         ↓
[LLM API 호출] (선택적)
         ↓
[mapAIFeedback()]
   ✅ 표준화된 aiFeedback 객체 생성
         ↓
[createStandardizedQuestionResult()]
   ✅ InterviewQuestionResult 생성
   {
     id, questionId, questionText,
     userAnswer: { ... },
     aiFeedback: { ... }
   }
         ↓
[Firestore: arrayUnion()]
   ✅ interview_results/{interviewId}/questions 배열에 추가
         ↓
[결과 페이지 렌더링]
   ✅ 표준화된 구조로 UI 표시
```

---

## ✅ 체크리스트

### 필수 작업
- [ ] `src/types/interview.types.js` 파일 생성 (타입 정의)
- [ ] `src/utils/interviewDataMapper.js` 파일 생성 (매핑 함수)
- [ ] InterviewUI에서 `createStandardizedQuestionResult` 사용
- [ ] 종합 피드백 API에서 LLM 응답 표준화 처리
- [ ] 데이터 검증 로직 추가

### 테스트
- [ ] 테스트 스크립트 실행
- [ ] 새로운 면접 진행 → Firestore 데이터 구조 확인
- [ ] 결과 페이지에서 모든 필드 정상 표시 확인

---

## 🎯 장점

### 1. **타입 안전성**
- 명확한 인터페이스 정의
- 컴파일 타임 오류 감지 (TypeScript 사용 시)

### 2. **유지보수성**
- 데이터 구조가 한 곳에 정의됨
- 변경 시 한 파일만 수정

### 3. **확장성**
- 새로운 필드 추가 용이
- LLM 응답 형식 변경에 유연하게 대응

### 4. **디버깅 용이**
- 각 단계별 로깅
- 데이터 검증 함수 제공

---

**작성일**: 2025-11-12  
**작성자**: AI Assistant  
**버전**: 1.0.0

