import { useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';

interface CheckoutFormProps {
  clientSecret: string;
  orderId: number;
  orderTotal: string;
}

const CheckoutForm = ({ clientSecret, orderId, orderTotal }: CheckoutFormProps) => {
  const stripe = useStripe();
  const elements = useElements();

  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        // Parse Stripe error types for better messages
        let errorMessage = submitError.message || 'An error occurred';
        
        if (submitError.type === 'card_error') {
          switch (submitError.code) {
            case 'card_declined':
              errorMessage = 'Your card was declined. Please try another payment method.';
              break;
            case 'insufficient_funds':
              errorMessage = 'Insufficient funds. Please try another payment method.';
              break;
            case 'expired_card':
              errorMessage = 'Your card has expired. Please use a different card.';
              break;
            case 'incorrect_cvc':
              errorMessage = 'Incorrect security code (CVC). Please check and try again.';
              break;
            case 'processing_error':
              errorMessage = 'An error occurred while processing your card. Please try again.';
              break;
            default:
              errorMessage = submitError.message || 'Card validation failed. Please check your details.';
          }
        } else if (submitError.type === 'validation_error') {
          errorMessage = 'Please check your payment details and try again.';
        }
        
        setError(errorMessage);
        setProcessing(false);
        return;
      }

      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/order-confirmation?order_id=${orderId}`,
        },
      });

      if (confirmError) {
        // Parse payment confirmation errors
        let errorMessage = confirmError.message || 'Payment failed';
        
        if (confirmError.type === 'card_error') {
          switch (confirmError.code) {
            case 'card_declined':
              errorMessage = 'Your card was declined. Please contact your bank or try another payment method.';
              break;
            case 'insufficient_funds':
              errorMessage = 'Insufficient funds. Please use a different payment method.';
              break;
            default:
              errorMessage = confirmError.message || 'Your card was declined. Please try another payment method.';
          }
        } else if (confirmError.type === 'invalid_request_error') {
          errorMessage = 'Payment request error. Please refresh the page and try again.';
        } else if (confirmError.type === 'api_connection_error') {
          errorMessage = 'Network error. Please check your connection and try again.';
        } else if (confirmError.type === 'api_error') {
          errorMessage = 'Payment processing error. Please try again in a moment.';
        }
        
        setError(errorMessage);
        setProcessing(false);
      }
      // If successful, Stripe will redirect to return_url
    } catch (err) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'An unexpected error occurred. Please refresh and try again.';
      setError(errorMessage);
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Payment Details</h2>
        
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="text-gray-700 font-medium">Order Total:</span>
            <span className="text-2xl font-bold text-blue-600">${orderTotal}</span>
          </div>
        </div>

        <PaymentElement />

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {error}
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <button
          type="submit"
          disabled={!stripe || processing}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? 'Processing...' : `Pay $${orderTotal}`}
        </button>
        
        <p className="mt-4 text-center text-sm text-gray-500">
          Your payment information is secure and encrypted
        </p>
      </div>
    </form>
  );
};

export default CheckoutForm;
