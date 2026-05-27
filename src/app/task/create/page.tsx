'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import pb from '@/lib/pocketbase';
import type { Task, Volunteer } from '@/lib/pocketbase';
import { Plus, MessageCircle } from 'lucide-react';

export default function CreateTaskPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    task_number: 1,
    title: '',
    description: '',
    zone: 'General',
    estimated_minutes: '',
    assigned_to: '', // Add assigned volunteer
  });
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Auto-generate next task number on mount
  useEffect(() => {
    const getNextTaskNumber = async () => {
      try {
        // Get all tasks ordered by task_number descending
        const tasks = await pb.collection('tasks').getList<Task>(1, 100, {
          sort: '-task_number',
        });
        const mainBoardTasks = tasks.items;

        // If there are tasks, increment the highest number, otherwise start at 1
        const nextNumber = mainBoardTasks.length > 0 ? mainBoardTasks[0].task_number + 1 : 1;
        setFormData(prev => ({ ...prev, task_number: nextNumber }));
      } catch (err) {
        console.error('Error fetching task number:', err);
        // Default to 1 if there's an error
        setFormData(prev => ({ ...prev, task_number: 1 }));
      }
    };

    getNextTaskNumber();
  }, []);

  // Fetch volunteers for assignment dropdown
  useEffect(() => {
    const fetchVolunteers = async () => {
      try {
        const records = await pb.collection('volunteers').getList<Volunteer>(1, 200, {
          sort: 'username,email',
        });
        setVolunteers(records.items);
      } catch (err) {
        console.error('Error fetching volunteers:', err);
      }
    };

    fetchVolunteers();
  }, []);

  const zones = [
    'Woodshop',
    '3D Printing',
    'Electronics',
    'Laser Cutting',
    'CNC',
    'General',
    'Admin',
  ];

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
    setSubmitting(true);
    setError('');

    try {
      // Get volunteerId from session or localStorage
      const volunteerId = localStorage.getItem('volunteerId');
      if (!volunteerId) {
        setError('Volunteer ID not found. Please log in again.');
        setSubmitting(false);
        return;
      }

      // Prepare data
      const data: any = {
        task_number: parseInt(formData.task_number.toString()),
        title: formData.title,
        description: formData.description,
        zone: formData.zone,
        estimated_minutes: parseInt(formData.estimated_minutes),
        status: formData.assigned_to ? 'in_progress' : 'open', // If assigned, set to in_progress
        created_by: volunteerId,
      };

      // Add assigned_to if volunteer is selected
      if (formData.assigned_to) {
        data.assigned_to = formData.assigned_to;
      }

      // Create task using API route (which has admin auth)
      const formDataObj = new FormData();
      Object.keys(data).forEach(key => {
        formDataObj.append(key, data[key]);
      });
      if (imageFile) {
        formDataObj.append('image', imageFile);
      }

      const createResponse = await fetch('/api/tasks', {
        method: 'POST',
        body: formDataObj,
      });

      const createResult = await createResponse.json();

      if (!createResponse.ok || !createResult.success) {
        throw new Error(createResult.error || 'Failed to create task');
      }

      const newTask = createResult.task;
      console.log('Task created successfully:', newTask);

      // Send Discord notification (non-blocking)
      try {
        await fetch('/api/discord/notify-task', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            taskId: newTask.id,
            taskData: {
              task_number: newTask.task_number,
              title: newTask.title,
              description: newTask.description,
              zone: newTask.zone,
              estimated_minutes: newTask.estimated_minutes,
              image: newTask.image,
            },
            createdById: volunteerId,
          }),
        });
        console.log('✅ Discord notification sent');
      } catch (discordErr) {
        // Don't fail task creation if Discord notification fails
        console.warn('⚠️ Discord notification failed:', discordErr);
      }

      // If task was assigned to someone, send them a DM
      if (formData.assigned_to) {
        try {
          console.log('🔔 Attempting to send Discord assignment DM...');
          const dmResponse = await fetch('/api/discord/notify-assignment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              taskId: newTask.id,
              taskData: {
                task_number: newTask.task_number,
                title: newTask.title,
                description: newTask.description,
                zone: newTask.zone,
                estimated_minutes: newTask.estimated_minutes,
              },
              volunteerId: formData.assigned_to,
            }),
          });
          
          const dmResult = await dmResponse.json();
          
          if (dmResponse.ok && dmResult.success) {
            console.log('✅ Discord assignment DM sent successfully!', dmResult);
          } else {
            console.warn('⚠️ Discord assignment DM failed:', dmResult);
          }
        } catch (discordErr) {
          console.error('❌ Discord assignment DM error:', discordErr);
        }
      }

      // Success - redirect back to volunteer's task list
      router.push(`/volunteer/tasks?id=${volunteerId}`);
    } catch (err: any) {
      console.error('Error creating task:', err);
      // Log detailed validation errors
      if (err.data && err.data.data) {
        console.error('Validation errors:', err.data.data);
        const validationErrors = Object.entries(err.data.data)
          .map(([field, error]: [string, any]) => `${field}: ${error.message}`)
          .join(', ');
        setError(`Validation failed: ${validationErrors}`);
      } else {
        const errorMessage = err.data?.message || err.message || 'Failed to create task';
        setError(errorMessage);
      }
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 p-4">
      <div className="max-w-2xl mx-auto py-8">
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <Plus className="w-20 h-20 mx-auto mb-4 text-white" />
            <h1 className="text-3xl font-bold text-white mb-2">Create New Task</h1>
            <p className="text-white/80">Add a task to the volunteer board</p>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-white p-4 rounded-xl mb-6">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Task Number - Auto-generated, read-only */}
            <div>
              <label className="block text-white font-medium mb-2">
                Task Number (Auto-generated)
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
              {formData.estimated_minutes && (
                <p className="text-white/60 text-sm mt-2">
                  ≈ {Math.round(parseInt(formData.estimated_minutes) / 60)} hours
                </p>
              )}
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
                <option value="" className="bg-brand-900">
                  -- Leave Unassigned --
                </option>
                {volunteers.map((volunteer) => (
                  <option key={volunteer.id} value={volunteer.id} className="bg-brand-900">
                    {volunteer.username || volunteer.email}
                  </option>
                ))}
              </select>
              {formData.assigned_to && (
                <p className="text-white/60 text-sm mt-2 flex items-center gap-1 justify-center">
                  <MessageCircle className="w-4 h-4" />
                  They will receive a Discord DM with task details
                </p>
              )}
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
              {imagePreview && (
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
              {submitting ? 'Creating...' : 'Create Task'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
