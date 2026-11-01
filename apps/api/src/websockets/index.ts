import type { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import logger from '../utils/logger';
import config from '../config';

/**
 * Real-time push for the RCM products: claim updates, queue changes and
 * notifications.
 *
 * Clients join two rooms - one per tenant and one per user - and every emit is
 * addressed to a room rather than broadcast to all sockets, so a connected
 * client never receives another tenant's events.
 *
 * The upstream platform also carried a device-agent channel here (heartbeats,
 * SNMP polling, patch and antivirus posture, remote script dispatch). That
 * belongs to an infrastructure-monitoring product and is not part of this
 * suite, so the socket surface is only what the RCM products use.
 */

let io: SocketIOServer | null = null;

/** Validates the handshake key. Rejects the connection when it does not match. */
function isValidApiKey(key: unknown): boolean {
  const expected = config.apiKey;
  if (!expected) return false;
  return typeof key === 'string' && key === expected;
}

export function initWebSockets(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    path: '/ws',
    cors: { origin: config.corsOrigin || true, credentials: true },
  });

  io.use((socket: Socket, next) => {
    const handshake = socket.handshake;
    const key = handshake.auth?.['apiKey'] ?? handshake.headers['apikey'];

    if (!isValidApiKey(key)) {
      logger.warn('[WS] connection rejected - invalid or missing key', { id: socket.id });
      return next(new Error('unauthorized'));
    }
    return next();
  });

  io.on('connection', (socket: Socket) => {
    const { userId, customerId } = socket.handshake.query as Record<string, string | undefined>;

    // Room membership is what scopes delivery, so both ids are validated as
    // positive integers before they are used to name a room.
    const user = Number(userId);
    if (Number.isInteger(user) && user > 0) socket.join(`user:${user}`);

    const customer = Number(customerId);
    if (Number.isInteger(customer) && customer > 0) socket.join(`customer:${customer}`);

    logger.info('[WS] client connected', { id: socket.id, user: user || null, customer: customer || null });

    socket.on('disconnect', reason => {
      logger.info('[WS] client disconnected', { id: socket.id, reason });
    });
  });

  logger.info('[WS] websocket server listening on /ws');
  return io;
}

/** Push a notification to one user's sockets. */
export function pushNotification(userId: number, notification: unknown): void {
  if (!io) return;
  if (!Number.isInteger(userId) || userId <= 0) return;
  io.to(`user:${userId}`).emit('notification', notification);
}

/**
 * Emit to every connected client.
 *
 * Reserved for events that carry no tenant data, such as a deployment notice.
 * Anything derived from a tenant's records must use broadcastToCustomer.
 */
export function broadcast(event: string, data?: unknown): void {
  if (!io) return;
  io.emit(event, data);
}

/** Emit to one tenant's clients. */
export function broadcastToCustomer(customerId: number, event: string, data?: unknown): void {
  if (!io) return;
  if (!Number.isInteger(customerId) || customerId <= 0) return;
  io.to(`customer:${customerId}`).emit(event, data);
}

export function getIO(): SocketIOServer | null {
  return io;
}
