import { Request, Response } from 'express';
import logger from '../utils/logger';

type ServiceInstance = {
  get: (req: Request, res: Response) => Promise<Response>;
};

export class ApiHandlerFactory {
  public create(serviceInstance: ServiceInstance, methodName: string) {
    return async (req: Request, res: Response): Promise<Response> => {
      try {
        return await serviceInstance.get(req, res);
      } catch (error: unknown) {
        logger.error(`ApiHandlerFactory; ${methodName}; Error:`, error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return res.status(500).json({
          message: `ApiHandlerFactory; ${methodName}; Internal server error`,
          error: message,
        });
      }
    };
  }
}
