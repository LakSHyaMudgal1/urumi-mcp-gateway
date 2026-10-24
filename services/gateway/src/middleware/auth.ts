import { Request, Response, NextFunction } from 'express';
import { User, Role } from '@urumi/shared';
import { verifyJWT } from '@urumi/shared';
import { UserRepository, APIKeyRepository } from '../db/repositories.js';

export interface AuthenticatedRequest extends Request {
  user?: User;
  authMethod?: 'jwt' | 'api_key';
  keyId?: string;
}

export interface AuthMiddlewareOptions {
  userRepo: UserRepository;
  apiKeyRepo: APIKeyRepository;
  jwtSecret: string;
}

export function createAuthMiddleware(options: AuthMiddlewareOptions) {
  const { userRepo, apiKeyRepo, jwtSecret } = options;

  /**
   * Resolves the caller's identity from Authorization header (Bearer JWT or Bearer API key).
   */
  const authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers['authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return next();
      }

      const token = authHeader.replace(/^Bearer\s+/, '').trim();
      if (!token) return next();

      // Case A: Gateway API Key (mcp_live_...)
      if (token.startsWith('mcp_live_')) {
        const validated = await apiKeyRepo.validateKey(token, jwtSecret);
        if (validated) {
          req.user = validated.user;
          req.authMethod = 'api_key';
          req.keyId = validated.keyId;
        }
        return next();
      }

      // Case B: Session JWT
      const jwtPayload = verifyJWT(token, jwtSecret);
      if (jwtPayload) {
        const user = await userRepo.findById(jwtPayload.userId);
        if (user) {
          req.user = user;
          req.authMethod = 'jwt';
        }
      }

      next();
    } catch (err) {
      next(err);
    }
  };

  /**
   * Enforces that the request is authenticated by an active user.
   */
  const requireAuth = (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized: Authentication required via Bearer JWT or Gateway API key'
      });
    }

    if (req.user.status === 'disabled') {
      return res.status(403).json({
        error: 'Forbidden: Account has been disabled by an administrator'
      });
    }

    next();
  };

  /**
   * Enforces role-based authorization (e.g. 'admin').
   */
  const requireRole = (role: Role) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized: Authentication required'
        });
      }

      if (req.user.status === 'disabled') {
        return res.status(403).json({
          error: 'Forbidden: Account has been disabled by an administrator'
        });
      }

      if (req.user.role !== role) {
        return res.status(403).json({
          error: `Forbidden: ${role} privilege is required for this action`
        });
      }

      next();
    };
  };

  return {
    authenticate,
    requireAuth,
    requireRole
  };
}
