import { RAZORPAY_CHECKOUT_SRC } from '../utils/constants';

let loadPromise = null;

/** Load Razorpay Checkout once, on demand. Resolves with window.Razorpay. */
export function loadRazorpay() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Checkout is only available in the browser'));
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loadPromise) return loadPromise;
  loadPromise = new Promise((resolve, reject) => {
    let s = document.querySelector('script[data-yw-razorpay]');
    if (!s) {
      s = document.createElement('script');
      s.async = true;
      s.src = RAZORPAY_CHECKOUT_SRC;
      s.dataset.ywRazorpay = '1';
      document.head.appendChild(s);
    }
    s.addEventListener('load', () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error('Razorpay failed to initialise'))));
    s.addEventListener('error', () => {
      s.remove();
      reject(new Error('Could not load Razorpay checkout. Check your connection or ad blocker.'));
    });
  }).catch((err) => {
    loadPromise = null;
    throw err;
  });
  return loadPromise;
}

/**
 * Open Razorpay Checkout for a backend order (POST /api/ads/orders response).
 * Resolves with {razorpay_order_id, razorpay_payment_id, razorpay_signature} on success,
 * rejects with {code:'DISMISSED'} when the user closes the modal or {code:'PAYMENT_FAILED', message}.
 */
export async function openRazorpayCheckout(order) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      fn(v);
    };
    const rzp = new Razorpay({
      key: order?.key_id,
      order_id: order?.razorpay_order_id,
      amount: order?.amount_paise,
      currency: order?.currency || 'INR',
      name: order?.name || 'YIELD WRAP',
      description: order?.description || `${order?.credits ?? ''} ad credits`,
      prefill: order?.prefill || {},
      theme: { color: '#1A7A4A' },
      handler: (resp) =>
        done(resolve, {
          razorpay_order_id: resp?.razorpay_order_id,
          razorpay_payment_id: resp?.razorpay_payment_id,
          razorpay_signature: resp?.razorpay_signature,
        }),
      modal: { ondismiss: () => done(reject, { code: 'DISMISSED', message: 'Payment cancelled' }) },
    });
    rzp.on?.('payment.failed', (resp) =>
      done(reject, { code: 'PAYMENT_FAILED', message: resp?.error?.description || 'Payment failed. No money was taken.' }),
    );
    rzp.open();
  });
}
