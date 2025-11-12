'use client';

import { useState } from 'react';
import Button from './ui/Button';
import Textarea from './ui/Textarea';
import Card from './ui/Card';

export default function JobUploader({ onAnalysisComplete }) {
  const [jobText, setJobText] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('text'); // 'text' or 'pdf'

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'application/pdf') {
      setError('PDF 파일만 업로드 가능합니다.');
      return;
    }

    setFile(selectedFile);
    setError('');

    // Extract text from PDF
    try {
      const text = await extractTextFromPDF(selectedFile);
      setJobText(text);
    } catch (err) {
      console.error('PDF extraction error:', err);
      setError('PDF 텍스트 추출에 실패했습니다. 텍스트를 직접 입력해주세요.');
    }
  };

  const extractTextFromPDF = async (file) => {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + '\n';
    }
    
    return fullText;
  };

  const handleAnalyze = async () => {
    if (!jobText.trim()) {
      setError('채용 공고 내용을 입력해주세요.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/job/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ jobText }),
      });

      if (!response.ok) {
        throw new Error('분석 요청 실패');
      }

      const result = await response.json();
      
      if (onAnalysisComplete) {
        onAnalysisComplete(result);
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setError('채용 공고 분석 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <h3 className="text-xl font-bold text-gray-800 mb-4">채용 공고 입력</h3>
      
      <div className="mb-4">
        <div className="flex space-x-4 mb-4">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              mode === 'text'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            텍스트 입력
          </button>
          <button
            type="button"
            onClick={() => setMode('pdf')}
            className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
              mode === 'pdf'
                ? 'bg-primary-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            PDF 업로드
          </button>
        </div>

        {mode === 'pdf' && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              PDF 파일 선택
            </label>
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            {file && (
              <p className="mt-2 text-sm text-green-600">
                ✓ {file.name} 업로드됨
              </p>
            )}
          </div>
        )}

        <Textarea
          label="채용 공고 내용"
          name="jobText"
          value={jobText}
          onChange={(e) => setJobText(e.target.value)}
          placeholder="채용 공고의 내용을 붙여넣거나, 위에서 PDF를 업로드하세요..."
          rows={10}
          required
        />
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      <Button
        onClick={handleAnalyze}
        disabled={loading || !jobText.trim()}
        fullWidth
      >
        {loading ? '분석 중...' : '채용 공고 분석하기'}
      </Button>
    </Card>
  );
}

