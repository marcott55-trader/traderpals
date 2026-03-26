export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">TraderPals</h1>
      <p className="text-lg text-gray-600 mb-8">
        Trading group bot system &amp; dashboard
      </p>
      <div className="grid gap-4 text-sm text-gray-500 max-w-md w-full">
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold text-gray-700 mb-1">Bot Status</h2>
          <p>
            Check{" "}
            <a href="/api/health" className="text-blue-600 underline">
              /api/health
            </a>{" "}
            for system health.
          </p>
        </div>
        <div className="border rounded-lg p-4">
          <h2 className="font-semibold text-gray-700 mb-1">Active Modules</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Market Movers &rarr; #premarket</li>
            <li>News &rarr; #news (coming soon)</li>
            <li>Political News &rarr; #politics (coming soon)</li>
            <li>Econ Calendar &rarr; #econ-calendar (coming soon)</li>
            <li>Earnings &rarr; #earnings (coming soon)</li>
            <li>Price Alerts &rarr; #alerts (coming soon)</li>
            <li>Flow / Sentiment &rarr; #flow (coming soon)</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
