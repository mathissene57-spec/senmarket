'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      const response = await fetch('/auth/logout', {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Erreur de déconnexion');
      }

      router.push('/login');
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loading}
      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
    >
      {loading ? 'Déconnexion...' : 'Se déconnecter'}
    </button>
  );
}
