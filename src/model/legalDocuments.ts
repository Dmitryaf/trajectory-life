export const TERMS_VERSION = '2026-10-09-v1';
export const PRIVACY_POLICY_VERSION = '2026-10-09-v1';
export const LEGAL_DOCUMENT_DATE = '9 октября 2026 года';

export type TermsAcceptance = {
  accepted: true;
  terms_version: typeof TERMS_VERSION;
  privacy_policy_version: typeof PRIVACY_POLICY_VERSION;
};

export function currentTermsAcceptance(): TermsAcceptance {
  return { accepted: true, terms_version: TERMS_VERSION, privacy_policy_version: PRIVACY_POLICY_VERSION };
}

export function isCurrentTermsAcceptance(value: unknown): value is TermsAcceptance {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const acceptance = value as Record<string, unknown>;
  return (
    Object.keys(acceptance).length === 3 &&
    acceptance.accepted === true &&
    acceptance.terms_version === TERMS_VERSION &&
    acceptance.privacy_policy_version === PRIVACY_POLICY_VERSION
  );
}
