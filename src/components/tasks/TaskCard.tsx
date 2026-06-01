import { Task } from '@/lib/pocketbase';
import { formatTime } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  volunteerId?: string | null;
  showClaimButton?: boolean;
  showCompleteButton?: boolean;
  showUnclaimButton?: boolean;
  onClaim?: (taskId: string) => void;
  onUnclaim?: (taskId: string) => void;
  onComplete?: (taskId: string) => void;
  imageBaseUrl?: string;
}

export function TaskCard({
  task,
  volunteerId,
  showClaimButton = false,
  showCompleteButton = false,
  showUnclaimButton = false,
  onClaim,
  onUnclaim,
  onComplete,
  imageBaseUrl = '',
}: TaskCardProps) {
  const isAssignedToMe = volunteerId && 
    (task.assigned_to === volunteerId || 
     (Array.isArray(task.assigned_to) && task.assigned_to.includes(volunteerId)));

  const getStatusColor = () => {
    switch (task.status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-brand-50 text-brand-900';
    }
  };

  const getZoneColor = () => {
    const colors: Record<string, string> = {
      'Wood Shop': 'bg-amber-500',
      'Electronics': 'bg-brand-600',
      'Laser': 'bg-red-500',
      '3D Printing': 'bg-brand-600',
      'CNC': 'bg-green-500',
      'Vinyl': 'bg-pink-500',
      'General': 'bg-gray-500',
    };
    return colors[task.zone] || 'bg-gray-500';
  };

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden">
      {task.image && (
        <div className="h-48 bg-gray-200 overflow-hidden">
          <img 
            src={`${imageBaseUrl}${task.image}`}
            alt={task.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}
      
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-gray-500">
            Task #{task.task_number}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor()}`}>
            {task.status.replace('_', ' ').toUpperCase()}
          </span>
        </div>
        
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          {task.title}
        </h3>
        
        {task.description && (
          <p className="text-gray-600 mb-4 line-clamp-3">
            {task.description}
          </p>
        )}
        
        <div className="flex items-center gap-4 mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${getZoneColor()}`}></div>
            <span className="text-sm font-medium text-gray-700">
              {task.zone}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-gray-600">
              {formatTime(task.estimated_minutes)}
            </span>
          </div>
        </div>
        
        {task.created && (
          <div className="text-xs text-gray-500 mb-4 pb-4 border-b border-gray-200">
            📅 Created {new Date(task.created).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            })}
          </div>
        )}
        
        <div className="flex gap-2">
          {showUnclaimButton && isAssignedToMe && onUnclaim && (
            <button
              onClick={() => onUnclaim(task.id)}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Unclaim
            </button>
          )}
          
          {showClaimButton && !isAssignedToMe && onClaim && (
            <button
              onClick={() => onClaim(task.id)}
              className="flex-1 bg-brand-600 hover:bg-brand-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Claim
            </button>
          )}
          
          {showCompleteButton && onComplete && (
            <button
              onClick={() => onComplete(task.id)}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              Complete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
