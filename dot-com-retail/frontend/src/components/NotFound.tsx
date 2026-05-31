import { useNavigate } from 'react-router-dom';
import SEO from './SEO';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="container mx-auto px-4 py-16 text-center">
      <SEO 
        title="404 - Page Not Found"
        description="The page you're looking for doesn't exist. Return to Dot-Com Retail homepage or browse our products."
      />
      
      <div className="max-w-2xl mx-auto">
        <h1 className="text-9xl font-bold text-gray-300 mb-4">404</h1>
        <h2 className="text-3xl font-bold mb-4">Page Not Found</h2>
        <p className="text-gray-600 mb-8">
          Oops! The page you're looking for doesn't exist. It might have been moved or deleted.
        </p>
        
        <div className="space-x-4">
          <button
            onClick={() => navigate('/')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Go Home
          </button>
          <button
            onClick={() => navigate(-1)}
            className="bg-gray-200 px-6 py-3 rounded-lg hover:bg-gray-300"
          >
            Go Back
          </button>
        </div>

        <div className="mt-12">
          <h3 className="font-semibold mb-4">Popular Pages:</h3>
          <div className="flex justify-center gap-4">
            <button onClick={() => navigate('/products')} className="text-blue-600 hover:underline">
              Browse Products
            </button>
            <button onClick={() => navigate('/cart')} className="text-blue-600 hover:underline">
              Shopping Cart
            </button>
            <button onClick={() => navigate('/contact')} className="text-blue-600 hover:underline">
              Contact Us
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
