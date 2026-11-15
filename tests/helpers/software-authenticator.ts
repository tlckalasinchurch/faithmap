/**
 * Software WebAuthn authenticator for tests only.
 * It builds real attestation ("none") and assertion objects with node:crypto,
 * so the server verification code is exercised, not mocked.
 */
import crypto from 'node:crypto';

// ---- minimal CBOR encoder (maps, byte strings, text, small ints)
function head(major: number, n: number): Buffer {
  if (n < 24) return Buffer.from([(major << 5) | n]);
  if (n < 256) return Buffer.from([(major << 5) | 24, n]);
  return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
}
type Cbor = number | string | Buffer | Map<Cbor, Cbor>;
function cbor(v: Cbor): Buffer {
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') {
    const b = Buffer.from(v, 'utf8');
    return Buffer.concat([head(3, b.length), b]);
  }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  const parts: Buffer[] = [head(5, v.size)];
  for (const [k, val] of v) parts.push(cbor(k), cbor(val));
  return Buffer.concat(parts);
}

const b64u = (b: Buffer) => b.toString('base64url');
const sha256 = (b: Buffer | string) => crypto.createHash('sha256').update(b).digest();

export interface AuthenticatorConfig {
  rpId: string;
  origin: string;
}

export class SoftwareAuthenticator {
  readonly credentialId = crypto.randomBytes(32);
  private readonly keys = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  private counter = 0;

  constructor(private readonly cfg: AuthenticatorConfig) {}

  get id(): string {
    return b64u(this.credentialId);
  }

  private coseKey(): Buffer {
    const jwk = this.keys.publicKey.export({ format: 'jwk' }) as { x: string; y: string };
    return cbor(
      new Map<Cbor, Cbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, Buffer.from(jwk.x, 'base64url')],
        [-3, Buffer.from(jwk.y, 'base64url')],
      ])
    );
  }

  private clientData(type: string, challenge: string, origin?: string): Buffer {
    return Buffer.from(
      JSON.stringify({ type, challenge, origin: origin ?? this.cfg.origin, crossOrigin: false })
    );
  }

  register(challenge: string, opts: { flags?: number; rpId?: string; origin?: string } = {}) {
    const flags = opts.flags ?? 0x01 | 0x04 | 0x40; // UP | UV | AT
    const counter = Buffer.alloc(4);
    const credLen = Buffer.alloc(2);
    credLen.writeUInt16BE(this.credentialId.length);
    const authData = Buffer.concat([
      sha256(opts.rpId ?? this.cfg.rpId),
      Buffer.from([flags]),
      counter,
      Buffer.alloc(16),
      credLen,
      this.credentialId,
      this.coseKey(),
    ]);
    const attestationObject = cbor(
      new Map<Cbor, Cbor>([
        ['fmt', 'none'],
        ['attStmt', new Map<Cbor, Cbor>()],
        ['authData', authData],
      ])
    );
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64u(this.clientData('webauthn.create', challenge, opts.origin)),
        attestationObject: b64u(attestationObject),
        transports: ['internal' as const],
      },
      clientExtensionResults: {},
    };
  }

  authenticate(
    challenge: string,
    userHandle: Buffer,
    opts: { flags?: number; rpId?: string; origin?: string; counter?: number; tamper?: boolean } = {}
  ) {
    this.counter = opts.counter ?? this.counter + 1;
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const authData = Buffer.concat([
      sha256(opts.rpId ?? this.cfg.rpId),
      Buffer.from([opts.flags ?? 0x01 | 0x04]),
      counter,
    ]);
    const clientDataJSON = this.clientData('webauthn.get', challenge, opts.origin);
    const signed = Buffer.concat([authData, sha256(clientDataJSON)]);
    let signature = crypto.sign('sha256', signed, this.keys.privateKey);
    if (opts.tamper) signature = Buffer.concat([signature.subarray(0, -1), Buffer.from([signature.at(-1)! ^ 1])]);
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key' as const,
      response: {
        clientDataJSON: b64u(clientDataJSON),
        authenticatorData: b64u(authData),
        signature: b64u(signature),
        userHandle: b64u(userHandle),
      },
      clientExtensionResults: {},
    };
  }
}
