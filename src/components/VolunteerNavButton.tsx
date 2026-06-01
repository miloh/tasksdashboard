'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import pb from '@/lib/pocketbase';
import type { Volunteer } from '@/lib/pocketbase';

export default function VolunteerNavButton() {
  const pathname = usePathname();
  const [volunteerId, setVolunteerId] = useState<string | null>(null);
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [mounted, setMounted] = useState(false);

  // Get volunteer ID from session or localStorage
  useEffect(() => {
    setMounted(true);
    
    async function getVolunteerId() {
      // Try to get from session first
      try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        if (data.session?.volunteerId) {
          setVolunteerId(data.session.volunteerId);
          // Store in localStorage for fallback
          localStorage.setItem('volunteerId', data.session.volunteerId);
          return;
        }
      } catch (err) {
        console.error('Error fetching session:', err);
      }

      // Fallback to localStorage
      const storedVolunteerId = localStorage.getItem('volunteerId');
      if (storedVolunteerId) {
        setVolunteerId(storedVolunteerId);
        return;
      }

      // Try to get from current URL
      const urlParams = new URLSearchParams(window.location.search);
      const idFromUrl = urlParams.get('id') || urlParams.get('volunteerId');
      if (idFromUrl) {
        setVolunteerId(idFromUrl);
        localStorage.setItem('volunteerId', idFromUrl);
      }
    }

    getVolunteerId();
  }, []);

  // Fetch volunteer data when we have an ID
  useEffect(() => {
    if (!volunteerId) return;

    async function fetchVolunteer() {
      if (!volunteerId) return; // Type guard
      try {
        const volunteerRecord = await pb.collection('volunteers').getOne<Volunteer>(volunteerId);
        setVolunteer(volunteerRecord);
      } catch (err) {
        console.error('Error fetching volunteer:', err);
        // If fetch fails, try to clear invalid volunteerId
        if (err && typeof err === 'object' && 'status' in err && err.status === 404) {
          localStorage.removeItem('volunteerId');
        }
      }
    }

    fetchVolunteer();
  }, [volunteerId]);

  // Don't render anything until mounted (prevents hydration mismatch)
  if (!mounted) {
    return null;
  }

  // Don't show on display page, root page, volunteer tasks page, or volunteer profile page
  if (pathname === '/display' || pathname === '/' || pathname === '/volunteer/tasks' || pathname === '/volunteer/profile') {
    return null;
  }

  // Only show if we have a volunteer ID
  if (!volunteerId) {
    return null;
  }

  return (
    <a
      href={`/volunteer/tasks?id=${volunteerId}`}
      className="fixed top-4 right-4 z-50 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg shadow-lg transition-colors font-semibold text-sm flex items-center gap-2"
    >
      {volunteer?.profile_photo ? (
        <img
          src={pb.files.getURL(volunteer, volunteer.profile_photo)}
          alt={volunteer.username}
          className="w-6 h-6 rounded-full object-cover"
        />
      ) : (
        <span>👤</span>
      )}
      <span>{volunteer?.username || 'Volunteer'}</span>
    </a>
  );
}
