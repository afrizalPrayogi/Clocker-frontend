export type ProjectType = 'PROJECT' | 'REQUEST';
export type ProjectStatus = 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
export type TaskStatus = 'TO_DO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
export type TimeEntryStatus = 'ACTIVE' | 'VOIDED';

export type Project = {
  id: string;
  name: string;
  type: ProjectType;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  tasks?: Task[];
  _count?: { tasks: number };
};

export type Task = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  project?: Project;
  timeEntries?: TimeEntry[];
  activities?: TaskActivity[];
};

export type TimeEntry = {
  id: string;
  taskId: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  revisionNumber: number;
  status: TimeEntryStatus;
  description: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  task?: Task & { project: Project };
};

export type TaskActivity = {
  id: string;
  taskId: string;
  type: 'STATUS_CHANGED' | 'REOPENED' | 'REVISION_NOTE' | 'TASK_CREATED' | 'TIME_ENTRY_CREATED' | 'TIME_ENTRY_UPDATED' | 'TIME_ENTRY_DELETED';
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus | null;
  revisionNumber: number | null;
  note: string | null;
  createdAt: string;
};

export type DashboardReport = {
  activeTimer: (TimeEntry & { task: Task & { project: Project } }) | null;
  todayTotalSeconds: number;
  projectTotals: Array<{ projectId: string; projectName: string; totalSeconds: number }>;
  recentEntries: Array<TimeEntry & { task: Task & { project: Project } }>;
};

export type TimeReport = {
  totalSeconds: number;
  byDay: Array<{ date: string; totalSeconds: number }>;
  byProject: Array<{ projectId: string; projectName: string; totalSeconds: number }>;
  byTask: Array<{ taskId: string; taskTitle: string; projectId: string; totalSeconds: number }>;
  byRevision: Array<{ taskId: string; taskTitle: string; revisionNumber: number; label: string; totalSeconds: number }>;
  entries: Array<TimeEntry & { task: Task & { project: Project } }>;
};

export type Screen = 'dashboard' | 'projects' | 'project-detail' | 'task-detail' | 'reports';
