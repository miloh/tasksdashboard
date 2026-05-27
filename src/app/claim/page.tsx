'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import pb from '@/lib/pocketbase';
import type { Task, Volunteer } from '@/lib/pocketbase';
import { getVolunteerName } from '@/lib/utils';
import { 
  ClipboardList, 
  Users, 
  Clock, 
  CheckCircle2,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';

export default function ClaimPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [step, setStep] = useState<'task' | 'volunteers' | 'time' | 'complete'>('task');
  const [taskNumber, setTaskNumber] = useState('');
  const [task, setTask] = useState<Task | null>(null);
  const [allVolunteers, setAllVolunteers] = useState<Volunteer[]>([]);
  const [selectedVolunteers, setSelectedVolunteers] = useState<string[]>([]);
  const [minutesWorked, setMinutesWorked] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked] = useState(true); // Default to checked/true to avoid blocking

  // Fetch volunteers on mount
  useEffect(() => {
    async function fetchVolunteers() {
      try {
        const records = await pb.collection('volunteers').getList<Volunteer>(1, 200, {
          sort: 'email'
        });
        // Filter out empty names for cleaner dropdown, or handle them in getVolunteerName
        setAllVolunteers(records.items);
      } catch (err) {
        console.error('Error fetching volunteers:', err);
      }
    }
    fetchVolunteers();
  }, []);

  // Check authentication on mount
  useEffect(() => {
    async function initializeAuth() {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await response.json();
        
        if (data.isAuthenticated) {
          setIsAuthenticated(true);
          console.log('✅ User authenticated');
        }
      } catch (err) {
        console.error('Error initializing auth:', err);
      }
    }
    
    initializeAuth();
  }, []);

  // Show loading while checking auth - REMOVED blocking check
  // If not authenticated after check, show redirecting message - REMOVED blocking redirect

  const handleFindTask = async () => {
    // RELAXED: If auth is unchecked, we assume it's fine or will be handled later.
    // Only block if we explicitly know they are NOT authenticated AND we care.
    // But if user "removed all authentication", we should probably allow proceed.
    // However, we need a volunteer ID to complete the task.
    // If we don't have one, we'll need to ask for it or redirect then.
    
    // For now, let's just check if we have a session at all.
    // If not, we redirect.
    if (!isAuthenticated && authChecked) {
        // Try one last check
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        if (!data.session) {
             router.push('/auth/discord?callbackUrl=' + encodeURIComponent('/claim'));
             return;
        }
    }

    if (!taskNumber.trim()) {
      setError('Please enter a task number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const foundTask = await pb.collection('tasks').getFirstListItem<Task>(
        `task_number = ${taskNumber}`
      );
      
      if (foundTask.status === 'completed') {
        setError('This task is already completed');
        setLoading(false);
        return;
      }

      setTask(foundTask);
      setStep('volunteers');
    } catch (err: any) {
      console.error('Error finding task:', err);
      setError(`Task #${taskNumber} not found`);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVolunteers = () => {
    if (selectedVolunteers.length === 0) {
      setError('Please select at least one volunteer');
      return;
    }
    setError('');
    setStep('time');
  };

  const handleComplete = async () => {
    if (!task || selectedVolunteers.length === 0) return;

    const totalMinutes = parseInt(minutesWorked);
    if (!totalMinutes || totalMinutes <= 0) {
      setError('Please enter time worked');
      return;
    }

    setLoading(true);
    setError('');

    try {
      console.log('Starting task completion...');
      
      // Each volunteer gets the full amount of time entered (not divided)
      const minutesPerVolunteer = totalMinutes;

      // Complete task via API route
      const response = await fetch('/api/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId: task.id,
          volunteerIds: selectedVolunteers,
          minutesPerVolunteer,
          note: notes || 'Task completed',
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to complete task');
      }

      console.log('✅ Task completion successful!');

      // Send Discord notifications (non-blocking - don't let failures prevent success)
      Promise.all([
        (async () => {
          try {
            const volunteerNames = selectedVolunteers.map(volId => {
              const vol = allVolunteers.find(v => v.id === volId);
              return vol?.username || vol?.email || 'Unknown';
            });

            // Send to channel
            const channelResponse = await fetch('/api/discord/notify-completion', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                taskId: task.id,
                taskData: {
                  task_number: task.task_number,
                  title: task.title,
                  description: task.description,
                  zone: task.zone,
                },
                volunteerNames: volunteerNames,
                actualMinutes: totalMinutes, // Time per volunteer
                totalMinutes: totalMinutes * selectedVolunteers.length, // Total aggregate time
              }),
            });
            
            if (!channelResponse.ok) {
              console.warn('⚠️ Discord channel notification failed:', await channelResponse.text());
            } else {
              console.log('✅ Discord channel notification sent');
            }
          } catch (err) {
            console.warn('⚠️ Discord channel notification error:', err);
          }
        })(),
        (async () => {
          try {
            // Send DMs to volunteers
            const dmResponse = await fetch('/api/discord/notify-completion-dm', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                taskId: task.id,
                taskData: {
                  task_number: task.task_number,
                  title: task.title,
                  description: task.description,
                  zone: task.zone,
                },
                volunteerIds: selectedVolunteers,
                actualMinutes: totalMinutes,
              }),
            });
            
            if (!dmResponse.ok) {
              console.warn('⚠️ Discord DM notification failed:', await dmResponse.text());
            } else {
              console.log('✅ Discord completion DMs sent');
            }
          } catch (err) {
            console.warn('⚠️ Discord DM notification error:', err);
          }
        })(),
      ]).catch(err => console.warn('⚠️ Discord notifications failed:', err));

      setSuccess(true);
      setStep('complete');
      setLoading(false);
    } catch (err: any) {
      console.error('Error completing task:', err);
      setError('Failed to complete task: ' + (err.message || 'Unknown error'));
      setLoading(false);
    }
  };

  const toggleVolunteer = (volId: string) => {
    setSelectedVolunteers(prev => {
      if (prev.includes(volId)) {
        return prev.filter(id => id !== volId);
      } else {
        return [...prev, volId];
      }
    });
  };

  const resetForm = () => {
    setStep('task');
    setTaskNumber('');
    setTask(null);
    setSelectedVolunteers([]);
    setMinutesWorked('');
    setNotes('');
    setError('');
    setSuccess(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl">
        
        {/* Success Screen */}
        {step === 'complete' && success && (
          <div className="text-center space-y-6">
            <CheckCircle2 className="w-24 h-24 mx-auto text-green-400" />
            <h1 className="text-4xl font-bold text-white">Task Completed!</h1>
            <p className="text-white/80 text-lg">
              Task #{task?.task_number} has been marked complete
            </p>
            <div className="bg-white/10 rounded-xl p-6">
              <p className="text-white mb-2">Credit given to:</p>
              {selectedVolunteers.map(volId => {
                const vol = allVolunteers.find(v => v.id === volId);
                return vol ? (
                  <div key={volId} className="text-white/90 font-semibold">
                    ✓ {getVolunteerName(vol)} - {parseInt(minutesWorked)} minutes
                  </div>
                ) : null;
              })}
            </div>
            <button
              onClick={resetForm}
              className="px-8 py-4 bg-white text-brand-900 rounded-xl font-bold text-lg hover:bg-white/90 transition-colors"
            >
              Claim Another Task
            </button>
          </div>
        )}

        {/* Step 1: Find Task */}
        {step === 'task' && !success && (
          <div className="text-center space-y-6">
            <div className="text-6xl">🎯</div>
            <h1 className="text-3xl font-bold text-white">Claim a Task</h1>
            <p className="text-white/80">Enter the task number from the display board</p>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-white p-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={taskNumber}
                onChange={(e) => setTaskNumber(e.target.value.replace(/\D/g, ''))}
                placeholder="Enter task #"
                className="w-full text-center text-4xl font-bold py-6 px-6 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                autoFocus
              />

              <button
                onClick={handleFindTask}
                disabled={!taskNumber.trim() || loading}
                className="w-full bg-white text-brand-900 font-bold py-4 px-6 rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-xl"
              >
                {loading ? 'Finding Task...' : 'Continue →'}
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Select Volunteers */}
        {step === 'volunteers' && task && !success && (
          <div className="space-y-6">
            <div className="text-center">
              <Users className="w-16 h-16 mx-auto mb-3 text-white" />
              <h1 className="text-2xl font-bold text-white mb-2">Who worked on this?</h1>
              <p className="text-white/60 text-sm">Task #{task.task_number}: {task.title}</p>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-white p-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="bg-white/10 rounded-xl p-4 mb-2">
              <div className="flex items-center justify-between">
                <span className="text-white/80 text-sm">
                  {selectedVolunteers.length} volunteer{selectedVolunteers.length !== 1 ? 's' : ''} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedVolunteers([])}
                    className="text-xs px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto bg-white/5 rounded-xl divide-y divide-white/10">
              {allVolunteers.map((vol) => {
                const isSelected = selectedVolunteers.includes(vol.id);
                
                return (
                  <button
                    key={vol.id}
                    onClick={() => toggleVolunteer(vol.id)}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-white/10 transition-colors ${
                      isSelected ? 'bg-white/10' : ''
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-green-500 border-green-500' : 'border-white/30'
                    }`}>
                      {isSelected && <span className="text-white text-xs font-bold">✓</span>}
                    </div>
                    
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-600 to-secondary-600 overflow-hidden flex-shrink-0">
                      {vol.profile_photo ? (
                        <img
                          src={pb.files.getURL(vol, vol.profile_photo)}
                          alt={getVolunteerName(vol)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white">
                          👤
                        </div>
                      )}
                    </div>

                    <div className="flex-1 text-left">
                      <p className="font-semibold text-white">{getVolunteerName(vol)}</p>
                      <p className="text-xs text-white/60">{Math.round((vol.total_minutes || 0) / 60)}h contributed</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('task')}
                className="flex-1 px-6 py-3 bg-white/20 text-white rounded-xl font-semibold hover:bg-white/30 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleSelectVolunteers}
                disabled={selectedVolunteers.length === 0}
                className="flex-1 px-6 py-3 bg-white text-brand-900 rounded-xl font-bold hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Enter Time */}
        {step === 'time' && task && !success && (
          <div className="space-y-6">
            <div className="text-center">
              <Clock className="w-16 h-16 mx-auto mb-3 text-white" />
              <h1 className="text-2xl font-bold text-white mb-2">How long did it take?</h1>
              <p className="text-white/60 text-sm">Task #{task.task_number}: {task.title}</p>
              <p className="text-white/80 text-sm mt-1">
                Estimated: {task.estimated_minutes} minutes
              </p>
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-white p-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="bg-white/10 rounded-xl p-4 text-center">
              <p className="text-white/80 text-sm mb-2">
                {selectedVolunteers.length} volunteer{selectedVolunteers.length !== 1 ? 's' : ''} selected
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {selectedVolunteers.map(volId => {
                  const vol = allVolunteers.find(v => v.id === volId);
                  return vol ? (
                    <span key={volId} className="text-xs px-3 py-1 bg-white/20 text-white rounded-full">
                      {getVolunteerName(vol)}
                    </span>
                  ) : null;
                })}
              </div>
            </div>

            <div>
              <label className="block text-white font-semibold mb-3 text-center">
                Minutes per Volunteer
              </label>
              <input
                type="number"
                value={minutesWorked}
                onChange={(e) => setMinutesWorked(e.target.value)}
                placeholder="60"
                min="1"
                className="w-full text-center text-5xl font-bold py-6 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                autoFocus
              />
              {minutesWorked && selectedVolunteers.length > 1 && (
                <p className="text-center text-white/60 text-sm mt-2">
                  Each of {selectedVolunteers.length} volunteers will receive {minutesWorked} minutes (total: {parseInt(minutesWorked) * selectedVolunteers.length} min)
                </p>
              )}
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                Notes (optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What was accomplished?"
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep('volunteers')}
                className="flex-1 px-6 py-3 bg-white/20 text-white rounded-xl font-semibold hover:bg-white/30 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleComplete}
                disabled={loading || !minutesWorked || parseInt(minutesWorked) <= 0}
                className="flex-1 px-6 py-3 bg-green-500 text-white rounded-xl font-bold hover:bg-green-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Completing...' : '✓ Complete Task'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
