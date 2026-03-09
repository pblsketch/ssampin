'use client';

import { useState, useEffect } from 'react';
import type { AssignmentPublic } from './submitApi';
import { getAssignmentPublic } from './submitApi';
import { SubmitForm } from './SubmitForm';
import { OfflineNotice } from './OfflineNotice';

interface SubmitPageContentProps {
  assignmentId: string;
}

export function SubmitPageContent({ assignmentId }: SubmitPageContentProps) {
  const [assignment, setAssignment] = useState<AssignmentPublic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline) return;

    async function loadAssignment() {
      setIsLoading(true);
      const data = await getAssignmentPublic(assignmentId);
      if (data) {
        setAssignment(data);
        setNotFound(false);
      } else {
        setNotFound(true);
      }
      setIsLoading(false);
    }

    void loadAssignment();
  }, [assignmentId, isOnline]);

  return (
    <div className="min-h-screen bg-sp-bg">
      {/* Header */}
      <header className="border-b border-sp-border/50 bg-sp-bg/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-lg px-4 py-3 text-center">
          <h1 className="text-lg font-bold text-sp-text">📝 쌤핀 과제수합</h1>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-lg px-4 py-8">
        {!isOnline ? (
          <div role="alert">
            <OfflineNotice onRetry={() => { setIsOnline(navigator.onLine); }} />
          </div>
        ) : isLoading ? (
          <div role="status" aria-label="로딩 중" className="flex min-h-[60vh] items-center justify-center">
            <div className="text-center">
              <div className="text-4xl mb-4 animate-pulse">📝</div>
              <p className="text-sp-muted">과제 정보를 불러오는 중...</p>
            </div>
          </div>
        ) : notFound ? (
          <div role="alert" className="flex min-h-[60vh] items-center justify-center">
            <div className="text-center px-6">
              <div className="text-5xl mb-4">❓</div>
              <h2 className="text-xl font-bold text-sp-text mb-2">과제를 찾을 수 없습니다</h2>
              <p className="text-sp-muted text-sm">링크가 올바른지 확인해주세요.</p>
            </div>
          </div>
        ) : assignment ? (
          <SubmitForm assignment={assignment} />
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-sp-border/30 py-4 text-center">
        <p className="text-xs text-sp-muted/40">Powered by 쌤핀</p>
      </footer>
    </div>
  );
}
