import {
  exportJWK,
  importPKCS8,
  importSPKI,
  jwtVerify,
  SignJWT,
  type JWK,
  type JWTPayload,
} from "jose";

export interface JwtConfig {
  algorithm: "EdDSA" | "RS256";
  issuer: string;
  audience: string;
  privateKeyPem: string;
  publicKeyPem: string;
  keyId?: string;
}

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  username: string;
  role: string;
}

export interface SignAccessTokenInput {
  sub: string;
  username: string;
  role: string;
}

type JoseKey = Awaited<ReturnType<typeof importPKCS8>>;

export class AsymmetricJwtService {
  private readonly config: JwtConfig;
  private privateKeyPromise: Promise<JoseKey> | null = null;
  private publicKeyPromise: Promise<JoseKey> | null = null;

  constructor(config: JwtConfig) {
    this.config = config;
  }

  private getPrivateKey(): Promise<JoseKey> {
    if (!this.privateKeyPromise) {
      this.privateKeyPromise = importPKCS8(this.config.privateKeyPem, this.config.algorithm);
    }
    return this.privateKeyPromise;
  }

  private getPublicKey(): Promise<JoseKey> {
    if (!this.publicKeyPromise) {
      this.publicKeyPromise = importSPKI(this.config.publicKeyPem, this.config.algorithm);
    }
    return this.publicKeyPromise;
  }

  async signAccessToken(
    claims: SignAccessTokenInput,
    expiresIn: string = "15m",
  ): Promise<string> {
    const privateKey = await this.getPrivateKey();
    return new SignJWT({ username: claims.username, role: claims.role })
      .setProtectedHeader({
        alg: this.config.algorithm,
        kid: this.config.keyId ?? "velostream-key-1",
      })
      .setSubject(claims.sub)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const publicKey = await this.getPublicKey();
    const { payload } = await jwtVerify(token, publicKey, {
      issuer: this.config.issuer,
      audience: this.config.audience,
      algorithms: [this.config.algorithm],
    });
    if (typeof payload.sub !== "string" || typeof payload.username !== "string") {
      throw new Error("JWT missing required subject or username claims");
    }
    return payload as AccessTokenClaims;
  }

  async getPublicJwks(): Promise<{ keys: JWK[] }> {
    const publicKey = await this.getPublicKey();
    const jwk = await exportJWK(publicKey);
    // Strip any private key component defensively before exposing publicly.
    const { d: _privateComponent, ...publicJwk } = jwk;
    return {
      keys: [
        {
          ...publicJwk,
          alg: this.config.algorithm,
          use: "sig",
          kid: this.config.keyId ?? "velostream-key-1",
        },
      ],
    };
  }
}

