'use client';

import { useState } from 'react';

export default function GoalsAdminPage() {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Custom',
    difficulty: 'Beginner',
    estimated_minutes: 60,
    icon: '🎯',
    zone_leader: '',
    sbu_schedule: '',
    is_sbu: 'false',
    board: 'main',
    steps: [] as any[],
  });

  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const emojiOptions = [
    '🎯', '🎨', '🔧', '💡', '🚀', '⚡', '🌟', '🔥',
    '📚', '🎓', '🏆', '⚙️', '🛠️', '🔬', '🎪', '🎭',
    '🎬', '🎮', '🎸', '🎺', '🎹', '🎤', '📻', '📡',
    '💻', '⌨️', '🖨️', '🖥️', '📱', '🔌', '💾', '📊'
  ];

  const addStep = () => {
    const newStep = {
      number: formData.steps.length + 1,
      title: '',
      description: '',
      type: 'text',
      content: '',
    };
    setFormData({ ...formData, steps: [...formData.steps, newStep] });
  };

  const updateStep = (index: number, field: string, value: any) => {
    const updatedSteps = [...formData.steps];
    updatedSteps[index] = { ...updatedSteps[index], [field]: value };
    setFormData({ ...formData, steps: updatedSteps });
  };

  const deleteStep = (index: number) => {
    const updatedSteps = formData.steps.filter((_, i) => i !== index);
    const renumberedSteps = updatedSteps.map((step, i) => ({ ...step, number: i + 1 }));
    setFormData({ ...formData, steps: renumberedSteps });
  };

  const moveStep = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === formData.steps.length - 1) return;
    
    const updatedSteps = [...formData.steps];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [updatedSteps[index], updatedSteps[targetIndex]] = [updatedSteps[targetIndex], updatedSteps[index]];
    
    const renumberedSteps = updatedSteps.map((step, i) => ({ ...step, number: i + 1 }));
    setFormData({ ...formData, steps: renumberedSteps });
  };

  const generateJSON = () => {
    return JSON.stringify({
      title: formData.title,
      description: formData.description,
      category: formData.category,
      difficulty: formData.difficulty,
      estimated_minutes: formData.estimated_minutes,
      icon: formData.icon,
      zone_leader: formData.zone_leader || '',
      sbu_schedule: formData.sbu_schedule || '',
      is_sbu: formData.is_sbu,
      steps: formData.steps,
      prerequisites: [],
      board: formData.board,
    }, null, 2);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateJSON());
    alert('✅ Copied to clipboard! Now paste this into PocketBase.');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch('/api/goals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          estimated_minutes: parseInt(String(formData.estimated_minutes)) || 60,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ success: true, data });
        setFormData({
          title: '',
          description: '',
          category: 'Custom',
          difficulty: 'Beginner',
          estimated_minutes: 60,
          icon: '🎯',
          zone_leader: '',
          sbu_schedule: '',
          is_sbu: 'false',
          board: 'main',
          steps: [],
        });
      } else {
        setResult({ success: false, error: data.message || 'Failed to create goal' });
      }
    } catch (error: any) {
      setResult({ success: false, error: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-900 via-secondary-900 to-secondary-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-md rounded-3xl p-8 shadow-2xl">
          <h1 className="text-4xl font-bold text-white mb-2">🎯 Goal Creator</h1>
          <p className="text-brand-200 mb-8">Create structured learning goals with multi-step paths</p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Icon */}
            <div>
              <label className="block text-white font-medium mb-2">Icon</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.icon}
                  onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                  className="flex-1 px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                  placeholder="🎯"
                  maxLength={2}
                />
                <button
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  className="px-6 py-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors text-2xl"
                >
                  😀
                </button>
              </div>
              {showEmojiPicker && (
                <div className="mt-2 p-3 bg-white/20 rounded-xl grid grid-cols-8 gap-2 max-h-48 overflow-y-auto">
                  {emojiOptions.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, icon: emoji });
                        setShowEmojiPicker(false);
                      }}
                      className="text-2xl hover:bg-white/20 rounded p-2 transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title */}
            <div>
              <label className="block text-white font-medium mb-2">Title *</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                placeholder="e.g., 3D Printing Basics"
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-white font-medium mb-2">Description *</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                placeholder="What will students learn?"
                rows={4}
                required
              />
            </div>

            {/* Category & Difficulty */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-white font-medium mb-2">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white focus:outline-none focus:border-white/60"
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
                <label className="block text-white font-medium mb-2">Difficulty</label>
                <select
                  value={formData.difficulty}
                  onChange={(e) => setFormData({ ...formData, difficulty: e.target.value })}
                  className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white focus:outline-none focus:border-white/60"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>
            </div>

            {/* Estimated Minutes */}
            <div>
              <label className="block text-white font-medium mb-2">Estimated Minutes</label>
              <input
                type="number"
                value={formData.estimated_minutes}
                onChange={(e) => setFormData({ ...formData, estimated_minutes: parseInt(e.target.value) || 60 })}
                className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white focus:outline-none focus:border-white/60"
                min="1"
              />
            </div>

            {/* SBU Settings */}
            <div className="bg-white/10 rounded-xl p-4 space-y-4">
              <h3 className="text-white font-bold text-lg">SBU Settings (Optional)</h3>
              
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is_sbu"
                  checked={formData.is_sbu === 'true'}
                  onChange={(e) => setFormData({ ...formData, is_sbu: e.target.checked ? 'true' : 'false' })}
                  className="w-5 h-5"
                />
                <label htmlFor="is_sbu" className="text-white">
                  This is an SBU (Skill Building Unit) goal
                </label>
              </div>

              {formData.is_sbu === 'true' && (
                <>
                  <div>
                    <label className="block text-white font-medium mb-2">Zone Leader</label>
                    <input
                      type="text"
                      value={formData.zone_leader}
                      onChange={(e) => setFormData({ ...formData, zone_leader: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                      placeholder="e.g., John Doe"
                    />
                  </div>

                  <div>
                    <label className="block text-white font-medium mb-2">SBU Schedule</label>
                    <input
                      type="text"
                      value={formData.sbu_schedule}
                      onChange={(e) => setFormData({ ...formData, sbu_schedule: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl bg-white/20 border-2 border-white/30 text-white placeholder-white/50 focus:outline-none focus:border-white/60"
                      placeholder="e.g., Tuesdays 2-4pm"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Steps Section */}
            <div className="bg-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold text-lg">
                  Learning Steps ({formData.steps.length})
                </h3>
                <button
                  type="button"
                  onClick={addStep}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
                >
                  ➕ Add Step
                </button>
              </div>

              {formData.steps.length === 0 && (
                <p className="text-white/60 italic text-center py-4">
                  No steps added yet. Click "Add Step" to create a structured learning path.
                </p>
              )}

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {formData.steps.map((step, index) => (
                  <div key={index} className="bg-white/10 rounded-xl p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="bg-brand-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {step.number}
                        </span>
                        <input
                          type="text"
                          value={step.title}
                          onChange={(e) => updateStep(index, 'title', e.target.value)}
                          placeholder="Step title"
                          className="font-semibold px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white flex-1 focus:outline-none focus:border-white/60 placeholder-white/40"
                        />
                      </div>
                      <div className="flex gap-1 ml-2">
                        <button
                          type="button"
                          onClick={() => moveStep(index, 'up')}
                          disabled={index === 0}
                          className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded disabled:opacity-30 text-white text-sm"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveStep(index, 'down')}
                          disabled={index === formData.steps.length - 1}
                          className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded disabled:opacity-30 text-white text-sm"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteStep(index)}
                          className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded text-sm"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    <textarea
                      value={step.description}
                      onChange={(e) => updateStep(index, 'description', e.target.value)}
                      placeholder="Step description"
                      className="w-full px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white text-sm mb-2 focus:outline-none focus:border-white/60 placeholder-white/40"
                      rows={2}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={step.type}
                        onChange={(e) => updateStep(index, 'type', e.target.value)}
                        className="px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white text-sm focus:outline-none focus:border-white/60"
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
                        className="px-3 py-2 bg-white/20 border border-white/30 rounded-lg text-white text-sm focus:outline-none focus:border-white/60 placeholder-white/40"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-white text-brand-900 font-bold py-4 px-6 rounded-xl hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Creating...' : '✨ Create Goal'}
              </button>
              <button
                type="button"
                onClick={copyToClipboard}
                className="px-6 py-4 bg-brand-600 text-white font-bold rounded-xl hover:bg-brand-700 transition-colors"
                title="Copy JSON for manual PocketBase entry"
              >
                📋 Copy JSON
              </button>
            </div>

            {/* Result */}
            {result && (
              <div className={`p-4 rounded-xl ${result.success ? 'bg-green-500/20 border border-green-400/30' : 'bg-red-500/20 border border-red-400/30'}`}>
                <p className="text-white font-bold mb-2">
                  {result.success ? '✅ Goal created successfully!' : '❌ Error creating goal'}
                </p>
                {!result.success && (
                  <p className="text-white/80 text-sm">{result.error}</p>
                )}
              </div>
            )}

            {/* JSON Preview */}
            {formData.steps.length > 0 && (
              <div className="bg-black/30 rounded-xl p-4">
                <h3 className="text-white font-bold mb-2">JSON Preview (for manual entry):</h3>
                <pre className="text-green-400 text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                  {generateJSON()}
                </pre>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}




