'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import pb from '@/lib/pocketbase';
import type { Goal } from '@/lib/pocketbase';

interface CourseDetailProps {
  params: Promise<{ courseId: string }>;
}

function CourseDetailContent({ params }: CourseDetailProps) {
  const { courseId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const volunteerId = searchParams.get('id');
  
  const [goal, setGoal] = useState<Goal | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isCompleted, setIsCompleted] = useState(false);
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(false);

  // Fetch goal from PocketBase
  useEffect(() => {
    async function fetchGoal() {
      if (!courseId) return;
      
      try {
        const record = await pb.collection('goals').getOne<Goal>(courseId);
        setGoal(record);
        setLoading(false);
      } catch (err) {
        console.error('Error fetching goal:', err);
        setLoading(false);
      }
    }
    
    fetchGoal();
  }, [courseId]);

  // Simple check - just verify we have a volunteerId and goal
  useEffect(() => {
    if (!volunteerId || !goal) {
      if (!volunteerId) {
        router.push('/volunteer');
      }
      return;
    }
    
    // That's it - just show the goal
    setIsAuthorized(true);
  }, [volunteerId, goal, router]);

  useEffect(() => {
    if (!volunteerId || !goal || !isAuthorized) {
      return;
    }

    // Load progress from PocketBase
    async function loadProgress() {
      try {
        const response = await fetch(`/api/goal-progress?volunteerId=${volunteerId}&goalId=${courseId}`);
        const data = await response.json();
        
        if (data.progress) {
          setCompletedSteps(new Set(data.progress.completed_steps || []));
          setIsCompleted(data.progress.is_completed || false);
        }
      } catch (error) {
        console.error('Error loading goal progress:', error);
        // Fallback to localStorage for backwards compatibility
        const completed = localStorage.getItem(`goals_completed_${volunteerId}`);
        if (completed) {
          const completedGoals = new Set(JSON.parse(completed));
          setIsCompleted(completedGoals.has(courseId));
        }
        const progress = localStorage.getItem(`goal_progress_${volunteerId}_${courseId}`);
        if (progress) {
          const { steps } = JSON.parse(progress);
          setCompletedSteps(new Set(steps));
        }
      }
    }

    loadProgress();
  }, [volunteerId, courseId, goal, isAuthorized]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading goal...</div>
      </div>
    );
  }

  if (!volunteerId || !goal) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">
          {!goal ? 'Goal not found' : 'No volunteer ID'}
        </div>
      </div>
    );
  }

  const steps = goal.steps || [];
  const allStepsCompleted = completedSteps.size === steps.length;

  const handleStepToggle = async (stepNumber: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(stepNumber)) {
      newCompleted.delete(stepNumber);
    } else {
      newCompleted.add(stepNumber);
    }
    setCompletedSteps(newCompleted);

    // Save progress to PocketBase
    try {
      await fetch('/api/goal-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volunteerId,
          goalId: courseId,
          completedSteps: Array.from(newCompleted),
          isCompleted: false
        })
      });
    } catch (error) {
      console.error('Error saving progress:', error);
      // Fallback to localStorage
      localStorage.setItem(
        `goal_progress_${volunteerId}_${courseId}`,
        JSON.stringify({ steps: Array.from(newCompleted) })
      );
    }
  };

  const handleCompleteCourse = async () => {
    // Mark goal as completed in PocketBase
    try {
      await fetch('/api/goal-progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volunteerId,
          goalId: courseId,
          completedSteps: Array.from(completedSteps),
          isCompleted: true,
          completedAt: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Error marking goal complete:', error);
      // Fallback to localStorage
      const completed = localStorage.getItem(`goals_completed_${volunteerId}`);
      const completedGoals = completed ? new Set(JSON.parse(completed)) : new Set();
      completedGoals.add(courseId);
      localStorage.setItem(`goals_completed_${volunteerId}`, JSON.stringify(Array.from(completedGoals)));
    }
    
    setIsCompleted(true);
    setShowCompletionDialog(true);
  };

  const progressPercentage = (completedSteps.size / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <button
            onClick={() => router.push(`/volunteer/goals?id=${volunteerId}`)}
            className="mb-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-sm"
          >
            ← Back to Goals
          </button>

          <div className="flex items-start gap-4">
            <div className="text-6xl">{goal.icon || '🎯'}</div>
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">{goal.title}</h1>
              <p className="text-brand-100 mb-3">{goal.description}</p>
              
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="text-xs px-3 py-1 rounded-full bg-white/20 border border-white/30">
                  {goal.difficulty || 'Beginner'}
                </span>
                <span className="text-xs px-3 py-1 rounded-full bg-white/20 border border-white/30">
                  ⏱️ {goal.estimated_minutes || 0} min
                </span>
                <span className="text-xs px-3 py-1 rounded-full bg-white/20 border border-white/30">
                  📚 {steps.length} steps
                </span>
                {isCompleted && (
                  <span className="text-xs px-3 py-1 rounded-full bg-green-500 text-white font-semibold">
                    ✓ Completed
                  </span>
                )}
              </div>

              {/* Progress */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>Progress: {completedSteps.size} of {steps.length} steps</span>
                  <span>{Math.round(progressPercentage)}%</span>
                </div>
                <div className="w-full bg-white/20 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-white transition-all duration-300"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Goal Steps */}
        <div className="space-y-6">
          {steps.map((step, index) => {
            const stepCompleted = completedSteps.has(step.number);
            const isCurrentStep = index === currentStep;

            return (
              <div
                key={step.number}
                className={`bg-white rounded-lg shadow-md overflow-hidden transition-all ${
                  isCurrentStep ? 'ring-2 ring-brand-500' : ''
                } ${stepCompleted ? 'border-l-4 border-green-500' : ''}`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-sm font-semibold text-brand-600 bg-brand-50 px-3 py-1 rounded-full">
                          Step {step.number}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                          {step.type || 'text'}
                        </span>
                        {stepCompleted && (
                          <span className="text-green-600 font-semibold flex items-center gap-1">
                            <span className="text-xl">✓</span> Completed
                          </span>
                        )}
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 mb-3">{step.title}</h3>
                      <p className="text-gray-700 text-lg leading-relaxed">{step.description}</p>
                      
                      {step.content && (
                        <div className="mt-4 bg-gray-50 border-l-4 border-brand-500 p-4">
                          {step.type === 'video' ? (
                            <a href={step.content} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline font-semibold">
                              🎥 Watch Video →
                            </a>
                          ) : (
                            <p className="text-gray-700">{step.content}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-6 flex gap-3">
                    <button
                      onClick={() => handleStepToggle(step.number)}
                      className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                        stepCompleted
                          ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          : 'bg-brand-600 text-white hover:bg-brand-700'
                      }`}
                    >
                      {stepCompleted ? 'Mark Incomplete' : 'Mark Complete'}
                    </button>
                    {!isCurrentStep && (
                      <button
                        onClick={() => setCurrentStep(index)}
                        className="px-4 py-2 rounded-lg border-2 border-brand-600 text-brand-600 hover:bg-brand-50 font-semibold transition-all"
                      >
                        Focus This Step
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Complete Goal Button */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {isCompleted ? 'Goal Completed! 🎉' : 'Ready to Complete?'}
              </h3>
              <p className="text-gray-600">
                {isCompleted 
                  ? 'You have completed this goal. You can review the steps anytime.'
                  : allStepsCompleted
                  ? 'You\'ve completed all steps! Mark this goal as complete.'
                  : `Complete all ${steps.length} steps to finish this goal.`
                }
              </p>
            </div>
            <button
              onClick={handleCompleteCourse}
              disabled={!allStepsCompleted || isCompleted}
              className={`px-8 py-3 rounded-lg font-bold text-lg transition-all ${
                allStepsCompleted && !isCompleted
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isCompleted ? '✓ Completed' : 'Complete Goal'}
            </button>
          </div>
        </div>
      </div>

      {/* Completion Dialog */}
      {showCompletionDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-2">Congratulations!</h2>
            <p className="text-gray-600 mb-2">You completed:</p>
            <p className="text-xl font-bold text-brand-600 mb-6">{goal.title}</p>
            <p className="text-gray-600 mb-6">
              Keep going and achieve more goals!
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => router.push(`/volunteer/goals?id=${volunteerId}`)}
                className="flex-1 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-semibold transition-all"
              >
                Browse More Goals
              </button>
              <button
                onClick={() => setShowCompletionDialog(false)}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg font-semibold transition-all"
              >
                Review Steps
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CourseDetailPage({ params }: CourseDetailProps) {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading goal...</div>
      </div>
    }>
      <CourseDetailContent params={params} />
    </Suspense>
  );
}

