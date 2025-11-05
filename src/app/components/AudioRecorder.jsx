'use client';

import { useState, useRef, useEffect } from 'react';
import Button from './ui/Button';
import Loading from './ui/Loading';

/**
 * AudioRecorder Component
 * 
 * 음성 녹음 및 STT를 수행하는 컴포넌트입니다.
 * 
 * Props:
 * - userId: string (필수)
 * - onComplete: (transcriptionId, summary, sttResult) => void (필수)
 * - onRetry: () => void (선택)
 */
export default function AudioRecorder({ userId, onComplete, onRetry }) {
  // UI 상태: IDLE, RECORDING, ANALYZING, CONFIRMING, ERROR
  const [uiState, setUiState] = useState('IDLE');
  const [recordingTime, setRecordingTime] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  
  // STT 및 요약 결과
  const [sttResult, setSttResult] = useState('');
  const [summary, setSummary] = useState('');
  const [transcriptionId, setTranscriptionId] = useState(null);

  // 녹음 관련 refs
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const recognitionRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const timerIntervalRef = useRef(null);

  // 브라우저 지원 확인
  const [browserSupported, setBrowserSupported] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setBrowserSupported(false);
      }
    }

    // 컴포넌트 언마운트 시 정리
    return () => {
      stopRecordingInternal();
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  // ===== 녹음 시작 =====
  const startRecording = async () => {
    if (!browserSupported) {
      setErrorMessage('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 브라우저를 사용해주세요.');
      setUiState('ERROR');
      return;
    }

    try {
      // 초기화
      finalTranscriptRef.current = '';
      setSttResult('');
      setRecordingTime(0);

      // 오디오 스트림 가져오기
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      // MediaRecorder 설정
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        sendAudioForAnalysis(audioBlob);
      };

      mediaRecorderRef.current.start();

      // SpeechRecognition 시작
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'ko-KR';
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;

      recognitionRef.current.onresult = (event) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;

          if (event.results[i].isFinal) {
            finalTranscriptRef.current += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        // 화면에는 표시하지 않음 (Live STT 제거)
        // setSttResult(finalTranscriptRef.current + interimTranscript);
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        if (event.error === 'not-allowed') {
          setErrorMessage('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
          setUiState('ERROR');
          stopRecordingInternal();
        }
      };

      // 음성 인식 자동 재시작
      recognitionRef.current.onend = () => {
        if (isRecordingRef.current && recognitionRef.current) {
          setTimeout(() => {
            if (isRecordingRef.current) {
              try {
                recognitionRef.current.start();
              } catch (error) {
                console.error('재시작 실패:', error);
              }
            }
          }, 100);
        }
      };

      recognitionRef.current.start();
      isRecordingRef.current = true;
      setUiState('RECORDING');

      // 타이머 시작
      timerIntervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('마이크 접근 오류:', error);
      setErrorMessage('마이크에 접근할 수 없습니다. 브라우저 설정에서 마이크 권한을 확인해주세요.');
      setUiState('ERROR');
    }
  };

  // ===== 녹음 중지 =====
  const stopRecording = () => {
    isRecordingRef.current = false;

    // SpeechRecognition 중지
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    // 최종 텍스트 저장
    const finalText = finalTranscriptRef.current.trim();
    setSttResult(finalText);

    // MediaRecorder 중지 (onstop에서 서버 전송됨)
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    // 오디오 스트림 정리
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    // 타이머 중지
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    // 상태 변경
    setUiState('ANALYZING');
  };

  // 내부 정리 함수
  const stopRecordingInternal = () => {
    isRecordingRef.current = false;

    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  };

  // ===== 서버로 오디오 전송 =====
  const sendAudioForAnalysis = async (audioBlob) => {
    try {
      const finalText = finalTranscriptRef.current.trim();

      const formData = new FormData();
      formData.append('audio', audioBlob, 'voice_feedback.webm');
      formData.append('userId', userId);
      formData.append('transcript', finalText); // 브라우저 STT 결과 전송

      const response = await fetch('/api/voice/transcribe', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('서버 응답 오류');
      }

      const result = await response.json();

      if (result.status === 'OK') {
        // 성공: 요약 결과 표시
        setSummary(result.summary);
        setSttResult(result.stt_result);
        setTranscriptionId(result.transcriptionId);
        setUiState('CONFIRMING');
      } else if (result.status === 'UNCERTAIN') {
        // 불확실: 부드러운 에러 메시지
        setErrorMessage('말씀이 잠깐 끊긴 것 같아요. 한 번만 더 말씀해주실까요?');
        setUiState('ERROR');
      } else if (result.status === 'OFF_TOPIC') {
        // 주제 벗어남
        setErrorMessage(result.summary);
        setUiState('ERROR');
      }

    } catch (error) {
      console.error('오디오 분석 오류:', error);
      setErrorMessage('음성 처리 중 오류가 발생했습니다. 다시 시도해주세요.');
      setUiState('ERROR');
    }
  };

  // ===== 계속하기 (확인) =====
  const handleConfirm = () => {
    if (onComplete) {
      onComplete(transcriptionId, summary, sttResult);
    }
  };

  // ===== 다시 녹음 =====
  const handleRetry = () => {
    // 상태 초기화
    setUiState('IDLE');
    setSummary('');
    setSttResult('');
    setTranscriptionId(null);
    setErrorMessage('');
    finalTranscriptRef.current = '';

    if (onRetry) {
      onRetry();
    }
  };

  // ===== 에러에서 재시도 =====
  const handleRetryFromError = () => {
    setUiState('IDLE');
    setErrorMessage('');
    finalTranscriptRef.current = '';
  };

  // ===== 시간 포맷팅 =====
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ===== UI 렌더링 =====
  if (!browserSupported) {
    return (
      <div className="bg-red-50 border border-red-300 rounded-lg p-6 text-center">
        <p className="text-red-800 font-medium mb-2">⚠️ 음성 인식이 지원되지 않습니다</p>
        <p className="text-red-600 text-sm">Chrome 브라우저를 사용해주세요.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-6">
      {/* IDLE: 녹음 시작 전 */}
      {uiState === 'IDLE' && (
        <div className="text-center">
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto bg-primary-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-5xl">🎤</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">음성으로 피드백 받기</h3>
            <p className="text-gray-600 text-sm">
              궁금한 점이나 고민을 자유롭게 말씀해주세요.<br />
              예: "자소서가 너무 추상적인 것 같아요", "공고와 연결성을 높이고 싶어요"
            </p>
          </div>
          <Button onClick={startRecording} fullWidth>
            🎤 녹음 시작
          </Button>
        </div>
      )}

      {/* RECORDING: 녹음 중 */}
      {uiState === 'RECORDING' && (
        <div className="text-center">
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto bg-red-100 rounded-full flex items-center justify-center mb-4 animate-pulse">
              <span className="text-5xl">🎙️</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">녹음 중...</h3>
            <div className="text-3xl font-bold text-red-600 mb-2">{formatTime(recordingTime)}</div>
            <p className="text-gray-600 text-sm">
              자유롭게 말씀하세요. 끝나면 "녹음 종료"를 눌러주세요.
            </p>
          </div>
          <Button onClick={stopRecording} variant="danger" fullWidth>
            ⏹️ 녹음 종료
          </Button>
        </div>
      )}

      {/* ANALYZING: 분석 중 */}
      {uiState === 'ANALYZING' && (
        <div className="text-center py-12">
          <Loading size="lg" text="음성을 정리하고 있어요..." />
          <p className="text-gray-500 text-sm mt-4">잠시만 기다려주세요</p>
        </div>
      )}

      {/* CONFIRMING: 확인 단계 */}
      {uiState === 'CONFIRMING' && (
        <div>
          <div className="mb-6">
            <div className="mb-4">
              <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                ✅ 음성 인식 완료
              </span>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-600 mb-2">말씀하신 내용이</p>
              <p className="text-lg font-bold text-gray-800 mb-2">"{summary}"</p>
              <p className="text-sm text-gray-600">으로 이해했어요. 이대로 피드백을 진행할까요?</p>
            </div>

            {/* 원본 텍스트 (접기/펼치기) */}
            <details className="text-sm text-gray-500">
              <summary className="cursor-pointer hover:text-gray-700">내가 한 말 전체 보기</summary>
              <div className="mt-2 p-3 bg-gray-50 rounded border border-gray-200">
                {sttResult || '(텍스트 없음)'}
              </div>
            </details>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleRetry} variant="secondary" className="flex-1">
              다시 녹음
            </Button>
            <Button onClick={handleConfirm} className="flex-1">
              계속하기
            </Button>
          </div>
        </div>
      )}

      {/* ERROR: 에러 상태 */}
      {uiState === 'ERROR' && (
        <div className="text-center">
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto bg-yellow-100 rounded-full flex items-center justify-center mb-4">
              <span className="text-5xl">😅</span>
            </div>
            <p className="text-gray-800 font-medium mb-2">{errorMessage}</p>
          </div>
          <Button onClick={handleRetryFromError} fullWidth>
            다시 시도하기
          </Button>
        </div>
      )}
    </div>
  );
}

