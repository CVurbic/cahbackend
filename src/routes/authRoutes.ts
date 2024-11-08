import express from 'express';
import { signup, login, joinWithoutSignup } from '../controllers/authController';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.post('/join-without-signup', joinWithoutSignup);

export default router;
