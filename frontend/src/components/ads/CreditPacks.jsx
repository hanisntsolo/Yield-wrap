import { useState } from 'react';
import toast from 'react-hot-toast';
import Icon from '../common/Icon';
import Modal from '../common/Modal';
import Spinner from '../common/Spinner';
import EmptyState from '../common/EmptyState';
import { adMarketApi, errorMessage, getApiError } from '../../services/api';
import { openRazorpayCheckout } from '../../services/razorpay';
import { formatINR, formatNumber } from '../../utils/formatters';
import { num } from './adUtils';

/** Credit packs + Razorpay (or simulated test) checkout. Calls onPaid(wallet) after verification. */
export default function CreditPacks({ pricing, onPaid }) {
  const [busyPack, setBusyPack] = useState(null);
  const [simOrder, setSimOrder] = useState(null);
  const [simBusy, setSimBusy] = useState(false);
  const packs = pricing?.packs || [];

  const verify = async (order, body) => {
    const res = await adMarketApi.verifyOrder(order.order_id, body);
    toast.success(`${formatNumber(res?.order?.credits ?? order.credits)} credits added to your wallet`);
    onPaid?.(res?.wallet);
  };

  const buy = async (pack) => {
    setBusyPack(pack.id);
    try {
      const order = await adMarketApi.createOrder(pack.id);
      if (order?.provider === 'simulated') {
        setSimOrder({ ...order, pack });
        return;
      }
      const toastId = toast.loading('Opening Razorpay checkout…');
      let resp;
      try {
        resp = await openRazorpayCheckout(order);
      } finally {
        toast.dismiss(toastId);
      }
      const vId = toast.loading('Verifying payment…');
      try {
        await verify(order, resp);
      } finally {
        toast.dismiss(vId);
      }
    } catch (err) {
      if (err?.code === 'DISMISSED') toast('Checkout closed. No payment was made.', { icon: <Icon name="info" size={18} className="text-[#21618C]" /> });
      else if (err?.code === 'PAYMENT_FAILED') toast.error(err.message);
      else if (getApiError(err).code === 'PAYMENTS_UNAVAILABLE') toast.error('Payments are temporarily unavailable. Please try again later.');
      else if (getApiError(err).code === 'PAYMENT_VERIFICATION_FAILED') toast.error('We could not verify this payment. If money was debited it will be credited automatically.');
      else toast.error(err?.response ? errorMessage(err, 'Could not start checkout') : err?.message || 'Could not start checkout');
    } finally {
      setBusyPack(null);
    }
  };

  const confirmSimulated = async () => {
    setSimBusy(true);
    try {
      await verify(simOrder, {});
      setSimOrder(null);
    } catch (err) {
      toast.error(errorMessage(err, 'Test payment failed'));
    } finally {
      setSimBusy(false);
    }
  };

  if (!packs.length) return <EmptyState compact icon="package" title="No credit packs available" description="Check back soon." />;

  const best = packs.reduce((b, p) => (num(p.credits) / num(p.price_inr, 1) > num(b?.credits) / num(b?.price_inr, 1) ? p : b), packs[0]);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {packs.map((p) => {
          const perCredit = num(p.price_inr) / Math.max(1, num(p.credits));
          const isBest = p.id === best?.id && packs.length > 1;
          return (
            <div key={p.id} className={`relative flex flex-col rounded-2xl border-2 p-4 ${isBest ? 'border-primary bg-primary-light/40' : 'border-slate-200 bg-white'}`}>
              {isBest ? <span className="badge absolute -top-2.5 right-3 bg-primary text-white ring-primary">Best value</span> : null}
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{p.id}</p>
              <p className="metric mt-1 text-2xl text-dark">
                {formatNumber(p.credits)} <span className="text-sm text-slate-500">credits</span>
              </p>
              <p className="metric text-lg text-primary">{formatINR(p.price_inr)}</p>
              <p className="text-xs text-slate-500">{formatINR(perCredit, { decimals: 2 })} per credit</p>
              <button type="button" className="btn btn-primary btn-sm mt-4" onClick={() => buy(p)} disabled={Boolean(busyPack)}>
                {busyPack === p.id ? <Spinner size={14} /> : <Icon name="zap" size={14} />} Buy
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <Icon name="lock" size={12} />
        {pricing?.payments?.provider === 'razorpay' ? 'Secure payments by Razorpay (test mode). Credits are added as soon as payment is verified.' : 'Razorpay is not configured on this server; purchases use a test checkout.'}
      </p>

      <Modal
        open={Boolean(simOrder)}
        onClose={simBusy ? undefined : () => setSimOrder(null)}
        dismissible={!simBusy}
        size="sm"
        title="Test checkout (Razorpay not configured)"
        description="No real payment is taken. This is for development and demos only."
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setSimOrder(null)} disabled={simBusy}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmSimulated} disabled={simBusy} data-autofocus>
              {simBusy ? <Spinner size={16} /> : <Icon name="check" size={16} />} Simulate payment
            </button>
          </>
        }
      >
        <div className="rounded-2xl border border-dashed border-accent bg-accent-light/60 p-4 text-sm">
          <p className="flex items-center gap-2 font-bold text-[#B9770E]">
            <Icon name="alert" size={16} /> TEST MODE
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-slate-700">
            <dt>Pack</dt>
            <dd className="text-right font-semibold capitalize">{simOrder?.pack?.id}</dd>
            <dt>Credits</dt>
            <dd className="metric text-right">{formatNumber(simOrder?.credits)}</dd>
            <dt>Amount</dt>
            <dd className="metric text-right">{formatINR(num(simOrder?.amount_paise) / 100)}</dd>
          </dl>
        </div>
      </Modal>
    </>
  );
}
