'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import pb from '@/lib/pocketbase';
import type { Task, Volunteer } from '@/lib/pocketbase';
import { getVolunteerName, formatTime } from '@/lib/utils';
import { 
  Plus,
  CheckCircle2,
  Target,
  Palette,
  Flame,
  User,
  Calendar,
  Clock,
  Edit,
  Link as LinkIcon,
  ChevronDown,
  ChevronUp
} from 'lucide-react';



function TasksPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const volunteerId = searchParams.get('id');
  const { data: session } = useSession();

  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTasks, setActiveTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<'all' | string>('all');
  const [sortBy, setSortBy] = useState<'task_number' | 'created' | 'updated'>('task_number');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if user is admin (has Zone Leader role)
  const isAdmin = (session?.user as any)?.isAdmin || false;

  // Check authentication on mount
  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        
        if (!data.session) {
          // Allow viewing without session
          setIsAuthenticated(true);
          setLoading(false);
          return;
        }
        
        setIsAuthenticated(true);
        console.log('✅ User authenticated');
      } catch (err) {
        console.error('Error checking auth:', err);
        // Allow view even if auth check fails
        setIsAuthenticated(true);
        setLoading(false);
      }
    }
    
    checkAuth();
  }, [router]);

  // Fetch volunteer data
useEffect(() => {
    const vid = volunteerId || (session?.user as any)?.volunteerId;
    if (!vid) {
      setLoading(false);
      return;
    }

    // Store volunteer ID in localStorage for navigation
    localStorage.setItem('volunteerId', vid);

    async function fetchVolunteer() {
      if (!vid) return;

      try {
        const record = await pb.collection('volunteers').getOne<Volunteer>(vid);
        setVolunteer(record);
      } catch (err) {
        console.error('Error fetching volunteer:', err);
        router.push('/volunteer');
      }
    }

    fetchVolunteer();
  }, [volunteerId, session, router]);

  // Fetch active (in-progress) tasks assigned to this volunteer
  useEffect(() => {
    const vid = volunteerId || (session?.user as any)?.volunteerId; 
    if (!vid) return;

    async function fetchActiveTasks() {
      try {
        // Fetch all in_progress tasks, then filter client-side for assignment
        // This avoids PocketBase filter syntax issues with relation fields
        const records = await pb.collection('tasks').getList(1, 100, {
          filter: 'status = "in_progress"',
          sort: 'task_number',
        });
        
        // PocketBase returns records with created/updated fields automatically
        const tasksWithDates = records.items as unknown as Task[];
        
        // Filter client-side:
        // 1. Assigned to this volunteer
        // 2. Not archived
        const active = tasksWithDates.filter((task: Task) => {
          // Check if assigned to this volunteer
          const isAssigned = volunteerId ? (
            Array.isArray(task.assigned_to)
              ? task.assigned_to.includes(volunteerId)
              : task.assigned_to === volunteerId
          ) : false;
          
          // Check not archived
          const notArchived = !task.title.startsWith('[ARCHIVED]');
          
          return isAssigned && notArchived;
        });
        
        // Fetch creator names for active tasks
        const activeWithCreators = await Promise.all(
          active.map(async (task) => {
            if (task.created_by) {
              try {
                const creator = await pb.collection('volunteers').getOne(task.created_by);
                return {
                  ...task,
                  creator_name: creator.username || creator.email || 'Unknown',
                };
              } catch (err) {
                return { ...task, creator_name: 'Unknown' };
              }
            }
            return task;
          })
        );
        
        setActiveTasks(activeWithCreators);
      } catch (err) {
        console.error('Error fetching active tasks:', err);
      }
    }

    fetchActiveTasks();
  }, [volunteerId]);

  // Fetch completed tasks assigned to this volunteer
  useEffect(() => {
    if (!volunteerId) return;

    async function fetchCompletedTasks() {
      try {
        // Fetch all completed tasks, then filter client-side for assignment
        // This avoids PocketBase filter syntax issues with relation fields
        const records = await pb.collection('tasks').getList(1, 100, {
          filter: 'status = "completed"',
          sort: '-updated',
        });
        
        // PocketBase returns records with created/updated fields automatically
        const tasksWithDates = records.items as unknown as Task[];
        
        // Filter client-side:
        // 1. Assigned to this volunteer
        // 2. Not archived
        const completed = tasksWithDates.filter((task: Task) => {
          // Check if assigned to this volunteer
          const isAssigned = volunteerId ? (
            Array.isArray(task.assigned_to)
              ? task.assigned_to.includes(volunteerId)
              : task.assigned_to === volunteerId
          ) : false;
          
          // Check not archived
          const notArchived = !task.title.startsWith('[ARCHIVED]');
          
          return isAssigned && notArchived;
        });
        
        // Fetch creator names for completed tasks
        const completedWithCreators = await Promise.all(
          completed.map(async (task) => {
            if (task.created_by) {
              try {
                const creator = await pb.collection('volunteers').getOne(task.created_by);
                return {
                  ...task,
                  creator_name: creator.username || creator.email || 'Unknown',
                };
              } catch (err) {
                return { ...task, creator_name: 'Unknown' };
              }
            }
            return task;
          })
        );
        
        setCompletedTasks(completedWithCreators);
      } catch (err) {
        console.error('Error fetching completed tasks:', err);
      }
    }

    fetchCompletedTasks();
  }, [volunteerId]);

  // Fetch tasks
  useEffect(() => {
    async function fetchTasks() {
      try {
        // Fetch tasks - get all open and in_progress tasks
        const records = await pb.collection('tasks').getList(1, 50, {
          filter: '(status = "open" || status = "in_progress")',
          sort: 'task_number',
        });
        
        // PocketBase automatically includes created and updated fields
        // Cast to Task type (which includes optional created/updated)
        const tasksWithDates = records.items as unknown as Task[];
        
        // Fetch creator names for all tasks
        const tasksWithCreators = await Promise.all(
          tasksWithDates.map(async (task) => {
            if (task.created_by) {
              try {
                const creator = await pb.collection('volunteers').getOne(task.created_by);
                return {
                  ...task,
                  creator_name: creator.username || creator.email || 'Unknown',
                };
              } catch (err) {
                console.warn(`Could not fetch creator for task ${task.id}:`, err);
                return { ...task, creator_name: 'Unknown' };
              }
            }
            return task;
          })
        );
        
        // Exclude archived tasks
        setTasks(tasksWithCreators.filter(task => !task.title.startsWith('[ARCHIVED]')));
        setLoading(false);
      } catch (err) {
        console.error('Error fetching tasks:', err);
        setLoading(false);
      }
    }

    fetchTasks();

    // Subscribe to real-time updates
    pb.collection('tasks').subscribe<Task>('*', (e) => {
      const isArchived = e.record.title.startsWith('[ARCHIVED]');

      if (e.action === 'create' && e.record.status === 'open' && !isArchived) {
        setTasks((prev) => [...prev, e.record].sort((a, b) => a.task_number - b.task_number));
      } else if (e.action === 'update') {
        // Update tasks list (exclude archived)
        // Include both open and in_progress
        if ((e.record.status === 'open' || e.record.status === 'in_progress') && !isArchived) {
          setTasks((prev) => {
            const exists = prev.find(t => t.id === e.record.id);
            if (exists) {
              return prev.map((t) => (t.id === e.record.id ? e.record : t));
            } else {
              return [...prev, e.record].sort((a, b) => a.task_number - b.task_number);
            }
          });
        } else {
          // Remove from tasks list if status changed to completed or archived
          setTasks((prev) => prev.filter((t) => t.id !== e.record.id));
        }

        // Update active tasks list (exclude archived)
        // The assigned_to field can be a string or array of strings.
        // We need to check if volunteerId is present in assigned_to.
        
        // Check if task is assigned to THIS specific user
        const isAssignedToMe = Array.isArray(e.record.assigned_to)
            ? e.record.assigned_to.includes(volunteerId || '')
            : e.record.assigned_to === volunteerId;

        // Show task in active list ONLY if:
        // 1. It's assigned to THIS user (volunteerId matches) AND
        // 2. Status is "in_progress" AND
        // 3. Not archived
        if (isAssignedToMe && e.record.status === 'in_progress' && !isArchived) {
          setActiveTasks((prev) => {
            const exists = prev.find(t => t.id === e.record.id);
            if (exists) {
              return prev.map((t) => (t.id === e.record.id ? e.record : t));
            } else {
              return [...prev, e.record].sort((a, b) => a.task_number - b.task_number);
            }
          });
        } else {
          // Remove from active tasks if:
          // - Not assigned to this user, OR
          // - Status changed from in_progress, OR
          // - Archived
          setActiveTasks((prev) => prev.filter((t) => t.id !== e.record.id));
        }
      } else if (e.action === 'delete') {
        setTasks((prev) => prev.filter((t) => t.id !== e.record.id));
        setActiveTasks((prev) => prev.filter((t) => t.id !== e.record.id));
      }
    });

    return () => {
      pb.collection('tasks').unsubscribe();
    };
  }, [volunteerId, volunteer]);

  const handleClaimTask = async (taskId: string) => {
    if (!volunteerId) {
      alert('Please log in to claim tasks');
      return;
    }

    try {
      // Get task details before updating
      const task = tasks.find(t => t.id === taskId);

      // Assign task to current user via API route
      const formData = new FormData();
      formData.append('assigned_to', volunteerId);
      formData.append('status', 'in_progress');

      const response = await fetch(`/api/tasks?id=${taskId}`, {
        method: 'PATCH',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to claim task');
      }

      console.log('✅ Task claimed successfully');

      // Send Discord DM notification (non-blocking)
      if (task) {
        try {
          await fetch('/api/discord/notify-assignment', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              taskId: taskId,
              taskData: {
                task_number: task.task_number,
                title: task.title,
                description: task.description,
                zone: task.zone,
                estimated_minutes: task.estimated_minutes,
              },
              volunteerId: volunteerId,
            }),
          });
          console.log('✅ Discord assignment DM sent');
        } catch (discordErr) {
          // Don't fail task claim if Discord notification fails
          console.warn('⚠️ Discord assignment DM failed:', discordErr);
        }
      }

      // Task will appear in active tasks via real-time subscription
    } catch (err: any) {
      console.error('Error claiming task:', err);
      alert('Failed to claim task: ' + (err.message || 'Unknown error'));
    }
  };

  const handleUnclaimTask = async (taskId: string) => {
    if (!volunteerId) {
      alert('Please log in to unclaim tasks');
      return;
    }

    try {
      // Unassign task via API route
      const formData = new FormData();
      formData.append('assigned_to', '');
      formData.append('status', 'open');

      const response = await fetch(`/api/tasks?id=${taskId}`, {
        method: 'PATCH',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to unclaim task');
      }

      console.log('✅ Task unclaimed successfully');

      // Task will be removed from active tasks via real-time subscription
    } catch (err: any) {
      console.error('Error unclaiming task:', err);
      alert('Failed to unclaim task: ' + (err.message || 'Unknown error'));
    }
  };

  const handleCompleteTask = (taskId: string) => {
    if (!volunteerId) return;
    router.push(`/volunteer/track?taskId=${taskId}&volunteerId=${volunteerId}`);
  };

  const filteredTasks = filter === 'all'
    ? tasks
    : tasks.filter(t => t.zone === filter);

  // Sort tasks based on selected criteria
  const sortedTasks = [...filteredTasks].sort((a, b) => {
    let comparison = 0;
    
    if (sortBy === 'task_number') {
      comparison = a.task_number - b.task_number;
    } else if (sortBy === 'created') {
      // Use created timestamp if available, fallback to task_number
      if (a.created && b.created) {
        comparison = new Date(a.created).getTime() - new Date(b.created).getTime();
      } else {
        // Fallback to task_number if created field is missing
        comparison = a.task_number - b.task_number;
      }
    } else if (sortBy === 'updated') {
      // Use updated timestamp if available, fallback to task_number
      if (a.updated && b.updated) {
        comparison = new Date(a.updated).getTime() - new Date(b.updated).getTime();
      } else {
        // Fallback to task_number if updated field is missing
        comparison = a.task_number - b.task_number;
      }
    }
    
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const zones = ['Woodshop', '3D Printing', 'Electronics', 'Laser Cutting', 'CNC', 'General', 'Admin'];

  const getZoneColor = (zone: string) => {
    const colors: Record<string, string> = {
      Woodshop: 'bg-amber-100 text-amber-800 border-amber-300',
      '3D Printing': 'bg-brand-100 text-brand-800 border-brand-400',
      Electronics: 'bg-brand-50 text-brand-900 border-brand-500',
      'Laser Cutting': 'bg-red-100 text-red-800 border-red-300',
      CNC: 'bg-green-100 text-green-800 border-green-300',
      General: 'bg-gray-100 text-gray-800 border-gray-300',
      Admin: 'bg-brand-50 text-brand-900 border-brand-500',
    };
    return colors[zone] || colors.General;
  };

  if (!isAuthenticated || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-brand-50 to-brand-50">
      {/* Top Navigation Bar */}
      <nav className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Action Buttons */}
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => router.push('/task/create')}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all font-medium text-sm shadow-lg border-2 border-blue-500"
              >
                <Plus className="w-5 h-5" />
                <span className="hidden sm:inline">Create</span>
              </button>
              <button
                onClick={() => router.push('/claim')}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium text-sm shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span className="hidden sm:inline">Claim</span>
              </button>
              <button
                onClick={() => router.push(`/volunteer/goals?id=${volunteerId}`)}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-medium text-sm shadow-md"
              >
                <Target className="w-4 h-4" />
                <span className="hidden sm:inline">Goals</span>
              </button>
              <button
                onClick={() => router.push(`/volunteer/creations?id=${volunteerId}`)}
                className="flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors font-medium text-sm shadow-md"
              >
                <Palette className="w-4 h-4" />
                <span className="hidden sm:inline">Creations</span>
              </button>
            </div>

            {/* Right: Profile & Admin */}
            <div className="flex items-center gap-3">
              {isAdmin && (
                <button
                  onClick={() => router.push('/admin/dashboard')}
                  className="hidden sm:flex items-center gap-2 px-3 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition-colors font-medium text-sm"
                >
                  <span className="text-lg">🔧</span>
                  <span>Admin</span>
                </button>
              )}

              {/* Logout Button */}
              <button
                onClick={async () => {
                  try {
                    // Clear session cookie
                    await fetch('/api/auth/logout', { method: 'POST' });
                    // Clear any stored volunteerId
                    localStorage.removeItem('volunteerId');
                    // Force redirect to login
                    window.location.href = '/auth/discord';
                  } catch (err) {
                    console.error('Logout error:', err);
                    // Force redirect anyway
                    window.location.href = '/auth/discord';
                  }
                }}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
                title="Logout"
              >
                <span className="text-base sm:text-lg">🚪</span>
                <span className="hidden sm:inline">Logout</span>
              </button>

              {/* Profile Image */}
              <button
                onClick={() => router.push(`/volunteer/profile?id=${volunteerId}`)}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                title={`${getVolunteerName(volunteer)} - ${Math.round((volunteer?.total_minutes || 0) / 60)}h contributed`}
              >
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-sm font-semibold text-gray-900">{getVolunteerName(volunteer)}</span>
                  <span className="text-xs text-gray-600">{Math.round((volunteer?.total_minutes || 0) / 60)}h</span>
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-600 to-secondary-600 overflow-hidden flex-shrink-0 border-2 border-white shadow-md">
                  {volunteer?.profile_photo ? (
                    <img
                      src={pb.files.getURL(volunteer, volunteer.profile_photo)}
                      alt="Profile"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white text-lg">
                      <User className="w-8 h-8" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Page Header */}
          <div className="mb-6">
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">Task Dashboard</h1>
            <p className="text-gray-600">Browse available tasks, claim work, or create new opportunities for the community</p>
          </div>

          {/* Active Tasks Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Flame className="w-6 h-6" />
              Your Active Tasks
            </h2>
            {activeTasks.length === 0 ? (
              <div className="bg-white rounded-lg shadow p-8 text-center">
                <p className="text-gray-500 text-lg">No active tasks right now.</p>
                <p className="text-gray-400 text-sm mt-2">Claim a task below to get started!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeTasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-gradient-to-br from-brand-50 to-brand-50 rounded-lg shadow-lg hover:shadow-xl transition-shadow p-6 border-2 border-brand-500 relative"
                >
                  {/* Task Image (if available) */}
                  {task.image && (
                    <div className="w-full mb-3 rounded overflow-hidden">
                      <img
                        src={pb.files.getURL(task, task.image, { thumb: '400x300' })}
                        alt={task.title}
                        className="w-full h-auto object-cover"
                        style={{ maxHeight: '200px' }}
                      />
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-mono text-brand-700 font-bold">#{task.task_number}</span>
                    <span className={`text-xs px-2 py-1 rounded-full border ${getZoneColor(task.zone)}`}>
                      {task.zone}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {task.title}
                  </h3>

                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                    {task.description}
                  </p>

                  {/* Creator and Date Info */}
                  {(task.creator_name || task.created) && (
                    <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5 mb-3 space-y-0.5">
                      {task.creator_name && (
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          <span className="font-medium">Creator:</span>
                          <span className="truncate">{task.creator_name}</span>
                        </div>
                      )}
                      {task.created && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">Created:</span>
                          <span>{new Date(task.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-brand-200">
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Clock className="w-4 h-4" />
                      <span>{formatTime(task.estimated_minutes)}</span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUnclaimTask(task.id)}
                        className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold text-sm"
                      >
                        Unclaim
                      </button>
                      <button
                        onClick={() => handleCompleteTask(task.id)}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-sm"
                      >
                        Complete
                      </button>
                      {/* Edit Button */}
                      <a
                        href={`/task/edit/${task.id}`}
                        className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg w-9 h-9 flex items-center justify-center transition-colors text-sm shadow-md"
                        title="Edit Task"
                      >
                        <Edit className="w-4 h-4" />
                      </a>
                      {/* Copy Link Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const taskUrl = `${window.location.origin}/task/${task.id}`;
                          navigator.clipboard.writeText(taskUrl);
                          const btn = e.currentTarget;
                          const originalText = btn.textContent;
                          btn.textContent = '✓';
                          setTimeout(() => btn.textContent = originalText, 1000);
                        }}
                        className="bg-gray-600 hover:bg-gray-700 text-white rounded-lg w-9 h-9 flex items-center justify-center transition-colors text-sm shadow-md"
                        title="Copy task link"
                      >
                        <LinkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
                ))}
              </div>
            )}
          </div>

          {/* Completed Tasks Section */}
          {completedTasks.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  <CheckCircle2 className="w-6 h-6" />
                  Your Completed Tasks ({completedTasks.length})
                </h2>
                <button
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm"
                >
                  {showCompleted ? '▲ Hide' : '▼ Show'}
                </button>
              </div>
              
              {showCompleted && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 border-l-4 border-green-500 relative opacity-75"
                  >
                    {/* Task Image (if available) */}
                    {task.image && (
                      <div className="w-full mb-3 rounded overflow-hidden">
                        <img
                          src={pb.files.getURL(task, task.image, { thumb: '400x300' })}
                          alt={task.title}
                          className="w-full h-auto object-cover"
                          style={{ maxHeight: '200px' }}
                        />
                      </div>
                    )}

                    <div className="flex items-start justify-between mb-3">
                      <span className="text-sm font-mono text-gray-500">#{task.task_number}</span>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getZoneColor(task.zone)}`}>
                        {task.zone}
                      </span>
                    </div>

                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {task.title}
                    </h3>

                    <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                      {task.description}
                    </p>

                    {/* Creator and Date Info */}
                    {(task.created_by || task.created) && (
                      <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5 mb-3 space-y-0.5">
                        {task.created_by && (
                          <div className="flex items-center gap-1">
                            <User className="w-4 h-4" />
                            <span className="font-medium">Creator:</span>
                            <span className="truncate">{task.created_by.slice(0, 10)}...</span>
                          </div>
                        )}
                        {task.created && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            <span className="font-medium">Created:</span>
                            <span>{new Date(task.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                      <div className="flex items-center gap-1 text-sm text-green-600 font-semibold">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Completed</span>
                      </div>
                      <div className="flex gap-2">
                        {/* Copy Link Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const taskUrl = `${window.location.origin}/task/${task.id}`;
                            navigator.clipboard.writeText(taskUrl);
                            const btn = e.currentTarget;
                            const originalText = btn.textContent;
                            btn.textContent = '✓';
                            setTimeout(() => btn.textContent = originalText, 1000);
                          }}
                          className="bg-gray-600 hover:bg-gray-700 text-white rounded-lg w-9 h-9 flex items-center justify-center transition-colors text-sm shadow-md"
                          title="Copy task link"
                        >
                          <LinkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filter and Sort Bar */}
          <div className="bg-white rounded-lg shadow p-4 mb-6">
            {/* Zone Filter */}
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="text-sm font-medium text-gray-700">Filter by zone:</span>
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All ({tasks.length})
              </button>
              {zones.map((zone) => {
                const count = tasks.filter(t => t.zone === zone).length;
                if (count === 0) return null;
                return (
                  <button
                    key={zone}
                    onClick={() => setFilter(zone)}
                    className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                      filter === zone
                        ? 'bg-brand-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {zone} ({count})
                  </button>
                );
              })}
            </div>

            {/* Sort Controls */}
            <div className="flex items-center gap-3 flex-wrap border-t pt-4">
              <span className="text-sm font-medium text-gray-700">Sort by:</span>
              <div className="flex gap-2">
                <button
                  onClick={() => setSortBy('task_number')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                    sortBy === 'task_number'
                      ? 'bg-brand-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>🔢</span>
                  <span>Task #</span>
                </button>
                <button
                  onClick={() => setSortBy('created')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                    sortBy === 'created'
                      ? 'bg-brand-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>📅</span>
                  <span>Created</span>
                </button>
                <button
                  onClick={() => setSortBy('updated')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1 ${
                    sortBy === 'updated'
                      ? 'bg-brand-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  <span>🔄</span>
                  <span>Updated</span>
                </button>
              </div>
              
              {/* Sort Order Toggle */}
              <button
                onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                className="px-3 py-1.5 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-1 shadow-md"
                title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
              >
                <span className="text-base">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                <span>{sortOrder === 'asc' ? 'Ascending' : 'Descending'}</span>
              </button>
            </div>
          </div>

          {/* Tasks Grid */}
          {sortedTasks.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-12 text-center">
              <p className="text-gray-500 text-lg">No tasks available right now.</p>
              <p className="text-gray-400 text-sm mt-2">Check back soon for new opportunities!</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedTasks.map((task) => (
                <div
                  key={task.id}
                  className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 border-l-4 border-brand-500 relative"
                >
                  {/* Task Image (if available) */}
                  {task.image && (
                    <div className="w-full mb-3 rounded overflow-hidden">
                      <img
                        src={pb.files.getURL(task, task.image, { thumb: '400x300' })}
                        alt={task.title}
                        className="w-full h-auto object-cover"
                        style={{ maxHeight: '200px' }}
                      />
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-3">
                    <span className="text-sm font-mono text-gray-500">#{task.task_number}</span>
                    <span className={`text-xs px-2 py-1 rounded-full border ${getZoneColor(task.zone)}`}>
                      {task.zone}
                    </span>
                  </div>

                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {task.title}
                  </h3>

                  <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                    {task.description}
                  </p>

                  {/* Creator and Date Info */}
                  {(task.creator_name || task.created) && (
                    <div className="text-xs text-gray-500 bg-gray-50 rounded px-2 py-1.5 mb-3 space-y-0.5">
                      {task.creator_name && (
                        <div className="flex items-center gap-1">
                          <User className="w-4 h-4" />
                          <span className="font-medium">Creator:</span>
                          <span className="truncate">{task.creator_name}</span>
                        </div>
                      )}
                      {task.created && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          <span className="font-medium">Created:</span>
                          <span>{new Date(task.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <Clock className="w-4 h-4" />
                      <span>{formatTime(task.estimated_minutes)}</span>
                    </div>

                    <div className="flex gap-2">
                      {(() => {
                        // Check if task is assigned to current user
                        const isAssignedToMe = volunteerId ? (
                          Array.isArray(task.assigned_to)
                            ? task.assigned_to.includes(volunteerId)
                            : task.assigned_to === volunteerId
                        ) : false;

                        if (isAssignedToMe) {
                          // Task is assigned to user - show Unclaim button
                          return (
                            <button
                              onClick={() => handleUnclaimTask(task.id)}
                              className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold text-sm"
                            >
                              Unclaim
                            </button>
                          );
                        } else {
                          // Task is not assigned - show Claim button
                          return (
                            <button
                              onClick={() => handleClaimTask(task.id)}
                              className="px-3 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors font-semibold text-sm"
                            >
                              Claim
                            </button>
                          );
                        }
                      })()}
                      <button
                        onClick={() => handleCompleteTask(task.id)}
                        className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-sm"
                      >
                        Complete
                      </button>
                      {/* Edit Button */}
                      <a
                        href={`/task/edit/${task.id}`}
                        className="bg-brand-600 hover:bg-brand-700 text-white rounded-lg w-9 h-9 flex items-center justify-center transition-colors text-sm shadow-md"
                        title="Edit Task"
                      >
                        <Edit className="w-4 h-4" />
                      </a>
                      {/* Copy Link Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const taskUrl = `${window.location.origin}/task/${task.id}`;
                          navigator.clipboard.writeText(taskUrl);
                          const btn = e.currentTarget;
                          const originalText = btn.textContent;
                          btn.textContent = '✓';
                          setTimeout(() => btn.textContent = originalText, 1000);
                        }}
                        className="bg-gray-600 hover:bg-gray-700 text-white rounded-lg w-9 h-9 flex items-center justify-center transition-colors text-sm shadow-md"
                        title="Copy task link"
                      >
                        <LinkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
  );
}

export default function TasksPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    }>
      <TasksPageContent />
    </Suspense>
  );
}
