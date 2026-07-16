"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { HealthProfileForm } from "@/components/HealthProfileForm";
import { FitnessAssessmentForm } from "@/components/FitnessAssessmentForm";
import { GoalsForm } from "@/components/GoalsForm";
import { Notification, useNotification } from "@/components/Notification";
import { logger } from "@/lib/logger";

type Tab = "physical" | "goals";

function EditProfileContent() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<Tab>("physical");
    const [profile, setProfile] = useState<any>(null);
    const [goals, setGoals] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const { notification, showNotification, hideNotification } = useNotification();

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [profileRes, goalsRes] = await Promise.all([
                    fetch("/api/profile"),
                    fetch("/api/goals"),
                ]);

                if (profileRes.ok) {
                    const data = await profileRes.json();
                    setProfile(data.profile);
                }

                if (goalsRes.ok) {
                    const data = await goalsRes.json();
                    setGoals(data.goals || []);
                }

            } catch (error) {
                logger.error("Error fetching profile data:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex">
            {notification && (
                <Notification
                    message={notification.message}
                    type={notification.type}
                    onClose={hideNotification}
                />
            )}
            <Sidebar />

            <main className="flex-1 md:ml-64 px-4 sm:px-6 lg:px-8 py-8 pt-16 md:pt-8">
                <div className="max-w-4xl mx-auto">
                    <div className="flex items-center justify-between mb-8">
                        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Edit Profile
                        </h1>
                        <button
                            onClick={() => router.push("/profile")}
                            className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                        >
                            Back to Profile
                        </button>
                    </div>

                    {/* Tabs */}
                    <div className="mb-8 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                        <nav className="flex space-x-8 min-w-max">
                            <button
                                onClick={() => setActiveTab("physical")}
                                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === "physical"
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                                    }`}
                            >
                                Physical & Bio
                            </button>
                            <button
                                onClick={() => setActiveTab("goals")}
                                className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${activeTab === "goals"
                                    ? "border-blue-500 text-blue-600 dark:text-blue-400"
                                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                                    }`}
                            >
                                Manage Goals
                            </button>
                        </nav>
                    </div>

                    {/* Tab Content */}
                    <div className="space-y-6">
                        {activeTab === "physical" && (
                            <HealthProfileForm
                                initialData={profile}
                                showMockIndicator={false}
                                onSubmit={async (data) => {
                                    try {
                                        const response = await fetch("/api/profile", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify(data),
                                        });
                                        if (!response.ok) throw new Error("Failed to update profile");
                                        showNotification("Health profile updated successfully", "success");
                                    } catch (error) {
                                        showNotification("Failed to update health profile", "error");
                                    }
                                }}
                            />
                        )}


                        {activeTab === "goals" && (
                            <GoalsForm
                                initialData={goals}
                                showMockIndicator={false}
                            />
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

export default function EditProfilePage() {
    return (
        <Suspense fallback={null}>
            <EditProfileContent />
        </Suspense>
    );
}
