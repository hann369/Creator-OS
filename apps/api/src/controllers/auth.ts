import { Request, Response, Router } from 'express';

export const authRouter = Router();

// Mock registration endpoint
authRouter.post('/register', (req: Request, res: Response) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'Missing registration details' });
  }

  return res.status(201).json({
    success: true,
    user: {
      id: crypto.randomUUID(),
      email,
      displayName,
      createdAt: new Date()
    }
  });
});

// Mock login endpoint
authRouter.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  return res.status(200).json({
    success: true,
    token: 'jwt-auth-session-token-here',
    user: {
      id: crypto.randomUUID(),
      email,
      displayName: 'Creator Account',
      createdAt: new Date()
    }
  });
});
