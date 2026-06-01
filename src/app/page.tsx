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
  Trophy,
  Clock,
  User,
  Calendar,
  Hammer,
  LogIn,
  Sparkles,
  Target,
  Users
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

export default function HomePage() {
  const { data: session, status } = useSession();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTasks, setActiveTasks] = useState<ActiveTaskWithDetails[]>([]);
  const [leaderboard, setLeaderboard] = useState<VolunteerWithStats[]>([]);
  const [recentCompletions, setRecentCompletions] = useState<CompletionWithDetails[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [mobileView, setMobileView] = useState<'tasks' | 'active' | 'completed' | 'leaderboard'>('tasks');
  const TASKS_PER_PAGE = 12; // 3x4 grid

  // Check authentication
  useEffect(() => {
    async function checkAuth() {
      if (status === 'loading') return;
      if (session) {
        setIsAuthenticated(true);
        return;
      }
      try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        setIsAuthenticated(data.session ? true : false);
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
        const records = await pb.collection('tasks').getList(1, 500, {
          filter: `(status = "open" || status = "in_progress")`,
          sort: '-task_number',
          expand: 'assigned_to,created_by',
        });
        
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
          hours: 0,
          rank: idx + 1,
        }));
        setLeaderboard(withStats);
      } catch (err) {
        console.error('Error fetching leaderboard:', err);
      }
    }
    fetchLeaderboard();
    pb.collection('volunteers').subscribe<Volunteer>('*', () => {
      fetchLeaderboard();
    }).catch((err) => {
      console.error('Error subscribing to volunteers:', err);
    });
    return () => {
      pb.collection('volunteers').unsubscribe().catch(() => {});
    };
  }, []);

  // Fetch active tasks
  useEffect(() => {
    async function fetchActiveTasks() {
      try {
        const records = await pb.collection('tasks').getList<Task>(1, 100, {
          sort: '-task_number',
          expand: 'assigned_to',
        });
        const inProgressTasks = records.items.filter(task =>
          task.status === 'in_progress' && !task.title.startsWith('[ARCHIVED]')
        );
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
        const volunteerIds = [...new Set(records.items.map(c => c.volunteer))];
        const volunteersMap = new Map();
        
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
            volunteer_record: volunteer,
          } as any;
        });
        setRecentCompletions(completionsWithDetails);
      } catch (err) {
        console.error('Error fetching recent completions:', err);
      }
    }
    fetchRecentCompletions();
    pb.collection('completions').subscribe<Completion>('*', (e) => {
      if (e.action === 'create') {
        fetchRecentCompletions();
      }
    }).catch((err) => {
      console.error('Error subscribing to completions:', err);
    });
    return () => {
      pb.collection('completions').unsubscribe().catch(() => {});
    };
  }, []);

  // Task subscription
  useEffect(() => {
    async function refetchTasks() {
      try {
        const allRecords = await pb.collection('tasks').getList(1, 500, {
          filter: `(status = "open" || status = "in_progress")`,
          sort: '-task_number',
          expand: 'assigned_to,created_by',
        });
        
        const tasksWithDates = allRecords.items.map((task) => {
          const taskRecord = task as unknown as Task;
          const expanded = task as any;
          const creator = expanded.expand?.created_by;
          
          const result: any = {
            ...taskRecord,
            creator_name: creator ? (creator.username || creator.email || 'Unknown') : undefined,
          };
          
          if (expanded.expand) {
            result.expand = expanded.expand;
          }
          
          return result;
        });

        const openTasks = tasksWithDates.filter(task =>
          !task.title.startsWith('[ARCHIVED]')
        );
        setTasks(openTasks);

        const inProgressTasks = tasksWithDates.filter(task =>
          task.status === 'in_progress' && !task.title.startsWith('[ARCHIVED]')
        );
        
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

    pb.collection('tasks').subscribe<Task>('*', (e) => {
      refetchTasks();
    }).catch((err) => {
      console.error('Error subscribing to tasks:', err);
    });

    return () => {
      pb.collection('tasks').unsubscribe().catch(() => {});
    };
  }, []);

  // Auto-rotate pages on desktop
  useEffect(() => {
    const taskPages = Math.ceil(tasks.length / TASKS_PER_PAGE);
    const totalSteps = Math.max(taskPages, 1) + 1;

    const interval = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalSteps);
    }, 20000);

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

  const taskPages = Math.ceil(tasks.length / TASKS_PER_PAGE) || 1;
  const isSplashPage = currentPage === taskPages;

  return (
    <div className="h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-brand-900 to-slate-900">
      {/* Desktop View - Hidden on mobile (portrait orientation or small screens) */}
      <div className="hidden landscape:md:block h-full p-4">
        <div className="max-w-[1920px] mx-auto h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between gap-4 mb-2">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white mb-0.5 flex items-center gap-2">
                <Hammer className="w-6 h-6" />
                {siteConfig.name} Volunteer Board
        </h1>
              <p className="text-sm text-brand-200 flex items-center gap-3">
                <span className="flex items-center gap-1"><Target className="w-3.5 h-3.5" /> Make an impact</span>
                <span className="flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Earn recognition</span>
                <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> Build community</span>
              </p>
            </div>

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

          {/* Main Grid */}
          {isSplashPage ? (
            <div className="flex-1 flex items-center justify-center bg-white/10 backdrop-blur-md rounded-2xl p-12 border border-white/20">
              <div className="max-w-7xl w-full flex items-center justify-between gap-16 px-12">
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
              {/* Open Tasks */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col overflow-hidden">
                <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5" />
                  Open Tasks
                  <span className="text-sm font-normal text-brand-200">({tasks.length})</span>
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
                    const startIdx = currentPage * TASKS_PER_PAGE;
                    const endIdx = startIdx + TASKS_PER_PAGE;
                    const pageTasks = tasks.slice(startIdx, endIdx);
                    
                    return pageTasks.map((task) => (
                      <div
                        key={task.id}
                        className="bg-white/90 rounded-lg p-3 border-l-4 border-brand-500 flex flex-col gap-1.5 relative overflow-hidden"
                      >
                        {task.image && (
                          <div className="w-full mb-2 rounded overflow-hidden">
                            <img
                              src={pb.files.getURL(task, task.image, { thumb: '400x300' })}
                              alt={task.title}
                              className="w-full h-auto object-cover"
                              style={{ maxHeight: '100px' }}
                            />
                          </div>
                        )}
                        <div className="flex items-center gap-1.5">
                          <span className="text-base font-mono text-gray-500">
                            #{task.task_number}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full border ${getZoneColor(task.zone)}`}>
                            {task.zone}
                          </span>
                        </div>
                        <h3 className="font-bold text-gray-900 text-xl line-clamp-2 leading-tight flex-1">
                          {task.title}
                        </h3>
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
                        <div className="flex items-center justify-between text-sm text-gray-500 mt-auto">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-4 h-4" />
                            <span>{formatTime(task.estimated_minutes)}</span>
                          </div>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Recently Completed - Scrollable */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col overflow-hidden">
                <h2 className="text-lg font-bold text-white mb-2 text-center flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Completed
                </h2>
                <div className="space-y-2 overflow-y-auto flex-1">
                  {recentCompletions.length === 0 ? (
                    <p className="text-brand-200 text-center py-8 text-sm">No completed tasks yet</p>
                  ) : (
                    recentCompletions.map((completion) => (
                      <div key={completion.id} className="bg-green-500/20 border border-green-400/30 rounded-lg p-2">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-7 h-7 rounded-full bg-green-500 overflow-hidden flex-shrink-0">
                            {completion.volunteer_photo && (completion as any).volunteer_record ? (
                              <img
                                src={pb.files.getURL((completion as any).volunteer_record, completion.volunteer_photo)}
                                alt="Profile"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs">😊</div>
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

              {/* Active Tasks - Scrollable */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col overflow-hidden">
                <h2 className="text-lg font-bold text-white mb-2 text-center flex items-center justify-center gap-2">
                  <Flame className="w-5 h-5" />
                  Active
                </h2>
                <div className="space-y-2 overflow-y-auto flex-1">
                  {activeTasks.length === 0 ? (
                    <p className="text-brand-200 text-center py-8 text-sm">No active tasks</p>
                  ) : (
                    activeTasks.map((task) => (
                      <div key={task.id} className="bg-orange-500/20 border border-orange-400/30 rounded-lg p-2">
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
                              <div className="w-full h-full flex items-center justify-center text-xs">😊</div>
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

              {/* Volunteers Leaderboard */}
              <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20 flex flex-col overflow-hidden">
                <div className="flex flex-col gap-1.5 overflow-hidden">
                  {leaderboard.length === 0 ? (
                    <p className="text-brand-200 text-center py-8 text-sm">No volunteers yet</p>
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
                        <div className={`${volunteer.rank === 1 ? 'w-12 h-12' : 'w-9 h-9'} rounded-full bg-brand-500 overflow-hidden flex-shrink-0 ${volunteer.rank === 1 ? 'ring-2 ring-yellow-400' : ''}`}>
                          {volunteer.profile_photo ? (
                            <img
                              src={pb.files.getURL(volunteer, volunteer.profile_photo)}
                              alt={volunteer.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${volunteer.rank === 1 ? 'text-xl' : 'text-base'}`}>😊</div>
                          )}
                        </div>
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

          {/* Version Number */}
          <div className="absolute bottom-2 right-4 text-white/40 text-xs font-mono">v0.02</div>
        </div>
      </div>

      {/* Mobile View - Shows on portrait orientation or small screens */}
      <div className="landscape:md:hidden h-full flex flex-col">
        {/* Mobile Header */}
        <div className="bg-white/10 backdrop-blur-md p-4 border-b border-white/20">
          <h1 className="text-xl font-bold text-white text-center mb-2 flex items-center justify-center gap-2">
            <Hammer className="w-5 h-5" />
            {siteConfig.name}
          </h1>
          <a
            href="/auth/discord"
            className="block bg-brand-600 text-white text-center py-3 rounded-lg font-bold hover:bg-brand-700 transition-colors flex items-center justify-center gap-2"
          >
            <LogIn className="w-5 h-5" />
            Login / Sign Up
          </a>
        </div>

        {/* Mobile Navigation Tabs */}
        <div className="flex bg-white/10 backdrop-blur-md border-b border-white/20">
          <button
            onClick={() => setMobileView('tasks')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 ${
              mobileView === 'tasks' ? 'text-white bg-brand-600/50' : 'text-brand-200'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setMobileView('active')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 ${
              mobileView === 'active' ? 'text-white bg-orange-600/50' : 'text-brand-200'
            }`}
          >
            <Flame className="w-4 h-4" />
            Active ({activeTasks.length})
          </button>
          <button
            onClick={() => setMobileView('completed')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 ${
              mobileView === 'completed' ? 'text-white bg-green-600/50' : 'text-brand-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            Done
          </button>
          <button
            onClick={() => setMobileView('leaderboard')}
            className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-1.5 ${
              mobileView === 'leaderboard' ? 'text-white bg-yellow-600/50' : 'text-brand-200'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Top 10
          </button>
        </div>

        {/* Mobile Content - Scrollable */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Open Tasks View */}
          {mobileView === 'tasks' && (
            <div className="space-y-4">
              {tasks.length === 0 ? (
                <p className="text-brand-200 text-center py-8">No open tasks</p>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="bg-white/90 rounded-lg p-4 border-l-4 border-brand-500">
                    {task.image && (
                      <img
                        src={pb.files.getURL(task, task.image, { thumb: '400x300' })}
                        alt={task.title}
                        className="w-full h-48 object-cover rounded mb-3"
                      />
                    )}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-mono text-gray-500">#{task.task_number}</span>
                      <span className={`text-xs px-2 py-1 rounded-full border ${getZoneColor(task.zone)}`}>
                        {task.zone}
                      </span>
                    </div>
                    <h3 className="font-bold text-gray-900 text-lg mb-2">{task.title}</h3>
                    <p className="text-gray-700 text-sm mb-3">{task.description}</p>
                    {task.creator_name && (
                      <p className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {task.creator_name}
                      </p>
                    )}
                    {task.created && (
                      <p className="text-xs text-gray-600 mb-2 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(task.created).toLocaleDateString()}
                      </p>
                    )}
                    <p className="text-sm text-gray-600 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Est. {formatTime(task.estimated_minutes)}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Active Tasks View */}
          {mobileView === 'active' && (
            <div className="space-y-4">
              {activeTasks.length === 0 ? (
                <p className="text-brand-200 text-center py-8">No active tasks</p>
              ) : (
                activeTasks.map((task) => (
                  <div key={task.id} className="bg-orange-500/20 border-2 border-orange-400/50 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-orange-500 overflow-hidden flex-shrink-0">
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
                          <div className="w-full h-full flex items-center justify-center text-xl">😊</div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">
                          {getVolunteerName(task.assigned_to ? (Array.isArray(task.assigned_to) ? (task as any).expand?.assigned_to?.[0] : (task as any).expand?.assigned_to) : {})}
                        </p>
                        <p className="text-orange-200 text-xs">Currently working</p>
                      </div>
                    </div>
                    <h3 className="text-white font-bold text-lg mb-1">#{task.task_number} • {task.title}</h3>
                    <p className="text-orange-100 text-sm">{task.description}</p>
                    <p className="text-orange-200 text-sm mt-2 flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      Est. {formatTime(task.estimated_minutes)}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Completed Tasks View */}
          {mobileView === 'completed' && (
            <div className="space-y-4">
              {recentCompletions.length === 0 ? (
                <p className="text-brand-200 text-center py-8">No completed tasks yet</p>
              ) : (
                recentCompletions.map((completion) => (
                  <div key={completion.id} className="bg-green-500/20 border-2 border-green-400/50 rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full bg-green-500 overflow-hidden flex-shrink-0">
                        {completion.volunteer_photo && (completion as any).volunteer_record ? (
                          <img
                            src={pb.files.getURL((completion as any).volunteer_record, completion.volunteer_photo)}
                            alt="Profile"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl">😊</div>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-white text-sm">
                          {completion.volunteer_name || 'Unknown'}
                        </p>
                        <p className="text-green-200 text-xs">Completed this task</p>
                      </div>
                    </div>
                    <h3 className="text-white font-bold text-lg mb-2">{completion.task_title || 'Task'}</h3>
                    <p className="text-green-200 text-lg font-semibold flex items-center gap-1">
                      <Clock className="w-5 h-5" />
                      {Math.round(completion.actual_minutes / 60)}h {completion.actual_minutes % 60}m
                    </p>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Leaderboard View */}
          {mobileView === 'leaderboard' && (
            <div className="space-y-3">
              {leaderboard.length === 0 ? (
                <p className="text-brand-200 text-center py-8">No volunteers yet</p>
              ) : (
                leaderboard.map((volunteer) => (
                  <div
                    key={volunteer.id}
                    className={`flex items-center gap-4 p-4 rounded-lg ${
                      volunteer.rank === 1
                        ? 'bg-gradient-to-r from-yellow-400/30 to-amber-500/30 border-2 border-yellow-400/70'
                        : volunteer.rank <= 3
                        ? 'bg-gradient-to-r from-yellow-400/15 to-amber-500/15 border-2 border-yellow-400/40'
                        : 'bg-white/10 border border-white/20'
                    }`}
                  >
                    <div className="text-2xl font-bold text-white/70 w-8">{volunteer.rank}</div>
                    <div className={`${volunteer.rank === 1 ? 'w-16 h-16' : 'w-14 h-14'} rounded-full bg-brand-500 overflow-hidden flex-shrink-0 ${volunteer.rank === 1 ? 'ring-4 ring-yellow-400' : ''}`}>
                      {volunteer.profile_photo ? (
                        <img
                          src={pb.files.getURL(volunteer, volunteer.profile_photo)}
                          alt={volunteer.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-2xl">😊</div>
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-bold text-white ${volunteer.rank === 1 ? 'text-lg' : 'text-base'}`}>
                        {getVolunteerName(volunteer)}
                      </p>
                      <p className={`text-brand-200 ${volunteer.rank === 1 ? 'text-base' : 'text-sm'}`}>
                        {formatTime(volunteer.total_minutes)}
                      </p>
                    </div>
                    {volunteer.rank <= 3 && (
                      <div className="text-2xl">
                        {volunteer.rank === 1 ? (
                          <Trophy className="w-8 h-8 text-yellow-400 fill-yellow-400" />
                        ) : volunteer.rank === 2 ? (
                          <Trophy className="w-7 h-7 text-gray-400 fill-gray-400" />
                        ) : (
                          <Trophy className="w-6 h-6 text-amber-600 fill-amber-600" />
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Mobile Version Number */}
        <div className="text-center py-2 text-white/40 text-xs font-mono bg-white/5">v0.02</div>
      </div>
    </div>
  );
}
