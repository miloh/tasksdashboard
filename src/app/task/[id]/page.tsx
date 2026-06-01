'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import pb from '@/lib/pocketbase';
import type { Task, Volunteer } from '@/lib/pocketbase';

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [creator, setCreator] = useState<Volunteer | null>(null);
  const [completedBy, setCompletedBy] = useState<Array<{ name: string; minutes: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null);

  // Check if user is logged in
  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        
        if (data.isAuthenticated && data.volunteerId) {
          // Fetch volunteer info
          const volunteer = await pb.collection('volunteers').getOne(data.volunteerId);
          setCurrentUser({
            id: data.volunteerId,
            name: volunteer.username || volunteer.email || 'User',
          });
        }
      } catch (err) {
        console.error('Error checking auth:', err);
      }
    }
    
    checkAuth();
  }, []);

  // Fetch task details
  useEffect(() => {
    async function fetchTask() {
      try {
        const record = await pb.collection('tasks').getOne<Task>(taskId);
        setTask(record);

        // Fetch creator info if available
        if (record.created_by) {
          try {
            const creatorRecord = await pb.collection('volunteers').getOne<Volunteer>(record.created_by);
            setCreator(creatorRecord);
          } catch (err) {
            console.warn('Could not fetch creator:', err);
          }
        }

        // If task is completed, fetch completion records
        if (record.status === 'completed') {
          try {
            const completions = await pb.collection('completions').getList(1, 50, {
              filter: `task = "${taskId}"`,
              expand: 'volunteer',
            });

            const completedByData = completions.items.map((completion: any) => {
              const volunteer = completion.expand?.volunteer;
              return {
                name: volunteer?.username || volunteer?.email || 'Unknown',
                minutes: completion.actual_minutes || 0,
              };
            });

            setCompletedBy(completedByData);
          } catch (err) {
            console.warn('Could not fetch completion records:', err);
          }
        }

        setLoading(false);
      } catch (err: any) {
        console.error('Error fetching task:', err);
        setError('Task not found');
        setLoading(false);
      }
    }

    if (taskId) {
      fetchTask();
    }
  }, [taskId]);

  const getZoneColor = (zone: string) => {
    switch (zone) {
      case 'Woodshop': return 'bg-amber-50 text-amber-700 border-amber-300';
      case '3D Printing': return 'bg-brand-50 text-brand-900 border-brand-500';
      case 'Electronics': return 'bg-yellow-50 text-yellow-700 border-yellow-300';
      case 'Laser Cutting': return 'bg-red-50 text-red-700 border-red-300';
      case 'CNC': return 'bg-brand-50 text-brand-700 border-brand-400';
      case 'General': return 'bg-gray-50 text-gray-700 border-gray-300';
      case 'Admin': return 'bg-pink-50 text-pink-700 border-pink-300';
      default: return 'bg-gray-50 text-gray-700 border-gray-300';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold">🟢 Open</span>;
      case 'in_progress':
        return <span className="px-3 py-1 bg-brand-100 text-brand-900 rounded-full text-sm font-semibold">🔵 In Progress</span>;
      case 'completed':
        return <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-semibold">✅ Completed</span>;
      default:
        return <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm font-semibold">{status}</span>;
    }
  };

  const handleClaimTask = () => {
    if (currentUser) {
      router.push(`/volunteer/track?taskId=${taskId}&volunteerId=${currentUser.id}`);
    } else {
      router.push(`/auth/discord?callbackUrl=/task/${taskId}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="text-white text-2xl">Loading task...</div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center">
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 max-w-md text-center">
          <div className="text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold text-white mb-2">Task Not Found</h1>
          <p className="text-white/80 mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-white text-brand-900 rounded-xl font-semibold hover:bg-white/90 transition-colors"
          >
            Back to Tasks
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900">
      {/* Top Navigation Bar */}
      <div className="bg-white/10 backdrop-blur-md border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-white hover:text-white/80 transition-colors font-medium"
          >
            ← Back to Tasks
          </button>
          
          {currentUser ? (
            <button
              onClick={() => router.push(`/volunteer?id=${currentUser.id}`)}
              className="px-4 py-2 bg-white text-brand-900 rounded-lg hover:bg-white/90 transition-colors font-semibold"
            >
              👤 {currentUser.name}
            </button>
          ) : (
            <button
              onClick={() => router.push('/auth/discord')}
              className="px-4 py-2 bg-white text-brand-900 rounded-lg hover:bg-white/90 transition-colors font-semibold"
            >
              Login
            </button>
          )}
        </div>
      </div>

      {/* Task Details */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl">
          {/* Task Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-lg font-mono text-white/90 font-bold">#{task.task_number}</span>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold border ${getZoneColor(task.zone)}`}>
                  {task.zone}
                </span>
                {getStatusBadge(task.status)}
              </div>
              
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
                {task.title}
              </h1>
              
              {creator && task.created && (
                <div className="text-white/70 text-sm space-y-1">
                  <p>
                    👤 Created by <span className="font-semibold text-white/90">{creator.username || creator.email}</span>
                  </p>
                  <p>
                    📅 {new Date(task.created).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Task Image */}
          {task.image && (
            <div className="mb-6 rounded-xl overflow-hidden">
              <img
                src={pb.files.getURL(task, task.image)}
                alt={task.title}
                className="w-full h-auto max-h-96 object-cover"
              />
            </div>
          )}

          {/* Task Details */}
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white mb-3">📝 Description</h2>
              <p className="text-white/90 text-lg whitespace-pre-wrap">
                {task.description}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-xl p-4">
                <div className="text-white/70 text-sm mb-1">Estimated Time</div>
                <div className="text-white text-2xl font-bold">
                  ⏱️ {task.estimated_minutes} min
                </div>
                <div className="text-white/60 text-sm">
                  ≈ {Math.round(task.estimated_minutes / 60 * 10) / 10} hours
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-4">
                <div className="text-white/70 text-sm mb-1">Zone</div>
                <div className="text-white text-2xl font-bold">
                  🏷️ {task.zone}
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {task.status === 'open' && (
            <div className="mt-8 pt-6 border-t border-white/20">
              <button
                onClick={handleClaimTask}
                className="w-full sm:w-auto px-8 py-4 bg-white text-brand-900 rounded-xl font-bold text-lg hover:bg-white/90 transition-all transform hover:scale-105 shadow-lg"
              >
                {currentUser ? '🎯 Claim & Start This Task' : '🔐 Login to Claim Task'}
              </button>
              <p className="text-white/60 text-sm mt-3">
                {currentUser 
                  ? 'Start tracking your time and earn credit for completing this task'
                  : 'Login with Discord to claim tasks and track your contributions'
                }
              </p>
            </div>
          )}

          {task.status === 'in_progress' && (
            <div className="mt-8 pt-6 border-t border-white/20">
              <div className="bg-brand-600/20 border border-brand-500/30 rounded-xl p-4">
                <p className="text-white text-center">
                  🔵 This task is currently being worked on
                </p>
              </div>
            </div>
          )}

          {task.status === 'completed' && (
            <div className="mt-8 pt-6 border-t border-white/20">
              <div className="bg-green-500/20 border border-green-400/30 rounded-xl p-6">
                <p className="text-white text-center text-xl font-bold mb-4">
                  ✅ This task has been completed
                </p>
                {completedBy.length > 0 && (
                  <div className="mt-4">
                    <h3 className="text-white/90 font-semibold mb-3">👥 Completed by:</h3>
                    <div className="space-y-2">
                      {completedBy.map((person, index) => (
                        <div 
                          key={index}
                          className="bg-white/10 rounded-lg p-3 flex items-center justify-between"
                        >
                          <span className="text-white font-medium">{person.name}</span>
                          <span className="text-white/70 text-sm">
                            {person.minutes} min ({Math.round(person.minutes / 60 * 10) / 10}h)
                          </span>
                        </div>
                      ))}
                    </div>
                    {completedBy.length > 1 && (
                      <div className="mt-3 pt-3 border-t border-white/20">
                        <div className="flex items-center justify-between">
                          <span className="text-white/90 font-semibold">Total Time:</span>
                          <span className="text-white font-bold text-lg">
                            {completedBy.reduce((sum, p) => sum + p.minutes, 0)} min
                            ({Math.round(completedBy.reduce((sum, p) => sum + p.minutes, 0) / 60 * 10) / 10}h)
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

