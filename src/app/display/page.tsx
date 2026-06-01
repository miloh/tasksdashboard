'use client';

import { siteConfig } from '@/lib/site-config';
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import pb from '@/lib/pocketbase';
import type { Task, Volunteer, Completion } from '@/lib/pocketbase';
import { getVolunteerName, formatTime } from '@/lib/utils';
import { 
  ClipboardList, 
  Flame, 
  CheckCircle2, 
  Clock,
  User,
  Calendar,
  Edit,
  Link as LinkIcon,
  Hammer
} from 'lucide-react';

const QRCode = dynamic(() => import('@/components/QRCode'), { ssr: false });



interface VolunteerWithStats extends Volunteer {
  hours: number;
  rank: number;
}

interface CompletionWithDetails extends Completion {
  task_title?: string;
  volunteer_name?: string;
  volunteer_photo?: string;
}

interface ActiveTaskWithDetails extends Task {
  volunteer_name?: string;
  volunteer_photo?: string;
}


export default function DisplayPage() {
  const { data: session, status } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTasks, setActiveTasks] = useState<ActiveTaskWithDetails[]>([]);
  const [leaderboard, setLeaderboard] = useState<VolunteerWithStats[]>([]);
  const [recentCompletions, setRecentCompletions] = useState<CompletionWithDetails[]>([]);
  const [timeFrame, setTimeFrame] = useState<'week' | 'month' | 'all'>('month');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const TASKS_PER_PAGE = 12; // 3x4 grid

  // Check authentication
  useEffect(() => {
    async function checkAuth() {
      // Wait for session to finish loading
      if (status === 'loading') {
        return;
      }

      // Check NextAuth session
      if (session) {
        setIsAuthenticated(true);
        return;
      }

      // Also check custom session cookie as fallback
      try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        if (data.session) {
          setIsAuthenticated(true);
        } else {
          setIsAuthenticated(false);
        }
      } catch (err) {
        console.error('Error checking auth:', err);
        setIsAuthenticated(false);
      }
    }
    
    checkAuth();
  }, [session, status]);

  // Fetch open tasks
  useEffect(() => {
    async function fetchTasks() {
      try {
        // Fetch ALL open and in_progress tasks (not completed)
        const records = await pb.collection('tasks').getList(1, 500, {
          filter: `(status = "open" || status = "in_progress")`,
          sort: '-task_number',
          expand: 'assigned_to,created_by',
        });
        
        // Cast to get created/updated fields and populate creator_name
        const tasksWithDates = records.items.map((task) => {
          const taskRecord = task as unknown as Task;
          const expanded = task as any;
          const creator = expanded.expand?.created_by;
          if (creator) {
            return {
              ...taskRecord,
              creator_name: creator.username || creator.email || 'Unknown',
            };
          }
          return taskRecord;
        });
        
        // Filter out archived tasks client-side
        const openTasks = tasksWithDates.filter(task =>
          !task.title.startsWith('[ARCHIVED]')
        );
        setTasks(openTasks);
      } catch (err) {
        console.error('Error fetching tasks:', err);
      }
    }

    fetchTasks();
  }, []);

  // Fetch leaderboard
  useEffect(() => {
    async function fetchLeaderboard() {
      try {
        const records = await pb.collection('volunteers').getList<Volunteer>(1, 10, {
          sort: '-total_minutes',
        });

        const withStats: VolunteerWithStats[] = records.items.map((v, idx) => ({
          ...v,
          hours: 0, // Not used anymore, keeping for interface compatibility
          rank: idx + 1,
        }));

        setLeaderboard(withStats);
      } catch (err) {
        console.error('Error fetching leaderboard:', err);
      }
    }

    fetchLeaderboard();

    // Subscribe to volunteer updates
    pb.collection('volunteers').subscribe<Volunteer>('*', () => {
      fetchLeaderboard(); // Refetch when volunteers update
    }).catch((err) => {
      console.error('Error subscribing to volunteers:', err);
    });

    return () => {
      pb.collection('volunteers').unsubscribe().catch(() => {
        // Ignore unsubscribe errors
      });
    };
  }, [timeFrame]);

  // Fetch active (in-progress) tasks
  useEffect(() => {
    async function fetchActiveTasks() {
      try {
        // Fetch with expand to get volunteer data in single query
        const records = await pb.collection('tasks').getList<Task>(1, 100, {
          sort: '-task_number',
          expand: 'assigned_to',
        });

        // Filter for in_progress status client-side (exclude archived)
        const inProgressTasks = records.items.filter(task =>
          task.status === 'in_progress' && !task.title.startsWith('[ARCHIVED]')
        );

        // Extract volunteer details from expanded data
        const tasksWithDetails: ActiveTaskWithDetails[] = inProgressTasks.slice(0, 10).map((task) => {
          const expanded = task as any;
          const volunteer = Array.isArray(expanded.expand?.assigned_to)
            ? expanded.expand?.assigned_to[0]
            : expanded.expand?.assigned_to;

          console.log('Active task volunteer data:', {
            taskId: task.id,
            taskTitle: task.title,
            volunteer: volunteer,
            volunteerPhoto: volunteer?.profile_photo,
            hasExpand: !!expanded.expand,
            assignedTo: expanded.expand?.assigned_to
          });

          return {
            ...task,
            volunteer_name: volunteer?.username,
            volunteer_photo: volunteer?.profile_photo,
          };
        });

        setActiveTasks(tasksWithDetails);
      } catch (err) {
        console.error('Error fetching active tasks:', err);
      }
    }

    fetchActiveTasks();
  }, []);

  // Fetch recent completions
  useEffect(() => {
    async function fetchRecentCompletions() {
      try {
        const records = await pb.collection('completions').getList<Completion>(1, 10, {
          expand: 'task,volunteer',
          sort: '-created',
        });

        // Fetch all unique volunteer IDs to get their full data
        const volunteerIds = [...new Set(records.items.map(c => c.volunteer))];
        const volunteersMap = new Map();
        
        // Fetch each volunteer directly (same as leaderboard approach)
        await Promise.all(
          volunteerIds.map(async (volunteerId) => {
            try {
              const volunteer = await pb.collection('volunteers').getOne<Volunteer>(volunteerId);
              volunteersMap.set(volunteerId, volunteer);
            } catch (err) {
              console.error(`Failed to fetch volunteer ${volunteerId}:`, err);
            }
          })
        );

        const completionsWithDetails: CompletionWithDetails[] = records.items.map(completion => {
          const expanded = completion as any;
          const volunteer = volunteersMap.get(completion.volunteer);
          
          return {
            ...completion,
            task_title: expanded.expand?.task?.title,
            volunteer_name: volunteer?.username || volunteer?.email,
            volunteer_photo: volunteer?.profile_photo,
            volunteer_record: volunteer, // Store the full volunteer record for image URL generation
          } as any;
        });

        setRecentCompletions(completionsWithDetails);
      } catch (err) {
        console.error('Error fetching recent completions:', err);
      }
    }

    fetchRecentCompletions();

    // Subscribe to completion updates
    pb.collection('completions').subscribe<Completion>('*', (e) => {
      if (e.action === 'create') {
        fetchRecentCompletions();
      }
    }).catch((err) => {
      console.error('Error subscribing to completions:', err);
    });

    return () => {
      pb.collection('completions').unsubscribe().catch(() => {
        // Ignore unsubscribe errors
      });
    };
  }, []);

  // Consolidated task subscription for real-time updates
  useEffect(() => {
    async function refetchTasks() {
      // Fetch with expand to get volunteer data in single query
      try {
        const allRecords = await pb.collection('tasks').getList(1, 500, {
          filter: `(status = "open" || status = "in_progress")`,
          sort: '-task_number',
          expand: 'assigned_to,created_by',
        });
        
        // Cast to get created/updated fields and populate creator_name
        // Keep the raw items to preserve expand data
        const tasksWithDates = allRecords.items.map((task) => {
          const taskRecord = task as unknown as Task;
          const expanded = task as any;
          const creator = expanded.expand?.created_by;
          
          // Return the task with creator_name AND preserve the expand property
          const result: any = {
            ...taskRecord,
            creator_name: creator ? (creator.username || creator.email || 'Unknown') : undefined,
          };
          
          // Preserve the expand data
          if (expanded.expand) {
            result.expand = expanded.expand;
          }
          
          return result;
        });

        // Filter out archived tasks client-side
        const openTasks = tasksWithDates.filter(task =>
          !task.title.startsWith('[ARCHIVED]')
        );
        setTasks(openTasks);

        // Filter in_progress tasks client-side (exclude archived)
        const inProgressTasks = tasksWithDates.filter(task =>
          task.status === 'in_progress' && !task.title.startsWith('[ARCHIVED]')
        );
        
        // Extract volunteer details from expanded data
        const tasksWithDetails: ActiveTaskWithDetails[] = inProgressTasks.slice(0, 10).map((task) => {
          const expanded = task as any;
          const volunteer = Array.isArray(expanded.expand?.assigned_to)
            ? expanded.expand?.assigned_to[0]
            : expanded.expand?.assigned_to;

          return {
            ...task,
            volunteer_name: volunteer?.username,
            volunteer_photo: volunteer?.profile_photo,
          };
        });

        setActiveTasks(tasksWithDetails);
      } catch (err) {
        console.error('Error refetching tasks:', err);
      }
    }

    // Subscribe to task updates
    pb.collection('tasks').subscribe<Task>('*', (e) => {
      console.log('Task update received:', e.action, e.record.status, e.record.title);
      refetchTasks();
    }).catch((err) => {
      console.error('Error subscribing to tasks:', err);
    });

    return () => {
      pb.collection('tasks').unsubscribe().catch(() => {
        // Ignore unsubscribe errors
      });
    };
  }, []);

  // Auto-rotate pages every 30 seconds
  useEffect(() => {
    // Calculate total pages for tasks
    const taskPages = Math.ceil(tasks.length / TASKS_PER_PAGE);
    // Total rotation steps = task pages + 1 (for splash screen)
    // Even if 0 tasks, we want at least 1 page (empty) + splash = 2 steps? 
    // Or if 0 tasks, just show empty page then splash?
    const totalSteps = Math.max(taskPages, 1) + 1; 

    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalSteps);
    }, 20000); // 20 seconds per view

    return () => clearInterval(interval);
  }, [tasks.length]);

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

  // Determine optimal grid layout based on task count
  const getGridLayout = (count: number): string => {
    if (count === 0) return 'grid-cols-1';
    if (count === 1) return 'grid-cols-1';
    if (count === 2) return 'grid-cols-2';
    if (count === 3) return 'grid-cols-3';
    if (count === 4) return 'grid-cols-2';
    if (count <= 6) return 'grid-cols-3';
    if (count <= 8) return 'grid-cols-4';
    if (count <= 9) return 'grid-cols-3';
    if (count <= 12) return 'grid-cols-4';
    return 'grid-cols-4';
  };

  // Get card styling configuration based on task count
  const getCardConfig = (count: number) => {
    // ... (omitted for brevity, keep existing logic if possible, or just insert before return)
    // 1 task: Large, centered, detailed
    if (count === 1) return {
      padding: 'p-4',
      taskNumberSize: 'text-base',
      zoneSize: 'text-sm',
      titleSize: 'text-xl',
      titleLines: 'line-clamp-2',
      descSize: 'text-base',
      descLines: 'line-clamp-3',
      timeSize: 'text-base',
      showDesc: true,
      spacing: 'gap-2'
    };

    // 2-3 tasks: Wide, horizontal, spacious
    if (count <= 3) return {
      padding: 'p-3',
      taskNumberSize: 'text-sm',
      zoneSize: 'text-sm',
      titleSize: 'text-base',
      titleLines: 'line-clamp-2',
      descSize: 'text-sm',
      descLines: 'line-clamp-3',
      timeSize: 'text-sm',
      showDesc: true,
      spacing: 'gap-2'
    };

    // 4-6 tasks: Balanced, comfortable
    if (count <= 6) return {
      padding: 'p-2.5',
      taskNumberSize: 'text-xs',
      zoneSize: 'text-xs',
      titleSize: 'text-sm',
      titleLines: 'line-clamp-2',
      descSize: 'text-xs',
      descLines: 'line-clamp-2',
      timeSize: 'text-xs',
      showDesc: true,
      spacing: 'gap-1.5'
    };

    // 7-9 tasks: Compact but clear
    if (count <= 9) return {
      padding: 'p-2',
      taskNumberSize: 'text-xs',
      zoneSize: 'text-[10px]',
      titleSize: 'text-sm',
      titleLines: 'line-clamp-1',
      descSize: 'text-[11px]',
      descLines: 'line-clamp-1',
      timeSize: 'text-[10px]',
      showDesc: true,
      spacing: 'gap-1'
    };

    // 10-15 tasks: Optimized for 1080p TV display - LARGE text for readability
    return {
      padding: 'p-2',
      taskNumberSize: 'text-[10px]',  // Minimize to save space
      zoneSize: 'text-[10px]',  // Minimize to save space
      titleSize: 'text-lg',  // LARGE: 18px for TV visibility
      titleLines: 'line-clamp-2',
      descSize: 'text-[10px]',
      descLines: 'line-clamp-none',
      timeSize: 'text-sm',  // Readable time
      showDesc: false,
      spacing: 'gap-1'
    };
  };

  const taskPages = Math.ceil(tasks.length / TASKS_PER_PAGE) || 1;
  const isSplashPage = currentPage === taskPages;

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900 p-4">
      <div className="max-w-[1920px] mx-auto h-full flex flex-col">
        {/* Header - Compact for 1080p */}
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white mb-0.5 flex items-center gap-2">
              <Hammer className="w-6 h-6" />
              {siteConfig.name} Volunteer Board
            </h1>
            <p className="text-sm text-brand-200">
              Make an impact • Earn recognition • Build community
            </p>
          </div>

          {/* Single QR Code - Clickable */}
          <a
            href={`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/auth/discord`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white rounded-xl p-2.5 shadow-2xl flex items-center gap-2.5 hover:shadow-3xl transition-shadow cursor-pointer"
          >
            <QRCode value={`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/auth/discord`} size={80} />
            <div>
              <h3 className="text-sm font-bold text-brand-900">Volunteer Portal</h3>
              <p className="text-xs text-gray-600">Scan or Click to join</p>
            </div>
          </a>
        </div>

        {/* Main Grid - Custom widths: tasks get 60%, side columns 13.33% each */}
        {isSplashPage ? (
          <div className="flex-1 flex items-center justify-center bg-white/10 backdrop-blur-md rounded-2xl p-12 border border-white/20 animate-fade-in">
            <div className="max-w-7xl w-full flex items-center justify-between gap-16 px-12">
              {/* Large Logo (Left Side) */}
              <div className="w-[400px] h-[400px] relative rounded-full overflow-hidden bg-white shadow-2xl p-6 flex items-center justify-center flex-shrink-0">
                 <img 
                    src={siteConfig.logoPath} 
                    alt={siteConfig.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        e.currentTarget.parentElement!.innerHTML = '<div class="text-6xl">🛠️</div>';
                    }}
                />
              </div>
              
              {/* Description (Right Side) */}
              <div className="flex-1 space-y-6 text-left">
                <h1 className="text-7xl font-bold text-white tracking-tight drop-shadow-lg">
                  {siteConfig.name}
                </h1>
                <p className="text-3xl text-brand-100 leading-relaxed font-light drop-shadow-md">
                  {siteConfig.description}
                </p>
              </div>
            </div>
          </div>
        ) : (
        <div className="grid gap-3 flex-1 overflow-hidden" style={{ gridTemplateColumns: '60% 13.33% 13.33% 13.33%' }}>
          {/* Open Tasks - 60% */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col overflow-hidden">
            <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Open Tasks
              <span className="text-sm font-normal text-brand-200">
                ({tasks.length})
              </span>
              {tasks.length > TASKS_PER_PAGE && (
                <span className="text-sm font-normal text-brand-200 ml-auto">
                  Page {currentPage + 1} of {Math.ceil(tasks.length / TASKS_PER_PAGE)}
                </span>
              )}
            </h2>

            <div className="grid grid-cols-3 grid-rows-4 gap-2 overflow-hidden h-full">
              {tasks.length === 0 ? (
                <div className="col-span-3 row-span-4 flex items-center justify-center">
                  <p className="text-brand-200 text-center text-lg">
                    No open tasks right now. Check back soon!
                  </p>
                </div>
              ) : (() => {
                // Get tasks for current page (12 tasks = 3x4 grid)
                const startIdx = currentPage * TASKS_PER_PAGE;
                const endIdx = startIdx + TASKS_PER_PAGE;
                const pageTasks = tasks.slice(startIdx, endIdx);
                
                // Use larger font config optimized for TV display - titles only, no descriptions
                const config = {
                  padding: 'p-3',
                  taskNumberSize: 'text-base', // Increased from text-sm for better visibility
                  zoneSize: 'text-xs',
                  titleSize: 'text-xl', // Extra large for TV readability
                  titleLines: 'line-clamp-2',
                  timeSize: 'text-sm',
                  spacing: 'gap-1.5'
                };
                
                return pageTasks.map((task) => (
                  <div
                    key={task.id}
                    className={`bg-white/90 rounded-lg ${config.padding} border-l-4 border-brand-500 flex flex-col ${config.spacing} relative overflow-hidden`}
                  >
                    {/* Task Image (if available) */}
                    {task.image && (
                      <div className="w-full mb-2 rounded overflow-hidden">
                        <img
                          src={pb.files.getURL(task, task.image, { thumb: '400x300' })}
                          alt={task.title}
                          className="w-full h-auto object-cover"
                          style={{ maxHeight: tasks.length <= 3 ? '150px' : '100px' }}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={`${config.taskNumberSize} font-mono text-gray-500`}>
                        #{task.task_number}
                      </span>
                      <span
                        className={`${config.zoneSize} px-1.5 py-0.5 rounded-full border ${getZoneColor(
                          task.zone
                        )}`}
                      >
                        {task.zone}
                      </span>
                    </div>
                    <h3 className={`font-bold text-gray-900 ${config.titleSize} ${config.titleLines} leading-tight flex-1`}>
                      {task.title}
                    </h3>
                    
                    {/* Creator and Date Info */}
                    {(task.creator_name || task.created) && (
                      <div className="text-[10px] text-gray-600 border-t border-gray-200 pt-1 mt-1">
                        {task.creator_name && (
                          <div className="truncate flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {task.creator_name}
                          </div>
                        )}
                        {task.created && (
                          <div className="truncate flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(task.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </div>
                        )}
                      </div>
                    )}
                    
                    <div className={`flex items-center justify-between ${config.timeSize} text-gray-500 mt-auto`}>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-4 h-4" />
                        <span>{formatTime(task.estimated_minutes)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Edit Button - Only show if authenticated */}
                        {isAuthenticated && (
                          <a
                            href={`/task/edit/${task.id}`}
                          className="bg-brand-600 hover:bg-brand-700 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors text-xs shadow-md"
                          title="Edit Task"
                        >
                          <Edit className="w-3 h-3" />
                        </a>
                        )}
                        {/* Copy Link Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const taskUrl = `${window.location.origin}/task/${task.id}`;
                            navigator.clipboard.writeText(taskUrl);
                          }}
                          className="bg-gray-600 hover:bg-gray-700 text-white rounded-full w-6 h-6 flex items-center justify-center transition-colors text-xs shadow-md"
                          title="Copy task link"
                        >
                          <LinkIcon className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Recently Completed - 13.33% */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col overflow-hidden">
            <h2 className="text-lg font-bold text-white mb-2 text-center flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Completed
            </h2>

            <div className="space-y-2 overflow-hidden">
              {recentCompletions.length === 0 ? (
                <p className="text-brand-200 text-center py-8 text-sm">
                  No completed tasks yet
                </p>
              ) : (
                recentCompletions.slice(0, 8).map((completion) => (
                  <div
                    key={completion.id}
                    className="bg-green-500/20 border border-green-400/30 rounded-lg p-2"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full bg-green-500 overflow-hidden flex-shrink-0">
                        {completion.volunteer_photo && (completion as any).volunteer_record ? (
                          <img
                            src={pb.files.getURL((completion as any).volunteer_record, completion.volunteer_photo)}
                            alt="Profile"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs">
                            😊
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-white text-xs flex-1 line-clamp-1">
                        {completion.volunteer_name || 'Unknown'}
                      </p>
                    </div>
                    <h3 className="text-white text-xs font-medium mb-1 line-clamp-2">
                      {completion.task_title || 'Task'}
                    </h3>
                    <p className="text-green-200 text-xs">
                      {Math.round(completion.actual_minutes / 60)}h {completion.actual_minutes % 60}m
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Tasks - 13.33% */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col overflow-hidden">
            <h2 className="text-lg font-bold text-white mb-2 text-center flex items-center justify-center gap-2">
              <Flame className="w-5 h-5" />
              Active
            </h2>

            <div className="space-y-2 overflow-hidden">
              {activeTasks.length === 0 ? (
                <p className="text-brand-200 text-center py-8 text-sm">
                  No active tasks
                </p>
              ) : (
                activeTasks.slice(0, 8).map((task) => (
                  <div
                    key={task.id}
                    className="bg-orange-500/20 border border-orange-400/30 rounded-lg p-2 relative"
                  >
                    {/* Edit Button - Only show if authenticated */}
                    {isAuthenticated && (
                      <a
                        href={`/task/edit/${task.id}`}
                        className="absolute top-1 right-1 bg-brand-600 hover:bg-brand-700 text-white rounded-full w-5 h-5 flex items-center justify-center transition-colors text-xs z-10 shadow-sm"
                        title="Edit Task"
                      >
                        <Edit className="w-3 h-3" />
                      </a>
                    )}

                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-7 h-7 rounded-full bg-orange-500 overflow-hidden flex-shrink-0">
                        {task.volunteer_photo && (task as any).expand?.assigned_to ? (
                          <img
                            src={pb.files.getURL(
                              Array.isArray((task as any).expand.assigned_to) 
                                ? (task as any).expand.assigned_to[0] 
                                : (task as any).expand.assigned_to,
                              task.volunteer_photo
                            )}
                            alt="Profile"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs">
                            😊
                          </div>
                        )}
                      </div>
                      <p className="font-semibold text-white text-xs flex-1 line-clamp-1">
                        {getVolunteerName(task.assigned_to ? (Array.isArray(task.assigned_to) ? (task as any).expand?.assigned_to?.[0] : (task as any).expand?.assigned_to) : {})}
                      </p>
                    </div>
                    <h3 className="text-white text-xs font-medium mb-1 line-clamp-2">
                      #{task.task_number} • {task.title}
                    </h3>
                    <p className="text-orange-200 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Est. {formatTime(task.estimated_minutes)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Volunteers - 13.33% (No title, no rank numbers) */}
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col overflow-hidden">
            <div className="flex flex-col gap-1.5 overflow-hidden">
              {leaderboard.length === 0 ? (
                <p className="text-brand-200 text-center py-8 text-sm">
                  No volunteers yet. Be the first!
                </p>
              ) : (
                leaderboard.slice(0, 10).map((volunteer) => (
                  <div
                    key={volunteer.id}
                    className={`flex items-center gap-2 p-1.5 rounded-lg ${
                      volunteer.rank === 1
                        ? 'bg-gradient-to-r from-yellow-400/30 to-amber-500/30 border border-yellow-400/50'
                        : volunteer.rank <= 3
                        ? 'bg-gradient-to-r from-yellow-400/15 to-amber-500/15 border border-yellow-400/20'
                        : 'bg-white/5'
                    }`}
                  >
                    {/* Profile Photo */}
                    <div className={`${volunteer.rank === 1 ? 'w-12 h-12' : 'w-9 h-9'} rounded-full bg-brand-500 overflow-hidden flex-shrink-0 ${volunteer.rank === 1 ? 'ring-2 ring-yellow-400' : ''}`}>
                      {volunteer.profile_photo ? (
                        <img
                          src={pb.files.getURL(volunteer, volunteer.profile_photo)}
                          alt={volunteer.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className={`w-full h-full flex items-center justify-center ${volunteer.rank === 1 ? 'text-xl' : 'text-base'}`}>
                          😊
                        </div>
                      )}
                    </div>

                    {/* Name and Time */}
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-white ${volunteer.rank === 1 ? 'text-sm' : 'text-xs'} truncate`}>
                        {getVolunteerName(volunteer)}
                      </p>
                      <p className={`text-brand-200 ${volunteer.rank === 1 ? 'text-xs' : 'text-[10px]'}`}>
                        {formatTime(volunteer.total_minutes)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
        )}
        
        {/* Version Number - Bottom Right */}
        <div className="absolute bottom-2 right-4 text-white/40 text-xs font-mono">
          v0.02
        </div>
      </div>
    </div>
  );
}
