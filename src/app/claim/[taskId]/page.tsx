'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function ClaimTaskPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.taskId as string;

  useEffect(() => {
    // Redirect to registration with task number
    router.push(`/volunteer/register?taskNumber=${taskId}`);
  }, [taskId, router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="animate-spin text-6xl">⏳</div>
        <p className="text-white text-xl">Redirecting to registration...</p>
      </div>
    </div>
  );
}
