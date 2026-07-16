"use client";

import React from "react";

interface SkeletonProps {
    className?: string;
    variant?: "rectangle" | "circle" | "text";
    shimmer?: boolean;
}

export function Skeleton({
    className = "",
    variant = "rectangle",
    shimmer = true
}: SkeletonProps) {
    const baseClass = "bg-slate-200 dark:bg-slate-800 overflow-hidden relative";
    const variantClass = variant === "circle" ? "rounded-full" : "rounded-xl";
    const shimmerClass = shimmer ? "after:content-[''] after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-white/20 dark:after:via-white/10 after:to-transparent" : "";

    return (
        <div className={`${baseClass} ${variantClass} ${className} ${shimmerClass}`} />
    );
}

export function CardSkeleton() {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
                <Skeleton variant="circle" className="w-10 h-10" />
                <Skeleton className="h-4 w-1/3" />
            </div>
            <Skeleton className="h-6 w-3/4" />
            <div className="space-y-2 mt-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
            </div>
        </div>
    );
}

export function ScoreSkeleton() {
    return (
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-8 flex flex-col items-center justify-center gap-8">
            <Skeleton variant="circle" className="w-[180px] h-[180px]" />
            <div className="w-full space-y-4">
                <div className="flex justify-between items-center">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <div className="flex justify-between items-center">
                    <Skeleton className="h-3 w-24" />
                    <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
            </div>
        </div>
    );
}
