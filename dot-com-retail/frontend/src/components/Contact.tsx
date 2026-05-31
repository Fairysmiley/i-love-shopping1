import { useState } from 'react';
import SEO from './SEO';

export default function Contact() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    
    // Simulate sending (in real app, would send to backend)
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setSubmitted(true);
    setSending(false);
    setFormData({ name: '', email: '', subject: '', message: '' });
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <SEO 
        title="Contact Us"
        description="Get in touch with Dot-Com Retail. Have questions about products, orders, or need customer support? Send us a message and we'll respond as soon as possible."
        keywords="contact, customer support, help, questions"
      />
      
      <h1 className="text-3xl font-bold mb-2">Contact Us</h1>
      <p className="text-gray-600 mb-8">Have a question? We'd love to hear from you. Send us a message and we'll respond as soon as possible.</p>

      {submitted && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-6">
          Thank you for contacting us! We'll get back to you soon.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="name" className="block font-semibold mb-2">Name *</label>
          <input
            type="text"
            id="name"
            required
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            className="w-full border rounded px-4 py-2"
          />
        </div>

        <div>
          <label htmlFor="email" className="block font-semibold mb-2">Email *</label>
          <input
            type="email"
            id="email"
            required
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            className="w-full border rounded px-4 py-2"
          />
        </div>

        <div>
          <label htmlFor="subject" className="block font-semibold mb-2">Subject *</label>
          <input
            type="text"
            id="subject"
            required
            value={formData.subject}
            onChange={(e) => setFormData({...formData, subject: e.target.value})}
            className="w-full border rounded px-4 py-2"
          />
        </div>

        <div>
          <label htmlFor="message" className="block font-semibold mb-2">Message *</label>
          <textarea
            id="message"
            required
            rows={6}
            value={formData.message}
            onChange={(e) => setFormData({...formData, message: e.target.value})}
            className="w-full border rounded px-4 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={sending}
          className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
        >
          {sending ? 'Sending...' : 'Send Message'}
        </button>
      </form>

      <div className="mt-12 grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="font-semibold mb-2">Email</h3>
          <p className="text-gray-600">support@dot-com-retail.com</p>
        </div>
        <div>
          <h3 className="font-semibold mb-2">Phone</h3>
          <p className="text-gray-600">+1 (555) 123-4567</p>
        </div>
      </div>
    </div>
  );
}
