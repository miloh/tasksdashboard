'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import pb from '@/lib/pocketbase';

export default function RegisterPage() {
  const router = useRouter();
  const [session, setSession] = useState<any>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Get session from cookie
  useEffect(() => {
    async function getSession() {
      try {
        console.log('Fetching session...');
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        console.log('Session data:', data);

        if (data.session) {
          setSession(data.session);

          console.log('needsRegistration:', data.session.needsRegistration);

          if (!data.session.needsRegistration) {
            // Already registered, redirect to tasks
            console.log('Already registered, redirecting to tasks');
            router.push(`/volunteer/tasks?id=${data.session.volunteerId}`);
          } else {
            console.log('New user, showing registration form');
          }
        } else {
          // No session, redirect to login
          console.log('No session found, redirecting to Discord auth');
          router.push('/auth/discord');
        }
      } catch (err) {
        console.error('Failed to get session:', err);
        router.push('/auth/discord');
      }
    }
    getSession();
  }, [router]);

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
    const requiredInviteCode = process.env.NEXT_PUBLIC_INVITE_CODE;

    // If invite code is configured, validate it
    if (requiredInviteCode && inviteCode.trim() !== requiredInviteCode) {
      setError('Please enter the correct invite code.');
      return;
    }

    if (!photoBlob || !session) {
      setError('Please select a photo');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      // Create volunteer record
      const formData = new FormData();
      // Save to both username (if enabled) and name (custom field)
      const username = session.username || 'Unknown';
      formData.append('username', username);
      formData.append('name', username);
      formData.append('email', session.email || '');
      formData.append('discord_id', session.discordId || '');
      formData.append('profile_photo', photoBlob, 'profile.jpg');
      formData.append('total_minutes', '0');
      formData.append('board', 'main'); // Default to main board

      let newVolunteer;
      let volunteerId = session.volunteerId;

      if (volunteerId) {
        // Update existing volunteer
        console.log('Updating existing volunteer:', volunteerId);
        newVolunteer = await pb.collection('volunteers').update(volunteerId, formData);
      } else {
        // Create new volunteer
        console.log('Creating new volunteer');
        newVolunteer = await pb.collection('volunteers').create(formData);
        volunteerId = newVolunteer.id;
      }

      // Update session cookie with volunteer ID
      await fetch('/api/auth/update-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volunteerId: volunteerId }),
      });

      // Redirect to tasks
      window.location.href = `/volunteer/tasks?id=${volunteerId}`;
    } catch (err: any) {
      console.error('Error registering:', err);
      setError('Failed to register: ' + (err.message || 'Unknown error'));
      setProcessing(false);
    }
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl">
        {!processing && (
          <div className="text-center space-y-6">
            <div className="text-6xl">📸</div>
            <h1 className="text-3xl font-bold text-white">
              {session.volunteerId ? 'Complete Your Profile' : 'Add Your Profile Photo'}
            </h1>
            <p className="text-white/80">
              Welcome, {session.username}! {session.volunteerId ? 'Update your details' : 'Add a photo'} for the leaderboard.
            </p>

            {process.env.NEXT_PUBLIC_INVITE_CODE && (
              <div className="space-y-3 text-left">
                <label className="block text-white/80 font-semibold">Invite Code</label>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="Enter invite code"
                  className="w-full px-4 py-3 rounded-xl bg-white/90 text-gray-900 font-semibold placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <p className="text-white/60 text-sm">Ask an admin if you need the invite code.</p>
              </div>
            )}

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
