import { type ReactNode } from 'react';

interface AuthPageProps {
  children: ReactNode;
  title: string;
}

const AuthPage = ({ children, title }: AuthPageProps) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
          <a href="/" className="text-2xl font-bold text-gray-900 hover:text-blue-600 transition-colors duration-200">
            ECommerce
          </a>
          <h2 className="mt-4 text-3xl font-bold text-gray-900">{title}</h2>
        </div>
        
        <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100 backdrop-blur-sm">
          {children}
        </div>
      </div>
    </div>
  );
};

export default AuthPage;