"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { NotificationProvider } from "@/components/NotificationProvider";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false}>
      <NotificationProvider>{children}</NotificationProvider>
    </SessionProvider>
  );
}

