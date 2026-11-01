import { Request, Response, NextFunction } from 'express';
import config from '../config';

const authenticate = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const username = req.headers.username as string;
  const password = req.headers.password as string;

  if (
    (username as string) === config.apiUsername &&
    (password as string) === config.apiPassword
  ) {
    next();
  } else {
    res
      .status(401)
      .json({ error: 'Unauthorized: Incorrect username or password' });
  }
};

export default authenticate;
