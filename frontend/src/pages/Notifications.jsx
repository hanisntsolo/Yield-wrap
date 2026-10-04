import { useState } from 'react';
import { useNotifications } from '../context/NotificationContext';
import { NotificationItem } from '../components/NotificationBell';
import SectionCard from '../components/common/SectionCard';
import SegmentedControl from '../components/common/SegmentedControl';
import EmptyState from '../components/common/EmptyState';
import { SkeletonRows } from '../components/common/Skeleton';
import Icon from '../components/common/Icon';

export default function Notifications() {
  const { notifications, unreadCount, loading, refresh, markRead, markAllRead } = useNotifications();
  const [filter, setFilter] = useState('all');
  const list = filter === 'unread' ? notifications.filter((n) => !n.read) : notifications;

  return (
    <div className="container-page max-w-3xl py-5 sm:py-8">
      <h1 className="mb-6 text-2xl font-extrabold sm:text-3xl">Notifications</h1>
      <SectionCard
        title="Inbox"
        subtitle={`${unreadCount} unread`}
        icon="bell"
        actions={
          <>
            <SegmentedControl
              size="sm"
              ariaLabel="Filter notifications"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All' },
                { value: 'unread', label: 'Unread' },
              ]}
            />
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh} aria-label="Refresh">
              <Icon name="refresh" size={14} />
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={markAllRead} disabled={!unreadCount}>
              <Icon name="check-all" size={14} /> Mark all read
            </button>
          </>
        }
      >
        {loading && !notifications.length ? (
          <SkeletonRows rows={5} />
        ) : list.length ? (
          <ul className="divide-y divide-slate-100">
            {list.map((n) => (
              <li key={n.id}>
                <NotificationItem n={n} onRead={markRead} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="bell" title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'} description="Updates about donations, matches and deliveries appear here." />
        )}
      </SectionCard>
    </div>
  );
}
