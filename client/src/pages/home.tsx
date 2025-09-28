export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-8">
            Welcome to Your Application
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-8">
            Your project has been successfully migrated to Replit and is ready for development.
          </p>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-4">🎉 Migration Complete!</h2>
            <p className="text-gray-600 dark:text-gray-300">
              Your application is now running securely on Replit with proper client/server separation.
              You can start building your features from here.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}