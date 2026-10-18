import type { RequestHandler } from 'express';
import { equalToken } from './credentials.js';

export function createRequireAuth(isSessionAuthorized: (token: string) => boolean, machineToken: string): RequestHandler {
  return (req, res, next) => {
    const header = req.header('authorization') || '';
    const token = /^Bearer\s+([^\s]+)$/i.exec(header)?.[1] || '';
    if (token && (isSessionAuthorized(token) || equalToken(token, machineToken))) { next(); return; }
    res.status(401).json({ success: false, error: 'Conecte um dispositivo autorizado ao Jasper para acessar a API.' });
  };
}
