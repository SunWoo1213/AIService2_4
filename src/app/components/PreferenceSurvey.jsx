'use client';

import { useState } from 'react';
import Button from './ui/Button';
import Modal from './ui/Modal';

/**
 * PreferenceSurvey Component
 * 
 * 초기 사용자 설문 모달입니다.
 * 
 * Props:
 * - userId: string (필수)
 * - isOpen: boolean (필수)
 * - onComplete: () => void (필수)
 */
export default function PreferenceSurvey({ userId, isOpen, onComplete }) {
  const [step, setStep] = useState(1);
  const [tonePreference, setTonePreference] = useState('friendly');
  const [feedbackDepth, setFeedbackDepth] = useState('detailed_examples');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);

    try {
      const response = await fetch('/api/user/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          tone_preference: tonePreference,
          feedback_depth: feedbackDepth,
          first_survey_completed: true
        })
      });

      if (!response.ok) {
        throw new Error('설정 저장 실패');
      }

      if (onComplete) {
        onComplete();
      }
    } catch (error) {
      console.error('설문 제출 오류:', error);
      alert('설정 저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    if (step < 2) {
      setStep(step + 1);
    } else {
      handleSubmit();
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={() => {}} closeOnOverlay={false}>
      <div className="p-6">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {step === 1 ? '피드백 톤 설정' : '피드백 상세도 설정'}
          </h2>
          <p className="text-gray-600 text-sm">
            {step === 1 
              ? '어떤 톤의 피드백을 선호하시나요?' 
              : '얼마나 상세한 피드백을 원하시나요?'}
          </p>
          <div className="mt-4">
            <div className="flex items-center gap-2">
              <div className={`h-2 flex-1 rounded ${step >= 1 ? 'bg-primary-600' : 'bg-gray-200'}`}></div>
              <div className={`h-2 flex-1 rounded ${step >= 2 ? 'bg-primary-600' : 'bg-gray-200'}`}></div>
            </div>
          </div>
        </div>

        {/* Step 1: 톤 설정 */}
        {step === 1 && (
          <div className="space-y-3 mb-6">
            <button
              onClick={() => setTonePreference('friendly')}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                tonePreference === 'friendly'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">😊</span>
                <div>
                  <p className="font-bold text-gray-800">친근하고 격려하는 톤</p>
                  <p className="text-sm text-gray-600">부담 없이 편하게 피드백 받고 싶어요</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setTonePreference('professional')}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                tonePreference === 'professional'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">💼</span>
                <div>
                  <p className="font-bold text-gray-800">전문적이고 명확한 톤</p>
                  <p className="text-sm text-gray-600">객관적이고 정확한 피드백을 원해요</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setTonePreference('formal')}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                tonePreference === 'formal'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎓</span>
                <div>
                  <p className="font-bold text-gray-800">격식 있고 정중한 톤</p>
                  <p className="text-sm text-gray-600">존댓말과 격식을 갖춘 피드백이 좋아요</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* Step 2: 상세도 설정 */}
        {step === 2 && (
          <div className="space-y-3 mb-6">
            <button
              onClick={() => setFeedbackDepth('summary_only')}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                feedbackDepth === 'summary_only'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">📝</span>
                <div>
                  <p className="font-bold text-gray-800">간단하게 핵심만</p>
                  <p className="text-sm text-gray-600">빠르게 요점만 파악하고 싶어요</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setFeedbackDepth('detailed_examples')}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                feedbackDepth === 'detailed_examples'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">💡</span>
                <div>
                  <p className="font-bold text-gray-800">구체적인 예시와 함께</p>
                  <p className="text-sm text-gray-600">실행 가능한 구체적 조언을 원해요 (추천)</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setFeedbackDepth('comprehensive')}
              className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                feedbackDepth === 'comprehensive'
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">📚</span>
                <div>
                  <p className="font-bold text-gray-800">매우 상세하고 포괄적으로</p>
                  <p className="text-sm text-gray-600">모든 세부사항까지 꼼꼼히 알고 싶어요</p>
                </div>
              </div>
            </button>
          </div>
        )}

        {/* 버튼 */}
        <div className="flex gap-3">
          {step > 1 && (
            <Button onClick={handlePrev} variant="secondary" className="flex-1">
              이전
            </Button>
          )}
          <Button
            onClick={handleNext}
            fullWidth={step === 1}
            className={step > 1 ? 'flex-1' : ''}
            disabled={submitting}
          >
            {step === 2 ? (submitting ? '저장 중...' : '완료') : '다음'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}





