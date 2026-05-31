import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { twoFASetup, twoFAEnable, twoFADisable } from '../api/auth';
import { useAuth } from '../context/AuthContext';

const TwoFASettings = () => {
  const { user, getAccessToken } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const startSetup = async () => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      const data = await twoFASetup(accessToken);
      setProvisioningUri(data.provisioning_uri);
      setSecret(data.secret);
    } catch (e: any) {
      setError(e.message || 'Failed to start 2FA setup');
    } finally {
      setLoading(false);
    }
  };

  const enable2FA = async () => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      await twoFAEnable(code, accessToken);
      setSuccess('Two-factor authentication enabled');
      setProvisioningUri(null);
      setSecret(null);
      setCode('');
    } catch (e: any) {
      setError(e.message || 'Failed to enable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const disable2FA = async () => {
    setError(''); setSuccess(''); setLoading(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) {
        throw new Error('Not authenticated');
      }
      await twoFADisable(code, accessToken);
      setSuccess('Two-factor authentication disabled');
      setProvisioningUri(null);
      setSecret(null);
      setCode('');
    } catch (e: any) {
      setError(e.message || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-semibold mb-4">Two-Factor Authentication</h2>
      <p className="text-gray-600 mb-6">Add an extra layer of security to your account with time-based one-time passwords (TOTP).</p>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded">{error}</div>}
      {success && <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded">{success}</div>}

      {!user?.twofa_enabled && !provisioningUri && (
        <div className="space-y-4">
          
          <button
            onClick={startSetup}
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg disabled:opacity-50 hover:bg-blue-700 transition-colors font-medium"
          >
            {loading ? 'Preparing…' : 'Set up 2FA'}
          </button>
        </div>
      )}

      {provisioningUri && (
        <div className="border rounded p-4 mt-4 bg-white">
          <p className="mb-4 text-lg font-medium">Scan this QR code with your authenticator app:</p>
          
          {/* QR Code */}
          <div className="flex justify-center mb-6 p-4 bg-white border-2 border-gray-200 rounded-lg">
            <QRCodeSVG 
              value={provisioningUri} 
              size={200}
              level="M"
              includeMargin={true}
            />
          </div>

          {/* Manual Entry Option */}
          <div className="mb-4 p-3 bg-gray-50 rounded border border-gray-200">
            <p className="text-sm text-gray-600 mb-2">Or enter this secret manually:</p>
            <p className="font-mono text-sm break-all bg-white p-2 rounded border">{secret}</p>
          </div>

          <label className="block text-sm font-medium text-gray-700 mb-2">Enter the 6-digit code from your app:</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full p-2 border rounded mb-3"
            inputMode="numeric"
            pattern="\\d{6}"
            placeholder="123456"
            maxLength={6}
          />
          <button
            onClick={enable2FA}
            disabled={loading || code.length !== 6}
            className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-green-700 transition-colors"
          >
            {loading ? 'Enabling…' : 'Enable 2FA'}
          </button>
        </div>
      )}

      {user?.twofa_enabled && (
        <div className="border rounded-lg p-4 mt-4 bg-white">
          <div className="flex items-center mb-4">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
            <p className="text-lg">Two-factor authentication is <span className="font-semibold text-green-600">enabled</span></p>
          </div>
          <p className="text-sm text-gray-600 mb-4">Your account is protected with an additional layer of security.</p>
          <hr className="my-4" />
          <label className="block text-sm font-medium text-gray-700 mb-2">To disable 2FA, enter your current 6-digit code:</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full p-2 border rounded mb-3"
            inputMode="numeric"
            pattern="\\d{6}"
            placeholder="123456"
            maxLength={6}
          />
          <button
            onClick={disable2FA}
            disabled={loading || code.length !== 6}
            className="bg-red-600 text-white px-4 py-2 rounded disabled:opacity-50 hover:bg-red-700 transition-colors"
          >
            {loading ? 'Disabling…' : 'Disable 2FA'}
          </button>
        </div>
      )}
    </div>
  );
};

export default TwoFASettings;


