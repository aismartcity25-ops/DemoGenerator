/**
 * Utility per la gestione dell'autenticazione
 */

async function checkAuth(expectedProduct) {
  try {
    const res = await fetch('/api/me');
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const user = data.user;
    
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
