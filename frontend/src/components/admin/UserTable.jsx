import { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyState from '../common/EmptyState';
import ErrorState from '../common/ErrorState';
import Icon from '../common/Icon';
import SegmentedControl from '../common/SegmentedControl';
import Spinner from '../common/Spinner';
import { SkeletonRows } from '../common/Skeleton';
import CreditGrantModal from './CreditGrantModal';
import useDebounce from '../../hooks/useDebounce';
import useFetch from '../../hooks/useFetch';
import { adminApi, apiUrl, asList, errorMessage } from '../../services/api';
import { ROLE_LABELS } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';

const ROLE_FILTERS = [{ value: '', label: 'All' }, ...Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }))];

function UserBadges({ u }) {
  return (
    <span className="flex flex-wrap gap-1">
      {u.is_verified ? (
        <span className="badge bg-primary-light text-primary ring-primary/20">
          <Icon name="check" size={11} strokeWidth={3} /> Verified
        </span>
      ) : (
        <span className="badge bg-accent-light text-[#B9770E] ring-accent/30">Unverified</span>
      )}
      {u.is_suspended ? <span className="badge bg-critical-light text-critical ring-critical/30">Suspended</span> : null}
    </span>
  );
}

function Actions({ u, self, busy, onVerify, onSuspend, onDelete, onCredits }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onVerify(u)} disabled={busy}>
        {busy ? <Spinner size={12} /> : <Icon name={u.is_verified ? 'x-circle' : 'check-circle'} size={14} />}
        {u.is_verified ? 'Unverify' : 'Verify'}
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onSuspend(u)} disabled={busy || self}>
        <Icon name={u.is_suspended ? 'power' : 'ban'} size={14} /> {u.is_suspended ? 'Reinstate' : 'Suspend'}
      </button>
      {u.role !== 'volunteer' ? (
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onCredits(u)} disabled={busy} aria-label={`Adjust ad credits for ${u.name}`}>
          <Icon name="zap" size={14} /> Credits
        </button>
      ) : null}
      <button type="button" className="btn btn-ghost btn-sm text-critical hover:bg-critical-light" onClick={() => onDelete(u)} disabled={busy || self} aria-label={`Delete ${u.name}`}>
        <Icon name="trash" size={14} />
      </button>
    </div>
  );
}

function Detail({ u }) {
  const p = u.profile;
  if (u.role === 'ngo' && p) {
    return (
      <span className="block text-xs text-slate-500">
        {p.organization_name}
        {p.registration_number ? <span className="font-mono"> · {p.registration_number}</span> : null}
        {p.document_url ? (
          <a href={apiUrl(p.document_url)} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-0.5 font-semibold text-primary hover:underline">
            <Icon name="file" size={12} /> document
          </a>
        ) : (
          <span className="ml-1 text-[#B9770E]">· no document</span>
        )}
      </span>
    );
  }
  if (u.role === 'volunteer' && p) {
    return <span className="block font-mono text-xs text-slate-500">{p.completed_deliveries ?? 0} deliveries · {p.vehicle_type || '—'}</span>;
  }
  return null;
}

/** Admin user management: search, role filter, verify / suspend / delete. */
export default function UserTable() {
  const { user: me } = useAuth();
  const [role, setRole] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebounce(q.trim(), 400);
  const { data, loading, error, reload, setData } = useFetch(() => adminApi.users({ role, q: debouncedQ }), [role, debouncedQ]);
  const users = asList(data, 'users');
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null); // {type:'suspend'|'delete', user}
  const [creditUser, setCreditUser] = useState(null);

  const patch = (updated) => setData((list) => asList(list, 'users').map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));

  const verify = async (u) => {
    setBusyId(u.id);
    try {
      const updated = await adminApi.verifyUser(u.id, !u.is_verified);
      patch(updated?.id ? updated : { id: u.id, is_verified: !u.is_verified });
      toast.success(`${u.name} ${u.is_verified ? 'is no longer verified' : 'verified'}`);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update verification'));
    } finally {
      setBusyId(null);
    }
  };

  const runConfirm = async () => {
    const { type, user: u } = confirm;
    try {
      if (type === 'delete') {
        await adminApi.deleteUser(u.id);
        setData((list) => asList(list, 'users').filter((x) => x.id !== u.id));
        toast.success(`${u.name} deleted`);
      } else {
        const updated = await adminApi.suspendUser(u.id, !u.is_suspended);
        patch(updated?.id ? updated : { id: u.id, is_suspended: !u.is_suspended });
        toast.success(`${u.name} ${u.is_suspended ? 'reinstated' : 'suspended'}`);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'Action failed'));
      throw err;
    }
  };

  const actionProps = (u) => ({
    u,
    self: u.id === me?.id,
    busy: busyId === u.id,
    onVerify: verify,
    onSuspend: (x) => setConfirm({ type: 'suspend', user: x }),
    onDelete: (x) => setConfirm({ type: 'delete', user: x }),
    onCredits: setCreditUser,
  });

  const isDelete = confirm?.type === 'delete';
  const reinstating = confirm?.type === 'suspend' && confirm.user.is_suspended;

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <SegmentedControl size="sm" ariaLabel="Filter by role" options={ROLE_FILTERS} value={role} onChange={setRole} />
        <div className="relative sm:w-72">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" className="input py-2 pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={6} />
      ) : error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : !users.length ? (
        <EmptyState icon="users" title="No users found" description="Try a different role filter or search term." />
      ) : (
        <>
          <ul className="divide-y divide-slate-100 md:hidden">
            {users.map((u) => (
              <li key={u.id} className="space-y-2 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-dark">{u.name}</p>
                    <p className="truncate text-xs text-slate-500">{u.email}</p>
                    <Detail u={u} />
                  </div>
                  <span className="badge bg-slate-100 text-slate-600 ring-slate-200">{ROLE_LABELS[u.role] || u.role}</span>
                </div>
                <UserBadges u={u} />
                <Actions {...actionProps(u)} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="table-base">
              <thead className="bg-slate-50/80">
                <tr>
                  <th scope="col">User</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                  <th scope="col" className="text-right">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="max-w-[18rem]">
                      <p className="truncate font-semibold text-dark">{u.name}</p>
                      <p className="truncate text-xs text-slate-500">{u.email}</p>
                      <Detail u={u} />
                    </td>
                    <td>{ROLE_LABELS[u.role] || u.role}</td>
                    <td>
                      <UserBadges u={u} />
                    </td>
                    <td className="whitespace-nowrap text-xs">{formatDate(u.created_at, { year: 'numeric' })}</td>
                    <td>
                      <div className="flex justify-end">
                        <Actions {...actionProps(u)} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <CreditGrantModal user={creditUser} onClose={() => setCreditUser(null)} />
      <ConfirmDialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        tone={reinstating ? 'primary' : 'danger'}
        title={isDelete ? 'Delete this user?' : reinstating ? 'Reinstate this user?' : 'Suspend this user?'}
        confirmLabel={isDelete ? 'Delete user' : reinstating ? 'Reinstate' : 'Suspend'}
        message={
          <>
            <strong className="text-dark">{confirm?.user?.name}</strong> ({confirm?.user?.email}){' '}
            {isDelete
              ? 'and their profile will be permanently removed. Open donations will be cancelled or re-matched. This cannot be undone.'
              : reinstating
                ? 'will be able to log in again.'
                : 'will be signed out everywhere and blocked from logging in.'}
          </>
        }
      />
    </div>
  );
}
