'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import pb from '@/lib/pocketbase';
import type { Volunteer, Completion, Task } from '@/lib/pocketbase';

interface CompletionWithDetails extends Completion {
  task_title?: string;
  task_number?: number;
  task_zone?: string;
}

function ProfilePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const volunteerId = searchParams.get('id');

  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [completions, setCompletions] = useState<CompletionWithDetails[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [editedUsername, setEditedUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameSuccess, setUsernameSuccess] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoSuccess, setPhotoSuccess] = useState(false);

  // Check authentication and authorization
  useEffect(() => {
    async function checkAuth() {
      if (!volunteerId) {
        router.push('/volunteer');
        return;
      }

      // Wait for NextAuth session to finish loading before checking
      if (status === 'loading') {
        return; // Don't redirect yet, still loading
      }

      let authenticatedVolunteerId: string | null = null;
      let isAdmin = false;
      let isAuthenticated = false;

      // Check custom session API immediately (more reliable)
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await response.json();
        if (data.isAuthenticated) {
          isAuthenticated = true;
          authenticatedVolunteerId = data.volunteerId || null;
        }
      } catch (err) {
        console.error('Error checking auth:', err);
      }

      // Also check NextAuth session if available
      if (!authenticatedVolunteerId && status === 'authenticated' && session) {
        isAuthenticated = true;
        authenticatedVolunteerId = (session.user as any)?.volunteerId || null;
        isAdmin = (session.user as any)?.isAdmin || false;
      }

      // Check admin status from NextAuth if available
      if (status === 'authenticated' && session) {
        isAdmin = (session.user as any)?.isAdmin || false;
      }

      // If not authenticated AND status is not loading, redirect to login
      if (!isAuthenticated && status === 'unauthenticated') {
        setIsAuthorized(false);
        router.push('/auth/discord?callbackUrl=' + encodeURIComponent(`/volunteer/profile?id=${volunteerId}`));
        return;
      }

      // If not admin and volunteerId doesn't match, redirect to their own profile
      if (!isAdmin && authenticatedVolunteerId && authenticatedVolunteerId !== volunteerId) {
        setIsAuthorized(false);
        router.push(`/volunteer/profile?id=${authenticatedVolunteerId}`);
        return;
      }

      // Authorized - proceed
      setIsAuthorized(true);
    }

    checkAuth();
  }, [volunteerId, session, status, router]);

  useEffect(() => {
    if (!volunteerId || !isAuthorized) {
      return;
    }

    async function fetchData() {
      if (!volunteerId) return;

      try {
        // Fetch volunteer (public read access)
        const volunteerRecord = await pb.collection('volunteers').getOne<Volunteer>(volunteerId);
        setVolunteer(volunteerRecord);
        if (!isEditingUsername) {
          setEditedUsername(volunteerRecord.username || '');
        }

        // Fetch completions with expanded task data
        const completionsRecords = await pb.collection('completions').getList<Completion>(1, 50, {
          filter: `volunteer = "${volunteerId}"`,
          expand: 'task'
        });

        const withDetails: CompletionWithDetails[] = completionsRecords.items.map(c => {
          const expanded = c as any;
          return {
            ...c,
            task_title: expanded.expand?.task?.title,
            task_number: expanded.expand?.task?.task_number,
            task_zone: expanded.expand?.task?.zone,
          };
        });

        setCompletions(withDetails);

        // Calculate rank
        const allVolunteers = await pb.collection('volunteers').getList<Volunteer>(1, 100, {
          sort: '-total_minutes'
        });

        const volunteerRank = allVolunteers.items.findIndex(v => v.id === volunteerId) + 1;
        setRank(volunteerRank);

        setLoading(false);
      } catch (err) {
        console.error('Error fetching profile data:', err);
        setLoading(false);
      }
    }

    fetchData();
  }, [volunteerId, router, isAuthorized]);

  // Update editedUsername when volunteer changes (but not while editing)
  useEffect(() => {
    if (volunteer && !isEditingUsername) {
      setEditedUsername(volunteer.username || '');
    }
  }, [volunteer, isEditingUsername]);

  if (status === 'loading' || !isAuthorized || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!volunteer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-red-600">Volunteer not found</div>
      </div>
    );
  }

  const tasksCompleted = completions.length;

  // Format time as "Xh Ym" or just "Ym" if less than 1 hour
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours === 0) {
      return `${mins}m`;
    } else if (mins === 0) {
      return `${hours}h`;
    } else {
      return `${hours}h ${mins}m`;
    }
  };

  const getRankEmoji = (rank: number | null) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return '🏅';
  };

  const handleSaveUsername = async () => {
    const trimmedUsername = editedUsername.trim();
    
    if (!volunteerId || !trimmedUsername) {
      setUsernameError('Username cannot be empty');
      return;
    }

    if (trimmedUsername === volunteer?.username) {
      setIsEditingUsername(false);
      return;
    }

    setSavingUsername(true);
    setUsernameError('');
    setUsernameSuccess(false);

    try {
      // Use API route to update username (handles authentication server-side)
      console.log('Updating username to:', trimmedUsername);
      
      let response;
      try {
        response = await fetch('/api/volunteers/update-username', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            volunteerId,
            username: trimmedUsername
          })
        });
      } catch (fetchError: any) {
        console.error('Network error:', fetchError);
        throw new Error('Network error: Could not connect to server. Please check your connection and try again.');
      }

      let data;
      try {
        data = await response.json();
      } catch (jsonError) {
        console.error('Failed to parse response:', jsonError);
        throw new Error('Server returned invalid response. Please try again.');
      }

      if (!response.ok) {
        console.error('API error:', data);
        throw new Error(data.error || `Failed to update username (${response.status})`);
      }

      console.log('Update response:', data);
      
      // Update local state with the updated volunteer
      if (data.volunteer) {
        setVolunteer(data.volunteer as Volunteer);
      } else {
        // Refetch volunteer if not included in response
        try {
          const refreshed = await pb.collection('volunteers').getOne<Volunteer>(volunteerId);
          setVolunteer(refreshed);
        } catch (refetchError) {
          console.warn('Could not refetch volunteer, but update succeeded');
        }
      }
      
      setIsEditingUsername(false);
      setUsernameSuccess(true);
      setTimeout(() => setUsernameSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error updating username:', err);
      setUsernameError(err.message || 'Failed to update username. Please try again.');
    } finally {
      setSavingUsername(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingUsername(false);
    setEditedUsername(volunteer?.username || '');
    setUsernameError('');
    setUsernameSuccess(false);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setPhotoError('Image must be less than 5MB');
      return;
    }

    setUploadingPhoto(true);
    setPhotoError('');
    setPhotoSuccess(false);

    try {
      const formData = new FormData();
      formData.append('volunteerId', volunteerId!);
      formData.append('photo', file);

      const response = await fetch('/api/volunteers/update-photo', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update photo');
      }

      // Update local state with the new photo
      if (data.volunteer) {
        setVolunteer(data.volunteer as Volunteer);
      } else {
        // Refetch volunteer if not included in response
        const refreshed = await pb.collection('volunteers').getOne<Volunteer>(volunteerId!);
        setVolunteer(refreshed);
      }

      setPhotoSuccess(true);
      setTimeout(() => setPhotoSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error updating photo:', err);
      setPhotoError(err.message || 'Failed to update photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-600 to-secondary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.push(`/volunteer/tasks?id=${volunteerId}`)}
            className="mb-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            ← Back to Tasks
          </button>

          <div className="flex items-center gap-6">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full bg-white/20 overflow-hidden flex-shrink-0 border-4 border-white/30">
                {volunteer.profile_photo ? (
                  <img
                    src={pb.files.getURL(volunteer, volunteer.profile_photo)}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-5xl">
                    😊
                  </div>
                )}
              </div>
              {/* Photo upload overlay */}
              <label 
                htmlFor="photo-upload" 
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <input
                  id="photo-upload"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  disabled={uploadingPhoto}
                  className="hidden"
                />
                <span className="text-white text-2xl">
                  {uploadingPhoto ? '⏳' : '📷'}
                </span>
              </label>
              {/* Upload status messages below photo */}
              {(photoError || photoSuccess) && (
                <div className="absolute -bottom-8 left-0 right-0 text-center text-sm whitespace-nowrap">
                  {photoError && <p className="text-red-200">{photoError}</p>}
                  {photoSuccess && <p className="text-green-200">✓ Photo updated!</p>}
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="mb-2">
                {isEditingUsername ? (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={editedUsername}
                      onChange={(e) => {
                        setEditedUsername(e.target.value);
                        setUsernameError('');
                      }}
                      className="w-full text-2xl sm:text-4xl font-bold bg-white/20 border-2 border-white/40 rounded-lg px-3 sm:px-4 py-2 text-white placeholder-white/60 focus:outline-none focus:border-white/80"
                      placeholder="Enter username"
                      autoFocus
                      disabled={savingUsername}
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveUsername}
                        disabled={savingUsername || !editedUsername.trim()}
                        className="flex-1 sm:flex-none px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                      >
                        {savingUsername ? 'Saving...' : '✓ Save'}
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        disabled={savingUsername}
                        className="flex-1 sm:flex-none px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 text-sm sm:text-base"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl sm:text-4xl font-bold break-words">
                      {volunteer.username || volunteer.email?.split('@')[0] || 'Volunteer'}
                    </h1>
                    <button
                      onClick={() => {
                        setIsEditingUsername(true);
                        setEditedUsername(volunteer.username || '');
                        setUsernameError('');
                      }}
                      className="px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                      title="Edit display name"
                    >
                      ✏️ Edit
                    </button>
                  </div>
                )}
              </div>
              {usernameError && (
                <p className="text-red-200 text-sm mb-2">{usernameError}</p>
              )}
              {usernameSuccess && (
                <p className="text-green-200 text-sm mb-2">✓ Username updated successfully!</p>
              )}
              <p className="text-brand-100">
                {volunteer.email}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                <span className="text-xl font-semibold">Level {Math.floor(tasksCompleted / 10) + 1}</span>
                <span className="text-sm text-brand-200">({tasksCompleted % 10}/10 tasks to next level)</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Milestone Progress */}
        <div className="bg-gradient-to-r from-brand-600 to-secondary-600 rounded-lg shadow-lg p-6 mb-8 text-white">
          <h2 className="text-2xl font-bold mb-4">🎯 Milestone Progress</h2>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="font-semibold">Current Level: {Math.floor(tasksCompleted / 10) + 1}</span>
                <span className="text-sm">{tasksCompleted} tasks completed</span>
              </div>
              <div className="w-full bg-white/20 rounded-full h-4">
                <div
                  className="bg-white rounded-full h-4 transition-all duration-500"
                  style={{ width: `${(tasksCompleted % 10) * 10}%` }}
                ></div>
              </div>
              <p className="text-sm mt-2 text-brand-100">
                {10 - (tasksCompleted % 10)} tasks remaining to reach Level {Math.floor(tasksCompleted / 10) + 2}
              </p>
            </div>
            <div className="grid grid-cols-5 gap-2 mt-4">
              {[...Array(10)].map((_, i) => (
                <div
                  key={i}
                  className={`h-12 rounded-lg flex items-center justify-center font-bold ${
                    i < (tasksCompleted % 10)
                      ? 'bg-white text-brand-600'
                      : 'bg-white/20 text-white/50'
                  }`}
                >
                  {i < (tasksCompleted % 10) ? '✓' : i + 1}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Total Time</p>
                <p className="text-3xl font-bold text-gray-900">{formatTime(volunteer.total_minutes)}</p>
              </div>
              <div className="text-4xl">⏱️</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Tasks Completed</p>
                <p className="text-3xl font-bold text-gray-900">{tasksCompleted}</p>
              </div>
              <div className="text-4xl">✓</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">Leaderboard Rank</p>
                <p className="text-3xl font-bold text-gray-900">#{rank}</p>
              </div>
              <div className="text-4xl">{getRankEmoji(rank)}</div>
            </div>
          </div>
        </div>

        {/* Completion History */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-gray-900">
              Completion History
            </h2>
          </div>

          {completions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-500 text-lg mb-2">No completed tasks yet</p>
              <p className="text-gray-400 text-sm mb-4">
                Start contributing by claiming a task!
              </p>
              <button
                onClick={() => router.push(`/volunteer/tasks?id=${volunteerId}`)}
                className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-semibold"
              >
                Browse Tasks
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {completions.map((completion) => (
                <div key={completion.id} className="p-6 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm font-mono text-gray-500">
                          #{completion.task_number}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-brand-100 text-brand-800 border border-brand-400">
                          {completion.task_zone}
                        </span>
                      </div>

                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {completion.task_title || 'Task'}
                      </h3>

                      {completion.completion_note && (
                        <p className="text-gray-600 text-sm mb-2">
                          {completion.completion_note}
                        </p>
                      )}
                    </div>

                    <div className="text-right ml-4">
                      <div className="text-2xl font-bold text-brand-600">
                        {Math.round(completion.actual_minutes / 60)}h {completion.actual_minutes % 60}m
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        time spent
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    }>
      <ProfilePageContent />
    </Suspense>
  );
}
