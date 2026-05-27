'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import pb from '@/lib/pocketbase';
import type { Creation, Volunteer } from '@/lib/pocketbase';

interface CreationDetailProps {
  params: Promise<{ id: string }>;
}

export default function CreationDetailPage({ params }: CreationDetailProps) {
  const { id } = use(params);
  const router = useRouter();
  const [creation, setCreation] = useState<Creation | null>(null);
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  useEffect(() => {
    async function fetchCreation() {
      try {
        const record = await pb.collection('creations').getOne<Creation>(id, {
          expand: 'volunteer'
        });

        setCreation(record);

        // Get volunteer info
        const expanded = record as any;
        if (expanded.expand?.volunteer) {
          setVolunteer(expanded.expand.volunteer);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error fetching creation:', err);
        setLoading(false);
      }
    }

    fetchCreation();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-500 via-brand-600 to-secondary-600 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!creation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-accent-500 via-brand-600 to-secondary-600 flex items-center justify-center">
        <div className="text-center">
          <div className="text-white text-xl mb-4">Creation not found</div>
          <button
            onClick={() => router.push('/creations')}
            className="px-6 py-3 bg-white text-brand-600 rounded-lg hover:bg-brand-50 transition-colors font-semibold"
          >
            ← Back to Gallery
          </button>
        </div>
      </div>
    );
  }

  const photos = creation.photos || [];
  const currentPhoto = photos[currentPhotoIndex];
  const photoUrl = currentPhoto ? pb.files.getUrl(creation, currentPhoto) : null;

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const previousPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const copyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    alert('✅ Link copied to clipboard!');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-accent-500 via-brand-600 to-secondary-600">
      {/* Header */}
      <div className="bg-black/20 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/creations')}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors font-medium"
            >
              ← Back to Gallery
            </button>
            <button
              onClick={copyLink}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-lg transition-colors font-medium flex items-center gap-2"
              title="Copy link"
            >
              🔗 Share
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-3xl shadow-2xl overflow-hidden">
          {/* Photo Gallery */}
          {photoUrl && (
            <div className="relative bg-gray-900 aspect-video">
              <img
                src={photoUrl}
                alt={creation.title}
                className="w-full h-full object-contain"
              />

              {/* Photo Navigation */}
              {photos.length > 1 && (
                <>
                  <button
                    onClick={previousPhoto}
                    className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors text-2xl"
                  >
                    ‹
                  </button>
                  <button
                    onClick={nextPhoto}
                    className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-black/50 hover:bg-black/70 text-white rounded-full flex items-center justify-center transition-colors text-2xl"
                  >
                    ›
                  </button>

                  {/* Photo Counter */}
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/70 text-white rounded-full text-sm font-medium">
                    {currentPhotoIndex + 1} / {photos.length}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Creation Details */}
          <div className="p-8">
            {/* Creator Info */}
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-200">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-brand-400 to-accent-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden">
                {volunteer?.profile_photo ? (
                  <img
                    src={pb.files.getUrl(volunteer, volunteer.profile_photo)}
                    alt={volunteer.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  volunteer?.username?.charAt(0).toUpperCase() || '?'
                )}
              </div>
              <div>
                <p className="text-sm text-gray-500">Created by</p>
                <p className="text-lg font-bold text-gray-900">{volunteer?.username || 'Anonymous'}</p>
                <p className="text-sm text-gray-500">
                  {new Date(creation.created).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold text-gray-900 mb-6">
              {creation.title}
            </h1>

            {/* Description */}
            <div className="prose prose-lg max-w-none">
              <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                {creation.description}
              </p>
            </div>

            {/* Photo Thumbnails */}
            {photos.length > 1 && (
              <div className="mt-8 pt-8 border-t border-gray-200">
                <h3 className="text-sm font-semibold text-gray-700 mb-4">All Photos</h3>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                  {photos.map((photo, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentPhotoIndex(index)}
                      className={`aspect-square rounded-lg overflow-hidden transition-all ${
                        currentPhotoIndex === index
                          ? 'ring-4 ring-brand-500 scale-105'
                          : 'ring-2 ring-gray-200 hover:ring-brand-400'
                      }`}
                    >
                      <img
                        src={pb.files.getUrl(creation, photo, { thumb: '100x100' })}
                        alt={`Photo ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-8 pt-8 border-t border-gray-200 flex gap-4">
              <button
                onClick={() => router.push('/creations')}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-brand-600 to-accent-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg"
              >
                View More Creations
              </button>
              {volunteer && (
                <button
                  onClick={() => router.push(`/volunteer/creations?id=${creation.volunteer}`)}
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
                >
                  View {volunteer.username}'s Gallery
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}




