import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service.js';

/**
 * WS chat: client connects with `auth: { token }` (access JWT).
 * Events:
 *  - c:join { conversationId }        → join room, presence
 *  - c:send { conversationId, text }  → persist + broadcast m:new
 *  - c:typing { conversationId }      → broadcast m:typing (no persist)
 *  - c:read { conversationId }        → mark read + broadcast m:read
 * Server emits: m:new, m:typing, m:read, presence { userId, online }
 */
@WebSocketGateway({ cors: { origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001').split(',') }, namespace: '/chat' })
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly chat: ChatService,
    private readonly jwt: JwtService,
  ) {}

  private userOf(client: Socket): { sub: string } | null {
    try {
      const token = (client.handshake.auth?.token as string)?.replace(/^Bearer /, '');
      if (!token) return null;
      const payload: any = this.jwt.verify(token, {
        secret: process.env.JWT_ACCESS_SECRET ?? 'change-me-access-secret-min-32-chars',
      });
      return { sub: payload.sub };
    } catch {
      return null;
    }
  }

  async handleConnection(client: Socket) {
    const user = this.userOf(client);
    if (!user) {
      client.disconnect();
      return;
    }
    client.data.userId = user.sub;
    this.chat.markOnline(user.sub, client.id);
    this.server.emit('presence', { userId: user.sub, online: true });
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (userId) {
      this.chat.markOffline(userId, client.id);
      if (!this.chat.isOnline(userId)) this.server.emit('presence', { userId, online: false });
    }
  }

  @SubscribeMessage('c:join')
  async join(@ConnectedSocket() client: Socket, @MessageBody() body: { conversationId: string }) {
    const userId = client.data.userId as string;
    await this.chat.assertMember(body.conversationId, userId);
    await client.join(body.conversationId);
    return { ok: true };
  }

  @SubscribeMessage('c:send')
  async send(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string; text: string },
  ) {
    const userId = client.data.userId as string;
    const msg = await this.chat.send(body.conversationId, userId, body.text);
    this.server.to(body.conversationId).emit('m:new', msg);
    return msg;
  }

  @SubscribeMessage('c:typing')
  async typing(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const userId = client.data.userId as string;
    client.to(body.conversationId).emit('m:typing', { userId, conversationId: body.conversationId });
    return { ok: true };
  }

  @SubscribeMessage('c:read')
  async read(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: string },
  ) {
    const userId = client.data.userId as string;
    await this.chat.markRead(body.conversationId, userId);
    this.server.to(body.conversationId).emit('m:read', { userId, conversationId: body.conversationId });
    return { ok: true };
  }
}
