import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import DashboardShell from '../components/common/DashboardShell';
import SectionCard from '../components/common/SectionCard';
import Switch from '../components/common/Switch';
import Icon from '../components/common/Icon';
import EmptyState from '../components/common/EmptyState';
import ErrorState from '../components/common/ErrorState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { SkeletonCard } from '../components/common/Skeleton';
import TaskCard from '../components/volunteer/TaskCard';
import ActiveTask from '../components/volunteer/ActiveTask';
import Leaderboard from '../components/volunteer/Leaderboard';
import MyStats from '../components/volunteer/MyStats';
import VolunteerHistory from '../components/volunteer/VolunteerHistory';
import useFetch from '../hooks/useFetch';
import useLocationSharing from '../hooks/useLocationSharing';
import { asList, errorMessage, volunteerApi } from '../services/api';
import { ACTIVE_TASK_STAGES, POLL, VEHICLE_LABELS } from '../utils/constants';
import { summarizeItems } from '../utils/formatters';

export default function VolunteerDashboard() {
  const { user, profile: authProfile } = useAuth();
  const profileQ = useFetch(() => volunteerApi.profile(), [], { pollMs: 60000 });
  const tasksQ = useFetch(() => volunteerApi.tasks(), [], { pollMs: POLL.volunteerTasks });
  const leaderboardQ = useFetch(() => volunteerApi.leaderboard(), [], { pollMs: 120000 });
  const historyQ = useFetch(() => volunteerApi.history(), []);
  const [toggling, setToggling] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [declining, setDeclining] = useState(null);

  const profile = profileQ.data || authProfile || {};
  const available = Boolean(profile?.availability);
  const tasks = useMemo(() => asList(tasksQ.data, 'tasks'), [tasksQ.data]);
  const active = tasks.find((t) => ACTIVE_TASK_STAGES.includes(t.task_stage)) || null;
  const offered = tasks.filter((t) => t.task_stage === 'assigned');
  const leaderboard = asList(leaderboardQ.data, 'leaderboard');
  const me = leaderboard.find((r) => String(r.volunteer_id) === String(profile?.id));

  const sharing = useLocationSharing(profile?.id, { enabled: Boolean(active) && available });
  const myPosition = sharing.position || profile?.current_location || null;

  const toggleAvailability = async (next) => {
    setToggling(true);
    try {
      const updated = await volunteerApi.setAvailability(next);
      profileQ.setData(updated && typeof updated === 'object' ? updated : { ...profile, availability: next });
      toast.success(next ? 'You are available for pickups' : 'You are offline — no new tasks will be assigned');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update availability'));
    } finally {
      setToggling(false);
    }
  };

  const accept = async (t) => {
    setBusyId(t.id);
    try {
      await volunteerApi.acceptTask(t.id);
      toast.success('Task accepted — route is ready');
      tasksQ.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not accept this task'));
      tasksQ.reload();
    } finally {
      setBusyId(null);
    }
  };

  const confirmDecline = async () => {
    try {
      await volunteerApi.declineTask(declining.id);
      toast.success('Task declined — it will be offered to someone else');
      tasksQ.reload();
    } catch (err) {
      toast.error(errorMessage(err, 'Could not decline this task'));
      throw err;
    }
  };

  const onActiveUpdated = (updated, opts = {}) => {
    tasksQ.reload();
    if (opts.delivered || updated?.status === 'delivered') {
      profileQ.reload();
      historyQ.reload();
      leaderboardQ.reload();
    }
  };

  const firstName = (user?.name || '').split(' ')[0] || 'there';

  return (
    <DashboardShell
      page="volunteer_dashboard"
      title={`Hi, ${firstName}`}
      subtitle={`${VEHICLE_LABELS[profile?.vehicle_type] || 'Volunteer'} · Pick up surplus and deliver it where it matters most.`}
      sidebarAd
      actions={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { tasksQ.reload(); profileQ.reload(); }}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      }
      sidebar={
        <>
          <div className={`card card-pad ${available ? 'ring-2 ring-primary/30' : ''}`}>
            <Switch
              checked={available}
              onChange={toggleAvailability}
              busy={toggling}
              disabled={profileQ.loading && !profileQ.data}
              label={available ? 'Available for pickups' : 'Offline'}
              description={available ? 'New tasks near you will be assigned automatically.' : 'Turn on to start receiving tasks.'}
            />
            {active && !available ? (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-[#B9770E]">
                <Icon name="info" size={13} className="mt-0.5" /> Location sharing is paused while you are offline.
              </p>
            ) : null}
          </div>
          <SectionCard title="Leaderboard" subtitle="Deliveries this month" icon="trophy">
            <Leaderboard rows={leaderboard} loading={leaderboardQ.loading} error={leaderboardQ.error} onRetry={leaderboardQ.reload} selfId={profile?.id} limit={8} />
          </SectionCard>
        </>
      }
    >
      <MyStats profile={profile} loading={profileQ.loading && !profileQ.data && !authProfile} monthDeliveries={me?.deliveries_this_month} />

      {tasksQ.loading ? (
        <SkeletonCard lines={6} />
      ) : tasksQ.error && !tasks.length ? (
        <div className="card">
          <ErrorState error={tasksQ.error} onRetry={tasksQ.reload} />
        </div>
      ) : active ? (
        <SectionCard id="active-task" title="Active delivery" subtitle={summarizeItems(active.food_items)} icon="navigation" bodyClassName="card-pad">
          <ActiveTask task={active} vehicleType={profile?.vehicle_type} myPosition={myPosition} onUpdated={onActiveUpdated} sharing={available ? sharing : null} />
        </SectionCard>
      ) : null}

      <SectionCard id="task-queue" title="Task queue" subtitle="Highest priority first" icon="inbox">
        <div className="p-4 sm:p-6">
          {tasksQ.loading ? (
            <div className="grid gap-4 md:grid-cols-2">
              <SkeletonCard lines={4} />
              <SkeletonCard lines={4} />
            </div>
          ) : offered.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {offered.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  myLocation={myPosition}
                  onAccept={accept}
                  onDecline={setDeclining}
                  busy={busyId === t.id}
                  disabled={Boolean(active)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon="truck"
              title={available ? 'No tasks right now' : 'You are offline'}
              description={available ? 'We will notify you as soon as a pickup near you needs a volunteer.' : 'Switch availability on to receive pickup tasks.'}
              compact
            />
          )}
        </div>
      </SectionCard>

      <SectionCard id="history" title="Delivery history" subtitle="Your completed deliveries" icon="calendar">
        <VolunteerHistory rows={asList(historyQ.data, 'donations')} loading={historyQ.loading} error={historyQ.error} onRetry={historyQ.reload} />
      </SectionCard>

      <ConfirmDialog
        open={Boolean(declining)}
        onClose={() => setDeclining(null)}
        onConfirm={confirmDecline}
        title="Decline this task?"
        confirmLabel="Decline task"
        message={
          <>
            <strong className="text-dark">{summarizeItems(declining?.food_items)}</strong> will be offered to another volunteer.
          </>
        }
      />
    </DashboardShell>
  );
}
