/**
 * Utility per la gestione dell'autenticazione
 */

async function checkAuth(expectedProduct) {
  try {
    const res = await fetch('/api/me');
    const data = await res.json().catch(() => ({}));
    const user = data.user;

    // Not authenticated -> redirect to login
    if (!user) {
      window.location.href = `/${expectedProduct}/login.html`;
      return null;
    }

    // Check if user has access to the expected product
    if (user.currentProduct !== expectedProduct) {
      // Redirect to the correct product
      window.location.href = `/${expectedProduct}/login.html`;
      return null;
    }

    return user;
  } catch (e) {
    console.error('Auth check failed:', e);
    window.location.href = '/login_comunicai.html';
    return null;
  }
}

async function logout(product) {
  try {
    await fetch('/api/logout', { method: 'POST' });
  } catch (e) {
    console.error('Logout failed:', e);
  }
  window.location.href = `/${product}/login.html`;
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.checkAuth = checkAuth;
  window.logout = logout;
}
