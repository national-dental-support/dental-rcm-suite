import { describe, it, expect, jest, beforeEach } from '@jest/globals';

/**
 * Covers the real-time push surface, with the emphasis on delivery scoping:
 * an emit addressed to one tenant must never reach another.
 */

const mockEmit = jest.fn();
const mockTo = jest.fn(() => ({ emit: mockEmit }));
const mockUse = jest.fn();
const mockOn = jest.fn();

jest.mock('socket.io', () => ({
  Server: jest.fn().mockImplementation(() => ({
    use: mockUse,
    on: mockOn,
    to: mockTo,
    emit: mockEmit,
  })),
}));

jest.mock('../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../config', () => ({
  __esModule: true,
  default: { apiKey: 'test-key', corsOrigin: 'http://127.0.0.1:4200' },
}));

function load() {
  let mod: any;
  jest.isolateModules(() => {
    mod = require('../websockets/index');
  });
  return mod;
}

describe('websockets', () => {
  beforeEach(() => {
    mockEmit.mockClear();
    mockTo.mockClear();
    mockUse.mockClear();
    mockOn.mockClear();
  });

  describe('before initialisation', () => {
    it('emitting is a no-op rather than a crash', () => {
      const ws = load();
      expect(() => ws.broadcast('x')).not.toThrow();
      expect(() => ws.broadcastToCustomer(1, 'x')).not.toThrow();
      expect(() => ws.pushNotification(1, {})).not.toThrow();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('getIO returns null', () => {
      expect(load().getIO()).toBeNull();
    });
  });

  describe('initWebSockets', () => {
    it('registers an auth guard and a connection handler', () => {
      const ws = load();
      const io = ws.initWebSockets({} as any);
      expect(io).toBeDefined();
      expect(mockUse).toHaveBeenCalledTimes(1);
      expect(mockOn).toHaveBeenCalledWith('connection', expect.any(Function));
      expect(ws.getIO()).toBe(io);
    });

    describe('handshake auth', () => {
      function runGuard(auth: any, headers: any = {}) {
        const ws = load();
        ws.initWebSockets({} as any);
        const guard = mockUse.mock.calls[0][0] as any;
        const next = jest.fn();
        guard({ id: 's1', handshake: { auth, headers } }, next);
        return next;
      }

      it('accepts the configured key from auth', () => {
        const next = runGuard({ apiKey: 'test-key' });
        expect(next).toHaveBeenCalledWith();
      });

      it('accepts the configured key from the apikey header', () => {
        const next = runGuard(undefined, { apikey: 'test-key' });
        expect(next).toHaveBeenCalledWith();
      });

      it('rejects a wrong key', () => {
        const next = runGuard({ apiKey: 'nope' });
        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });

      it('rejects a missing key', () => {
        const next = runGuard({});
        expect(next).toHaveBeenCalledWith(expect.any(Error));
      });
    });

    describe('room membership', () => {
      function connect(query: Record<string, string | undefined>) {
        const ws = load();
        ws.initWebSockets({} as any);
        const handler = mockOn.mock.calls.find(c => c[0] === 'connection')![1] as any;
        const join = jest.fn();
        const on = jest.fn();
        handler({ id: 's1', handshake: { query }, join, on });
        return join;
      }

      it('joins the user and tenant rooms', () => {
        const join = connect({ userId: '10', customerId: '3' });
        expect(join).toHaveBeenCalledWith('user:10');
        expect(join).toHaveBeenCalledWith('customer:3');
      });

      it('joins no room when the ids are absent', () => {
        expect(connect({})).not.toHaveBeenCalled();
      });

      it('refuses a non-numeric tenant id rather than naming a room from it', () => {
        const join = connect({ userId: 'abc', customerId: '1; DROP TABLE Users' });
        expect(join).not.toHaveBeenCalled();
      });

      it('refuses a non-positive id', () => {
        expect(connect({ userId: '0', customerId: '-5' })).not.toHaveBeenCalled();
      });
    });
  });

  describe('delivery scoping', () => {
    function ready() {
      const ws = load();
      ws.initWebSockets({} as any);
      mockEmit.mockClear();
      mockTo.mockClear();
      return ws;
    }

    it('broadcastToCustomer addresses only that tenant room', () => {
      ready().broadcastToCustomer(7, 'claim:updated', { id: 1 });
      expect(mockTo).toHaveBeenCalledWith('customer:7');
      expect(mockEmit).toHaveBeenCalledWith('claim:updated', { id: 1 });
    });

    it('broadcastToCustomer emits nothing for an invalid tenant id', () => {
      const ws = ready();
      ws.broadcastToCustomer(Number('x'), 'claim:updated');
      ws.broadcastToCustomer(0, 'claim:updated');
      expect(mockTo).not.toHaveBeenCalled();
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('pushNotification addresses only that user room', () => {
      ready().pushNotification(42, { title: 'hi' });
      expect(mockTo).toHaveBeenCalledWith('user:42');
      expect(mockEmit).toHaveBeenCalledWith('notification', { title: 'hi' });
    });

    it('pushNotification emits nothing for an invalid user id', () => {
      ready().pushNotification(-1, {});
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it('broadcast reaches every client without naming a room', () => {
      ready().broadcast('deploy:notice', { version: '1' });
      expect(mockTo).not.toHaveBeenCalled();
      expect(mockEmit).toHaveBeenCalledWith('deploy:notice', { version: '1' });
    });
  });
});
