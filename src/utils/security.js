/**
 * security.js
 * -----------
 * Cryptographic utility for securing QR codes and routing parameters.
 */

export async function generateTableToken(resId, tableId) {
  if (!resId || !tableId) return "";
  const secretSalt = "FW_PROD_SECURE_SALT_991";
  const message = `${resId}:${tableId}:${secretSalt}`;
  
  // Use Web Crypto API for secure SHA-256 hashing
  const msgUint8 = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Return a short, deterministic 12-character token
  return hashHex.substring(0, 12);
}
