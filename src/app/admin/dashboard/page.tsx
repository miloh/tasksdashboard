'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import pb from '@/lib/pocketbase';
import type { Task, Volunteer, Completion } from '@/lib/pocketbase';

export default function AdminDashboard() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'tasks' | 'completions' | 'volunteers'>('tasks');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Check authentication - must be logged in with Zone Leader role
  useEffect(() => {
    async function checkAuth() {
      let isAdminUser = false;

      // Check NextAuth session first if available
      if (status === 'authenticated' && session) {
        isAdminUser = (session.user as any)?.isAdmin || false;
        if (isAdminUser) {
          setIsAuthorized(true);
          setAuthChecked(true);
          return;
        }
      }

      // Also check custom session cookie as fallback
      try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        
        if (data.session) {
          // Check if user has admin role in session
          // Note: Admin check should come from NextAuth, but we check session anyway
          // For now, we'll rely on NextAuth for admin check
        }
      } catch (err) {
        console.error('Error checking auth:', err);
      }

      // If NextAuth is still loading, wait a bit then check
      if (status === 'loading') {
        // Wait max 2 seconds for NextAuth, then proceed
        setTimeout(() => {
          if (!isAdminUser) {
            setIsAuthorized(false);
            setAuthChecked(true);
            router.push('/admin');
          }
        }, 2000);
        return;
      }

      // Not admin - redirect
      if (!isAdminUser) {
        setIsAuthorized(false);
        setAuthChecked(true);
        router.push('/admin');
      }
    }
    
    checkAuth();
  }, [session, status, router]);

  // Fetch data (only if authorized)
  useEffect(() => {
    if (!isAuthorized || !authChecked) {
      return;
    }
    async function fetchData() {
      try {
        const [tasksData, volunteersData, completionsData] = await Promise.all([
          pb.collection('tasks').getList<Task>(1, 200, { sort: '-task_number' }),
          pb.collection('volunteers').getList<Volunteer>(1, 200, { sort: '-total_minutes' }),
          pb.collection('completions').getList<Completion>(1, 200, {
            sort: '-created',
            expand: 'task,volunteer'
          })
        ]);

        setTasks(tasksData.items);
        setVolunteers(volunteersData.items);
        setCompletions(completionsData.items);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching data:', err);
        setLoading(false);
      }
    }

    fetchData();
  }, [isAuthorized, authChecked]);

  // Show loading while checking auth
  if (!authChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Checking authorization...</div>
      </div>
    );
  }

  // If not authorized, show message (redirect will happen)
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="text-6xl">🔒</div>
          <p className="text-xl text-gray-600">Admin access required. Redirecting...</p>
        </div>
      </div>
    );
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;

    try {
      await pb.collection('tasks').delete(taskId);
      setTasks(prev => prev.filter(t => t.id !== taskId));
      alert('Task deleted successfully');
    } catch (err) {
      console.error('Error deleting task:', err);
      alert('Failed to delete task');
    }
  };

  const handleDeleteCompletion = async (completionId: string) => {
    if (!confirm('Are you sure you want to delete this completion?')) return;

    try {
      await pb.collection('completions').delete(completionId);
      setCompletions(prev => prev.filter(c => c.id !== completionId));
      alert('Completion deleted successfully');
    } catch (err) {
      console.error('Error deleting completion:', err);
      alert('Failed to delete completion');
    }
  };

  const handleResetVolunteer = async (volunteerId: string) => {
    if (!confirm('Are you sure you want to reset this volunteer\'s hours to 0?')) return;

    try {
      await pb.collection('volunteers').update(volunteerId, { total_minutes: 0 });
      setVolunteers(prev => prev.map(v => v.id === volunteerId ? { ...v, total_minutes: 0 } : v));
      alert('Volunteer hours reset successfully');
    } catch (err) {
      console.error('Error resetting volunteer:', err);
      alert('Failed to reset volunteer hours');
    }
  };

  const handleDeleteVolunteer = async (volunteerId: string) => {
    if (!confirm('Are you sure you want to DELETE this volunteer completely?')) return;

    try {
      await pb.collection('volunteers').delete(volunteerId);
      setVolunteers(prev => prev.filter(v => v.id !== volunteerId));
      alert('Volunteer deleted successfully');
    } catch (err) {
      console.error('Error deleting volunteer:', err);
      alert('Failed to delete volunteer');
    }
  };

  const handleClearAllCompletions = async () => {
    if (!confirm('⚠️ WARNING: This will delete ALL completions. Are you absolutely sure?')) return;
    if (!confirm('This cannot be undone. Type YES in the next prompt to confirm.')) return;

    try {
      // Get all completions
      const allCompletions = await pb.collection('completions').getFullList<Completion>();

      // Delete each one
      for (const completion of allCompletions) {
        await pb.collection('completions').delete(completion.id);
      }

      setCompletions([]);
      alert(`Successfully deleted ${allCompletions.length} completions`);
    } catch (err) {
      console.error('Error clearing completions:', err);
      alert('Failed to clear all completions');
    }
  };

  const handleLogout = () => {
    // Clear any session storage
    sessionStorage.removeItem('admin_authenticated');
    // Redirect to admin login
    router.push('/admin');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-600 to-secondary-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">🔧 Admin Dashboard</h1>
              <p className="text-brand-100 mt-1">Manage tasks, completions, and volunteers</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tabs */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('tasks')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'tasks'
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Tasks ({tasks.length})
              </button>
              <button
                onClick={() => setActiveTab('completions')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'completions'
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Completions ({completions.length})
              </button>
              <button
                onClick={() => setActiveTab('volunteers')}
                className={`px-6 py-4 text-sm font-medium border-b-2 ${
                  activeTab === 'volunteers'
                    ? 'border-brand-500 text-brand-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Volunteers ({volunteers.length})
              </button>
            </nav>
          </div>
        </div>

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">All Tasks</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {tasks.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No tasks found</div>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="p-4 hover:bg-gray-50 flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-mono text-gray-500">#{task.task_number}</span>
                        <span className={`text-xs px-2 py-1 rounded-full ${
                          task.status === 'open' ? 'bg-green-100 text-green-800' :
                          task.status === 'in_progress' ? 'bg-orange-100 text-orange-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {task.status}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-brand-100 text-brand-800">
                          {task.zone}
                        </span>
                      </div>
                      <h3 className="font-semibold text-gray-900">{task.title}</h3>
                      <p className="text-sm text-gray-600 line-clamp-1">{task.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => router.push(`/task/edit/${task.id}`)}
                        className="ml-4 px-3 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task.id)}
                        className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Completions Tab */}
        {activeTab === 'completions' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">All Completions</h2>
              <button
                onClick={handleClearAllCompletions}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium"
              >
                Clear All Completions
              </button>
            </div>
            <div className="divide-y divide-gray-200">
              {completions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No completions found</div>
              ) : (
                completions.map((completion) => {
                  const expanded = completion as any;
                  return (
                    <div key={completion.id} className="p-4 hover:bg-gray-50 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-700">
                            {expanded.expand?.volunteer?.username || 'Unknown'}
                          </span>
                          <span className="text-sm text-gray-500">completed</span>
                          <span className="text-sm font-semibold text-gray-700">
                            {expanded.expand?.task?.title || 'Unknown Task'}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">
                          Time: {completion.actual_minutes} minutes
                        </p>
                        {completion.completion_note && (
                          <p className="text-sm text-gray-500 line-clamp-1">
                            Note: {completion.completion_note}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteCompletion(completion.id)}
                        className="ml-4 px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Volunteers Tab */}
        {activeTab === 'volunteers' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">All Volunteers</h2>
            </div>
            <div className="divide-y divide-gray-200">
              {volunteers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">No volunteers found</div>
              ) : (
                volunteers.map((volunteer) => (
                  <div key={volunteer.id} className="p-4 hover:bg-gray-50 flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{volunteer.username}</h3>
                      <p className="text-sm text-gray-600">{volunteer.email}</p>
                      <p className="text-sm text-gray-500">
                        Total time: {Math.floor(volunteer.total_minutes / 60)}h {volunteer.total_minutes % 60}m
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleResetVolunteer(volunteer.id)}
                        className="px-3 py-2 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium"
                      >
                        Reset Hours
                      </button>
                      <button
                        onClick={() => handleDeleteVolunteer(volunteer.id)}
                        className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors text-sm font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
