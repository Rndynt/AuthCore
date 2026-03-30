'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">500</h1>
        <p className="mt-2 text-gray-600">Something went wrong</p>
        <button
          onClick={reset}
          className="mt-4 inline-block text-blue-600 hover:underline"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
