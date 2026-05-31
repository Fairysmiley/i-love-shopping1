import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import type { ReactElement } from 'react';
import Layout from './components/Layout';
import AuthPage from './components/AuthPage';
import Home from './components/Home';
import Register from './components/Register';
import Login from './components/Login';
import ProductList from './components/ProductList';
import ForgotPassword from './components/ForgotPassword';
import ResetPassword from './components/ResetPassword';
import TwoFASettings from './components/TwoFASettings';
import Cart from './components/Cart';
import Checkout from './components/Checkout';
import OrderConfirmation from './components/OrderConfirmation';
import Orders from './components/Orders';
import OrderDetail from './components/OrderDetail';
import ProductDetail from './components/ProductDetail';
import AdminDashboard from './components/AdminDashboard';
import Contact from './components/Contact';
import About from './components/About';
import NotFound from './components/NotFound';
import { useAuth } from './context/AuthContext';

const RequireAuth = ({ children }: { children: ReactElement }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <AuthPage title="Sign in to your account"><Login /></AuthPage>;
  }
  return children;
};
import { AuthProvider } from './context/AuthContext';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Layout><Home /></Layout>} />
          <Route path="/products" element={<Layout><ProductList /></Layout>} />
          <Route path="/products/:id" element={<Layout><ProductDetail /></Layout>} />
          <Route path="/cart" element={<Layout><Cart /></Layout>} />
          <Route path="/checkout" element={<Layout><Checkout /></Layout>} />
          <Route path="/order-confirmation" element={<Layout><OrderConfirmation /></Layout>} />
          <Route path="/orders" element={<RequireAuth><Layout><Orders /></Layout></RequireAuth>} />
          <Route path="/orders/:orderId" element={<RequireAuth><Layout><OrderDetail /></Layout></RequireAuth>} />
          <Route path="/login" element={<AuthPage title="Sign in to your account"><Login /></AuthPage>} />
          <Route path="/register" element={<AuthPage title="Create your account"><Register /></AuthPage>} />
          <Route path="/forgot-password" element={<AuthPage title="Reset your password"><ForgotPassword /></AuthPage>} />
          <Route path="/reset-password" element={<AuthPage title="Set new password"><ResetPassword /></AuthPage>} />
          <Route path="/account/security" element={<RequireAuth><Layout><TwoFASettings /></Layout></RequireAuth>} />
          <Route path="/admin" element={<RequireAuth><Layout><AdminDashboard /></Layout></RequireAuth>} />
          <Route path="/contact" element={<Layout><Contact /></Layout>} />
          <Route path="/about" element={<Layout><About /></Layout>} />
          <Route path="*" element={<Layout><NotFound /></Layout>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;