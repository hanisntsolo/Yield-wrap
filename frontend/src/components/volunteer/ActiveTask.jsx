import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import MapView from '../MapView';
import MapLegend from '../map/MapLegend';
import Icon from '../common/Icon';
import Spinner from '../common/Spinner';
import Countdown from '../common/Countdown';
import StageProgress from '../common/StageProgress';
import ConfirmDialog from '../common/ConfirmDialog';
import { Link } from 'react-router-dom';
import DeliveryConfirmModal from './DeliveryConfirmModal';
import StickerConfirmModal from './StickerConfirmModal';
import RouteSteps from './RouteSteps';
import PriorityBadge from './PriorityBadge';
import { aiApi, errorMessage, volunteerApi } from '../../services/api';
import { MARKER_COLORS, NEXT_TASK_ACTION, VEHICLE_TYPES } from '../../utils/constants';
import { donationEarliestExpiry, donationTotalKg, formatDistance, formatEta, formatKg, summarizeItems } from '../../utils/formatters';
import { googleMapsDirectionsUrl, routePath, toLatLng } from '../../utils/geo';

const coords = (p) => (p ? { lat: p.lat, lng: p.lng } : null);

function Stop({ color, title, name, address }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-4" style={{ background: color, '--tw-ring-color': `${color}33` }} aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="text-xs font-medium text-slate-500">
          {title} · {name}
        </p>
        <p className="text-slate-700">{address || '—'}</p>
      </div>
    </div>
  );
}

/** The volunteer's current delivery: route map, directions, and the stage buttons. */
export default function ActiveTask({ task, vehicleType = 'bike', myPosition, onUpdated, sharing }) {
  const [route, setRoute] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const posRef = useRef(myPosition);
  posRef.current = myPosition;

  const stage = task?.task_stage;
  const pickedUp = stage === 'picked_up';
  const pickup = toLatLng(task?.pickup_location);
  const delivery = toLatLng(task?.delivery_location);
  const me = toLatLng(myPosition);
  const next = NEXT_TASK_ACTION[stage];
  const travelMode = VEHICLE_TYPES.find((v) => v.value === vehicleType)?.travelMode || 'driving';

  const loadRoute = useCallback(async () => {
    const start = toLatLng(posRef.current) || pickup;
    if (!start || !pickup || !delivery) return;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const res = await aiApi.route({
        volunteer_location: coords(start),
        pickup_location: coords(pickup),
        delivery_location: coords(delivery),
        vehicle_type: vehicleType,
      });
      setRoute(res);
    } catch (err) {
      setRouteError(err);
      setRoute(null);
    } finally {
      setRouteLoading(false);
    }
  }, [pickup?.lat, pickup?.lng, delivery?.lat, delivery?.lng, vehicleType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadRoute();
  }, [task?.id, loadRoute]);

  // Re-route once the first GPS fix arrives (initial route may have started at the pickup).
  const hadFix = useRef(false);
  useEffect(() => {
    if (me && !hadFix.current) {
      hadFix.current = true;
      if (route && !routeLoading) loadRoute();
    }
  }, [me, route, routeLoading, loadRoute]);

  const path = useMemo(() => {
    const stops = [me, pickedUp ? null : pickup, delivery].filter(Boolean).map((p) => [p.lat, p.lng]);
    return routePath(route, stops);
  }, [route, me?.lat, me?.lng, pickup?.lat, delivery?.lat, pickedUp]); // eslint-disable-line react-hooks/exhaustive-deps

  const markers = useMemo(() => {
    const list = [];
    if (pickup) list.push({ id: 'pickup', type: 'pickup', ...pickup, label: task?.donor_name || 'Pickup', description: task?.pickup_location?.address, shortLabel: 'Pickup' });
    if (delivery) list.push({ id: 'delivery', type: 'delivery', ...delivery, label: task?.matched_ngo_name || 'Delivery', description: task?.delivery_location?.address, shortLabel: 'NGO' });
    if (me) list.push({ id: 'me', type: 'volunteer', ...me, label: 'You', description: 'Your live position' });
    return list;
  }, [pickup?.lat, delivery?.lat, me?.lat, me?.lng, task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapsUrl = googleMapsDirectionsUrl({
    origin: me,
    destination: delivery || pickup,
    waypoints: !pickedUp && pickup && delivery ? [pickup] : [],
    travelMode,
  });

  const advance = async () => {
    if (!next) return;
    if (next.status === 'delivered') {
      setConfirmOpen(true);
      return;
    }
    if (next.status === 'picked_up' && Number(task?.packaging?.stickers_total) > 0) {
      setStickerOpen(true);
      return;
    }
    setBusy(true);
    try {
      const updated = await volunteerApi.updateTaskStatus(task.id, { status: next.status });
      toast.success(next.status === 'at_pickup' ? 'Marked as arrived at pickup' : 'Food collected — head to the NGO');
      onUpdated?.(updated);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not update the task'));
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    try {
      await volunteerApi.declineTask(task.id);
      toast.success('Task released — we will find another volunteer');
      onUpdated?.(null);
    } catch (err) {
      toast.error(errorMessage(err, 'Could not release the task'));
      throw err;
    }
  };

  if (!task) return null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityBadge score={task.priority_score} />
            <Countdown target={donationEarliestExpiry(task)} prefix="Expires" />
          </div>
          <h3 className="mt-2 text-lg font-bold">{summarizeItems(task.food_items)}</h3>
          <p className="metric text-sm text-slate-500">{formatKg(donationTotalKg(task))}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Route</p>
          <p className="metric text-2xl text-primary">{routeLoading ? '…' : formatEta(route?.eta_minutes)}</p>
          <p className="font-mono text-xs text-slate-500">
            {formatDistance(route?.distance_km)}
            {route?.provider ? ` · ${route.provider === 'google' ? 'Google' : 'estimated'}` : ''}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <MapView markers={markers} polyline={path} height={420} dashed={route?.provider !== 'google'} emptyMessage="Waiting for task locations" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <MapLegend
              items={[
                { color: MARKER_COLORS.volunteer, label: 'You' },
                { color: MARKER_COLORS.pickup, label: 'Pickup' },
                { color: MARKER_COLORS.delivery, label: 'NGO' },
              ]}
            />
            {sharing ? (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${sharing.error ? 'text-critical' : 'text-primary'}`}>
                <Icon name={sharing.error ? 'alert' : 'navigation'} size={13} />
                {sharing.error || (sharing.lastSentAt ? `Sharing location (${sharing.via === 'socket' ? 'live' : 'fallback'})` : 'Waiting for GPS…')}
              </span>
            ) : null}
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-3 rounded-2xl bg-surface p-4">
            <Stop color={MARKER_COLORS.pickup} title="Pickup" name={task.donor_name || 'Donor'} address={task.pickup_location?.address} />
            {(stage === 'accepted' || stage === 'at_pickup') && Number(task.packaging?.stickers_total) > 0 ? (
              <Link to={`/print/stickers/${task.id}`} target="_blank" rel="noreferrer" className="btn btn-outline-primary btn-sm ml-5">
                <Icon name="file" size={14} /> Print sticker sheet
                <span className="font-mono">({task.packaging.stickers_total})</span>
              </Link>
            ) : null}
            <Stop color={MARKER_COLORS.delivery} title="Deliver to" name={task.matched_ngo_name || 'NGO'} address={task.delivery_location?.address} />
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-sm font-semibold text-dark">Directions</h4>
              <button type="button" className="btn btn-ghost btn-sm" onClick={loadRoute} disabled={routeLoading} aria-label="Recalculate route">
                {routeLoading ? <Spinner size={14} /> : <Icon name="refresh" size={14} />} Re-route
              </button>
            </div>
            {routeError ? <p className="mb-2 text-xs text-[#B9770E]">{errorMessage(routeError, 'Route service unavailable')} — showing straight-line path.</p> : null}
            <RouteSteps steps={route?.steps} loading={routeLoading && !route} />
          </div>
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-secondary w-full">
            <Icon name="external" size={16} /> Open in Google Maps
          </a>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 p-4">
        <StageProgress stage={stage} status={task.status} />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {next ? (
          <button type="button" className="btn btn-primary btn-lg flex-1" onClick={advance} disabled={busy}>
            {busy ? <Spinner size={18} /> : <Icon name={next.icon} size={18} />} {next.label}
          </button>
        ) : null}
        {!pickedUp ? (
          <button type="button" className="btn btn-secondary btn-lg" onClick={() => setReleaseOpen(true)} disabled={busy}>
            <Icon name="x" size={18} /> Release task
          </button>
        ) : null}
      </div>

      <StickerConfirmModal task={task} open={stickerOpen} onClose={() => setStickerOpen(false)} onPickedUp={(d) => onUpdated?.(d)} />
      <DeliveryConfirmModal task={task} open={confirmOpen} onClose={() => setConfirmOpen(false)} onDelivered={(d) => onUpdated?.(d, { delivered: true })} />
      <ConfirmDialog
        open={releaseOpen}
        onClose={() => setReleaseOpen(false)}
        onConfirm={release}
        title="Release this task?"
        confirmLabel="Release task"
        message="The pickup will be re-allocated to another volunteer. Only do this if you cannot complete it."
      />
    </div>
  );
}
