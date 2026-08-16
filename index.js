import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

app.get('/reviews/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    const result = await pool.query(
      'SELECT id as "_id", "productId", "userId", rating, comment, "createdAt" FROM "Review" WHERE "productId" = $1 ORDER BY "createdAt" DESC',
      [productId]
    );
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/reviews/:productId', authenticate, async (req, res) => {
  try {
    const { productId } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user.userId || req.user.id;
    
    const result = await pool.query(
      'INSERT INTO "Review" (id, "productId", "userId", rating, comment) VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id as "_id", "productId", "userId", rating, comment, "createdAt"',
      [productId, userId, parseInt(rating), comment]
    );
    
    res.status(201).json({
      _id: result.rows[0]._id,
      userName: req.user.name || 'User',
      userId: result.rows[0].userId,
      rating: result.rows[0].rating,
      comment: result.rows[0].comment,
      createdAt: result.rows[0].createdAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/reviews/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    const check = await pool.query('SELECT * FROM "Review" WHERE id = $1', [id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    
    if (check.rows[0].userId !== req.user.userId && check.rows[0].userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    
    await pool.query('DELETE FROM "Review" WHERE id = $1', [id]);
    res.json({ message: 'Review deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'review-service' });
});

export default app;
