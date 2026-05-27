'use client';
import { siteConfig } from '@/lib/site-config';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Goal } from '@/lib/pocketbase';

function GoalsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const volunteerId = searchParams.get('id');
  const [goals, setGoals] = useState<Goal[]>([]);
  const [completedGoals, setCompletedGoals] = useState<Set<string>>(new Set());
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check authentication and authenticate PocketBase
  useEffect(() => {
    async function checkAuth() {
      try {
        const response = await fetch('/api/auth/session', { cache: 'no-store' });
        const data = await response.json();
        
        // Don't force authentication - allow viewing without login
        console.log('✅ Goals page ready for viewing');
        
        // Always set authenticated to true to allow viewing
        setIsAuthenticated(true);
      } catch (err) {
        console.error('Error checking auth:', err);
        // Still allow viewing even if auth check fails
        setIsAuthenticated(true);
      }
    }
    
    checkAuth();
  }, [router]);

  // Fetch goals from PocketBase (main board)
  useEffect(() => {
    async function fetchGoals() {
      try {
        const response = await fetch('/api/goals?board=main');
        const data = await response.json();
        if (data.goals) {
          setGoals(data.goals);
        }
      } catch (err) {
        console.error('Error fetching goals:', err);
      } finally {
        setLoading(false);
      }
    }

    if (isAuthenticated) {
      fetchGoals();
    }
  }, [isAuthenticated]);

  // Load completed goals from PocketBase
  useEffect(() => {
    if (!volunteerId) {
      router.push('/volunteer');
      return;
    }

    async function loadCompletedGoals() {
      try {
        const response = await fetch(`/api/goal-progress?volunteerId=${volunteerId}`);
        const data = await response.json();
        
        if (data.progressList) {
          const completed = new Set<string>(
            data.progressList
              .filter((p: any) => p.is_completed)
              .map((p: any) => p.goal as string)
          );
          setCompletedGoals(completed);
        }
      } catch (error) {
        console.error('Error loading completed goals:', error);
        // Fallback to localStorage
        const completed = localStorage.getItem(`goals_completed_${volunteerId}`);
        if (completed) {
          setCompletedGoals(new Set(JSON.parse(completed)));
        }
      }
    }

    loadCompletedGoals();
  }, [volunteerId, router]);

  if (!volunteerId || !isAuthenticated) {
    return null;
  }

  const categories = ['All', '3D Printing', 'Laser', 'Electronics', 'Woodshop', 'CNC', 'Vinyl', 'Custom'];
  
  const filteredGoals = selectedCategory === 'All' 
    ? goals 
    : goals.filter(g => g.category === selectedCategory);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Beginner': return 'bg-green-100 text-green-800 border-green-300';
      case 'Intermediate': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'Advanced': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      '3D Printing': 'from-blue-500 to-cyan-500',
      'Laser': 'from-red-500 to-orange-500',
      'Electronics': 'from-yellow-500 to-amber-500',
      'Woodshop': 'from-amber-700 to-yellow-700',
      'CNC': 'from-green-600 to-emerald-600',
      'Vinyl': 'from-pink-500 to-purple-500',
    };
    return colors[category] || 'from-purple-500 to-blue-500';
  };

  const totalGoals = goals.length;
  const completedCount = completedGoals.size;
  const progressPercentage = totalGoals > 0 ? (completedCount / totalGoals) * 100 : 0;

  const handleDeleteGoal = async (goalId: string) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    
    try {
      const response = await fetch(`/api/goals/${goalId}`, {
        method: 'DELETE',
      });
      
      if (response.ok) {
        setGoals(goals.filter(g => g.id !== goalId));
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to delete goal');
      }
    } catch (err) {
      console.error('Error deleting goal:', err);
      alert('Failed to delete goal');
    }
  };

  const handleCreateGoal = async (goalData: Partial<Goal>) => {
    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...goalData, board: 'main' }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setGoals([...goals, data.goal]);
        setShowCreateForm(false);
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to create goal');
      }
    } catch (err) {
      console.error('Error creating goal:', err);
      alert('Failed to create goal');
    }
  };

  const handleUpdateGoal = async (goalId: string, goalData: Partial<Goal>) => {
    try {
      // Ensure board field is preserved (don't allow changing board)
      const existingGoal = goals.find(g => g.id === goalId);
      const updateData = {
        ...goalData,
        board: existingGoal?.board || 'main', // Preserve existing board
      };
      
      const response = await fetch(`/api/goals/${goalId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      
      if (response.ok) {
        const data = await response.json();
        setGoals(goals.map(g => g.id === goalId ? data.goal : g));
        setEditingGoal(null);
      } else {
        const data = await response.json();
        alert(data.message || 'Failed to update goal');
      }
    } catch (err) {
      console.error('Error updating goal:', err);
      alert('Failed to update goal');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <button
            onClick={() => router.push(`/volunteer/tasks?id=${volunteerId}`)}
            className="mb-4 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            ← Back to Dashboard
          </button>

          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold mb-2">🎯 Learning Goals</h1>
              <p className="text-purple-100 text-lg">
                Master the equipment and skills at {siteConfig.name}
              </p>
            </div>
            <div className="text-right">
              <div className="text-5xl font-bold">{completedCount}/{totalGoals}</div>
              <div className="text-sm text-purple-200">Goals Completed</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6">
            <div className="flex justify-between text-sm mb-2">
              <span>Overall Progress</span>
              <span>{Math.round(progressPercentage)}%</span>
            </div>
            <div className="w-full bg-white/20 rounded-full h-3 overflow-hidden">
              <div
                className="h-full bg-white transition-all duration-500"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Category Filter and Create Button */}
        <div className="mb-8 flex items-center justify-between flex-wrap gap-4">
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedCategory === category
                    ? 'bg-indigo-600 text-white shadow-lg'
                    : 'bg-white text-gray-700 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center gap-2"
          >
            <span>➕</span>
            <span>Create Goal</span>
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="text-xl text-gray-600">Loading goals...</div>
          </div>
        ) : (
          <>
            {/* Goals Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredGoals.map((goal) => {
                const isCompleted = completedGoals.has(goal.id);
                const canEdit = !goal.is_sbu && goal.created_by === volunteerId;

                return (
                  <div
                    key={goal.id}
                    className={`bg-white rounded-xl shadow-md overflow-hidden transition-all hover:shadow-xl relative ${
                      isCompleted ? 'ring-2 ring-green-500' : ''
                    } ${goal.is_sbu ? 'ring-2 ring-blue-500' : ''}`}
                  >
                    <div className={`h-2 bg-gradient-to-r ${getCategoryColor(goal.category)}`} />
                    
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-3">
                        <div className="text-4xl">{goal.icon}</div>
                        <div className="flex gap-2">
                          {goal.is_sbu && (
                            <div className="bg-blue-500 text-white px-2 py-1 rounded text-xs font-semibold">
                              SBU
                            </div>
                          )}
                          {isCompleted && (
                            <div className="bg-green-500 text-white px-3 py-1 rounded-full text-sm font-semibold">
                              ✓ Completed
                            </div>
                          )}
                        </div>
                      </div>

                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {goal.title}
                      </h3>

                      <p className="text-gray-600 text-sm mb-4 line-clamp-2">
                        {goal.description}
                      </p>

                      <div className="flex flex-wrap gap-2 mb-4">
                        <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-800 border border-purple-300">
                          {goal.category}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full border ${getDifficultyColor(goal.difficulty)}`}>
                          {goal.difficulty}
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 border border-gray-300">
                          ⏱️ {goal.estimated_minutes} min
                        </span>
                      </div>

                      {goal.is_sbu && (
                        <div className="text-sm text-gray-600 mb-4 space-y-1">
                          {goal.zone_leader && (
                            <div className="font-semibold text-indigo-700">👤 Zone Leader: {goal.zone_leader}</div>
                          )}
                          {goal.sbu_schedule && (
                            <div className="text-xs text-gray-500">📅 SBU: {goal.sbu_schedule}</div>
                          )}
                        </div>
                      )}

                      <div className="text-sm text-gray-600 mb-4">
                        📚 {goal.steps?.length || 0} steps
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => router.push(`/volunteer/goals/${goal.id}?id=${volunteerId}`)}
                          className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all ${
                            isCompleted
                              ? 'bg-green-600 hover:bg-green-700 text-white'
                              : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          }`}
                        >
                          {isCompleted ? 'Review Goal' : 'Start Goal →'}
                        </button>
                        {canEdit && (
                          <>
                            <button
                              onClick={() => setEditingGoal(goal)}
                              className="px-3 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
                              title="Edit Goal"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDeleteGoal(goal.id)}
                              className="px-3 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors"
                              title="Delete Goal"
                            >
                              🗑️
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {filteredGoals.length === 0 && (
              <div className="text-center py-12">
                <p className="text-gray-500 text-lg">No goals found in this category.</p>
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
                >
                  Create Your First Goal
                </button>
              </div>
            )}
          </>
        )}

        {/* Create Goal Form Modal */}
        {showCreateForm && (
          <GoalFormModal
            onClose={() => setShowCreateForm(false)}
            onSave={handleCreateGoal}
          />
        )}

        {/* Edit Goal Form Modal */}
        {editingGoal && (
          <GoalFormModal
            goal={editingGoal}
            onClose={() => setEditingGoal(null)}
            onSave={(data) => handleUpdateGoal(editingGoal.id, data)}
          />
        )}
      </div>
    </div>
  );
}

// Goal Form Modal Component
function GoalFormModal({ 
  goal, 
  onClose, 
  onSave 
}: { 
  goal?: Goal; 
  onClose: () => void; 
  onSave: (data: Partial<Goal>) => void;
}) {
  const [formData, setFormData] = useState({
    title: goal?.title || '',
    description: goal?.description || '',
    category: goal?.category || 'Custom',
    difficulty: goal?.difficulty || 'Beginner',
    estimated_minutes: goal?.estimated_minutes || 60,
    icon: goal?.icon || '🎯',
    steps: goal?.steps || [],
  });

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStepsEditor, setShowStepsEditor] = useState(false);

  // Common emoji options for goals
  const emojiOptions = [
    '🎯', '🎨', '🔧', '💡', '🚀', '⚡', '🌟', '🔥',
    '📚', '🎓', '🏆', '⚙️', '🛠️', '🔬', '🎪', '🎭',
    '🎬', '🎮', '🎸', '🎺', '🎹', '🎤', '📻', '📡',
    '💻', '⌨️', '🖨️', '🖥️', '📱', '🔌', '💾', '📊'
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const addStep = () => {
    const newStep = {
      number: formData.steps.length + 1,
      title: '',
      description: '',
      type: 'text' as const,
      content: '',
    };
    setFormData({ ...formData, steps: [...formData.steps, newStep] });
    setShowStepsEditor(true);
  };

  const updateStep = (index: number, field: string, value: any) => {
    const updatedSteps = [...formData.steps];
    updatedSteps[index] = { ...updatedSteps[index], [field]: value };
    setFormData({ ...formData, steps: updatedSteps });
  };

  const deleteStep = (index: number) => {
    const updatedSteps = formData.steps.filter((_, i) => i !== index);
    // Renumber steps
    const renumberedSteps = updatedSteps.map((step, i) => ({ ...step, number: i + 1 }));
    setFormData({ ...formData, steps: renumberedSteps });
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === formData.steps.length - 1) return;
    
    const updatedSteps = [...formData.steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [updatedSteps[index], updatedSteps[targetIndex]] = [updatedSteps[targetIndex], updatedSteps[index]];
    
    // Renumber steps
    const renumberedSteps = updatedSteps.map((step, i) => ({ ...step, number: i + 1 }));
    setFormData({ ...formData, steps: renumberedSteps });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">
              {goal ? 'Edit Goal' : 'Create New Goal'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Icon
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="🎯"
                  maxLength={2}
                />
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-xl"
                  title="Choose emoji"
                >
                  😀
                </button>
              </div>
              {showEmojiPicker && (
                <div className="mt-2 p-3 border border-gray-300 rounded-lg bg-white grid grid-cols-8 gap-2 max-h-48 overflow-y-auto">
                  {emojiOptions.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, icon: emoji });
                        setShowEmojiPicker(false);
                      }}
                      className="text-2xl hover:bg-gray-100 rounded p-2 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Goal title"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description *
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Goal description"
                rows={3}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Category
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Custom">Custom</option>
                  <option value="3D Printing">3D Printing</option>
                  <option value="Laser">Laser</option>
                  <option value="Electronics">Electronics</option>
                  <option value="Woodshop">Woodshop</option>
                  <option value="CNC">CNC</option>
                  <option value="Vinyl">Vinyl</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Difficulty
                </label>
                <select
                  value={formData.difficulty}
                  onChange={(e) => setFormData({ ...formData, difficulty: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estimated Minutes
              </label>
              <input
                type="number"
                value={formData.estimated_minutes}
                onChange={(e) => setFormData({ ...formData, estimated_minutes: parseInt(e.target.value) || 60 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                min="1"
              />
            </div>

            {/* Steps Section */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  Learning Steps ({formData.steps.length})
                </label>
                <button
                  type="button"
                  onClick={addStep}
                  className="px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-semibold"
                >
                  ➕ Add Step
                </button>
              </div>

              {formData.steps.length === 0 && (
                <p className="text-sm text-gray-500 italic mb-3">
                  No steps added yet. Add steps to create a structured learning path.
                </p>
              )}

              {formData.steps.length > 0 && (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {formData.steps.map((step, index) => (
                    <div key={index} className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="bg-indigo-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                            {step.number}
                          </span>
                          <input
                            type="text"
                            value={step.title}
                            onChange={(e) => updateStep(index, 'title', e.target.value)}
                            placeholder="Step title"
                            className="font-semibold px-2 py-1 border border-gray-300 rounded text-black flex-1 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => moveStep(index, 'up')}
                            disabled={index === 0}
                            className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                            title="Move up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveStep(index, 'down')}
                            disabled={index === formData.steps.length - 1}
                            className="px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded disabled:opacity-30 disabled:cursor-not-allowed text-xs"
                            title="Move down"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteStep(index)}
                            className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-xs"
                            title="Delete step"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <textarea
                        value={step.description}
                        onChange={(e) => updateStep(index, 'description', e.target.value)}
                        placeholder="Step description"
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm text-black mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        rows={2}
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={step.type}
                          onChange={(e) => updateStep(index, 'type', e.target.value)}
                          className="px-2 py-1 border border-gray-300 rounded text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="text">📄 Text</option>
                          <option value="video">🎥 Video</option>
                          <option value="task">✅ Task</option>
                          <option value="quiz">❓ Quiz</option>
                        </select>

                        <input
                          type="text"
                          value={step.content}
                          onChange={(e) => updateStep(index, 'content', e.target.value)}
                          placeholder={step.type === 'video' ? 'Video URL' : 'Content/Instructions'}
                          className="px-2 py-1 border border-gray-300 rounded text-sm text-black focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold"
              >
                {goal ? 'Update Goal' : 'Create Goal'}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function GoalsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    }>
      <GoalsPageContent />
    </Suspense>
  );
}

