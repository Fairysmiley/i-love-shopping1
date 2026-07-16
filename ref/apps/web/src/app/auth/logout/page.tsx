import { handleSignOut } from "../logout-actions";

export default function LogoutPage() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg max-w-md w-full text-center">
                <h1 className="text-2xl font-bold mb-4 text-gray-900 dark:text-white">Sign Out</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6">
                    Are you sure you want to sign out?
                </p>
                <form action={handleSignOut}>
                    <button
                        type="submit"
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition"
                    >
                        Sign Out
                    </button>
                </form>
                <a
                    href="/dashboard"
                    className="block mt-4 text-blue-600 hover:underline"
                >
                    Cancel
                </a>
            </div>
        </div>
    );
}
