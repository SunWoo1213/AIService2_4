'use client';

import { useState } from 'react';
import Button from './ui/Button';

/**
 * FeedbackRating Component
 * 
 * 피드백 평가를 받는 컴포넌트입니다.
 * 
 * Props:
 * - feedbackId: string (필수)
 * - userId: string (필수)
 * - onRatingComplete?: (rating, reason) => void (선택)
 */
export default function FeedbackRating({ feedbackId, userId, onRatingComplete }) {
  const [rated, setRated] = useState(false);
  const [showReasonPrompt, setShowReasonPrompt] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const handleGoodRating = async () => {
    setSubmitting(true);

    try {
      const response = await fetch('/api/feedback/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          feedbackId,
          userId,
          rating: 'good'
        })
      });

      if (!response.ok) {
        throw new Error('평가 저장 실패');
      }

      const result = await response.json();
      setMessage(result.message);
      setRated(true);

      if (onRatingComplete) {
        onRatingComplete('good', null);
      }
    } catch (error) {
      console.error('평가 오류:', error);
      alert('평가 저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBadRating = () => {
    setShowReasonPrompt(true);
  };

  const handleReasonSelect = async (reason) => {
    setSubmitting(true);

    try {
      const response = await fetch('/api/feedback/rate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          feedbackId,
          userId,
          rating: 'bad',
          reason
        })
      });

      if (!response.ok) {
        throw new Error('평가 저장 실패');
      }

      const result = await response.json();
      setMessage(result.message);
      setRated(true);
      setShowReasonPrompt(false);

      if (onRatingComplete) {
        onRatingComplete('bad', reason);
      }
    } catch (error) {
      console.error('평가 오류:', error);
      alert('평가 저장 중 오류가 발생했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (rated) {
    return (
      <div className="bg-green-50 border border-green-300 rounded-lg p-6 text-center">
        <p className="text-green-800 font-medium">✅ {message}</p>
      </div>
    );
  }

  if (showReasonPrompt) {
    return (
      <div className="bg-white border border-gray-300 rounded-lg p-6">
        <h4 className="text-lg font-bold text-gray-800 mb-4 text-center">어떤 점이 아쉬웠나요?</h4>
        <div className="space-y-3">
          <Button
            onClick={() => handleReasonSelect('abstract')}
            variant="secondary"
            fullWidth
            disabled={submitting}
          >
            설명이 추상적이에요
          </Button>
          <Button
            onClick={() => handleReasonSelect('needs_examples')}
            variant="secondary"
            fullWidth
            disabled={submitting}
          >
            예시가 더 필요해요
          </Button>
          <Button
            onClick={() => handleReasonSelect('needs_refinement')}
            variant="secondary"
            fullWidth
            disabled={submitting}
          >
            문장을 다듬어주세요
          </Button>
          <Button
            onClick={() => setShowReasonPrompt(false)}
            variant="secondary"
            fullWidth
            disabled={submitting}
          >
            취소
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-300 rounded-lg p-6">
      <h4 className="text-lg font-bold text-gray-800 mb-4 text-center">이 피드백이 충분했나요?</h4>
      <div className="flex gap-4 justify-center">
        <Button
          onClick={handleGoodRating}
          className="flex items-center gap-2"
          disabled={submitting}
        >
          <span className="text-xl">👍</span>
          유용했어요
        </Button>
        <Button
          onClick={handleBadRating}
          variant="secondary"
          className="flex items-center gap-2"
          disabled={submitting}
        >
          <span className="text-xl">👎</span>
          아쉬워요
        </Button>
      </div>
    </div>
  );
}




