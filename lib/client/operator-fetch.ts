const STORAGE_KEY = "voicelab_operator_secret";

function readSecret() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeSecret(value: string | null) {
  try {
    if (value) {
      window.sessionStorage.setItem(STORAGE_KEY, value);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // sessionStorage unavailable; the secret is simply asked for again.
  }
}

/**
 * Calls a privileged route. The operator secret is typed in by the operator and kept only in this
 * tab's sessionStorage; it is never bundled into the client build.
 */
export async function operatorFetch(input: string, init: RequestInit = {}) {
  const send = (secret: string | null) =>
    fetch(input, {
      ...init,
      headers: { ...init.headers, ...(secret ? { "x-operator-secret": secret } : {}) }
    });

  let response = await send(readSecret());
  if (response.status === 401) {
    const entered = window.prompt("Operator secret required for this action:");
    storeSecret(entered || null);
    if (entered) {
      response = await send(entered);
    }
  }
  if (response.status === 401 || response.status === 403) {
    storeSecret(null);
    window.alert(response.status === 403 ? "Operator routes are disabled on this deployment." : "Operator secret rejected.");
  }
  return response;
}
