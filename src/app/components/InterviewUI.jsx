'use client';

import { useState, useEffect, useRef } from 'react';
import Button from './ui/Button';
import Card from './ui/Card';
import { storage, db } from '@/firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, Timestamp, query, where, getDocs } from 'firebase/firestore';

export default function InterviewUI({ userId, initialQuestion, jobKeywords, resumeText, onComplete, tonePreference = 'friendly' }) {
  const [currentQuestion, setCurrentQuestion] = useState(initialQuestion);
  const [questionCount, setQuestionCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(initialQuestion?.time_limit || 60);
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [browserSupported, setBrowserSupported] = useState(true);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [interviewId] = useState(() => `interview_${Date.now()}`); // 면접 세션 고유 ID
  const [streamingQuestion, setStreamingQuestion] = useState(''); // 스트리밍 중인 질문
  const [isStreaming, setIsStreaming] = useState(false); // 스트리밍 상태
  const MAX_QUESTIONS = 5; // 최대 질문 수
  
  // ===== [마이크 선택 기능] State 추가 =====
  const [audioDevices, setAudioDevices] = useState([]); // 사용 가능한 마이크 목록
  const [selectedDeviceId, setSelectedDeviceId] = useState(''); // 선택된 마이크 ID (빈 문자열 = 기본 마이크)

  const recognitionRef = useRef(null);
  const timerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioStreamRef = useRef(null);
  const finalTranscriptRef = useRef('');
  const isRecordingRef = useRef(false);
  const recordingStartTimeRef = useRef(null);

  // TTS 기능: 질문을 음성으로 읽어주는 함수 (자동 녹음 제거)
  const speakQuestion = (text) => {
    if (window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
    }

    // ===== [타입 안전성] 방어 코드 추가 =====
    // text가 객체인 경우 (예: { question: "...", time_limit: 60 })
    if (typeof text === 'object' && text !== null) {
      text = text.question || '';
      console.warn('[TTS] ⚠️ speakQuestion에 객체가 전달됨, question 필드 추출:', text);
    }
    
    // text가 문자열이 아닌 경우 (null, undefined, 숫자 등)
    if (typeof text !== 'string') {
      text = String(text || '');
      console.warn('[TTS] ⚠️ speakQuestion에 비문자열 값 전달됨, 문자열로 변환:', text);
    }
    
    // 빈 문자열이면 TTS 실행하지 않음
    if (!text || text.trim().length === 0) {
      console.warn('[TTS] ⚠️ 빈 텍스트, TTS 실행하지 않음');
      return;
    }

    const processedText = text
      .replace(/\./g, '. ')
      .replace(/,/g, ', ')
      .replace(/\?/g, '? ')
      .replace(/\s+/g, ' ')
      .trim();

    const utterance = new SpeechSynthesisUtterance(processedText);
    utterance.lang = 'ko-KR';
    
    // 말투 설정에 따른 TTS 파라미터 조정
    if (tonePreference === 'friendly') {
      // 친근하고 격려하는 톤: 조금 느리고 부드러운 톤
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
    } else if (tonePreference === 'professional') {
      // 전문적이고 명확한 톤: 보통 속도, 중간 톤
      utterance.rate = 0.95;
      utterance.pitch = 0.9;
      utterance.volume = 1.0;
    } else if (tonePreference === 'formal') {
      // 격식 있고 정중한 톤: 약간 느리고 낮은 톤
      utterance.rate = 0.8;
      utterance.pitch = 0.85;
      utterance.volume = 1.0;
    } else {
      // 기본값
      utterance.rate = 0.85;
      utterance.pitch = 0.95;
      utterance.volume = 1.0;
    }

    const voices = window.speechSynthesis.getVoices();
    let selectedVoice = voices.find(voice => 
      voice.lang.includes('ko') && 
      (voice.name.includes('Male') || voice.name.includes('남성'))
    );
    
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => 
        voice.lang.includes('ko') && 
        (voice.name.includes('Female') || voice.name.includes('여성'))
      );
    }
    
    if (!selectedVoice) {
      selectedVoice = voices.find(voice => voice.lang.includes('ko'));
    }
    
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }

    utterance.onerror = (event) => {
      console.error('TTS 오류:', event.error);
    };

    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setBrowserSupported(false);
      }

      if (window.speechSynthesis) {
        const loadVoices = () => {
          const voices = window.speechSynthesis.getVoices();
          console.log('사용 가능한 TTS 음성:', voices.length, '개');
        };

        loadVoices();

        if (window.speechSynthesis.onvoiceschanged !== undefined) {
          window.speechSynthesis.onvoiceschanged = loadVoices;
        }
      }
    }
  }, []);

  // ===== [마이크 선택 기능] 마이크 목록 불러오기 및 장치 변경 감지 =====
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.mediaDevices) {
      console.warn('⚠️ MediaDevices API를 사용할 수 없습니다.');
      return;
    }

    // 마이크 목록을 가져오는 함수
    const loadAudioDevices = async () => {
      try {
        // 마이크 권한 요청 (권한이 있어야 label이 표시됨)
        await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // 모든 미디어 장치 가져오기
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // 오디오 입력 장치만 필터링
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        
        console.log('========================================');
        console.log('[마이크 선택] 사용 가능한 오디오 입력 장치:', audioInputs.length, '개');
        audioInputs.forEach((device, index) => {
          console.log(`[마이크 ${index + 1}] ID: ${device.deviceId}`);
          console.log(`         Label: ${device.label || '(권한 필요)'}`);
          console.log(`         GroupId: ${device.groupId}`);
        });
        console.log('========================================');
        
        setAudioDevices(audioInputs);
        
        // 기본 마이크가 선택되지 않았다면 첫 번째 장치를 선택
        if (!selectedDeviceId && audioInputs.length > 0) {
          setSelectedDeviceId(audioInputs[0].deviceId);
          console.log('[마이크 선택] 기본 마이크 자동 선택:', audioInputs[0].label);
        }
      } catch (error) {
        console.error('[마이크 선택] 장치 목록 가져오기 실패:', error);
        if (error.name === 'NotAllowedError') {
          console.warn('⚠️ 마이크 권한이 거부되었습니다. 사용자가 권한을 허용해야 마이크 목록을 볼 수 있습니다.');
        }
      }
    };

    // 초기 로드
    loadAudioDevices();

    // 장치 변경 감지 (마이크 연결/연결 해제 시 자동 갱신)
    const handleDeviceChange = () => {
      console.log('[마이크 선택] 🔄 장치 변경 감지됨, 목록 갱신 중...');
      loadAudioDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    // Cleanup
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [selectedDeviceId]);

  // 질문 변경 시: 타이머 리셋 및 TTS 시작 (자동 녹음 제거)
  useEffect(() => {
    if (currentQuestion && typeof window !== 'undefined' && window.speechSynthesis) {
      setIsTimerRunning(false);
      setTimeLeft(currentQuestion.time_limit);
      finalTranscriptRef.current = '';
      isRecordingRef.current = false;
      recordingStartTimeRef.current = null;
      
      const timer = setTimeout(() => {
        speakQuestion(currentQuestion.question); // 자동 녹음 제거
      }, 500);

      return () => {
        clearTimeout(timer);
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
        }
      };
    }
  }, [currentQuestion]);

  // 타이머 카운트다운 로직
  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            if (isRecording) {
              handleStopRecording();
            }
            setIsTimerRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }
  }, [isTimerRunning, timeLeft, isRecording]);

  // 오디오 녹음 시작 (MediaRecorder + SpeechRecognition)
  const startRecording = async () => {
    if (!browserSupported) {
      alert('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 브라우저를 사용해주세요.');
      return;
    }

    try {
      finalTranscriptRef.current = '';
      recordingStartTimeRef.current = Date.now();
      console.log('녹음 시작:', new Date(recordingStartTimeRef.current).toLocaleTimeString());

      // ===== [마이크 선택 기능] 선택된 마이크로 녹음 =====
      const audioConstraints = selectedDeviceId 
        ? { deviceId: { exact: selectedDeviceId } }  // 특정 마이크 선택
        : true;  // 기본 마이크 사용

      console.log('[마이크 선택] 사용할 마이크 ID:', selectedDeviceId || '(기본 마이크)');
      const selectedDevice = audioDevices.find(device => device.deviceId === selectedDeviceId);
      if (selectedDevice) {
        console.log('[마이크 선택] 사용할 마이크 이름:', selectedDevice.label);
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: audioConstraints 
      });
      audioStreamRef.current = stream;

      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });

      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // 녹음 중지 시 즉시 API로 전송
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        // [진단 1단계] 오디오 데이터 생성 확인
        console.log('[진단 1단계] 오디오 데이터:', audioBlob.size, 'bytes', '타입:', audioBlob.type);
        
        sendAudioForAnalysis(audioBlob);
      };

      mediaRecorderRef.current.start();

      // SpeechRecognition (백그라운드 - API 전송용)
      // 사용자가 답변 완료 버튼을 누를 때까지 계속 녹음
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.lang = 'ko-KR';
      recognitionRef.current.continuous = true; // 연속 녹음 활성화
      recognitionRef.current.interimResults = true; // 중간 결과 표시
      recognitionRef.current.maxAlternatives = 1; // 최적화

      recognitionRef.current.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          
          if (event.results[i].isFinal) {
            finalTranscriptRef.current += transcript + ' ';
            console.log('음성 인식 (최종):', transcript);
          } else {
            // 중간 결과도 로깅 (디버깅용)
            console.log('음성 인식 (중간):', transcript);
          }
        }
      };

      recognitionRef.current.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        // no-speech 에러는 침묵일 때 발생하지만, 계속 녹음해야 함
        if (['no-speech', 'audio-capture', 'aborted'].includes(event.error)) {
          console.log('일시적 에러 (무시):', event.error);
          // 자동 재시작하도록 onend에서 처리됨
          return;
        }
        
        if (event.error === 'not-allowed') {
          alert('마이크 권한이 거부되었습니다. 브라우저 설정에서 마이크 권한을 허용해주세요.');
          isRecordingRef.current = false;
          setIsRecording(false);
        }
      };

      // 음성 인식 자동 재시작 (정적 감지로 중단되어도 계속 녹음)
      recognitionRef.current.onend = () => {
        console.log('Speech recognition ended, 재시작 시도...');
        
        // 사용자가 답변 완료 버튼을 누르지 않았다면 계속 녹음
        if (isRecordingRef.current) {
          setTimeout(() => {
            if (isRecordingRef.current && recognitionRef.current) {
              try {
                console.log('Speech recognition 재시작 중...');
                recognitionRef.current.start();
              } catch (error) {
                // 이미 시작된 경우 발생하는 에러 무시
                if (error.message && error.message.includes('already started')) {
                  console.log('이미 시작됨, 무시');
                } else {
                  console.error('음성 인식 재시작 실패:', error);
                  // 재시도
                  setTimeout(() => {
                    if (isRecordingRef.current && recognitionRef.current) {
                      try {
                        recognitionRef.current.start();
                      } catch (e) {
                        console.error('재시도 실패:', e);
                      }
                    }
                  }, 300);
                }
              }
            }
          }, 100);
        } else {
          console.log('녹음 중지됨, 재시작하지 않음');
        }
      };

      recognitionRef.current.start();
      setIsRecording(true);
      isRecordingRef.current = true;
      
      if (!isTimerRunning) {
        setIsTimerRunning(true);
      }
    } catch (error) {
      console.error('마이크 접근 오류:', error);
      alert('마이크에 접근할 수 없습니다. 브라우저 설정에서 마이크 권한을 확인해주세요.');
    }
  };

  const handleStopRecording = async () => {
    console.log('=== 녹음 중지 ===');
    
    isRecordingRef.current = false;
    setIsRecording(false);
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(track => track.stop());
      audioStreamRef.current = null;
    }

    // [중요] 타이머 완전히 해제
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsTimerRunning(false);

    setIsProcessing(true);
  };

  // ===== [세트 기반] 백그라운드에서 답변 저장 (개별 피드백 제거) =====
  // 변경 사항: 개별 피드백 생성 제거, 답변 데이터만 저장
  // 이 함수의 목적:
  // 1. audioBlob을 Whisper API에 보내 정확한 transcript 추출 (STT용)
  // 2. 답변 데이터(transcript, audioURL)를 Firestore에 저장
  // 3. 개별 피드백은 생성하지 않음 (5개 모두 완료 후 종합 피드백 생성)
  const saveAnswerInBackground = async (
    audioBlob,
    transcript,
    question,
    audioURL,
    duration
  ) => {
    try {
      // ===== [진단 1단계] 함수 진입점 로깅 =====
      console.log('========================================');
      console.log('[백그라운드 평가] 함수 시작');
      console.log('[백그라운드 평가] 시작 시각:', new Date().toISOString());
      console.log('[백그라운드 평가] docId 생성 예정:', `${userId}_${interviewId}_q${questionCount + 1}`);
      console.log('========================================');
      
      // ===== [진단 1단계] 전달받은 데이터 확인 =====
      console.log('[백그라운드 평가] 📋 입력 데이터 검증:');
      console.log('[백그라운드 평가] - audioBlob:', {
        exists: !!audioBlob,
        size: audioBlob ? audioBlob.size : 0,
        type: audioBlob ? audioBlob.type : 'N/A'
      });
      console.log('[백그라운드 평가] - transcript:', {
        exists: !!transcript,
        isEmpty: !transcript || transcript.trim().length === 0,
        length: transcript ? transcript.length : 0,
        preview: transcript ? transcript.substring(0, 50) + '...' : '(비어있음)'
      });
      console.log('[백그라운드 평가] - question:', question ? question.substring(0, 50) + '...' : '(없음)');
      console.log('[백그라운드 평가] - audioURL:', audioURL ? '존재함 ✓' : '없음 ✗');
      console.log('[백그라운드 평가] - duration:', duration, '초');
      
      // ===== [에러 핸들링] 필수 데이터 검증 =====
      if (!audioBlob || audioBlob.size === 0) {
        throw new Error('❌ CRITICAL: audioBlob이 비어있거나 존재하지 않습니다!');
      }
      if (!transcript || transcript.trim().length === 0) {
        console.warn('⚠️ WARNING: transcript가 비어있습니다. API가 실패할 수 있습니다.');
      }
      if (!question) {
        throw new Error('❌ CRITICAL: question이 비어있습니다!');
      }
      
      console.log('[백그라운드 평가] ✅ 입력 데이터 검증 통과');
      
      // ===== [세트 기반] 개별 피드백 생성 제거 =====
      // 변경 사항: LLM API 호출 제거, 답변 데이터만 저장
      // Whisper STT는 선택적으로 사용 가능 (더 정확한 transcript)
      // 하지만 여기서는 Browser STT 결과를 그대로 사용
      
      console.log('[답변 저장] 💾 개별 피드백 없이 답변 데이터만 저장합니다.');
      console.log('[답변 저장] 💡 5개 질문 완료 후 종합 피드백이 생성됩니다.');
      
      // analysisResult 대신 null 사용 (피드백 없음)
      const analysisResult = null;

      // ===== [저장] Firestore에 결과 저장 =====
      // 저장되는 데이터:
      // - audioURL: 재생용 (사용자가 나중에 자신의 답변을 다시 들을 수 있음)
      // - transcript: 분석용 (AI가 평가한 텍스트 내용)
      // - feedback: AI 평가 결과 (strengths, weaknesses, improvements, summary)
      
      console.log('[백그라운드 평가] 💾 Firestore 저장 준비 중...');
      
      if (!db) {
        const errorMsg = '❌ FATAL: Firestore DB가 초기화되지 않았습니다!';
        console.error('[백그라운드 평가]', errorMsg);
        console.error('[백그라운드 평가] 💡 firebase/config.js에서 Firestore 초기화를 확인하세요!');
        throw new Error(errorMsg);
      }
      
      // ===== [세트 기반] feedback 필드는 null (종합 피드백만 생성) =====
      const answerData = {
        userId: userId,
        interviewId: interviewId,
        questionId: `q${questionCount + 1}`,
        question: question,
        transcript: transcript, // [분석용] 실제 답변 내용 (종합 평가에 사용)
        audioURL: audioURL, // [재생용] 오디오 파일 URL (다시 듣기 전용)
        feedback: null, // [세트 기반] 개별 피드백 없음
        duration: duration,
        timestamp: Timestamp.now(),
        createdAt: new Date().toISOString()
      };
      
      // ===== [진단 1단계] DB 업데이트 직전 로깅 =====
      console.log('[백그라운드 평가] 📝 Firestore 저장 시작');
      console.log('[백그라운드 평가] - 컬렉션:', 'interview_answers');
      console.log('[백그라운드 평가] - userId:', userId);
      console.log('[백그라운드 평가] - interviewId:', interviewId);
      console.log('[백그라운드 평가] - questionId:', `q${questionCount + 1}`);
      console.log('[백그라운드 평가] - 저장할 데이터 크기:', JSON.stringify(answerData).length, 'bytes');
      console.log('[백그라운드 평가] - feedback 필드 포함:', !!answerData.feedback);
      console.log('[백그라운드 평가] - 저장 시각:', new Date().toISOString());
      
      // ===== [에러 핸들링 2단계] Firestore 저장 try-catch =====
      try {
        // ===== [저장 실패 추적] 저장 직전에 기존 데이터 개수 확인 =====
        console.log('[백그라운드 평가] 🔍 저장 직전 - 기존 데이터 개수 확인 중...');
        try {
          const checkQuery = query(
            collection(db, 'interview_answers'),
            where('userId', '==', userId),
            where('interviewId', '==', interviewId)
          );
          const checkSnapshot = await getDocs(checkQuery);
          console.log('[백그라운드 평가] 📊 현재 이 면접의 답변 개수:', checkSnapshot.size, '개');
          console.log('[백그라운드 평가] 📝 이제 저장하면 총', checkSnapshot.size + 1, '개가 됩니다.');
        } catch (checkError) {
          console.warn('[백그라운드 평가] ⚠️ 개수 확인 실패 (무시하고 계속):', checkError.message);
        }
        
        console.log('[백그라운드 평가] 💾 addDoc 실행 중...');
        const docRef = await addDoc(collection(db, 'interview_answers'), answerData);
        
        // ===== [진단 1단계] DB 업데이트 성공 로깅 =====
        console.log('========================================');
        console.log('[백그라운드 평가] ✅✅✅ Firestore 저장 성공! ✅✅✅');
        console.log('[백그라운드 평가] - 저장된 문서 ID:', docRef.id);
        console.log('[백그라운드 평가] - 저장 경로: interview_answers/' + docRef.id);
        console.log('[백그라운드 평가] - 완료 시각:', new Date().toISOString());
        console.log('[백그라운드 평가] 🎉 백그라운드 평가 전체 프로세스 완료!');
        console.log('========================================');
        
      } catch (firestoreError) {
        // ===== [에러 핸들링 2단계] Firestore 에러 상세 로깅 =====
        console.error('========================================');
        console.error('[백그라운드 평가] ❌❌❌ Firestore 저장 실패! ❌❌❌');
        console.error('[백그라운드 평가] - 에러 코드:', firestoreError.code);
        console.error('[백그라운드 평가] - 에러 메시지:', firestoreError.message);
        console.error('[백그라운드 평가] - 에러 이름:', firestoreError.name);
        console.error('[백그라운드 평가] - 전체 에러 객체:', firestoreError);
        console.error('[백그라운드 평가] - 에러 스택:', firestoreError.stack);
        console.error('========================================');
        console.error('[백그라운드 평가] 💡 해결 방법:');
        console.error('[백그라운드 평가] 1. Firebase Console → Firestore Database → Rules');
        console.error('[백그라운드 평가] 2. "allow create, write" 권한이 있는지 확인');
        console.error('[백그라운드 평가] 3. Firestore가 활성화되어 있는지 확인');
        console.error('[백그라운드 평가] 4. 네트워크 연결 상태 확인');
        console.error('========================================');
        throw firestoreError; // 에러를 다시 던져서 외부 catch에서 처리
      }
      
    } catch (error) {
      // ===== [에러 핸들링 2단계] 최종 에러 핸들링 =====
      console.error('========================================');
      console.error('[백그라운드 평가] 💥💥💥 FATAL ERROR 💥💥💥');
      console.error('[백그라운드 평가] 백그라운드 평가 프로세스 중 치명적 오류 발생!');
      console.error('[백그라운드 평가] - 에러 타입:', error.name);
      console.error('[백그라운드 평가] - 에러 메시지:', error.message);
      console.error('[백그라운드 평가] - 전체 에러:', error);
      console.error('[백그라운드 평가] - 에러 스택:', error.stack);
      console.error('[백그라운드 평가] - 발생 시각:', new Date().toISOString());
      
      // 에러 원인 분석
      if (error.message.includes('audioBlob')) {
        console.error('[백그라운드 평가] 🔍 원인: 오디오 데이터 문제');
        console.error('[백그라운드 평가] → 마이크 권한 또는 녹음 실패 확인 필요');
      } else if (error.message.includes('question')) {
        console.error('[백그라운드 평가] 🔍 원인: 질문 데이터 누락');
        console.error('[백그라운드 평가] → 질문 생성 로직 확인 필요');
      } else if (error.message.includes('API')) {
        console.error('[백그라운드 평가] 🔍 원인: LLM API 호출 실패');
        console.error('[백그라운드 평가] → API 키, 네트워크, 서버 상태 확인 필요');
      } else if (error.message.includes('Firestore') || error.code) {
        console.error('[백그라운드 평가] 🔍 원인: Firestore 저장 실패');
        console.error('[백그라운드 평가] → Firestore 권한, 규칙, 연결 상태 확인 필요');
      } else {
        console.error('[백그라운드 평가] 🔍 원인: 알 수 없는 에러');
        console.error('[백그라운드 평가] → 위 스택 트레이스를 확인하세요');
      }
      
      console.error('========================================');
      
      // 에러를 다시 던지지 않고 여기서 멈춤 (사용자 플로우에 영향 없도록)
      // throw error; (주석 처리 - 백그라운드 작업 실패가 사용자에게 영향 없도록)
    }
  };

  // 오디오 파일을 서버로 전송하여 분석 및 Firebase에 저장
  const sendAudioForAnalysis = async (audioBlob) => {
    try {
      const finalAnswer = finalTranscriptRef.current.trim() || '답변 없음';
      
      const recordingEndTime = Date.now();
      const actualDurationInSeconds = recordingStartTimeRef.current 
        ? Math.round((recordingEndTime - recordingStartTimeRef.current) / 1000)
        : null;
      
      console.log('=== Firebase Storage 업로드 및 백그라운드 평가 시작 ===');
      console.log('질문:', currentQuestion.question);
      console.log('답변 길이:', finalAnswer.length, '자');
      console.log('녹음 시간:', actualDurationInSeconds, '초');

      // ===== [진단 1] Blob 유효성 검사 =====
      console.log('[진단 1] audioBlob 유효성 검사:');
      console.log('[진단 1] - size:', audioBlob.size, 'bytes');
      console.log('[진단 1] - type:', audioBlob.type);
      
      if (audioBlob.size === 0) {
        console.error('[진단 1] ❌ 치명적 오류: audioBlob의 size가 0입니다. 녹음이 실패했거나 마이크 권한이 없습니다!');
        alert('녹음에 실패했습니다. 마이크 권한을 확인해주세요.');
        return;
      } else if (audioBlob.size < 1000) {
        console.warn('[진단 1] ⚠️ 경고: audioBlob의 size가 매우 작습니다 (', audioBlob.size, 'bytes). 녹음이 제대로 되지 않았을 수 있습니다.');
      } else {
        console.log('[진단 1] ✅ audioBlob 유효성 검사 통과');
      }

      // ===== [재생용] Firebase Storage 업로드 시작 =====
      // 목적: 사용자가 나중에 자신의 답변을 다시 들을 수 있도록 오디오 파일 저장
      // 이 audioURL은 평가/분석에 사용되지 않고, 순수하게 재생(Playback)용도입니다.
      console.log('=== [재생용] Firebase Storage 업로드 시작 ===');
      
      let audioURL = null;
      
      if (storage) {
        const questionId = `q${questionCount + 1}`;
        const fileName = `${questionId}_${Date.now()}.webm`;
        const storagePath = `recordings/${userId}/${interviewId}/${fileName}`;
        const storageReference = ref(storage, storagePath);
        
        console.log('[진단 2] Storage 업로드 시작');
        console.log('[진단 2] - 업로드 경로:', storagePath);
        console.log('[진단 2] - 파일 이름:', fileName);
        console.log('[진단 2] - 파일 크기:', audioBlob.size, 'bytes');
        console.log('[진단 2] - Content-Type:', 'audio/webm');
        
        // ===== [진단 2] Storage 업로드 try-catch =====
        try {
          const uploadResult = await uploadBytes(storageReference, audioBlob, {
            contentType: 'audio/webm'
          });
          
          console.log('[진단 2] ✅ Storage 업로드 성공!');
          console.log('[진단 2] - 업로드된 경로:', uploadResult.metadata.fullPath);
          console.log('[진단 2] - 파일 크기:', uploadResult.metadata.size, 'bytes');
          console.log('[진단 2] - Content-Type:', uploadResult.metadata.contentType);
          
          // ===== [진단 3] Download URL 가져오기 try-catch =====
          console.log('[진단 3] Download URL 가져오기 시작');
          try {
            audioURL = await getDownloadURL(storageReference);
            console.log('[진단 3] ✅ Download URL 확보 성공!');
            console.log('[진단 3] - URL:', audioURL.substring(0, 80) + '...');
          } catch (urlError) {
            console.error('[진단 3] ❌ Download URL 가져오기 실패!');
            console.error('[진단 3] - 에러 코드:', urlError.code);
            console.error('[진단 3] - 에러 메시지:', urlError.message);
            console.error('[진단 3] - 전체 에러:', urlError);
            console.error('[진단 3] 💡 Firebase Storage Rules에서 allow read 권한을 확인하세요!');
          }
          
        } catch (uploadError) {
          console.error('[진단 2] ❌ Storage 업로드 실패!');
          console.error('[진단 2] - 에러 코드:', uploadError.code);
          console.error('[진단 2] - 에러 메시지:', uploadError.message);
          console.error('[진단 2] - 전체 에러:', uploadError);
          console.error('[진단 2] 💡 Firebase Storage Rules에서 allow write 권한을 확인하세요!');
          console.error('[진단 2] 💡 Firebase Storage가 활성화되어 있는지 확인하세요!');
          // Storage 실패해도 계속 진행 (URL은 null)
        }
      } else {
        console.error('[Firebase] ❌ Storage가 초기화되지 않았습니다!');
        console.error('[Firebase] 💡 firebase/config.js에서 Storage 초기화를 확인하세요!');
      }

      // ===== [분석용] 답변 평가를 백그라운드로 처리 (fire-and-forget) =====
      // 목적: 텍스트 transcript를 기반으로 AI가 답변 내용을 평가
      // 오디오 파일(audioBlob)은 Whisper STT로 더 정확한 transcript를 얻기 위해 전송하며,
      // 실제 평가는 오디오가 아닌 '텍스트 내용'만을 기반으로 수행됩니다.
      // 
      // 데이터 흐름:
      // 1. [저장용] audioBlob → Firebase Storage → audioURL (위에서 완료)
      // 2. [분석용] audioBlob → Whisper API → 정확한 transcript → LLM 분석 (여기서 수행)
      
      // ===== [3단계] 비동기 실행 보장 패턴 =====
      // 주의: 이 함수는 클라이언트 측에서 실행되므로 Vercel의 waitUntil이 필요하지 않습니다.
      // 하지만 에러가 발생해도 사용자 플로우에 영향을 주지 않도록 .catch()를 추가합니다.
      console.log('[메인 플로우] 백그라운드 평가 함수 호출 시작');
      
      saveAnswerInBackground(
        audioBlob,
        finalAnswer,
        currentQuestion.question,
        audioURL,
        actualDurationInSeconds
      ).catch(error => {
        // ===== [에러 핸들링 3단계] 백그라운드 작업 실패 시 처리 =====
        console.error('========================================');
        console.error('[메인 플로우] ⚠️ 백그라운드 평가 프로세스 실패');
        console.error('[메인 플로우] 하지만 사용자 플로우는 계속 진행됩니다.');
        console.error('[메인 플로우] - 에러:', error);
        console.error('[메인 플로우] - 에러 메시지:', error.message);
        console.error('[메인 플로우] - 발생 시각:', new Date().toISOString());
        console.error('========================================');
        
        // 에러가 발생해도 사용자 플로우에는 영향 없음
        // 사용자는 다음 질문으로 계속 진행하고, 결과 페이지에서 "분석 중..." 상태를 보게 됨
      });
      
      console.log('[메인 플로우] 백그라운드 평가 함수 호출 완료 (백그라운드 실행 중)');

      // 다음 질문 요청 또는 면접 완료
      const nextQuestionCount = questionCount + 1;
      
      if (nextQuestionCount < MAX_QUESTIONS) {
        // ===== [최적화] 다음 질문을 스트리밍으로 요청 =====
        console.log('=== 다음 질문 스트리밍 요청 ===');
        console.log('이전 질문:', currentQuestion.question);
        console.log('이전 답변:', finalAnswer.substring(0, 100));
        
        setIsStreaming(true);
        setStreamingQuestion('');
        
        try {
          const response = await fetch('/api/interview/generate-questions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jobKeywords: jobKeywords,
              resumeText: resumeText,
              previousAnswer: finalAnswer,
              previousQuestion: currentQuestion.question,
              questionCount: nextQuestionCount,
              streaming: true // 스트리밍 활성화
            }),
          });

          if (!response.ok) {
            throw new Error('다음 질문 생성 실패');
          }

          // SSE 스트림 읽기
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          let fullQuestion = '';

          while (true) {
            const { done, value } = await reader.read();
            
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                
                try {
                  const parsed = JSON.parse(data);
                  if (parsed.content) {
                    fullQuestion += parsed.content;
                    setStreamingQuestion(fullQuestion);
                  }
                } catch (e) {
                  console.error('스트림 파싱 오류:', e);
                }
              }
            }
          }

          setIsStreaming(false);
          console.log('스트리밍 완료:', fullQuestion);

          // JSON 파싱하여 질문 추출
          const jsonMatch = fullQuestion.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const questionData = JSON.parse(jsonMatch[0]);
            setCurrentQuestion(questionData);
            setQuestionCount(nextQuestionCount);
            setStreamingQuestion('');
            
            // 스트리밍 완료 후 TTS로 질문 읽어주기
            setTimeout(() => {
              speakQuestion(questionData.question);
            }, 500); // 0.5초 딜레이 후 TTS 시작
          } else {
            throw new Error('질문 파싱 실패');
          }
        } catch (streamError) {
          console.error('스트리밍 오류:', streamError);
          setIsStreaming(false);
          
          // 폴백: 비스트리밍 방식으로 재시도
          console.log('폴백: 비스트리밍 방식으로 재시도');
          const fallbackResponse = await fetch('/api/interview/generate-questions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jobKeywords: jobKeywords,
              resumeText: resumeText,
              previousAnswer: finalAnswer,
              previousQuestion: currentQuestion.question,
              questionCount: nextQuestionCount,
              streaming: false
            }),
          });

          if (!fallbackResponse.ok) {
            throw new Error('다음 질문 생성 실패');
          }

          const fallbackData = await fallbackResponse.json();
          setCurrentQuestion(fallbackData.question);
          setQuestionCount(nextQuestionCount);
          
          // 폴백 완료 후 TTS로 질문 읽어주기
          setTimeout(() => {
            speakQuestion(fallbackData.question);
          }, 500);
        }
      } else {
        // ===== [면접 완료] 모든 질문 종료 + 종합 피드백 생성 =====
        console.log('========================================');
        console.log('=== 면접 완료 ===');
        console.log('총', MAX_QUESTIONS, '개의 질문을 모두 완료했습니다.');
        console.log('========================================');
        
        // ===== [세트 기반] 종합 피드백 생성 시작 =====
        console.log('[종합 피드백] 🚀 5개 답변 종합 평가 시작');
        console.log('[종합 피드백] - interviewId:', interviewId);
        console.log('[종합 피드백] - userId:', userId);
        
        // 종합 피드백 생성을 비동기로 처리 (백그라운드)
        fetch('/api/interview/generate-overall-feedback', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            interviewId: interviewId,
            userId: userId
          }),
        }).then(response => {
          if (!response.ok) {
            throw new Error(`종합 피드백 생성 실패: ${response.status}`);
          }
          return response.json();
        }).then(feedbackResult => {
          console.log('========================================');
          console.log('[종합 피드백] ✅✅✅ 종합 피드백 생성 완료! ✅✅✅');
          console.log('[종합 피드백] - 피드백 ID:', feedbackResult.feedbackId || '(저장됨)');
          console.log('[종합 피드백] 💡 결과 페이지에서 종합 피드백을 확인할 수 있습니다!');
          console.log('========================================');
        }).catch(error => {
          console.error('========================================');
          console.error('[종합 피드백] ❌ 종합 피드백 생성 실패');
          console.error('[종합 피드백] - 에러:', error.message);
          console.error('[종합 피드백] 💡 개별 답변 내역은 저장되어 있습니다.');
          console.error('========================================');
        });
        
        // 종합 피드백 생성과 관계없이 결과 페이지로 즉시 이동
        if (onComplete) {
          onComplete(interviewId);
        }
      }
    } catch (error) {
      // [진단 3단계] 에러 발생 시
      console.error('[진단 3단계] STT API 에러:', error);
      console.error('[진단 3단계] 에러 상세:', {
        message: error.message,
        stack: error.stack
      });
      
      alert('음성 분석 중 오류가 발생했습니다.');
    } finally {
      setIsProcessing(false);
    }
  };


  if (!currentQuestion) {
    return <div>질문을 불러오는 중...</div>;
  }

  // ===== [로딩 UI] 답변 제출 후 다음 질문 준비 중 =====
  if (isProcessing) {
    if (isStreaming && streamingQuestion) {
      // 스트리밍 중: 질문이 타이핑되듯이 표시
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
          <Card className="max-w-3xl w-full">
            <div className="text-center py-8">
              {/* 애니메이션 아이콘 */}
              <div className="mb-6">
                <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-full animate-pulse">
                  <span className="text-4xl">✨</span>
                </div>
              </div>

              {/* 메인 메시지 */}
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                AI 면접관이 다음 질문을 생성하고 있습니다
              </h2>
              <p className="text-gray-600 mb-6">
                답변을 분석하고 맞춤형 질문을 준비 중입니다
              </p>

              {/* 스트리밍 질문 표시 */}
              <div className="text-left bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-indigo-200 rounded-xl p-6 shadow-inner">
                <div className="flex items-start space-x-3 mb-3">
                  <span className="text-xl">💭</span>
                  <p className="text-sm font-semibold text-indigo-900">생성 중인 질문</p>
                </div>
                <p className="text-base text-gray-800 leading-relaxed whitespace-pre-wrap">
                  {streamingQuestion}
                  <span className="inline-block w-2 h-5 bg-indigo-600 ml-1 animate-pulse"></span>
                </p>
              </div>

              {/* 안내 메시지 */}
              <div className="mt-6 flex items-center justify-center space-x-2 text-sm text-gray-500">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span>답변 평가는 백그라운드에서 자동 진행됩니다</span>
              </div>
            </div>
          </Card>
        </div>
      );
    } else {
      // 스트리밍 전: 깔끔한 로딩 UI
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
          <Card className="max-w-2xl w-full">
            <div className="text-center py-12 px-6">
              {/* 애니메이션 아이콘 */}
              <div className="mb-8 relative">
                {/* 외부 원 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-24 h-24 border-4 border-primary-200 rounded-full animate-ping opacity-75"></div>
                </div>
                {/* 중간 원 */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 border-4 border-primary-300 rounded-full animate-pulse"></div>
                </div>
                {/* 중심 스피너 */}
                <div className="relative flex items-center justify-center">
                  <div className="w-16 h-16 border-4 border-primary-600 border-t-transparent rounded-full animate-spin"></div>
                  <span className="absolute text-2xl">🤖</span>
                </div>
              </div>

              {/* 메인 메시지 */}
              <h2 className="text-2xl font-bold text-gray-900 mb-3">
                AI 면접관이 답변을 분석하고 다음 질문을 준비 중입니다
              </h2>
              <p className="text-gray-600 mb-6">
                잠시만 기다려 주세요. 곧 다음 질문이 표시됩니다
              </p>

              {/* 진행 단계 표시 */}
              <div className="space-y-3 max-w-md mx-auto">
                <div className="flex items-center space-x-3 text-sm">
                  <div className="flex-shrink-0 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center text-white">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <span className="text-gray-700">답변 녹음 완료</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="flex-shrink-0 w-6 h-6 bg-yellow-500 rounded-full flex items-center justify-center">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  </div>
                  <span className="text-gray-700 font-medium">답변 내용 분석 중...</span>
                </div>
                <div className="flex items-center space-x-3 text-sm">
                  <div className="flex-shrink-0 w-6 h-6 bg-gray-300 rounded-full"></div>
                  <span className="text-gray-500">맞춤형 후속 질문 생성 대기</span>
                </div>
              </div>

              {/* 안내 메시지 */}
              <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-start space-x-2 text-sm text-blue-800">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-left">
                    <p className="font-semibold mb-1">답변 평가는 백그라운드에서 자동 진행됩니다</p>
                    <p className="text-xs text-blue-700">면접이 끝난 후 결과 페이지에서 상세한 피드백을 확인하실 수 있습니다</p>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      );
    }
  }

  const progress = ((questionCount + 1) / MAX_QUESTIONS) * 100;

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>진행률</span>
          <span>{questionCount + 1} / {MAX_QUESTIONS}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-primary-600 h-3 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>

      <Card>
        <div className="mb-6">
          <span className="inline-block px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm font-medium mb-4">
            질문 {questionCount + 1}
          </span>
          <h2 className="text-2xl font-bold text-gray-800">
            {currentQuestion.question}
          </h2>
        </div>

        {/* Timer */}
        <div className="mb-6 text-center">
          {!isRecording && !isTimerRunning ? (
            <div className="mb-4">
              <div className="inline-flex items-center px-4 py-2 bg-blue-100 text-blue-800 rounded-full">
                <span className="animate-pulse mr-2">🎧</span>
                <span className="font-medium">질문을 듣고 있습니다...</span>
              </div>
            </div>
          ) : null}
          {isTimerRunning && (
            <>
              <div className={`text-6xl font-bold ${timeLeft <= 10 ? 'text-red-600' : 'text-primary-600'}`}>
                {timeLeft}
              </div>
              <p className="text-gray-600 mt-2">초 남음</p>
            </>
          )}
        </div>

        {/* Recording status */}
        {isRecording && (
          <div className="mb-6 text-center">
            <div className="inline-flex items-center px-6 py-3 bg-red-100 text-red-800 rounded-full animate-pulse">
              <span className="text-2xl mr-2">🎙️</span>
              <span className="font-bold">녹음 중...</span>
            </div>
            <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-semibold mb-1">
                💡 중요: 잠시 멈추셔도 괜찮습니다
              </p>
              <p className="text-xs text-blue-700">
                생각할 시간이 필요하면 잠시 멈추셔도 녹음은 계속됩니다.<br />
                답변이 완전히 끝나면 아래 <strong>&ldquo;답변 완료&rdquo;</strong> 버튼을 눌러주세요.
              </p>
            </div>
          </div>
        )}

        {!browserSupported && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-800 rounded-lg">
            <p className="font-medium">⚠️ 음성 인식이 지원되지 않습니다.</p>
            <p className="text-sm mt-1">Chrome 브라우저를 사용해주세요.</p>
          </div>
        )}

        {/* ===== [마이크 선택 기능] 마이크 선택 드롭다운 ===== */}
        {!isRecording && !isTimerRunning && audioDevices.length > 0 && (
          <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 mt-1">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <label htmlFor="microphone-select" className="block text-sm font-semibold text-blue-900 mb-2">
                  🎙️ 마이크 선택
                </label>
                <select
                  id="microphone-select"
                  value={selectedDeviceId}
                  onChange={(e) => {
                    setSelectedDeviceId(e.target.value);
                    console.log('[마이크 선택] 사용자가 마이크 변경:', e.target.options[e.target.selectedIndex].text);
                  }}
                  className="w-full px-3 py-2 bg-white border-2 border-blue-300 rounded-lg 
                           text-gray-800 font-medium
                           focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                           hover:border-blue-400 transition-colors cursor-pointer"
                >
                  {audioDevices.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `마이크 ${audioDevices.indexOf(device) + 1}`}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-blue-700 mt-2">
                  💡 외부 마이크를 연결하셨다면 위에서 선택해주세요. 더 나은 음질로 녹음됩니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        {!isRecording && !isTimerRunning && (
          <div className="space-y-3">
            <Button
              onClick={startRecording}
              fullWidth
              className="bg-primary-600 hover:bg-primary-700 text-lg py-4 font-bold shadow-lg"
            >
              🎤 녹음 시작
            </Button>
            <p className="text-xs text-center text-gray-500">
              준비가 되면 위 버튼을 눌러 답변을 시작하세요
            </p>
          </div>
        )}
        
        {isRecording && (
          <div className="space-y-3">
            <Button
              onClick={handleStopRecording}
              fullWidth
              className="bg-green-600 hover:bg-green-700 text-lg py-4 font-bold shadow-lg"
            >
              ✅ 답변 완료
            </Button>
            <p className="text-xs text-center text-gray-500">
              답변이 모두 끝났다면 위 버튼을 눌러주세요
            </p>
          </div>
        )}
      </Card>

    </div>
  );
}
