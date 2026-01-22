import ConfigurationsPageClient from "@/components/ConfigurationsPageClient";

export const dynamic = "force-dynamic";

export default function ConfigurationsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Saved Configurations
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mt-1">
          Manage saved URL and credential combinations for quick testing
        </p>
      </div>

      <ConfigurationsPageClient />
    </div>
  );
}
