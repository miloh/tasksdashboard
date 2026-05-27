'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import pb from '@/lib/pocketbase';

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  const taskNumber = searchParams.get('taskNumber');
  const callbackUrl = searchParams.get('callbackUrl') || '/volunteer/tasks';

  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [redirecting, setRedirecting] = useState(false);
  const hasRedirected = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect if already registered or not authenticated
  useEffect(() => {
    if (hasRedirected.current) return;
    
    if (status === 'loading') return; // Wait for auth to load

    if (status === 'unauthenticated') {
      hasRedirected.current = true;
      setRedirecting(true);
      // Preserve task number in callback URL
      const registerUrl = taskNumber 
        ? `/volunteer/register?taskNumber=${taskNumber}`
        : `/volunteer/register`;
      router.push(`/auth/discord?callbackUrl=${encodeURIComponent(registerUrl)}`);
      return;
    }

    if (status === 'authenticated' && session?.user) {
      const user = session.user as any;
      
      // If already registered
      if (!user.needsRegistration && user.volunteerId) {
        hasRedirected.current = true;
        setRedirecting(true);
        
        if (taskNumber) {
          // Find task and go to tracking
          pb.collection('tasks').getFirstListItem(`task_number = ${taskNumber}`)
            .then(task => {
              router.push(`/volunteer/track?taskId=${task.id}&volunteerId=${user.volunteerId}`);
            })
            .catch(err => {
              console.error('Error finding task:', err);
              alert(`Task #${taskNumber} not found`);
              router.push(`/volunteer/tasks?id=${user.volunteerId}`);
            });
        } else {
          router.push(`/volunteer/tasks?id=${user.volunteerId}`);
        }
        return;
      }
      
      // User needs registration - show the form
    }
  }, [status, session, router, callbackUrl, taskNumber]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setPhotoBlob(file);
      setPhotoUrl(URL.createObjectURL(file));
    }
  };

  const retakePhoto = () => {
    setPhotoBlob(null);
    setPhotoUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async () => {
    if (!photoBlob || !session?.user) {
      setError('Please select a photo');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      // Create volunteer record
      const formData = new FormData();
      formData.append('username', session.user.name || 'Unknown');
      formData.append('email', session.user.email || '');
      formData.append('discord_id', (session.user as any).id || '');
      formData.append('profile_photo', photoBlob, 'profile.jpg');
      formData.append('total_minutes', '0');
      formData.append('board', 'main'); // Default to main board

      const newVolunteer = await pb.collection('volunteers').create(formData);

      // Store volunteer ID in localStorage
      localStorage.setItem('volunteerId', newVolunteer.id);

      // If claiming a task, find it and go to tracking
      if (taskNumber) {
        try {
          const task = await pb.collection('tasks').getFirstListItem(`task_number = ${taskNumber}`);
          window.location.href = `/volunteer/track?taskId=${task.id}&volunteerId=${newVolunteer.id}`;
          return;
        } catch (err) {
          console.error('Error finding task:', err);
          // Task not found, go to tasks list
        }
      }

      // Otherwise redirect to callback URL with volunteer ID
      let redirectUrl = callbackUrl;
      if (redirectUrl === '/volunteer/tasks' && newVolunteer.id) {
        redirectUrl = `/volunteer/tasks?id=${newVolunteer.id}`;
      }
      window.location.href = redirectUrl;
    } catch (err: any) {
      console.error('Error registering:', err);
      setError('Failed to register: ' + (err.message || 'Unknown error'));
      setProcessing(false);
    }
  };

  // Show loading/redirecting for: loading, redirecting, unauthenticated, or already registered
  const shouldShowLoading = status === 'loading' ||
                           redirecting ||
                           status === 'unauthenticated' ||
                           (status === 'authenticated' && session?.user && !(session.user as any).needsRegistration);

  if (shouldShowLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-white text-xl">
          {redirecting || status === 'unauthenticated' || (status === 'authenticated' && !(session?.user as any)?.needsRegistration)
            ? 'Redirecting...'
            : 'Loading...'}
        </div>
      </div>
    );
  }

  if (!session?.user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl">
        {!processing && (
          <div className="text-center space-y-6">
            <div className="text-6xl">📸</div>
            <h1 className="text-3xl font-bold text-white">Add Your Profile Photo</h1>
            <p className="text-white/80">
              Welcome, {session.user.name}! Add a photo for the leaderboard.
            </p>

            {photoUrl ? (
              <div className="relative">
                <img
                  src={photoUrl}
                  alt="Profile preview"
                  className="w-full aspect-square object-cover rounded-2xl"
                />
              </div>
            ) : (
              <div className="bg-white/10 border-2 border-dashed border-white/30 rounded-2xl p-12 aspect-square flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl mb-4">🖼️</div>
                  <p className="text-white/60">No photo selected</p>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileSelect}
              className="hidden"
            />

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-white p-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3">
              {!photoUrl ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 bg-white text-brand-900 font-bold py-4 px-6 rounded-xl hover:bg-white/90 transition-colors text-xl"
                >
                  📷 Take Photo
                </button>
              ) : (
                <>
                  <button
                    onClick={retakePhoto}
                    className="flex-1 bg-white/20 text-white font-bold py-3 px-4 rounded-xl hover:bg-white/30 transition-colors"
                  >
                    🔄 Retake
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="flex-1 bg-green-500 text-white font-bold py-3 px-4 rounded-xl hover:bg-green-600 transition-colors"
                  >
                    ✓ Continue
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {processing && (
          <div className="text-center space-y-6">
            <div className="text-6xl animate-spin">⚙️</div>
            <h1 className="text-2xl font-bold text-white">Setting up your profile...</h1>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    }>
      <RegisterPageContent />
    </Suspense>
  );
}
