import LogoutButton from '@/components/LogoutButton';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-3xl font-bold mb-6">Bienvenue au Dashboard</h1>
          <p className="text-gray-600 mb-6">
            Vous êtes connecté avec succès !
          </p>
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}