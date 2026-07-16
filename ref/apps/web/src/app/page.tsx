"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function Home() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    if (status === "loading") {
      return; // Still checking
    }

    setIsLoading(false);

    // If user is logged in, redirect to dashboard
    if (status === "authenticated" && session) {
      router.replace("/dashboard");
    }
  }, [status, session, router]);

  // Show loading state while checking session
  if (isLoading || status === "loading") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-12 lg:px-24">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </main>
    );
  }

  // Don't render if user is authenticated (will redirect)
  if (status === "authenticated") {
    return null;
  }

  // Show landing page for non-authenticated users
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 px-6 py-16 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 sm:px-12 lg:px-24">
      <section className="max-w-4xl space-y-4 text-center">
        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">
          Wellness Platform
        </h1>
        <p className="text-lg text-zinc-600 dark:text-zinc-400 sm:text-xl">
          Building an AI-first health companion in three deliberate stages.
          We are starting with robust health profiles and analytics to ensure
          later nutrition intelligence and conversational experiences have
          reliable, well-structured data to build on.
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <a
            href="/auth/register"
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Get Started
          </a>
          <a
            href="/auth/login"
            className="inline-flex items-center justify-center rounded-lg bg-white dark:bg-gray-800 px-6 py-3 text-sm font-semibold text-gray-900 dark:text-white border border-gray-300 dark:border-gray-700 shadow-sm transition hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Sign In
          </a>
        </div>
      </section>
    </main>
  );
}
