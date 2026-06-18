import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password, fullName } = await request.json();

    // Validation basique
    if (!email || !password || !fullName) {
      return NextResponse.json(
        { message: 'Email, mot de passe et nom complet requis' },
        { status: 400 }
      );
    }

    // Créer client Supabase
    const supabase = await createClient();

    // S'inscrire avec Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      return NextResponse.json(
        { message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        message: 'Inscription réussie. Vérifiez votre email.',
        user: data.user,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Erreur signup:', error);
    return NextResponse.json(
      { message: 'Erreur serveur' },
      { status: 500 }
    );
  }
}