'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import pb from '@/lib/pocketbase';
import type { Task, Volunteer } from '@/lib/pocketbase';
import { getVolunteerName, formatTime as formatMinutes } from '@/lib/utils';
import { 
  Clock, 
  Play, 
  Pause, 
  CheckCircle2, 
  Users, 
  User,
  Loader2
} from 'lucide-react';



function TrackPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const taskId = searchParams.get('taskId');
  const volunteerId = searchParams.get('volunteerId');

  const [task, setTask] = useState<Task | null>(null);
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [allVolunteers, setAllVolunteers] = useState<Volunteer[]>([]);
  const [selectedVolunteers, setSelectedVolunteers] = useState<string[]>([]);
  const [mode, setMode] = useState<'timer' | 'manual'>('manual');
  const [isTracking, setIsTracking] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [manualMinutes, setManualMinutes] = useState<string>('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(true); // Default to true to avoid blocking
  const [error, setError] = useState<string | null>(null);

  // No authentication needed for reading task data
  useEffect(() => {
    async function resolveParams() {
      let effectiveVolunteerId = volunteerId;

      // 1. If we have URL params, attempt fetch immediately
      if (taskId) {
         console.log('Fetching with URL params:', taskId, effectiveVolunteerId);
         fetchData(taskId, effectiveVolunteerId);
         // We don't return here, we let the session check run in parallel just in case
         // but we don't block the UI for it.
      }

      // If no volunteerId in URL, try session or localStorage
      if (!effectiveVolunteerId) {
        try {
          const response = await fetch('/api/auth/session', { cache: 'no-store' });
          const data = await response.json();
          if (data.session?.volunteerId) {
            effectiveVolunteerId = data.session.volunteerId;
          }
        } catch (e) {}
      }

      if (!effectiveVolunteerId) {
        effectiveVolunteerId = localStorage.getItem('volunteerId');
      }

      // If we found an ID via session/storage but NOT via URL, fetch now
      if (taskId && effectiveVolunteerId && effectiveVolunteerId !== volunteerId) {
         console.log('Fetching with resolved ID:', taskId, effectiveVolunteerId);
         fetchData(taskId, effectiveVolunteerId);
      } else if (taskId && !effectiveVolunteerId && !volunteer) {
         // If we haven't fetched yet and still no ID, fetch task only
         fetchData(taskId);
      }
      
      if (!effectiveVolunteerId) {
        // Only mark unauthorized if we truly have no way to know who this is
        setIsAuthorized(false);
      }
    }

    resolveParams();
  }, [taskId, volunteerId]);

  async function fetchData(tid: string, vid?: string | null) {
      try {
        const promises: Promise<any>[] = [
          pb.collection('tasks').getOne<Task>(tid),
          pb.collection('volunteers').getList<Volunteer>(1, 200, { sort: 'email' })
        ];
        
        if (vid) {
            promises.push(pb.collection('volunteers').getOne<Volunteer>(vid));
        }

        const results = await Promise.all(promises);
        const taskRecord = results[0];
        const volunteersRecords = results[1];
        const volunteerRecord = vid ? results[2] : null;

        setTask(taskRecord);
        if (volunteerRecord) {
            setVolunteer(volunteerRecord);
            setSelectedVolunteers([vid!]);
        }
        setAllVolunteers(volunteersRecords.items);

        // Update task status logic...
        if (taskRecord.status === 'open' || taskRecord.status === 'in_progress') {
           // ...
        }
      } catch (err: any) {
        console.error('Error fetching data:', err);
        setError(err.message || 'Failed to load task data. Please try refreshing.');
      }
  }

  // Timer effect
  useEffect(() => {
    if (!isTracking) return;

    const interval = setInterval(() => {
      if (startTime) {
        setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isTracking, startTime]);

  const handleStartStop = () => {
    if (isTracking) {
      setIsTracking(false);
    } else {
      setStartTime(Date.now() - (elapsedSeconds * 1000));
      setIsTracking(true);
    }
  };

  const handleReset = () => {
    setIsTracking(false);
    setStartTime(null);
    setElapsedSeconds(0);
  };

  const handleComplete = async () => {
    if (!task || !taskId) return;

    if (selectedVolunteers.length === 0) {
      alert('Please select at least one volunteer to give credit to');
      return;
    }

    setSubmitting(true);

    try {
      // Get actual minutes from either timer or manual entry
      const actualMinutes = mode === 'timer'
        ? Math.ceil(elapsedSeconds / 60)
        : parseInt(manualMinutes) || 0;

      if (actualMinutes === 0) {
        alert('Please enter time spent on the task');
        setSubmitting(false);
        return;
      }

      // Each volunteer gets the full amount of time entered (not divided)
      const minutesPerVolunteer = actualMinutes;

      // Complete task via API route
      const response = await fetch('/api/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskId,
          volunteerIds: selectedVolunteers,
          minutesPerVolunteer,
          note: note || 'Completed successfully',
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to complete task');
      }

      console.log('✅ Task completed successfully');

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
                taskId: taskId,
                taskData: {
                  task_number: task.task_number,
                  title: task.title,
                  description: task.description,
                  zone: task.zone,
                },
                volunteerNames: volunteerNames,
                actualMinutes: actualMinutes, // Time per volunteer
                totalMinutes: actualMinutes * selectedVolunteers.length, // Total aggregate time
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
                taskId: taskId,
                taskData: {
                  task_number: task.task_number,
                  title: task.title,
                  description: task.description,
                  zone: task.zone,
                },
                volunteerIds: selectedVolunteers,
                actualMinutes: actualMinutes, // Time each volunteer receives
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

      // Redirect to tasks page
      router.push(`/volunteer/tasks?id=${volunteerId}`);
    } catch (err: any) {
      console.error('Error completing task:', err);
      alert('Failed to complete task: ' + (err.message || 'Unknown error'));
      setSubmitting(false);
    }
  };

  const toggleVolunteerSelection = (volId: string) => {
    setSelectedVolunteers(prev => {
      if (prev.includes(volId)) {
        // Don't allow deselecting if it's the only one selected
        if (prev.length === 1) return prev;
        return prev.filter(id => id !== volId);
      } else {
        return [...prev, volId];
      }
    });
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error Loading Task</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button 
              onClick={() => window.location.reload()}
              className="bg-brand-600 text-white px-6 py-3 rounded-lg hover:bg-brand-700 font-semibold"
            >
              Retry
            </button>
            <button 
              onClick={() => router.push('/volunteer')}
              className="bg-gray-200 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-300 font-semibold"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Only block if we don't have the essential data yet
  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">⏳</div>
          <div className="text-xl text-gray-600 font-medium">
             Loading task details...
          </div>
          {/* Debug info if it takes too long */}
          <div className="text-xs text-gray-400 mt-4">
            {taskId ? `Task: ${taskId}` : 'No Task ID'} • 
            {volunteerId ? `Vol: ${volunteerId}` : 'No Vol ID'} • 
            Auth: {isAuthorized ? 'Yes' : 'No'}
          </div>
        </div>
      </div>
    );
  }

  const estimatedSeconds = task.estimated_minutes * 60;
  const progressPercent = Math.min((elapsedSeconds / estimatedSeconds) * 100, 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 to-brand-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-mono text-gray-500">#{task.task_number}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-brand-100 text-brand-800 border border-brand-400">
                  {task.zone}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                {task.title}
              </h1>
              <p className="text-gray-600">
                {task.description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <span>👤</span>
              <span>
                {selectedVolunteers.length === 1 
                  ? getVolunteerName(allVolunteers.find(v => v.id === selectedVolunteers[0]) || volunteer)
                  : selectedVolunteers.length === 0 
                  ? 'Select Volunteer'
                  : `${selectedVolunteers.length} volunteers`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Est. {formatMinutes(task.estimated_minutes)}</span>
            </div>
          </div>
        </div>

        {/* Time Entry */}
        <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-6 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setMode('manual')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                mode === 'manual'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              ⏰ Enter Time
            </button>
            <button
              onClick={() => setMode('timer')}
              className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-colors ${
                mode === 'timer'
                  ? 'bg-brand-600 text-white shadow-md'
                  : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>Use Timer</span>
            </button>
          </div>

          {/* Manual Entry Mode */}
          {mode === 'manual' && (
            <div className="text-center">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                How many minutes did this task take?
              </label>
              <input
                type="number"
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
                placeholder="30"
                min="1"
                className="text-5xl font-bold text-gray-900 text-center border-2 border-gray-300 rounded-lg px-6 py-4 w-full max-w-xs mx-auto focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <div className="text-sm text-gray-500 mt-3">
                Estimated: {formatMinutes(task.estimated_minutes)}
              </div>
              {selectedVolunteers.length > 1 && (
                <div className="text-xs text-brand-600 mt-2">
                  Each of the {selectedVolunteers.length} selected volunteers will receive this amount of time
                </div>
              )}
            </div>
          )}

          {/* Timer Mode */}
          {mode === 'timer' && (
            <>
              <div className="text-center mb-6">
                <div className="text-6xl font-bold text-gray-900 mb-2 font-mono">
                  {formatTime(elapsedSeconds)}
                </div>
                <div className="text-sm text-gray-500">
                  Estimated: {formatTime(estimatedSeconds)}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mb-6">
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      progressPercent > 100 ? 'bg-orange-500' : 'bg-brand-600'
                    }`}
                    style={{ width: `${Math.min(progressPercent, 100)}%` }}
                  />
                </div>
                {progressPercent > 100 && (
                  <p className="text-center text-orange-600 text-sm mt-2">
                    Over estimated time
                  </p>
                )}
              </div>

              {/* Controls */}
              <div className="flex gap-4 justify-center">
                <button
                  onClick={handleStartStop}
                  className={`px-8 py-4 rounded-lg font-bold text-lg transition-colors ${
                    isTracking
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-white'
                  }`}
                >
                  {isTracking ? (
                    <>
                      <Pause className="w-5 h-5" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-5 h-5" />
                      <span>Start</span>
                    </>
                  )}
                </button>

                <button
                  onClick={handleReset}
                  disabled={elapsedSeconds === 0}
                  className="px-8 py-4 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-lg font-bold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🔄 Reset
                </button>
              </div>
            </>
          )}
        </div>

        {/* Completion Section */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">
            Complete Task
          </h2>

          {/* Volunteer Credit Selection */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-900">
                Who worked on this task? (Select all that apply)
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => volunteerId && setSelectedVolunteers([volunteerId])}
                  className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium transition-colors"
                >
                  Just Me
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedVolunteers(allVolunteers.map(v => v.id))}
                  className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium transition-colors"
                >
                  Select All
                </button>
              </div>
            </div>
            <div className="bg-brand-50 border border-brand-200 rounded-lg p-4 mb-2">
              <div className="flex items-center gap-2 text-sm text-brand-800 mb-2">
                <span>ℹ️</span>
                <span>Each selected volunteer will receive the same amount of time credit</span>
              </div>
              <div className="text-xs text-brand-600">
                {selectedVolunteers.length} selected · {mode === 'timer' ? Math.ceil(elapsedSeconds / 60) : (parseInt(manualMinutes) || 0)} min each
              </div>
            </div>
            
            <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-lg divide-y">
              {allVolunteers.map((vol) => {
                const isSelected = selectedVolunteers.includes(vol.id);
                const isCurrentUser = vol.id === volunteerId;
                
                return (
                  <button
                    key={vol.id}
                    type="button"
                    onClick={() => toggleVolunteerSelection(vol.id)}
                    className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                      isSelected ? 'bg-brand-50' : ''
                    }`}
                  >
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected 
                        ? 'bg-brand-600 border-purple-600' 
                        : 'border-gray-300'
                    }`}>
                      {isSelected && <span className="text-white text-xs">✓</span>}
                    </div>
                    
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-600 to-secondary-600 overflow-hidden flex-shrink-0">
                      {vol.profile_photo ? (
                        <img
                          src={pb.files.getURL(vol, vol.profile_photo)}
                          alt={getVolunteerName(vol)}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white text-sm">
                          👤
                        </div>
                      )}
                    </div>

                    <div className="flex-1 text-left">
                      <p className="font-medium text-gray-900">
                        {getVolunteerName(vol)}
                        {isCurrentUser && <span className="text-brand-600 text-xs ml-2">(You)</span>}
                      </p>
                      <p className="text-xs text-gray-500">{Math.round((vol.total_minutes || 0) / 60)}h contributed</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Completion Notes (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent text-gray-900"
              rows={3}
              placeholder="What did you accomplish? Any notes for the next person?"
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleComplete}
              disabled={submitting || selectedVolunteers.length === 0 || (mode === 'timer' && elapsedSeconds === 0) || (mode === 'manual' && !manualMinutes)}
              className="flex-1 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting 
                ? 'Submitting...' 
                : selectedVolunteers.length > 1
                ? `✓ Complete (${selectedVolunteers.length} volunteers)`
                : '✓ Mark Complete'
              }
            </button>

            <button
              onClick={() => router.push(`/volunteer/tasks?id=${volunteerId}`)}
              className="px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-colors"
            >
              Cancel
            </button>
          </div>

          <p className="text-xs text-gray-500 mt-4 text-center">
            {selectedVolunteers.length === 1 ? (
              <>Time to record: {mode === 'timer' ? Math.ceil(elapsedSeconds / 60) : (parseInt(manualMinutes) || 0)} minutes</>
            ) : (
              <>
                {mode === 'timer' ? Math.ceil(elapsedSeconds / 60) : (parseInt(manualMinutes) || 0)} minutes per volunteer 
                (total: {(mode === 'timer' ? Math.ceil(elapsedSeconds / 60) : (parseInt(manualMinutes) || 0)) * selectedVolunteers.length} min across {selectedVolunteers.length} volunteers)
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TrackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    }>
      <TrackPageContent />
    </Suspense>
  );
}
