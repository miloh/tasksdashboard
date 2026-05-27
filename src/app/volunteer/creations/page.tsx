'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import pb from '@/lib/pocketbase';
import type { Creation, Volunteer } from '@/lib/pocketbase';

interface CreationWithVolunteer extends Creation {
  volunteer_name?: string;
  volunteer_photo?: string;
}

function VolunteerCreationsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const volunteerId = searchParams.get('id');

  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [myCreations, setMyCreations] = useState<Creation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

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
      let isAdminUser = false;
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
        isAdminUser = (session.user as any)?.isAdmin || false;
      }

      // Check admin status from NextAuth if available
      if (status === 'authenticated' && session) {
        isAdminUser = (session.user as any)?.isAdmin || false;
      }

      // If not authenticated AND status is not loading, redirect to login
      if (!isAuthenticated && status === 'unauthenticated') {
        setIsAuthorized(false);
        router.push('/auth/discord?callbackUrl=' + encodeURIComponent(`/volunteer/creations?id=${volunteerId}`));
        return;
      }

      // If not admin and volunteerId doesn't match, redirect to their own creations page
      if (!isAdminUser && authenticatedVolunteerId && authenticatedVolunteerId !== volunteerId) {
        setIsAuthorized(false);
        router.push(`/volunteer/creations?id=${authenticatedVolunteerId}`);
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
        // Fetch volunteer
        const volunteerRecord = await pb.collection('volunteers').getOne<Volunteer>(volunteerId);
        setVolunteer(volunteerRecord);

        // Fetch this volunteer's creations (main board only for volunteer creations page)
        let creationsRecords;
        try {
          creationsRecords = await pb.collection('creations').getList<Creation>(1, 50, {
            filter: `volunteer = "${volunteerId}" && board = "main"`,
            sort: '-created'
          });
        } catch {
          // Fallback: fetch all and filter client-side
          creationsRecords = await pb.collection('creations').getList<Creation>(1, 50, {
            filter: `volunteer = "${volunteerId}"`,
            sort: '-created'
          });
          creationsRecords.items = creationsRecords.items.filter((c: Creation) => !c.board || c.board === 'main');
        }
        setMyCreations(creationsRecords.items);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setLoading(false);
      }
    }

    fetchData();
  }, [volunteerId, router, isAuthorized]);

  if (loading) {
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-accent-600 to-brand-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.push(`/volunteer/tasks?id=${volunteerId}`)}
            className="mb-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            ← Back to Dashboard
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">🎨 My Creations</h1>
              <p className="text-brand-100 text-lg">
                Showcase your makerspace projects to inspire others
              </p>
            </div>
            <button
              onClick={() => setShowUploadForm(true)}
              className="px-6 py-3 bg-white text-brand-600 rounded-lg hover:bg-brand-50 transition-colors font-semibold shadow-lg flex items-center gap-2"
            >
              <span className="text-xl">➕</span>
              Share Creation
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Public Gallery Link */}
        <div className="mb-6 bg-gradient-to-r from-blue-50 to-purple-50 border border-brand-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900 mb-1">🌍 View Public Gallery</h3>
              <p className="text-sm text-gray-600">See creations from all volunteers</p>
            </div>
            <button
              onClick={() => router.push('/creations')}
              className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium"
            >
              Browse All →
            </button>
          </div>
        </div>

        {/* My Creations Grid */}
        {myCreations.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🎨</div>
            <p className="text-gray-500 text-lg mb-2">You haven't shared any creations yet</p>
            <p className="text-gray-400 text-sm mb-6">
              Made something cool at the makerspace? Share it with the community!
            </p>
            <button
              onClick={() => setShowUploadForm(true)}
              className="px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-semibold"
            >
              Share Your First Creation
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {myCreations.map((creation) => (
              <CreationCard
                key={creation.id}
                creation={creation}
                volunteerId={volunteerId}
                onDelete={async () => {
                  await pb.collection('creations').delete(creation.id);
                  setMyCreations(myCreations.filter(c => c.id !== creation.id));
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Upload Form Modal */}
      {showUploadForm && (
        <UploadCreationForm
          volunteerId={volunteerId!}
          onClose={() => setShowUploadForm(false)}
          onSuccess={(newCreation) => {
            setMyCreations([newCreation, ...myCreations]);
            setShowUploadForm(false);
          }}
        />
      )}
    </div>
  );
}

function CreationCard({ creation, volunteerId, onDelete }: { creation: Creation; volunteerId: string | null; onDelete: () => void }) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden hover:shadow-xl transition-shadow">
      {/* Image */}
      {creation.photos && creation.photos.length > 0 ? (
        <div className="aspect-video bg-gray-100 overflow-hidden">
          <img
            src={pb.files.getURL(creation, creation.photos[0])}
            alt={creation.title}
            className="w-full h-full object-cover"
          />
        </div>
      ) : (
        <div className="aspect-video bg-gradient-to-br from-brand-100 to-accent-500/20 flex items-center justify-center">
          <span className="text-6xl">🎨</span>
        </div>
      )}

      {/* Content */}
      <div className="p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{creation.title}</h3>
        <p className="text-gray-600 text-sm mb-4 line-clamp-3">{creation.description}</p>
        
        <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
          <span>{new Date(creation.created).toLocaleDateString()}</span>
          {creation.photos && creation.photos.length > 1 && (
            <span>📷 {creation.photos.length} photos</span>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex-1 px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Creation?</h3>
            <p className="text-gray-600 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setShowDeleteConfirm(false);
                }}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadCreationForm({ volunteerId, onClose, onSuccess }: { volunteerId: string; onClose: () => void; onSuccess: (creation: Creation) => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setPhotoFiles(files);

    // Create previews
    const previews: string[] = [];
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        previews.push(reader.result as string);
        if (previews.length === files.length) {
          setPhotoPreviews(previews);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('description', description);

      // Add all photos
      photoFiles.forEach((file) => {
        formData.append('photos', file);
      });

      // Use API route instead of direct PocketBase call
      const response = await fetch('/api/creations/create', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error response:', errorData);
        console.error('Error details object:', errorData.details);
        console.error('Field errors:', errorData.fieldErrors);
        console.error('Full error:', errorData.fullError);
        
        // Extract more detailed error message from PocketBase
        let errorMessage = errorData.error || `Failed to upload creation (${response.status})`;
        
        // Show field-specific errors if available
        if (errorData.fieldErrors && Object.keys(errorData.fieldErrors).length > 0) {
          const fieldErrors = Object.entries(errorData.fieldErrors)
            .map(([field, message]) => `${field}: ${message}`)
            .join(', ');
          errorMessage = `${errorMessage}\n\nField errors: ${fieldErrors}`;
        } else if (errorData.details) {
          // Fallback to details if fieldErrors not available
          const detailsStr = JSON.stringify(errorData.details, null, 2);
          errorMessage = `${errorMessage}\n\nDetails: ${detailsStr}`;
        }
        
        throw new Error(errorMessage);
      }

      const creation = await response.json();
      onSuccess(creation);
    } catch (err: any) {
      console.error('Error uploading creation:', err);
      console.error('Error details:', err);
      setError(err.message || 'Failed to upload creation');
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-8 max-w-2xl w-full my-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Share Your Creation</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title */}
          <div>
            <label className="block text-black font-semibold mb-2">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Custom Laser-Cut Wooden Box"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-black placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-black font-semibold mb-2">
              Description *
            </label>
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tell us about your creation... What inspired it? What tools did you use? Any challenges or lessons learned?"
              rows={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-black placeholder-gray-500 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Photos */}
          <div>
            <label className="block text-black font-semibold mb-2">
              Photos * (up to 5)
            </label>
            <input
              type="file"
              accept="image/*"
              multiple
              required
              onChange={handlePhotoChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-white text-black focus:ring-2 focus:ring-brand-500 focus:border-brand-500 focus:outline-none file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
            />
            <p className="text-sm text-gray-500 mt-1">
              Upload multiple photos to show different angles and details
            </p>

            {/* Photo Previews */}
            {photoPreviews.length > 0 && (
              <div className="mt-4 grid grid-cols-3 gap-3">
                {photoPreviews.map((preview, index) => (
                  <div key={index} className="aspect-square rounded-lg overflow-hidden border-2 border-brand-200">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || photoFiles.length === 0}
              className="flex-1 px-6 py-3 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : 'Share Creation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function VolunteerCreationsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    }>
      <VolunteerCreationsContent />
    </Suspense>
  );
}


