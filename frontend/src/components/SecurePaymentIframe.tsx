import React, { useState } from 'react';
import { api, ApiError } from '../api/client';

export interface SecurePaymentIframeProps {
  orderId: string;
  amount: number;
  currency: string;
  onSuccess: () => void;
  onError: (error: string) => void;
  onProcessing: (isProcessing: boolean) => void;
}

export function SecurePaymentIframe({ orderId, amount, currency, onSuccess, onError, onProcessing }: SecurePaymentIframeProps) {
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [name, setName] = useState('');
  const [validationError, setValidationError] = useState('');

  const validateCard = () => {
    const rawNumber = cardNumber.replace(/\s+/g, '');
    if (!/^\d{16}$/.test(rawNumber)) {
      return 'Invalid card number format. Must be 16 digits.';
    }
    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
      return 'Invalid expiry date format. Must be MM/YY.';
    }
    if (!/^\d{3,4}$/.test(cvv)) {
      return 'Invalid CVV. Must be 3 or 4 digits.';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');
    
    const err = validateCard();
    if (err) {
      setValidationError(err);
      return;
    }

    onProcessing(true);
    try {
      // 1. Create Payment Intent
      const intent = await api.post<{ id: string }>('/checkout/create-intent', {
        orderId,
        amount,
        currency
      });

      // 2. Confirm Payment Intent
      const rawNumber = cardNumber.replace(/\s+/g, '');
      await api.post('/checkout/confirm-intent', {
        intentId: intent.id,
        cardNumber: rawNumber
      });

      // Simulation specific logic: We assume it succeeded unless it times out. 
      // The backend webhook handles the actual DB updates, but we'll optimisticly call onSuccess
      // unless it's the timeout card
      if (rawNumber === '4000000000000005') {
        throw new Error('Payment gateway timeout');
      }

      onSuccess();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      onProcessing(false);
    }
  };

  return (
    <div style={{ border: '1px solid var(--border)', padding: 16, borderRadius: 'var(--radius)', background: 'var(--surface-2)' }}>
      <h3 style={{ marginTop: 0, fontSize: "1rem" }}>
        <span style={{ marginRight: 8 }}>🔒</span>
        Secure Card Payment
      </h3>
      <p className="muted" style={{ fontSize: "0.75rem" }}>
        This is a simulated secure iframe. Your card details never touch our application servers (PCI DSS Compliance).
      </p>

      {validationError && <div className="alert alert-error" style={{ fontSize: "0.8125rem", padding: 8 }}>{validationError}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: "0.75rem" }}>Name on Card</label>
          <input 
            type="text" 
            placeholder="Jane Doe" 
            value={name} 
            onChange={e => setName(e.target.value)} 
            required 
          />
        </div>
        <div className="field" style={{ margin: 0 }}>
          <label style={{ fontSize: "0.75rem" }}>Card Number</label>
          <input 
            type="text" 
            placeholder="4000 0000 0000 0000" 
            value={cardNumber} 
            onChange={e => setCardNumber(e.target.value)} 
            maxLength={19}
            required 
          />
          <p className="muted" style={{ fontSize: "0.6875rem", marginTop: 4 }}>
            Test Cards: Success: any 16 digits | Insufficient funds: ...0002 | Invalid card: ...0003 | Expired: ...0004 | Timeout: ...0005
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div className="field" style={{ margin: 0, flex: 1 }}>
            <label style={{ fontSize: "0.75rem" }}>Expiry (MM/YY)</label>
            <input 
              type="text" 
              placeholder="12/25" 
              value={expiry} 
              onChange={e => setExpiry(e.target.value)} 
              maxLength={5}
              required 
            />
          </div>
          <div className="field" style={{ margin: 0, flex: 1 }}>
            <label style={{ fontSize: "0.75rem" }}>CVV</label>
            <input 
              type="password" 
              placeholder="123" 
              value={cvv} 
              onChange={e => setCvv(e.target.value)} 
              maxLength={4}
              required 
            />
          </div>
        </div>
      </div>
      <button 
        type="button" 
        onClick={handleSubmit}
        className="btn btn-primary btn-block" 
        style={{ marginTop: 16 }}
      >
        Submit Secure Payment
      </button>
    </div>
  );
}
