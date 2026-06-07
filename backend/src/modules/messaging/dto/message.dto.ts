/**
 * MessageDto — canonical response shape for a DM message.
 * Matches the API contract MessageDto spec.
 */
export class MessageDto {
  id!: string;
  conversationId!: string;
  senderId!: string;
  text!: string | null;
  media!: null; // Media subtask wires this; null for now
  clientNonce!: string;
  createdAt!: string;
}
