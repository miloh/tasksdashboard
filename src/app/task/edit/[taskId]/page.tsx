'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import pb from '@/lib/pocketbase';
import type { Task, Volunteer } from '@/lib/pocketbase';

import { getVolunteerName } from '@/lib/utils';

export default function EditTaskPage() {
  const params = useParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const taskId = params.taskId as string;

  const [task, setTask] = useState<Task | null>(null);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [formData, setFormData] = useState({
    task_number: 0,
    title: '',
    description: '',
    zone: 'General',
    estimated_minutes: '',
    status: 'open' as 'open' | 'in_progress' | 'completed',
    assigned_to: '',
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMounted, setIsMounted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  const zones = [
    'Woodshop',
    '3D Printing',
    'Electronics',
    'Laser Cutting',
    'CNC',
    'General',
    'Admin',
  ];

  // Set mounted state (client-side only)
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Check authentication on mount
  useEffect(() => {
    async function checkAuth() {
      let authenticated = false;
      
      // Check custom session API immediately (more reliable)
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await response.json();
        
        if (data.isAuthenticated) {
          authenticated = true;
          console.log('✅ User authenticated for task edit page');
        }
      } catch (err) {
        console.error('Error checking auth:', err);
      }

      // Also check NextAuth session if available
      if (status === 'authenticated' && session) {
        authenticated = true;
      }

      setIsAuthenticated(authenticated);
      setAuthChecked(true);
      
      // Only redirect if definitely not authenticated
      if (!authenticated && status === 'unauthenticated') {
        console.log('❌ Not authenticated, redirecting to login');
        router.push('/auth/discord?callbackUrl=' + encodeURIComponent(`/task/edit/${taskId}`));
      }
    }
    
    // Run check immediately, don't wait for NextAuth status
    checkAuth();
  }, [status, session, router, taskId]);

  // Fetch task data and volunteers
  useEffect(() => {
    // Don't fetch if not authenticated
    if (!isAuthenticated && status !== 'loading') {
      return;
    }
    async function fetchData() {
      try {
        // Fetch task
        const taskRecord = await pb.collection('tasks').getOne<Task>(taskId);
        setTask(taskRecord);
        // Handle both string and array formats - show first volunteer if multiple
        const assignedTo = taskRecord.assigned_to
          ? Array.isArray(taskRecord.assigned_to)
            ? taskRecord.assigned_to[0] || ''
            : taskRecord.assigned_to
          : '';

        setFormData({
          task_number: taskRecord.task_number,
          title: taskRecord.title,
          description: taskRecord.description,
          zone: taskRecord.zone,
          estimated_minutes: taskRecord.estimated_minutes.toString(),
          status: taskRecord.status,
          assigned_to: assignedTo,
        });

        // Fetch volunteers for assignment dropdown
        const volunteerRecords = await pb.collection('volunteers').getList<Volunteer>(1, 100, {
          sort: 'email',
        });
        setVolunteers(volunteerRecords.items);

        setLoading(false);
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError('Failed to load task data');
        setLoading(false);
      }
    }

    fetchData();
  }, [taskId]);

  // Set image preview only after component is mounted (client-side only)
  useEffect(() => {
    if (isMounted && task?.image) {
      const imageUrl = pb.files.getURL(task, task.image);
      setImagePreview(imageUrl);
    }
  }, [isMounted, task]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const updateData = new FormData();
      updateData.append('task_number', formData.task_number.toString());
      updateData.append('title', formData.title);
      updateData.append('description', formData.description);
      updateData.append('zone', formData.zone);
      updateData.append('estimated_minutes', formData.estimated_minutes);
      
      // If assigning a volunteer and status is "open", automatically set to "in_progress"
      let finalStatus = formData.status;
      if (formData.assigned_to && formData.status === 'open') {
        finalStatus = 'in_progress';
      }
      updateData.append('status', finalStatus);

      // Add assigned_to (send empty string to clear assignment)
      // If it's a single value, PocketBase expects a single value for single-relation or array for multiple.
      // But FormData with same key multiple times creates an array on server side usually.
      // However, for single updates via SDK using FormData, we should be careful.
      // If assigned_to is empty string, it clears.
      
      if (formData.assigned_to) {
          updateData.append('assigned_to', formData.assigned_to);
      } else {
          updateData.append('assigned_to', '');
      }

      // Add image if a new one was selected
      if (imageFile) {
        updateData.append('image', imageFile);
      }

      // Update task via API route
      const response = await fetch(`/api/tasks?id=${taskId}`, {
        method: 'PATCH',
        body: updateData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to update task');
      }

      console.log('✅ Task updated successfully');

      // Success - redirect back to volunteer's task list
      const volunteerId = localStorage.getItem('volunteerId');
      if (volunteerId) {
        router.push(`/volunteer/tasks?id=${volunteerId}`);
      } else {
        router.push('/display'); // Fallback if no volunteer context
      }
    } catch (err: any) {
      console.error('Error updating task:', err);
      setError(err.message || 'Failed to update task');
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (!confirm('Are you sure you want to archive this task? It will be hidden from all lists.')) {
      return;
    }

    try {
      // Prepend [ARCHIVED] to title if not already archived
      const newTitle = formData.title.startsWith('[ARCHIVED]')
        ? formData.title
        : `[ARCHIVED] ${formData.title}`;

      // Archive task via API route
      const archiveFormData = new FormData();
      archiveFormData.append('title', newTitle);

      const response = await fetch(`/api/tasks?id=${taskId}`, {
        method: 'PATCH',
        body: archiveFormData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to archive task');
      }

      console.log('✅ Task archived successfully');

      // Success - redirect back to volunteer's task list
      const volunteerId = localStorage.getItem('volunteerId');
      if (volunteerId) {
        router.push(`/volunteer/tasks?id=${volunteerId}`);
      } else {
        router.push('/display'); // Fallback if no volunteer context
      }
    } catch (err: any) {
      console.error('Error archiving task:', err);
      setError(err.message || 'Failed to archive task');
    }
  };

  // Show loading while checking auth
  if (status === 'loading' || !authChecked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin text-6xl">⏳</div>
          <p className="text-white text-xl">Checking authentication...</p>
        </div>
      </div>
    );
  }

  // If not authenticated after check, show redirecting message
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl">🔒</div>
          <p className="text-white text-xl">Authentication required. Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // Show loading while fetching task data
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin text-6xl">⏳</div>
          <p className="text-white text-xl">Loading task...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl">❌</div>
          <p className="text-white text-xl">Task not found</p>
          <button
            onClick={() => router.back()}
            className="text-white/80 hover:text-white"
          >
            ← Go back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 p-4">
      <div className="max-w-2xl mx-auto py-8">
        <button
          onClick={() => router.back()}
          className="text-white/80 hover:text-white mb-6 flex items-center gap-2"
        >
          ← Back
        </button>

        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">✏️</div>
            <h1 className="text-3xl font-bold text-white mb-2">Edit Task #{task.task_number}</h1>
            <p className="text-white/80">Update task details, image, and assignment</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-white p-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Task Number - Read-only */}
            <div>
              <label className="block text-white font-medium mb-2">
                Task Number
              </label>
              <input
                type="number"
                readOnly
                value={formData.task_number}
                className="w-full px-4 py-3 rounded-xl bg-white/10 border-2 border-white/20 text-white/70 cursor-not-allowed"
              />
            </div>

            {/* Title */}
            <div>
              <label className="block text-white font-medium mb-2">
                Title *
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                placeholder="e.g., Clean 3D Printer Area"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-white font-medium mb-2">
                Description *
              </label>
              <textarea
                required
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={4}
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                placeholder="What needs to be done?"
              />
            </div>

            {/* Zone */}
            <div>
              <label className="block text-white font-medium mb-2">
                Zone *
              </label>
              <select
                required
                value={formData.zone}
                onChange={(e) =>
                  setFormData({ ...formData, zone: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white focus:outline-none focus:border-white/60"
              >
                {zones.map((zone) => (
                  <option key={zone} value={zone} className="bg-brand-900">
                    {zone}
                  </option>
                ))}
              </select>
            </div>

            {/* Estimated Time */}
            <div>
              <label className="block text-white font-medium mb-2">
                Estimated Time (minutes) *
              </label>
              <input
                type="number"
                required
                value={formData.estimated_minutes}
                onChange={(e) =>
                  setFormData({ ...formData, estimated_minutes: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                placeholder="e.g., 120 (2 hours)"
              />
              {formData.estimated_minutes && !isNaN(parseInt(formData.estimated_minutes)) && (
                <p className="text-white/60 text-sm mt-2">
                  ≈ {Math.round(parseInt(formData.estimated_minutes) / 60)} hours
                </p>
              )}
            </div>

            {/* Status */}
            <div>
              <label className="block text-white font-medium mb-2">
                Status *
              </label>
              <select
                required
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as 'open' | 'in_progress' | 'completed' })
                }
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white focus:outline-none focus:border-white/60"
              >
                <option value="open" className="bg-brand-900">Open</option>
                <option value="in_progress" className="bg-brand-900">In Progress</option>
                <option value="completed" className="bg-brand-900">Completed</option>
              </select>
            </div>

            {/* Assign to Volunteer */}
            <div>
              <label className="block text-white font-medium mb-2">
                Assign to Volunteer (Optional)
              </label>
              <select
                value={formData.assigned_to}
                onChange={(e) =>
                  setFormData({ ...formData, assigned_to: e.target.value })
                }
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white focus:outline-none focus:border-white/60"
              >
                <option value="" className="bg-brand-900">-- Unassigned --</option>
                {volunteers.map((volunteer) => (
                  <option key={volunteer.id} value={volunteer.id} className="bg-brand-900">
                    {getVolunteerName(volunteer)} ({Math.round((volunteer.total_minutes || 0) / 60)}h contributed)
                  </option>
                ))}
              </select>
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-white font-medium mb-2">
                Task Image (Optional)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-white/30 file:text-white hover:file:bg-white/40"
              />
              {isMounted && imagePreview && (
                <div className="mt-4">
                  <p className="text-white/80 text-sm mb-2">Preview:</p>
                  <img
                    src={imagePreview}
                    alt="Task preview"
                    className="w-full max-h-64 object-contain rounded-xl border-2 border-white/30"
                  />
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-white text-brand-900 font-bold py-4 px-6 rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xl"
            >
              {submitting ? 'Updating...' : 'Update Task'}
            </button>

            {/* Archive Button */}
            <button
              type="button"
              onClick={handleArchive}
              className="w-full bg-orange-500/20 border-2 border-orange-500/50 text-white font-bold py-4 px-6 rounded-xl hover:bg-orange-500/30 transition-colors text-xl"
            >
              Archive Task
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
