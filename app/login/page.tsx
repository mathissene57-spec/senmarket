‘use client’

import { useState } from ‘react’
import { useRouter } from ‘next/navigation’
import { createClient } from ‘@/lib/supabase/client’

export default function LoginPage() {
const router = useRouter()
const supabase = createClient()

const [mode, setMode] = useState<‘login’ | ‘register’>(‘login’)
const [loading, setLoading] = useState(false)
const [msg, setMsg] = useState<{ text: string; type: ‘ok’ | ‘err’ } | null>(null)

// Champs login
const [loginEmail, setLoginEmail] = useState(’’)
const [loginPwd, setLoginPwd] = useState(’’)

// Champs inscription
const [regNom, setRegNom] = useState(’’)
const [regEmail, setRegEmail] = useState(’’)
const [regPwd, setRegPwd] = useState(’’)

function showMsg(text: string, type: ‘ok’ | ‘err’) {
setMsg({ text, type })
}

async function handleLogin(e: React.FormEvent) {
e.preventDefault()
if (!loginEmail || !loginPwd) {
showMsg(‘Email et mot de passe requis’, ‘err’)
return
}

```
setLoading(true)
setMsg(null)

const { error } = await supabase.auth.signInWithPassword({
  email: loginEmail,
  password: loginPwd,
})

setLoading(false)

if (error) {
  showMsg(error.message || 'Identifiants incorrects', 'err')
  return
}

showMsg('Connexion reussie ! Redirection...', 'ok')
router.push('/dashboard')
router.refresh()
```

}

async function handleRegister(e: React.FormEvent) {
e.preventDefault()
if (!regNom || !regEmail) {
showMsg(‘Nom et email requis’, ‘err’)
return
}
if (regPwd.length < 8) {
showMsg(‘Mot de passe minimum 8 caracteres’, ‘err’)
return
}

```
setLoading(true)
setMsg(null)

const { error } = await supabase.auth.signUp({
  email: regEmail,
  password: regPwd,
  options: {
    data: { full_name: regNom, role: 'vendor' },
  },
})

setLoading(false)

if (error) {
  showMsg(error.message, 'err')
  return
}

showMsg('Compte cree ! Verifiez votre email pour confirmer.', 'ok')
```

}

async function handleMagicLink() {
if (!loginEmail) {
showMsg(“Entrez votre email d’abord”, ‘err’)
return
}
setLoading(true)
const { error } = await supabase.auth.signInWithOtp({ email: loginEmail })
setLoading(false)

```
if (error) {
  showMsg(error.message, 'err')
  return
}
showMsg('Lien envoye a ' + loginEmail + ' !', 'ok')
```

}

async function handleResetPassword() {
if (!loginEmail) {
showMsg(“Entrez votre email d’abord”, ‘err’)
return
}
const { error } = await supabase.auth.resetPasswordForEmail(loginEmail, {
redirectTo: `${window.location.origin}/login`,
})

```
if (error) {
  showMsg(error.message, 'err')
  return
}
showMsg('Email de reinitialisation envoye !', 'ok')
```

}

return (
<div style={styles.body}>
<div style={styles.logo}>
<div style={styles.logoIco}>🛒</div>
<span style={styles.logoTxt}>
Sen<span style={{ color: ‘#F5B800’ }}>Market</span>
</span>
</div>

```
  <div style={styles.card}>
    <div style={styles.cardTitle}>Espace Vendeur</div>
    <div style={styles.cardSub}>Connectez-vous pour acceder a votre dashboard</div>

    <div style={styles.tabs}>
      <button
        style={mode === 'login' ? styles.tabBtnOn : styles.tabBtn}
        onClick={() => { setMode('login'); setMsg(null) }}
      >
        Se connecter
      </button>
      <button
        style={mode === 'register' ? styles.tabBtnOn : styles.tabBtn}
        onClick={() => { setMode('register'); setMsg(null) }}
      >
        Creer un compte
      </button>
    </div>

    {mode === 'login' ? (
      <form onSubmit={handleLogin}>
        <div style={styles.fg}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            placeholder="awa@email.com"
            autoComplete="email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
          />
        </div>
        <div style={styles.fg}>
          <label style={styles.label}>Mot de passe</label>
          <input
            style={styles.input}
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            value={loginPwd}
            onChange={(e) => setLoginPwd(e.target.value)}
          />
        </div>
        <button style={styles.btnP} type="submit" disabled={loading}>
          {loading ? 'Chargement...' : 'Se connecter'}
        </button>

        <div style={styles.divider}>ou</div>

        <button
          style={styles.btnWa}
          type="button"
          onClick={handleMagicLink}
          disabled={loading}
        >
          ✉️ Lien magique par email
        </button>

        <div style={styles.forgot}>
          <span onClick={handleResetPassword} style={styles.forgotLink}>
            Mot de passe oublie ?
          </span>
        </div>
      </form>
    ) : (
      <form onSubmit={handleRegister}>
        <div style={styles.fg}>
          <label style={styles.label}>Nom complet</label>
          <input
            style={styles.input}
            type="text"
            placeholder="Awa Diallo"
            autoComplete="name"
            value={regNom}
            onChange={(e) => setRegNom(e.target.value)}
          />
        </div>
        <div style={styles.fg}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            type="email"
            placeholder="awa@email.com"
            autoComplete="email"
            value={regEmail}
            onChange={(e) => setRegEmail(e.target.value)}
          />
        </div>
        <div style={styles.fg}>
          <label style={styles.label}>Mot de passe</label>
          <input
            style={styles.input}
            type="password"
            placeholder="Minimum 8 caracteres"
            autoComplete="new-password"
            value={regPwd}
            onChange={(e) => setRegPwd(e.target.value)}
          />
        </div>
        <button style={styles.btnP} type="submit" disabled={loading}>
          {loading ? 'Chargement...' : 'Creer mon compte'}
        </button>
      </form>
    )}

    {msg && (
      <div style={msg.type === 'ok' ? styles.msgOk : styles.msgErr}>
        {msg.text}
      </div>
    )}
  </div>

  <div style={styles.backLink}>
    <a href="/" style={{ color: '#00C96B', fontWeight: 600, textDecoration: 'none' }}>
      ← Retour a la marketplace
    </a>
  </div>
</div>
```

)
}

const styles: { [key: string]: React.CSSProperties } = {
body: {
fontFamily: “‘DM Sans’, system-ui, sans-serif”,
background: ‘#0A1A0F’,
color: ‘#F2F7F4’,
minHeight: ‘100vh’,
display: ‘flex’,
flexDirection: ‘column’,
alignItems: ‘center’,
justifyContent: ‘center’,
padding: 20,
},
logo: { display: ‘flex’, alignItems: ‘center’, gap: 10, marginBottom: 32 },
logoIco: {
width: 44, height: 44, borderRadius: 12,
background: ‘linear-gradient(135deg,#006B3C,#00A65A)’,
display: ‘flex’, alignItems: ‘center’, justifyContent: ‘center’,
fontSize: 22, boxShadow: ‘0 4px 20px rgba(0,201,107,.25)’,
},
logoTxt: { fontFamily: “‘Playfair Display’, serif”, fontSize: 24, fontWeight: 900 },
card: {
background: ‘#111F16’, border: ‘1px solid rgba(255,255,255,.08)’,
borderRadius: 24, padding: ‘clamp(24px,5vw,40px)’,
width: ‘100%’, maxWidth: 400,
boxShadow: ‘0 16px 48px rgba(0,0,0,.4)’,
},
cardTitle: { fontFamily: “‘Playfair Display’, serif”, fontSize: 22, fontWeight: 900, marginBottom: 6, textAlign: ‘center’ },
cardSub: { fontSize: 14, color: ‘#6A8572’, textAlign: ‘center’, marginBottom: 28, lineHeight: 1.6 },
tabs: { display: ‘flex’, background: ‘#0A1A0F’, borderRadius: 10, padding: 4, marginBottom: 24 },
tabBtn: {
flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700,
color: ‘#6A8572’, cursor: ‘pointer’, textAlign: ‘center’,
border: ‘none’, fontFamily: ‘inherit’, background: ‘transparent’,
},
tabBtnOn: {
flex: 1, padding: 10, borderRadius: 8, fontSize: 13, fontWeight: 700,
color: ‘#00C96B’, cursor: ‘pointer’, textAlign: ‘center’,
border: ‘none’, fontFamily: ‘inherit’, background: ‘#172618’,
boxShadow: ‘0 2px 8px rgba(0,0,0,.3)’,
},
fg: { marginBottom: 16 },
label: { display: ‘block’, fontSize: 12, fontWeight: 700, color: ‘#6A8572’, textTransform: ‘uppercase’, letterSpacing: ‘.7px’, marginBottom: 8 },
input: {
width: ‘100%’, padding: ‘14px 16px’, background: ‘#172618’,
border: ‘1.5px solid rgba(255,255,255,.08)’, borderRadius: 12,
fontSize: 16, color: ‘#F2F7F4’, fontFamily: ‘inherit’, outline: ‘none’,
},
btnP: {
width: ‘100%’, padding: 16, borderRadius: 14, background: ‘#00C96B’,
color: ‘#000’, fontSize: 16, fontWeight: 700, border: ‘none’,
cursor: ‘pointer’, fontFamily: ‘inherit’, marginTop: 8,
boxShadow: ‘0 4px 20px rgba(0,201,107,.25)’,
},
btnWa: {
width: ‘100%’, padding: 14, borderRadius: 14, background: ‘#25D366’,
color: ‘#fff’, fontSize: 14, fontWeight: 700, border: ‘none’,
cursor: ‘pointer’, fontFamily: ‘inherit’,
},
divider: { textAlign: ‘center’, margin: ‘20px 0’, color: ‘#3D5449’, fontSize: 13 },
forgot: { textAlign: ‘center’, marginTop: 16, fontSize: 13, color: ‘#6A8572’ },
forgotLink: { color: ‘#00C96B’, fontWeight: 600, cursor: ‘pointer’ },
msgOk: {
padding: ‘12px 16px’, borderRadius: 10, fontSize: 13, fontWeight: 500,
marginTop: 12, textAlign: ‘center’,
background: ‘rgba(0,201,107,.12)’, border: ‘1px solid rgba(0,201,107,.25)’, color: ‘#00C96B’,
},
msgErr: {
padding: ‘12px 16px’, borderRadius: 10, fontSize: 13, fontWeight: 500,
marginTop: 12, textAlign: ‘center’,
background: ‘rgba(255,71,87,.1)’, border: ‘1px solid rgba(255,71,87,.25)’, color: ‘#FF4757’,
},
backLink: { textAlign: ‘center’, marginTop: 20, fontSize: 13, color: ‘#6A8572’ },
}