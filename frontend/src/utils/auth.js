const STORAGE_KEY = 'smugshotz_user';

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

export function setUser(user) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  if (user && user.user_id) {
    localStorage.setItem('user_id', String(user.user_id));
  }
}

export function clearUser() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem('user_id');
}
