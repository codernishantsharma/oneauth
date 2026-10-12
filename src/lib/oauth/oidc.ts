import { createPrivateKey, createPublicKey } from "node:crypto";
import { importPKCS8, importSPKI, exportJWK, SignJWT } from "jose";
import { db } from "@/src/prisma/db";
import { normalizeIssuer } from "./validation";

export function getIssuer() {
  return normalizeIssuer(process.env.ONEAUTH_ISSUER_URL ?? "", process.env.NODE_ENV === "production");
}

export async function getOidcKey() {
  const pem = process.env.ONEAUTH_OIDC_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const kid = process.env.ONEAUTH_OIDC_KEY_ID;
  if (!pem || !kid || !/^[A-Za-z0-9._-]{1,128}$/.test(kid) || !pem.includes("PRIVATE KEY")) {
    throw new Error("Configure ONEAUTH_OIDC_PRIVATE_KEY and ONEAUTH_OIDC_KEY_ID before enabling OpenID Connect.");
  }
  const privateKey = createPrivateKey(pem);
  if (privateKey.asymmetricKeyType !== "rsa" || (privateKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
    throw new Error("The OpenID Connect signing key must be an RSA key of at least 2048 bits.");
  }
  const key = await importPKCS8(pem, "RS256");
  return { key, kid };
}

export async function signIdToken(input: { userId: string; clientId: string; nonce: string | null; scopes: string[] }) {
  const issuer = getIssuer();
  const { key, kid } = await getOidcKey();
  const now = Math.floor(Date.now() / 1000);
  const claims: Record<string, unknown> = {};
  if (input.nonce) claims.nonce = input.nonce;
  if (input.scopes.includes("email") || input.scopes.includes("profile")) {
    const rows = await db.runtime().query(db.raw.sql`SELECT ea.normalized_email AS email,ea.verified_at AS "verifiedAt",p.username,p.display_name AS "displayName" FROM public.users u LEFT JOIN public.email_addresses ea ON ea.user_id=u.id AND ea.is_primary=true LEFT JOIN public.profiles p ON p.user_id=u.id WHERE u.id=${input.userId}::uuid AND u.status='ACTIVE' AND u.deleted_at IS NULL LIMIT 1`.returnsRow({email:"pg/text@1",verifiedAt:"pg/timestamptz-string@1",username:"pg/text@1",displayName:"pg/text@1"}).build());
    const row = rows[0];
    if (!row) throw new Error("OIDC_ACCOUNT_NOT_ACTIVE");
    if (input.scopes.includes("email")) {
      if (row.email) claims.email = row.email;
      claims.email_verified = Boolean(row.verifiedAt);
    }
    if (input.scopes.includes("profile")) {
      if (row.username) claims.preferred_username = row.username;
      if (row.displayName) claims.name = row.displayName;
    }
  }
  return new SignJWT(claims).setProtectedHeader({alg:"RS256",kid,typ:"JWT"}).setIssuer(issuer).setAudience(input.clientId).setSubject(input.userId).setIssuedAt(now).setExpirationTime(now+300).sign(key);
}

export async function getPublicJwks() {
  const { kid } = await getOidcKey();
  const pem = process.env.ONEAUTH_OIDC_PRIVATE_KEY!.replace(/\\n/g, "\n");
  const privateKey = createPrivateKey(pem);
  const publicPem = createPublicKey(privateKey).export({format:"pem",type:"spki"}).toString();
  const publicKey = await importSPKI(publicPem,"RS256");
  const jwk = await exportJWK(publicKey);
  return {keys:[{...jwk,kid,use:"sig",alg:"RS256"}]};
}
