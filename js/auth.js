
const ROLE_PAGES = { patient: 'patient.html', doctor: 'doctor.html', cashier: 'cashier.html' };

function showAuthForm(formName) {
  const forms = ['login', 'register', 'forgot'];
  const selectedForm = document.getElementById(`${formName}-form`);
  if (!selectedForm) return;
  forms.forEach(name => {
    const element = document.getElementById(`${name}-form`);
    if (!element) return;
    const hidden = name !== formName;
    element.classList.toggle('is-hidden', hidden);
    element.setAttribute('aria-hidden', String(hidden));
  });
  const message = document.getElementById('auth-message');
  if (message) { message.textContent = ''; message.classList.remove('success'); }
}

function setAuthMessage(message, success = false) {
  const element = document.getElementById('auth-message');
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('success', success);
}

function setFormBusy(form, busy, label) {
  const button = form.querySelector('button[type="submit"]');
  if (!button) return;
  button.disabled = busy;
  if (busy) { button.dataset.originalText = button.querySelector('span').textContent; button.querySelector('span').textContent = label; }
  else if (button.dataset.originalText) button.querySelector('span').textContent = button.dataset.originalText;
}

async function getAssignedRole(user) {
  // The profiles table is authoritative. app_metadata is an optional trusted fallback;
  // user_metadata is deliberately not used for access checks because users can edit it.
  const { data, error } = await supabaseClient.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (error) {
    throw new Error(`Could not read your role from Supabase (${error.message}). Run supabase-schema.sql in the Supabase SQL Editor, then try again.`);
  }
  if (data?.role) return data.role;
  return user.app_metadata?.role || null;
}

async function redirectForRole(role) {
  if (!ROLE_PAGES[role]) throw new Error('Your account does not have an assigned hospital role yet. Please contact the hospital administrator.');
  window.location.assign(ROLE_PAGES[role]);
}

async function handleRegister(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  const role = form.elements.role.value;
  setAuthMessage(''); setFormBusy(form, true, 'Creating account…');
  try {
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name, role } } });
    if (error) throw error;
    if (data.session) {
      setAuthMessage('Account created. Your role must be assigned in the hospital profiles table before you can sign in.', true);
    } else {
      setAuthMessage('Account created. Check your email to confirm it, then sign in. Your selected role is a request and may need administrator approval.', true);
    }
    form.reset();
  } catch (error) {
    setAuthMessage(error.message || 'Could not create your account. Please try again.');
  } finally { setFormBusy(form, false); }
}

async function handleLogin(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.elements.email.value.trim();
  const password = form.elements.password.value;
  setAuthMessage(''); setFormBusy(form, true, 'Signing in…');
  let hasAuthSession = false;
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    hasAuthSession = true;
    const role = await getAssignedRole(data.user);
    if (!ROLE_PAGES[role]) {
      throw new Error('Your profile has no assigned role yet. New signups start as Patient; ask the administrator to assign Doctor or Cashier access if needed.');
    }
    await redirectForRole(role);
  } catch (error) {
    if (hasAuthSession) await supabaseClient.auth.signOut();
    setAuthMessage(error.message || 'Sign in failed. Please check your details and try again.');
  } finally { setFormBusy(form, false); }
}

async function handleForgotPassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const email = form.elements.email.value.trim();
  setAuthMessage(''); setFormBusy(form, true, 'Sending link…');
  try {
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password.html`
    });
    if (error) throw error;
    setAuthMessage('If an account uses that email, a password reset link will arrive shortly. Check your inbox and spam folder.', true);
    form.reset();
  } catch (error) {
    setAuthMessage(error.message || 'Could not send the reset link. Please try again.');
  } finally { setFormBusy(form, false); }
}

async function handleUpdatePassword(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const password = form.elements.password.value;
  const confirmation = form.elements.confirmPassword.value;
  if (password !== confirmation) { setAuthMessage('The passwords do not match.'); return; }
  setAuthMessage(''); setFormBusy(form, true, 'Updating…');
  try {
    const { data: { session }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!session) throw new Error('This reset link is invalid or has expired. Request a new one from the sign-in page.');
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) throw error;
    setAuthMessage('Password updated. Taking you back to sign in…', true);
    await supabaseClient.auth.signOut();
    window.setTimeout(() => window.location.assign('index.html'), 1200);
  } catch (error) {
    setAuthMessage(error.message || 'Could not update your password. Request a new reset link and try again.');
  } finally { setFormBusy(form, false); }
}

async function requireDashboardRole(expectedRole) {
  if (!window.supabaseClient) { window.location.replace('index.html'); return; }
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error || !user) { window.location.replace('index.html'); return; }
  try {
    const role = await getAssignedRole(user);
    if (role !== expectedRole) {
      await supabaseClient.auth.signOut();
      window.location.replace('index.html');
      return;
    }
  } catch (error) {
    console.error('Could not verify dashboard role:', error);
    window.location.replace('index.html');
  }
}

async function logoutUser() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) console.error('Sign out failed:', error.message);
  window.location.replace('index.html');
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-show]').forEach(button => button.addEventListener('click', () => showAuthForm(button.dataset.show)));
  document.querySelectorAll('[data-password-toggle]').forEach(button => button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.passwordToggle);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(show));
    button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));
  const loginForm = document.getElementById('login-form-fields');
  const registerForm = document.getElementById('register-form-fields');
  const forgotForm = document.getElementById('forgot-form-fields');
  const updatePasswordForm = document.getElementById('update-password-form');
  if (loginForm) loginForm.addEventListener('submit', handleLogin);
  if (registerForm) registerForm.addEventListener('submit', handleRegister);
  if (forgotForm) forgotForm.addEventListener('submit', handleForgotPassword);
  if (updatePasswordForm) updatePasswordForm.addEventListener('submit', handleUpdatePassword);
});
