'use client';

import { FormEvent, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatDate, formatDateTime, formatDuration, liveSeconds, revisionLabel, todayIsoDate } from '@/lib/format';
import type { DashboardReport, Project, ProjectStatus, ProjectType, Screen, Task, TaskActivity, TaskStatus, TimeEntry, TimeReport } from '@/lib/types';

type Modal =
  | { type: 'project'; project?: Project }
  | { type: 'task'; task?: Task }
  | { type: 'reopen'; task: Task }
  | { type: 'archiveProject'; project: Project }
  | { type: 'archiveTask'; task: Task }
  | { type: 'manualEntry'; task: Task }
  | { type: 'blockedProject'; project: Project; unfinished: Task[] }
  | { type: 'switchTimer'; nextTask: Task }
  | null;

const statusMeta: Record<TaskStatus, { label: string; className: string }> = {
  TO_DO: { label: 'To do', className: 'todo' },
  IN_PROGRESS: { label: 'In progress', className: 'progress' },
  IN_REVIEW: { label: 'In review', className: 'review' },
  DONE: { label: 'Done', className: 'done' },
};

const projectStatusMeta: Record<ProjectStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'progress' },
  COMPLETED: { label: 'Completed', className: 'completed' },
  ARCHIVED: { label: 'Archived', className: 'archived' },
};

export default function Home() {
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [dashboard, setDashboard] = useState<DashboardReport | null>(null);
  const [report, setReport] = useState<TimeReport | null>(null);
  const [projectFilter, setProjectFilter] = useState<ProjectStatus>('ACTIVE');
  const [taskFilter, setTaskFilter] = useState<TaskStatus | 'ALL'>('ALL');
  const [projectSearch, setProjectSearch] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [reportFilters, setReportFilters] = useState({ startDate: todayIsoDate(), endDate: todayIsoDate(), projectId: '', taskId: '', revisionNumber: '' });

  useEffect(() => {
    void refreshAll();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(''), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function refreshAll() {
    setLoading(true);
    setError('');
    try {
      const timezoneOffsetMinutes = new Date().getTimezoneOffset();
      const [dashboardData, projectData] = await Promise.all([
        api.dashboard(timezoneOffsetMinutes) as Promise<DashboardReport>,
        api.projects() as Promise<Project[]>,
      ]);
      setDashboard(dashboardData);
      setProjects(projectData);
      await loadReport(reportFilters);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function refreshProject(id: string) {
    const project = (await api.project(id)) as Project;
    setSelectedProject(project);
    setProjects((current) => current.map((item) => (item.id === project.id ? { ...item, ...project, tasks: undefined } : item)));
    return project;
  }

  async function refreshTask(id: string) {
    const task = (await api.task(id)) as Task;
    setSelectedTask(task);
    return task;
  }

  async function loadReport(filters = reportFilters) {
    const params = new URLSearchParams();
    params.set('startDate', filters.startDate);
    params.set('endDate', `${filters.endDate}T23:59:59.999Z`);
    params.set('timezoneOffsetMinutes', String(new Date().getTimezoneOffset()));
    if (filters.projectId) params.set('projectId', filters.projectId);
    if (filters.taskId) params.set('taskId', filters.taskId);
    if (filters.revisionNumber) params.set('revisionNumber', filters.revisionNumber);
    setReport((await api.report(params.toString())) as TimeReport);
  }

  async function runAction(action: () => Promise<void>, success: string) {
    setError('');
    try {
      await action();
      await refreshAll();
      setToast(success);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  function openProject(project: Project) {
    setScreen('project-detail');
    setTaskFilter('ALL');
    void refreshProject(project.id);
  }

  function openTask(task: Task) {
    setScreen('task-detail');
    void refreshTask(task.id);
    if (task.projectId) void refreshProject(task.projectId);
  }

  async function startTimer(task: Task) {
    if (dashboard?.activeTimer && dashboard.activeTimer.taskId !== task.id) {
      setModal({ type: 'switchTimer', nextTask: task });
      return;
    }
    await runAction(async () => {
      await api.startTimer(task.id);
      await refreshTask(task.id);
    }, `Timer dimulai untuk ${task.title}.`);
  }

  async function stopTimer() {
    await runAction(async () => {
      const stopped = (await api.stopTimer()) as TimeEntry;
      if (selectedTask?.id === stopped.taskId) await refreshTask(stopped.taskId);
    }, 'Sesi timer tersimpan. Status task tidak berubah otomatis.');
  }

  async function completeProject(project: Project) {
    const fullProject = selectedProject?.id === project.id ? selectedProject : await refreshProject(project.id);
    const unfinished = (fullProject.tasks || []).filter((task) => !task.archivedAt && task.status !== 'DONE');
    if (unfinished.length) {
      setModal({ type: 'blockedProject', project: fullProject, unfinished });
      return;
    }
    await runAction(async () => {
      await api.updateProject(project.id, { status: 'COMPLETED' });
      await refreshProject(project.id);
    }, 'Project ditandai Completed.');
  }

  const activeTimer = dashboard?.activeTimer ?? null;
  const activeSeconds = activeTimer ? liveSeconds(activeTimer.startedAt, now) : 0;
  const activeProjects = projects.filter((project) => project.status === 'ACTIVE');
  const projectTasks = (selectedProject?.tasks || []).filter((task) => !task.archivedAt);
  const filteredProjects = projects.filter((project) => project.status === projectFilter && `${project.name} ${project.description || ''}`.toLowerCase().includes(projectSearch.toLowerCase()));
  const filteredTasks = projectTasks.filter((task) => taskFilter === 'ALL' || task.status === taskFilter);
  const allTasks = projects.flatMap((project) => project.tasks || []).concat(selectedProject?.tasks || []).filter(uniqueTask);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C/</div>
          <div>
            <div className="brand-name">clocker</div>
            <div className="brand-subtitle">personal work log</div>
          </div>
        </div>
        <nav className="nav" aria-label="Navigasi utama">
          <NavButton active={screen === 'dashboard'} icon="01" label="Dashboard" onClick={() => setScreen('dashboard')} />
          <NavButton active={screen === 'projects' || screen === 'project-detail' || screen === 'task-detail'} icon="02" label="Projects" onClick={() => setScreen('projects')} />
          <NavButton active={screen === 'reports'} icon="03" label="Reports" onClick={() => setScreen('reports')} />
        </nav>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="topbar-left">
            <div className="topbar-title">{new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())}</div>
          </div>
          <div className="topbar-right">
            <div className="api-badge"><span className="api-dot" />{error ? 'API needs attention' : 'API connected'}</div>
            <button className="btn btn-primary btn-sm" onClick={() => setModal({ type: 'project' })}>+ New project</button>
          </div>
        </header>

        {error && <div className="card error-card" style={{ marginTop: 18 }}>{error}</div>}
        {loading && <div className="card pad" style={{ marginTop: 18 }}>Loading workspace...</div>}

        {!loading && screen === 'dashboard' && <DashboardScreen activeProjects={activeProjects} activeSeconds={activeSeconds} activeTimer={activeTimer} dashboard={dashboard} onNewTask={() => selectedProject ? setModal({ type: 'task' }) : setScreen('projects')} onOpenProject={openProject} onOpenTask={(task) => openTask(task)} onStopTimer={stopTimer} projects={projects} setScreen={setScreen} />}
        {!loading && screen === 'projects' && <ProjectsScreen activeCount={activeProjects.length} filteredProjects={filteredProjects} projectFilter={projectFilter} projectSearch={projectSearch} setModal={setModal} setProjectFilter={setProjectFilter} setProjectSearch={setProjectSearch} onOpenProject={openProject} />}
        {!loading && screen === 'project-detail' && selectedProject && <ProjectDetailScreen activeTimer={activeTimer} filteredTasks={filteredTasks} project={selectedProject} taskFilter={taskFilter} setModal={setModal} setScreen={setScreen} setTaskFilter={setTaskFilter} onArchive={() => setModal({ type: 'archiveProject', project: selectedProject })} onComplete={() => void completeProject(selectedProject)} onOpenTask={openTask} onStartTimer={(task) => void startTimer(task)} onStopTimer={stopTimer} />}
        {!loading && screen === 'task-detail' && selectedTask && <TaskDetailScreen activeSeconds={activeSeconds} activeTimer={activeTimer} setModal={setModal} task={selectedTask} onBack={() => selectedTask.project && openProject(selectedTask.project)} onComplete={() => void runAction(async () => { await api.completeTask(selectedTask.id); await refreshTask(selectedTask.id); }, 'Task ditandai Done.')} onReview={() => void runAction(async () => { await api.reviewTask(selectedTask.id); await refreshTask(selectedTask.id); }, 'Task masuk ke In review.')} onStart={() => void startTimer(selectedTask)} onStop={stopTimer} />}
        {!loading && screen === 'reports' && <ReportsScreen filters={reportFilters} projects={projects} report={report} tasks={allTasks} setFilters={setReportFilters} onSubmit={() => void runAction(async () => loadReport(reportFilters), 'Report diperbarui.')} />}
      </main>

      {activeTimer && <div className="global-timer">
        <span className="pulse" aria-hidden="true" />
        <div className="global-copy"><strong>{activeTimer.task.title}</strong><small>{activeTimer.task.project.name} / {revisionLabel(activeTimer.revisionNumber)}</small></div>
        <span className="global-value">{formatDuration(activeSeconds, true)}</span>
        <button className="btn btn-acid" onClick={() => void stopTimer()}>Stop</button>
      </div>}
      <div className={`toast ${toast ? 'show' : ''}`} role="status" aria-live="polite">{toast}</div>
      {modal && <ModalView modal={modal} close={() => setModal(null)} projects={projects} submit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (modal.type === 'project') {
          const payload = { name: String(form.get('name')), type: form.get('type') as ProjectType, description: String(form.get('description') || '') };
          await runAction(async () => {
            const project = modal.project ? await api.updateProject(modal.project.id, payload) : await api.createProject(payload);
            await refreshProject((project as Project).id);
            setScreen('project-detail');
          }, modal.project ? 'Project diperbarui.' : 'Project dibuat sebagai ACTIVE.');
        }
        if (modal.type === 'task' && selectedProject) {
          const payload = { title: String(form.get('title')), description: String(form.get('description') || '') };
          await runAction(async () => {
            const task = modal.task ? await api.updateTask(modal.task.id, payload) : await api.createTask(selectedProject.id, payload);
            await refreshTask((task as Task).id);
            await refreshProject(selectedProject.id);
            setScreen('task-detail');
          }, modal.task ? 'Task diperbarui.' : 'Task dibuat sebagai TO_DO.');
        }
        if (modal.type === 'manualEntry') {
          const startedAt = String(form.get('startedAt') || '');
          const endedAt = String(form.get('endedAt') || '');
          const revisionNumber = String(form.get('revisionNumber') || '');
          await runAction(async () => {
            await api.createManualTimeEntry(modal.task.id, {
              startedAt: new Date(startedAt).toISOString(),
              endedAt: new Date(endedAt).toISOString(),
              revisionNumber: revisionNumber === '' ? undefined : Number(revisionNumber),
              description: String(form.get('description') || ''),
            });
            await refreshTask(modal.task.id);
          }, 'Manual time entry tersimpan.');
        }
        if (modal.type === 'reopen') {
          await runAction(async () => { await api.reopenTask(modal.task.id, String(form.get('note') || '')); await refreshTask(modal.task.id); }, `${modal.task.title} dibuka untuk revision baru.`);
        }
        setModal(null);
      }} action={async (kind) => {
        if (kind === 'archiveProject' && modal.type === 'archiveProject') await runAction(async () => { await api.updateProject(modal.project.id, { status: 'ARCHIVED' }); setScreen('projects'); }, 'Project diarsipkan.');
        if (kind === 'archiveTask' && modal.type === 'archiveTask') await runAction(async () => { await api.updateTask(modal.task.id, { archived: true }); if (modal.task.projectId) await refreshProject(modal.task.projectId); setScreen('project-detail'); }, 'Task diarsipkan.');
        if (kind === 'switchTimer' && modal.type === 'switchTimer') await runAction(async () => { await api.stopTimer(); await api.startTimer(modal.nextTask.id); await refreshTask(modal.nextTask.id); setScreen('task-detail'); }, 'Timer dipindahkan ke task berikutnya.');
        setModal(null);
      }} />}
    </div>
  );
}

function NavButton({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}><span className="nav-icon">{icon}</span><span>{label}</span></button>;
}

function DashboardScreen({ activeProjects, activeSeconds, activeTimer, dashboard, onNewTask, onOpenProject, onOpenTask, onStopTimer, projects, setScreen }: { activeProjects: Project[]; activeSeconds: number; activeTimer: DashboardReport['activeTimer']; dashboard: DashboardReport | null; onNewTask: () => void; onOpenProject: (project: Project) => void; onOpenTask: (task: Task) => void; onStopTimer: () => Promise<void>; projects: Project[]; setScreen: (screen: Screen) => void }) {
  const openTasks = projects.flatMap((project) => project.tasks || []).filter((task) => !task.archivedAt && task.status !== 'DONE').length;
  return <section className="screen">
    <div className="screen-intro"><div><h1>Make the work<br />visible.</h1></div><div className="button-row"><button className="btn btn-outline" onClick={() => setScreen('reports')}>View reports -&gt;</button><button className="btn btn-primary" onClick={onNewTask}>+ New task</button></div></div>
    <div className="grid stats-grid"><Stat color="lime" label="Today" value={formatDuration(dashboard?.todayTotalSeconds || 0)} foot="completed sessions" /><Stat color="blue" label="Active projects" value={String(activeProjects.length).padStart(2, '0')} foot="available for new work" /><Stat color="cream" label="Open tasks" value={String(openTasks).padStart(2, '0')} foot="to do, progress, review" /></div>
    <div className="grid dashboard-grid single" style={{ marginTop: 16 }}><article className="timer-card"><div className="timer-context"><span className="revision-badge">{activeTimer ? revisionLabel(activeTimer.revisionNumber) : 'No active entry'}</span></div><h2 className="timer-task-name">{activeTimer ? activeTimer.task.title : 'Choose a task.'}</h2><div className="timer-project">{activeTimer ? `${activeTimer.task.project.name} / active task` : 'Timer tersedia pada task TO_DO atau IN_PROGRESS.'}</div><div className="timer-value">{formatDuration(activeSeconds, true)}</div><div className="button-row">{activeTimer ? <><button className="btn btn-primary" onClick={() => void onStopTimer()}>Stop &amp; save session</button><button className="btn btn-outline" onClick={() => onOpenTask(activeTimer.task)}>Open task</button></> : <button className="btn btn-primary" onClick={() => setScreen('projects')}>Browse tasks</button>}</div></article></div>
    <div className="dashboard-projects"><div className="section-heading"><div><p className="eyebrow">Active portfolio</p><h2>Projects in motion</h2></div><button className="btn btn-quiet btn-sm" onClick={() => setScreen('projects')}>All projects -&gt;</button></div><div className="grid project-grid">{activeProjects.length ? activeProjects.map((project) => <button className="project-card" key={project.id} onClick={() => onOpenProject(project)}><div className="card-heading" style={{ justifyContent: 'space-between' }}><TypeBadge type={project.type} /><span className="soft-badge">{project._count?.tasks ?? project.tasks?.length ?? 0} tasks</span></div><h3>{project.name}</h3><p>{project.description || 'No description yet.'}</p><strong className="project-total">{formatDuration(dashboard?.projectTotals.find((item) => item.projectId === project.id)?.totalSeconds || 0)} <small>tracked</small></strong></button>) : <div className="card pad">Belum ada active project. Buat project pertama untuk mulai tracking.</div>}</div></div>
    <RecentEntries entries={dashboard?.recentEntries || []} />
  </section>;
}

function ProjectsScreen({ activeCount, filteredProjects, projectFilter, projectSearch, setModal, setProjectFilter, setProjectSearch, onOpenProject }: { activeCount: number; filteredProjects: Project[]; projectFilter: ProjectStatus; projectSearch: string; setModal: (modal: Modal) => void; setProjectFilter: (status: ProjectStatus) => void; setProjectSearch: (query: string) => void; onOpenProject: (project: Project) => void }) {
  return <section className="screen"><div className="screen-intro"><div><h1>Projects, without<br />the noise.</h1></div><div className="button-row"><button className="btn btn-primary" onClick={() => setModal({ type: 'project' })}>+ New project</button></div></div><div className="filter-tabs">{(['ACTIVE', 'COMPLETED', 'ARCHIVED'] as ProjectStatus[]).map((status) => <button className={`filter-tab ${projectFilter === status ? 'active' : ''}`} key={status} onClick={() => setProjectFilter(status)}>{projectStatusMeta[status].label} {status === 'ACTIVE' ? activeCount : ''}</button>)}</div><div className="project-toolbar"><input className="search-box" value={projectSearch} onChange={(event) => setProjectSearch(event.target.value)} placeholder="Search project..." /></div><div className="card project-list-card">{filteredProjects.length ? filteredProjects.map((project) => <div className="project-list-row" key={project.id}><button className="project-list-title text-link" onClick={() => onOpenProject(project)}><strong>{project.name}</strong><small>{project.description || 'No description yet.'}</small></button><div className="project-list-stat hide-tablet"><strong>{project._count?.tasks ?? project.tasks?.length ?? 0}</strong>tasks</div><div className="project-list-stat hide-tablet"><strong>{formatDate(project.createdAt)}</strong>created</div><StatusBadge status={project.status} /><button className="btn btn-outline btn-sm" onClick={() => onOpenProject(project)}>Open</button></div>) : <div className="empty-state">Tidak ada project yang cocok dengan filter ini.</div>}</div></section>;
}

function ProjectDetailScreen({ activeTimer, filteredTasks, project, taskFilter, setModal, setScreen, setTaskFilter, onArchive, onComplete, onOpenTask, onStartTimer, onStopTimer }: { activeTimer: DashboardReport['activeTimer']; filteredTasks: Task[]; project: Project; taskFilter: TaskStatus | 'ALL'; setModal: (modal: Modal) => void; setScreen: (screen: Screen) => void; setTaskFilter: (status: TaskStatus | 'ALL') => void; onArchive: () => void; onComplete: () => void; onOpenTask: (task: Task) => void; onStartTimer: (task: Task) => void; onStopTimer: () => Promise<void> }) {
  const tasks = (project.tasks || []).filter((task) => !task.archivedAt);
  const done = tasks.filter((task) => task.status === 'DONE').length;
  const totalSeconds = tasks.flatMap((task) => task.timeEntries || []).reduce((total, entry) => total + (entry.durationSeconds || 0), 0);
  return <section className="screen"><div className="breadcrumb"><button onClick={() => setScreen('projects')}>Projects</button><span>/</span><span className="current">{project.name}</span></div><div className="detail-header"><div><div className="meta-line" style={{ gap: 7, marginBottom: 12 }}><TypeBadge type={project.type} /><StatusBadge status={project.status} /></div><h1>{project.name}</h1><p>{project.description || 'No description yet.'}</p></div><div className="detail-actions"><button className="btn btn-outline" onClick={() => setModal({ type: 'project', project })}>Edit project</button><button className="btn btn-quiet" disabled={project.status === 'ARCHIVED'} onClick={onArchive}>Archive</button>{project.status === 'ACTIVE' && <button className="btn btn-acid" onClick={onComplete}>Complete project</button>}<button className="btn btn-primary" disabled={project.status === 'ARCHIVED'} onClick={() => setModal({ type: 'task' })}>+ New task</button></div></div><div className="project-summary"><Summary accent label="Tracked time" value={formatDuration(totalSeconds)} foot="completed sessions" /><Summary label="Tasks" value={String(tasks.length)} foot={`${done} done`} /><Summary label="Created" value={formatDate(project.createdAt)} foot="owner workspace" /><Summary label="Gate" value={`${done}/${tasks.length || 0} ready`} foot={done === tasks.length && tasks.length ? 'can complete' : 'finish all tasks'} /></div><div className="card task-list-card"><div className="task-list-head"><div><p className="eyebrow" style={{ marginBottom: 4 }}>Project task board</p><h2 style={{ margin: 0, fontSize: '1rem' }}>Tasks in this project</h2></div><select className="search-box" style={{ width: 'auto', minWidth: 126 }} value={taskFilter} onChange={(event) => setTaskFilter(event.target.value as TaskStatus | 'ALL')}><option value="ALL">All statuses</option><option value="TO_DO">To do</option><option value="IN_PROGRESS">In progress</option><option value="IN_REVIEW">In review</option><option value="DONE">Done</option></select></div>{filteredTasks.length ? filteredTasks.map((task) => <TaskRow active={activeTimer?.taskId === task.id} key={task.id} task={task} onOpen={() => onOpenTask(task)} onStart={() => onStartTimer(task)} onStop={onStopTimer} />) : <div className="empty-state">Belum ada task pada status ini.</div>}</div></section>;
}

function TaskDetailScreen({ activeSeconds, activeTimer, setModal, task, onBack, onComplete, onReview, onStart, onStop }: { activeSeconds: number; activeTimer: DashboardReport['activeTimer']; setModal: (modal: Modal) => void; task: Task; onBack: () => void; onComplete: () => void; onReview: () => void; onStart: () => void; onStop: () => Promise<void> }) {
  const active = activeTimer?.taskId === task.id;
  const entries = task.timeEntries || [];
  return <section className="screen"><div className="breadcrumb"><button onClick={onBack}>Projects</button><span>/</span><button onClick={onBack}>{task.project?.name || 'Project'}</button><span>/</span><span className="current">{task.title}</span></div><div className="detail-header"><div><p className="eyebrow">Task detail / persistent history</p><h1>{task.title}</h1><p>{task.description || 'All sessions stay attached to this task, including revision work.'}</p></div><div className="detail-actions"><button className="btn btn-outline" onClick={() => setModal({ type: 'manualEntry', task })}>Add manual entry</button><button className="btn btn-outline" onClick={() => setModal({ type: 'task', task })}>Edit task</button><button className="btn btn-quiet" onClick={() => setModal({ type: 'archiveTask', task })}>Archive task</button></div></div><div className="grid two-column task-detail-grid"><div className="task-main-column"><article className="task-hero"><div className="timer-context"><div className="meta-line" style={{ gap: 7 }}><TaskStatusBadge status={task.status} /><span className="revision-badge">{revisionLabel(task.currentRevision)}</span></div><span className="timer-inline">{active && <span className="pulse" />} {active ? `Live ${formatDuration(activeSeconds, true)}` : `${formatDuration(entries.reduce((total, entry) => total + (entry.durationSeconds || 0), 0))} recorded`}</span></div><h2>{task.title}</h2><p>{task.description || 'No description yet.'}</p><div className="button-row">{active ? <button className="btn btn-primary" onClick={() => void onStop()}>Stop &amp; save session</button> : canStart(task) && <button className="btn btn-primary" onClick={onStart}>Start timer</button>}{task.status === 'IN_PROGRESS' && !active && <button className="btn btn-outline" onClick={onReview}>Submit for review</button>}{task.status === 'IN_REVIEW' && <button className="btn btn-acid" onClick={onComplete}>Mark done</button>}{(task.status === 'IN_REVIEW' || task.status === 'DONE') && <button className="btn btn-outline" onClick={() => setModal({ type: 'reopen', task })}>Reopen task</button>}</div></article><article className="card history-card"><div className="card-heading" style={{ justifyContent: 'space-between' }}><div><p className="eyebrow">Recorded work</p><h2>Time entries</h2></div><span className="muted">{entries.length + (active ? 1 : 0)} sessions</span></div><div className="entry-list" style={{ marginTop: 16 }}>{active && <div className="entry-row"><span className="entry-line" style={{ background: 'var(--coral)' }} /><div><strong>Current session <span className="soft-badge">active</span></strong><small>Started {formatDateTime(activeTimer.startedAt)} / not finalized until Stop</small></div><span className="entry-duration">{formatDuration(activeSeconds, true)}</span></div>}{entries.length ? entries.map((entry) => <EntryRow entry={entry} key={entry.id} />) : !active && <div className="empty-state">Belum ada sesi tersimpan.</div>}</div></article></div><div className="task-side-column"><article className="card history-card"><div className="card-heading" style={{ justifyContent: 'space-between' }}><div><p className="eyebrow">Audit trail</p><h2>Task activity</h2></div><span className="muted">append-only</span></div><div className="timeline" style={{ marginTop: 16 }}>{(task.activities || []).length ? task.activities!.map((activity, index) => <ActivityRow activity={activity} first={index === 0} key={activity.id} />) : <div className="empty-state">Belum ada activity.</div>}</div></article><article className="card history-card"><p className="eyebrow">State rules</p><h2 style={{ margin: '0 0 12px', fontSize: '.98rem' }}>What can happen next?</h2><p className="small-note">{nextRule(task, active)}</p><div className="mini-flow" style={{ marginTop: 17 }}><span>TO_DO</span><i>-&gt;</i><span>WORK</span><i>-&gt;</i><span>REVIEW</span><i>-&gt;</i><span>DONE</span></div></article></div></div></section>;
}

function ReportsScreen({ filters, projects, report, tasks, setFilters, onSubmit }: { filters: { startDate: string; endDate: string; projectId: string; taskId: string; revisionNumber: string }; projects: Project[]; report: TimeReport | null; tasks: Task[]; setFilters: (filters: { startDate: string; endDate: string; projectId: string; taskId: string; revisionNumber: string }) => void; onSubmit: () => void }) {
  const maxDay = Math.max(1, ...(report?.byDay.map((item) => item.totalSeconds) || [1]));
  const maxProject = Math.max(1, ...(report?.byProject.map((item) => item.totalSeconds) || [1]));
  return <section className="screen"><div className="screen-intro"><div><h1>See where the<br />hours went.</h1></div></div><form className="report-filters" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}><Field label="Start date"><input type="date" value={filters.startDate} onChange={(event) => setFilters({ ...filters, startDate: event.target.value })} /></Field><Field label="End date"><input type="date" value={filters.endDate} onChange={(event) => setFilters({ ...filters, endDate: event.target.value })} /></Field><Field label="Project" wide><select value={filters.projectId} onChange={(event) => setFilters({ ...filters, projectId: event.target.value, taskId: '' })}><option value="">All projects</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select></Field><Field label="Task" wide><select value={filters.taskId} onChange={(event) => setFilters({ ...filters, taskId: event.target.value })}><option value="">All tasks</option>{tasks.filter((task) => !filters.projectId || task.projectId === filters.projectId).map((task) => <option value={task.id} key={task.id}>{task.title}</option>)}</select></Field><Field label="Revision"><select value={filters.revisionNumber} onChange={(event) => setFilters({ ...filters, revisionNumber: event.target.value })}><option value="">All revisions</option><option value="0">Initial</option><option value="1">Revision 1</option><option value="2">Revision 2</option><option value="3">Revision 3</option></select></Field><button className="btn btn-primary" type="submit">Apply filters</button></form><div className="grid stats-grid" style={{ marginBottom: 18 }}><Stat color="lime" label="Range total" value={formatDuration(report?.totalSeconds || 0)} foot={`${filters.startDate} to ${filters.endDate}`} /><Stat color="blue" label="Top project" value={report?.byProject[0]?.projectName || '-'} foot={report?.byProject[0] ? `${formatDuration(report.byProject[0].totalSeconds)} recorded` : 'no completed entry'} /><Stat color="cream" label="Revision time" value={formatDuration((report?.byRevision || []).filter((item) => item.revisionNumber > 0).reduce((total, item) => total + item.totalSeconds, 0))} foot="across reopen cycles" /></div><div className="grid two-column"><article className="card report-chart"><div className="card-heading" style={{ justifyContent: 'space-between' }}><div><h2>Daily rhythm</h2></div></div>{report?.byDay.length ? report.byDay.map((day) => <div className="chart-row" key={day.date}><span className="chart-label">{day.date.slice(5)}</span><div className="chart-track"><span className="chart-bar" style={{ width: `${Math.round((day.totalSeconds / maxDay) * 100)}%` }} /></div><span className="chart-value">{formatDuration(day.totalSeconds)}</span></div>) : <div className="empty-state">Belum ada entry dalam range ini.</div>}</article><article className="card report-chart"><div className="card-heading" style={{ justifyContent: 'space-between' }}><div><h2>Where effort lands</h2></div></div><div className="breakdown-list">{report?.byProject.length ? report.byProject.map((project) => <div className="breakdown-item" key={project.projectId}><strong>{project.projectName}</strong><div className="breakdown-track"><span style={{ width: `${Math.round((project.totalSeconds / maxProject) * 100)}%` }} /></div><small>{formatDuration(project.totalSeconds)}</small></div>) : <div className="empty-state">No project time yet.</div>}</div></article></div><article className="card recent-card"><div className="section-heading" style={{ padding: '18px 20px 0' }}><div><h2>Grouped by revision</h2></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Task</th><th>Revision</th><th>Total</th></tr></thead><tbody>{report?.byRevision.length ? report.byRevision.map((item) => <tr key={`${item.taskId}-${item.revisionNumber}`}><td className="entry-title">{item.taskTitle}</td><td><span className="revision-badge">{item.label}</span></td><td><strong>{formatDuration(item.totalSeconds)}</strong></td></tr>) : <tr><td colSpan={3}><div className="empty-state">Belum ada revision time.</div></td></tr>}</tbody></table></div></article></section>;
}

function ModalView({ action, close, modal, projects, submit }: { action: (kind: string) => Promise<void>; close: () => void; modal: Exclude<Modal, null>; projects: Project[]; submit: (event: FormEvent<HTMLFormElement>) => Promise<void> }) {
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}><div className="modal">{modal.type === 'project' && <><ModalHeader title={modal.project ? 'Edit project' : 'Create a project'} close={close}>Pilih Project untuk pekerjaan besar atau Request untuk pekerjaan kecil/ad-hoc.</ModalHeader><form className="modal-form" onSubmit={(event) => void submit(event)}><Field label="Name"><input name="name" required minLength={1} defaultValue={modal.project?.name || ''} placeholder="Contoh: Website Client C" /></Field><Field label="Type"><select name="type" defaultValue={modal.project?.type || 'PROJECT'}><option value="PROJECT">Project</option><option value="REQUEST">Request</option></select></Field><Field label="Description"><textarea name="description" defaultValue={modal.project?.description || ''} placeholder="Tujuan singkat atau konteks pekerjaan" /></Field><ModalActions close={close} submitLabel={modal.project ? 'Save changes' : 'Create project'} /></form></>}{modal.type === 'task' && <><ModalHeader title={modal.task ? 'Edit task' : 'Create a task'} close={close}>Task baru akan dibuat sebagai TO_DO pada project aktif.</ModalHeader><form className="modal-form" onSubmit={(event) => void submit(event)}><Field label="Title"><input name="title" required minLength={1} defaultValue={modal.task?.title || ''} placeholder="Contoh: Review mobile layout" /></Field><Field label="Description"><textarea name="description" defaultValue={modal.task?.description || ''} placeholder="Definisi pekerjaan atau catatan singkat" /></Field><ModalActions close={close} submitLabel={modal.task ? 'Save changes' : 'Create task'} /></form></>}{modal.type === 'manualEntry' && <><ModalHeader title="Add manual entry" close={close}>Catat sesi lama dengan tanggal dan jam custom.</ModalHeader><form className="modal-form" onSubmit={(event) => void submit(event)}><Field label="Started at"><input name="startedAt" type="datetime-local" required /></Field><Field label="Ended at"><input name="endedAt" type="datetime-local" required /></Field><Field label="Revision"><select name="revisionNumber" defaultValue={modal.task.currentRevision}>{Array.from({ length: modal.task.currentRevision + 1 }, (_, revision) => <option value={revision} key={revision}>{revisionLabel(revision)}</option>)}</select></Field><Field label="Description"><textarea name="description" placeholder="Contoh: Migrasi catatan waktu lama" /></Field><ModalActions close={close} submitLabel="Save entry" /></form></>}{modal.type === 'reopen' && <><ModalHeader title="Open a new cycle" close={close}>Histori lama tidak diubah. Revision berikutnya menjadi {revisionLabel(modal.task.currentRevision + 1)}.</ModalHeader><form className="modal-form" onSubmit={(event) => void submit(event)}><div className="modal-callout"><strong>{modal.task.title}</strong><br />State: {statusMeta[modal.task.status].label} -&gt; In progress</div><Field label="Revision note"><textarea name="note" placeholder="Contoh: Perlu revisi CTA pada mobile breakpoint" /></Field><ModalActions close={close} submitLabel="Reopen task" /></form></>}{modal.type === 'archiveProject' && <ConfirmModal close={close} title="Archive project?" description="Data tetap ada untuk histori. Project tidak bisa menerima task atau timer baru." actionLabel="Archive project" onAction={() => action('archiveProject')} />}{modal.type === 'archiveTask' && <ConfirmModal close={close} title="Archive task?" description="Time Entry dan activity tetap tersimpan, tetapi task tidak menerima timer baru." actionLabel="Archive task" onAction={() => action('archiveTask')} />}{modal.type === 'blockedProject' && <><ModalHeader title="Project belum siap" close={close}>Semua task aktif harus DONE sebelum project bisa diselesaikan.</ModalHeader><div className="modal-callout"><strong>{modal.project.name}</strong><br />{modal.unfinished.length} task masih belum Done.</div><div className="entry-list" style={{ marginTop: 14 }}>{modal.unfinished.map((task) => <div className="entry-row" key={task.id}><span className="entry-line" style={{ background: 'var(--yellow)' }} /><div><strong>{task.title}</strong><small>{statusMeta[task.status].label}</small></div><span className="revision-badge">{revisionLabel(task.currentRevision)}</span></div>)}</div><div className="modal-actions"><button className="btn btn-primary" onClick={close}>Back to tasks</button></div></>}{modal.type === 'switchTimer' && <><ModalHeader title="Switch the work slot?" close={close}>Timer yang sedang berjalan akan disimpan sebelum timer baru dimulai.</ModalHeader><div className="modal-callout">Next: <strong>{modal.nextTask.title}</strong><br />{projects.find((project) => project.id === modal.nextTask.projectId)?.name || 'Selected project'} / {revisionLabel(modal.nextTask.currentRevision)}</div><div className="modal-actions"><button className="btn btn-quiet" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={() => void action('switchTimer')}>Stop &amp; start next</button></div></>}</div></div>;
}

function RecentEntries({ entries }: { entries: DashboardReport['recentEntries'] }) {
  return <div className="card recent-card"><div className="section-heading" style={{ padding: '18px 20px 0' }}><div><h2>Recent time entries</h2></div></div><div className="table-wrap"><table className="data-table"><thead><tr><th>Task</th><th>Project</th><th>Revision</th><th>When</th><th>Duration</th></tr></thead><tbody>{entries.length ? entries.map((entry) => <tr key={entry.id}><td><span className="entry-title">{entry.task.title}</span></td><td className="muted">{entry.task.project.name}</td><td><span className="revision-badge">{revisionLabel(entry.revisionNumber)}</span></td><td className="muted">{formatDateTime(entry.startedAt)}</td><td><strong>{formatDuration(entry.durationSeconds || 0)}</strong></td></tr>) : <tr><td colSpan={5}><div className="empty-state">Belum ada completed time entry.</div></td></tr>}</tbody></table></div></div>;
}

function TaskRow({ active, onOpen, onStart, onStop, task }: { active: boolean; onOpen: () => void; onStart: () => void; onStop: () => Promise<void>; task: Task }) {
  const seconds = (task.timeEntries || []).reduce((total, entry) => total + (entry.durationSeconds || 0), 0);
  return <div className="task-row"><button className="task-main text-link" onClick={onOpen}><span className={`task-status-mark ${statusMeta[task.status].className}`} /><span className="task-title"><strong>{task.title}</strong><small>{task.description || 'No description yet.'}</small></span></button><div className="task-actions"><span className="task-time">{formatDuration(seconds)}</span><TaskStatusBadge status={task.status} />{active ? <button className="btn btn-acid btn-sm" onClick={() => void onStop()}>Stop</button> : canStart(task) ? <button className="btn btn-primary btn-sm" onClick={onStart}>Start</button> : <button className="btn btn-outline btn-sm" onClick={onOpen}>Review</button>}</div></div>;
}

function EntryRow({ entry }: { entry: TimeEntry }) {
  return <div className="entry-row"><span className={`entry-line ${entry.revisionNumber > 0 ? 'revision' : ''}`} /><div><strong>{formatDateTime(entry.startedAt)} - {formatDateTime(entry.endedAt)}</strong><small><span className="revision-badge">{revisionLabel(entry.revisionNumber)}</span> completed Time Entry</small></div><span className="entry-duration">{formatDuration(entry.durationSeconds || 0, true)}</span></div>;
}

function ActivityRow({ activity, first }: { activity: TaskActivity; first: boolean }) {
  const label = activity.type === 'REOPENED' ? `Reopened for ${revisionLabel(activity.revisionNumber || 0)}` : activity.type === 'TASK_CREATED' ? 'Task created' : activity.toStatus ? `Moved to ${statusMeta[activity.toStatus].label}` : activity.type;
  return <div className="timeline-item"><span className={`timeline-dot ${first ? 'lime' : ''}`} /><div className="timeline-content"><strong>{label}</strong><small>{activity.note || 'No note'} / {formatDateTime(activity.createdAt)}</small></div></div>;
}

function Stat({ color, foot, label, value }: { color: string; foot: string; label: string; value: string }) {
  return <article className={`card stat-card ${color}`}><span className="stat-label">{label}</span><strong className="stat-value">{value}</strong><span className="stat-foot">{foot}</span></article>;
}

function Summary({ accent, foot, label, value }: { accent?: boolean; foot: string; label: string; value: string }) {
  return <div className={`summary-tile ${accent ? 'accent' : ''}`}><span className="label">{label}</span><strong>{value}</strong><small>{foot}</small></div>;
}

function Field({ children, label, wide }: { children: React.ReactNode; label: string; wide?: boolean }) {
  return <div className={`field ${wide ? 'wide-mobile' : ''}`}><label>{label}</label>{children}</div>;
}

function ModalHeader({ children, close, title }: { children: React.ReactNode; close: () => void; title: string }) {
  return <div className="modal-header"><div><h2>{title}</h2><p>{children}</p></div><button className="close-modal" onClick={close} aria-label="Tutup">x</button></div>;
}

function ModalActions({ close, submitLabel }: { close: () => void; submitLabel: string }) {
  return <div className="modal-actions"><button type="button" className="btn btn-quiet" onClick={close}>Cancel</button><button type="submit" className="btn btn-primary">{submitLabel}</button></div>;
}

function ConfirmModal({ actionLabel, close, description, onAction, title }: { actionLabel: string; close: () => void; description: string; onAction: () => Promise<void>; title: string }) {
  return <><ModalHeader close={close} title={title}>{description}</ModalHeader><div className="modal-callout">Hard delete tidak tersedia agar data historis tetap aman.</div><div className="modal-actions"><button className="btn btn-quiet" onClick={close}>Cancel</button><button className="btn btn-danger" onClick={() => void onAction()}>{actionLabel}</button></div></>;
}

function TypeBadge({ type }: { type: ProjectType }) {
  return <span className={`type-badge ${type === 'REQUEST' ? 'request' : ''}`}>{type}</span>;
}

function StatusBadge({ status }: { status: ProjectStatus }) {
  return <span className={`status-badge ${projectStatusMeta[status].className}`}>{projectStatusMeta[status].label}</span>;
}

function TaskStatusBadge({ status }: { status: TaskStatus }) {
  return <span className={`status-badge ${statusMeta[status].className}`}>{statusMeta[status].label}</span>;
}

function canStart(task: Task) {
  return !task.archivedAt && (task.status === 'TO_DO' || task.status === 'IN_PROGRESS');
}

function nextRule(task: Task, active: boolean) {
  if (active) return 'Stop menyimpan Time Entry. Status task tetap sama sampai kamu submit review.';
  if (task.status === 'TO_DO') return 'Start timer akan otomatis memindahkan task ke IN_PROGRESS.';
  if (task.status === 'IN_PROGRESS') return 'Submit for review untuk masuk ke IN_REVIEW setelah timer berhenti.';
  if (task.status === 'IN_REVIEW') return 'Mark done jika pekerjaan diterima, atau reopen bila perlu revision.';
  return 'Task selesai. Reopen akan membuat revision baru dan project completed kembali ACTIVE bila perlu.';
}

function uniqueTask(task: Task, index: number, tasks: Task[]) {
  return tasks.findIndex((item) => item.id === task.id) === index;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}
