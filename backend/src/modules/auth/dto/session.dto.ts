import { Session } from '../session.entity';

/**
 * SessionDto — matches the contract: { id, userAgent, ip, createdAt, expiresAt, isCurrent }
 */
export class SessionDto {
  id!: string;
  userAgent!: string | null;
  ip!: string | null;
  createdAt!: string;
  expiresAt!: string;
  isCurrent!: boolean;

  static fromEntity(session: Session, currentSessionId: string): SessionDto {
    const dto = new SessionDto();
    dto.id = session.id;
    dto.userAgent = session.userAgent;
    dto.ip = session.ip;
    dto.createdAt = session.createdAt.toISOString();
    dto.expiresAt = session.expiresAt.toISOString();
    dto.isCurrent = session.id === currentSessionId;
    return dto;
  }
}
