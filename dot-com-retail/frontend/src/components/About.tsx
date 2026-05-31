import SEO from './SEO';

export default function About() {
  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <SEO 
        title="About Us"
        description="Learn about Dot-Com Retail's mission to provide the best online shopping experience for electronics and technology products. Founded in 2024, serving thousands of customers worldwide."
        keywords="about us, our story, company mission, team"
      />
      
      <h1 className="text-4xl font-bold mb-6">About Dot-Com Retail</h1>
      
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Our Mission</h2>
        <p className="text-gray-700 leading-relaxed">
          At Dot-Com Retail, we're committed to providing the best online shopping experience for electronics and technology products.
          We believe in quality, affordability, and exceptional customer service. Our mission is to make cutting-edge technology 
          accessible to everyone.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Our Story</h2>
        <p className="text-gray-700 leading-relaxed mb-4">
          Founded in 2024, Dot-Com Retail started as a small e-commerce platform with a vision to revolutionize online shopping.
          Today, we serve thousands of customers worldwide, offering a curated selection of electronics, gadgets, and tech accessories.
        </p>
        <p className="text-gray-700 leading-relaxed">
          We partner with leading brands to bring you authentic products at competitive prices, backed by our commitment to 
          quality and customer satisfaction.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Our Team</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto mb-4"></div>
            <h3 className="font-semibold">John Smith</h3>
            <p className="text-gray-600">CEO & Founder</p>
          </div>
          <div className="text-center">
            <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto mb-4"></div>
            <h3 className="font-semibold">Sarah Johnson</h3>
            <p className="text-gray-600">Head of Operations</p>
          </div>
          <div className="text-center">
            <div className="w-32 h-32 bg-gray-200 rounded-full mx-auto mb-4"></div>
            <h3 className="font-semibold">Mike Chen</h3>
            <p className="text-gray-600">Customer Success Lead</p>
          </div>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-4">Why Choose Us?</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="border p-6 rounded-lg">
            <h3 className="font-semibold mb-2">✓ Authentic Products</h3>
            <p className="text-gray-600">All products are sourced directly from authorized distributors</p>
          </div>
          <div className="border p-6 rounded-lg">
            <h3 className="font-semibold mb-2">✓ Secure Shopping</h3>
            <p className="text-gray-600">Your data is protected with industry-leading security measures</p>
          </div>
          <div className="border p-6 rounded-lg">
            <h3 className="font-semibold mb-2">✓ Fast Shipping</h3>
            <p className="text-gray-600">Quick and reliable delivery to your doorstep</p>
          </div>
          <div className="border p-6 rounded-lg">
            <h3 className="font-semibold mb-2">✓ 24/7 Support</h3>
            <p className="text-gray-600">Our customer service team is always here to help</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-4">Connect With Us</h2>
        <div className="flex gap-4">
          <a href="https://facebook.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
            Facebook
          </a>
          <a href="https://twitter.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
            Twitter
          </a>
          <a href="https://instagram.com" target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">
            Instagram
          </a>
          <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-blue-700 hover:underline">
            LinkedIn
          </a>
        </div>
      </section>
    </div>
  );
}
