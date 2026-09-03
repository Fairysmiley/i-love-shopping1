import { useState } from 'react';
import { api, ApiError } from '../../api/client';

interface BulkUploadResult {
  imported: number;
  skipped: number;
  errors: string[];
}

export function BulkUploadPanel() {
  const [uploadMethod, setUploadMethod] = useState<'csv' | 'json'>('csv');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [jsonText, setJsonText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BulkUploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCsvUpload = async () => {
    if (!csvFile) {
      setError('Please select a CSV file');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const response = await api.post<BulkUploadResult>('/products/bulk-csv', formData);

      setResult(response);
      setCsvFile(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to upload CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleJsonUpload = async () => {
    if (!jsonText.trim()) {
      setError('Please enter JSON data');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const products = JSON.parse(jsonText);
      const response = await api.post<BulkUploadResult>('/products/bulk', { products });
      setResult(response);
      setJsonText('');
    } catch (err) {
      if (err instanceof SyntaxError) {
        setError('Invalid JSON format');
      } else {
        setError(err instanceof ApiError ? err.message : 'Failed to upload products');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Bulk Product Upload</h2>
      <p className="muted">Import multiple products at once using CSV or JSON format.</p>

      <div style={{ marginBottom: 24 }}>
        <label>
          <input
            type="radio"
            value="csv"
            checked={uploadMethod === 'csv'}
            onChange={(e) => setUploadMethod(e.target.value as 'csv')}
          />
          <span style={{ marginLeft: 8 }}>CSV Upload</span>
        </label>
        <label style={{ marginLeft: 24 }}>
          <input
            type="radio"
            value="json"
            checked={uploadMethod === 'json'}
            onChange={(e) => setUploadMethod(e.target.value as 'json')}
          />
          <span style={{ marginLeft: 8 }}>JSON Upload</span>
        </label>
      </div>

      {uploadMethod === 'csv' ? (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3>CSV Upload</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            Upload a CSV file with the following columns:
            <br />
            <code>sku, name, description, price, stockQuantity, categorySlug, brandName, weightGrams, lengthMm, widthMm, heightMm</code>
          </p>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="csv-file" className="label">
              Select CSV File
            </label>
            <input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              style={{ display: 'block', marginTop: 8 }}
            />
            {csvFile && (
              <p style={{ marginTop: 8, fontSize: 14 }}>
                Selected: <strong>{csvFile.name}</strong> ({(csvFile.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          <button
            className="btn btn-primary"
            onClick={handleCsvUpload}
            disabled={loading || !csvFile}
          >
            {loading ? 'Uploading...' : 'Upload CSV'}
          </button>
        </div>
      ) : (
        <div className="card" style={{ padding: 24, marginBottom: 24 }}>
          <h3>JSON Upload</h3>
          <p className="muted" style={{ marginBottom: 16 }}>
            Paste JSON array of products. Each product should have: sku, name, description, price, stockQuantity, categorySlug, brandName (optional: dimensions)
          </p>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="json-text" className="label">
              JSON Data
            </label>
            <textarea
              id="json-text"
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              placeholder='[{"sku":"PROD-001","name":"Test Product","price":99.99,"stockQuantity":10,"categorySlug":"outdoor-jackets","brandName":"TestBrand"}]'
              rows={12}
              style={{
                width: '100%',
                fontFamily: 'monospace',
                fontSize: 13,
                padding: 12,
                marginTop: 8,
              }}
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={handleJsonUpload}
            disabled={loading || !jsonText.trim()}
          >
            {loading ? 'Uploading...' : 'Upload JSON'}
          </button>
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 24 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {result && (
        <div className="card" style={{ padding: 24, backgroundColor: '#f0f9ff' }}>
          <h3>Upload Results</h3>
          <div style={{ marginTop: 16 }}>
            <p>
              <strong>Imported:</strong> {result.imported} products
            </p>
            <p>
              <strong>Skipped:</strong> {result.skipped} products
            </p>
            {result.errors.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <strong>Errors:</strong>
                <ul style={{ marginTop: 8, marginLeft: 20 }}>
                  {result.errors.slice(0, 20).map((err, idx) => (
                    <li key={idx} style={{ fontSize: 14, marginBottom: 4 }}>
                      {err}
                    </li>
                  ))}
                  {result.errors.length > 20 && (
                    <li style={{ fontSize: 14, fontStyle: 'italic' }}>
                      ... and {result.errors.length - 20} more errors
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 24, marginTop: 24, backgroundColor: '#fffbeb' }}>
        <h4>CSV Format Example</h4>
        <pre style={{ fontSize: 12, overflow: 'auto', marginTop: 12 }}>
{`sku,name,description,price,stockQuantity,categorySlug,brandName,weightGrams,lengthMm,widthMm,heightMm
PROD-001,Winter Jacket,Warm winter jacket,149.99,10,outdoor-jackets,North Face,1200,700,500,100
PROD-002,Hiking Boots,Durable hiking boots,89.99,15,footwear,Salomon,1500,300,250,150`}
        </pre>
      </div>
    </div>
  );
}
