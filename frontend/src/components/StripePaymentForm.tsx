import React, { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

export interface StripePaymentFormProps {
  orderId: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  onProcessing: (isProcessing: boolean) => void;
}

export function StripePaymentForm({ orderId, onSuccess, onError, onProcessing }: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Without this guard, a double-click (or an impatient second tap while
    // the first request is still in flight) fires two concurrent
    // stripe.confirmPayment() calls against the same PaymentIntent — Stripe
    // accepts the first and rejects the second with a 400
    // (payment_intent_unexpected_state), which surfaces as a confusing
    // console error even though the payment itself still went through.
    if (!stripe || !elements || submitting) return;

    setSubmitting(true);
    onProcessing(true);
    setErrorMessage('');

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      // Card (this app's only non-redirect method) never redirects, so this
      // stays a single-page checkout for it; MobilePay always redirects out
      // to confirm and needs somewhere to land — the order confirmation
      // page is self-contained (reads the order fresh from the URL, polls
      // for PENDING -> PAID itself), so it's a safe, simple return target.
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/order-confirmation/${orderId}`,
      },
    });

    if (error) {
      setErrorMessage(error.message || 'An unexpected error occurred.');
      onError(error.message || 'Payment failed');
      onProcessing(false);
      setSubmitting(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Stripe has confirmed the charge, but Order.status only becomes PAID once
      // our backend's webhook handler processes the async callback (see the
      // Stripe CLI note in the README) — the confirmation page itself polls for
      // that, so we just hand off; we never forge a webhook call from the
      // browser, since that would mean shipping a webhook secret to the client.
      onProcessing(false);
      onSuccess();
      // Deliberately leave `submitting` true — onSuccess navigates away, and
      // re-enabling the button would just let a stray extra click fire
      // another confirm() against an intent that's already succeeded.
    } else {
      onProcessing(false);
      setSubmitting(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--border)', padding: 16, borderRadius: 'var(--radius)', background: 'var(--surface-2)' }}>
      <h3 style={{ marginTop: 0, fontSize: "1rem" }}>
        <span style={{ marginRight: 8 }}>💳</span>
        Complete Payment
      </h3>
      
      <form onSubmit={handleSubmit}>
        <PaymentElement />
        
        {errorMessage && <div className="alert alert-error" style={{ fontSize: "0.8125rem", padding: 8, marginTop: 12 }}>{errorMessage}</div>}
        
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="btn btn-primary btn-block"
          style={{ marginTop: 16 }}
        >
          {submitting ? 'Processing...' : 'Pay Now'}
        </button>
      </form>
    </div>
  );
}
