const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function pilotAccounts(value: string | undefined): string[] {
  const ids = value?.split(",").map(id => id.trim().toLowerCase()) ?? [];
  if (ids.length < 1 || ids.length > 2 || !ids.every(id => uuid.test(id)) || new Set(ids).size !== ids.length) return [];
  return ids;
}

export function withdrawalVerificationMethod(identities: readonly { provider: string }[], amr: unknown) {
  const googleOAuth = identities.some(identity => identity.provider === "google") &&
    Array.isArray(amr) && amr.some(entry => entry?.method === "oauth");
  return !googleOAuth && identities.some(identity => identity.provider === "email") ? "password" : "email";
}
