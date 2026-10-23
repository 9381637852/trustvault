import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { pool } from './db/index.js';
import authRoutes from './routes/auth.routes.js';
import documentRoutes from './routes/document.routes.js';
import adminRoutes from './routes/admin.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://trustvault-ruddy.vercel.app',
  ],
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json());

// Mount All Routes
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/admin', adminRoutes);

// Health Route
app.get('/api/health', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'UP',
      message: '🎉 TrustVault is connected to your Neon PostgreSQL Database!',
      databaseTime: result.rows[0].now,
    });
  } catch (error: any) {
    res.status(500).json({ status: 'DATABASE_ERROR', error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 TrustVault Server running at http://localhost:${PORT}`);
});