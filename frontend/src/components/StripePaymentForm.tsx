import React, { useState } from 'react';
import { useStripe, useElements, PaymentElement } from '@stripe/react-stripe-js';

export interface StripePaymentFormProps {
  onSuccess: () => void;
  onError: (error: string) => void;
  onProcessing: (isProcessing: boolean) => void;
}

export function StripePaymentForm({ onSuccess, onError, onProcessing }: StripePaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    onProcessing(true);
    setErrorMessage('');

    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required', // We want to stay on the page for single-page checkout
    });

    if (error) {
      setErrorMessage(error.message || 'An unexpected error occurred.');
      onError(error.message || 'Payment failed');
      onProcessing(false);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Stripe has confirmed the charge, but Order.status only becomes PAID once
      // our backend's webhook handler processes the async callback (see the
      // Stripe CLI note in the README) — the confirmation page itself polls for
      // that, so we just hand off; we never forge a webhook call from the
      // browser, since that would mean shipping a webhook secret to the client.
      onProcessing(false);
      onSuccess();
    } else {
      onProcessing(false);
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
          disabled={!stripe}
          className="btn btn-primary btn-block" 
          style={{ marginTop: 16 }}
        >
          Pay Now
        </button>
      </form>
    </div>
  );
}
