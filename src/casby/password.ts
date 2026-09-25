import crypto from 'crypto';

export function hashPassword(password: string, salt: string | null = null): string {
    const saltHex = salt || crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(String(password), saltHex, 120000, 32, 'sha256').toString('hex');
    return `pbkdf2$sha256$120000$${saltHex}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
    if (!storedHash || typeof storedHash !== 'string') return false;
    const parts = storedHash.split('$');
    if (parts.length !== 5) return false;
    const [prefix, algo, iterStr, salt, expectedHashHex] = parts;
    if (prefix !== 'pbkdf2') return false;
    const iterations = parseInt(iterStr, 10);
    if (!iterations || !salt || !expectedHashHex) return false;

    const expectedBuffer = Buffer.from(expectedHashHex, 'hex');
    const calculatedHash = crypto.pbkdf2Sync(String(password), salt, iterations, expectedBuffer.length, algo).toString('hex');
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

    if (expectedBuffer.length !== calculatedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, calculatedBuffer);
}
