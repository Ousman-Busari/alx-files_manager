import sha1 from 'sha1';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AuthController {
  static async getConnect(req, res) {
    const auth = req.header('Authorization') || null;
    if (!auth) return res.status(401).send({ error: 'Unauthorized' });

    const credentials = Buffer.from(auth.split(' ')[1], 'base64').toString(
      'utf-8',
    );
    const [email, password] = credentials.split(':');

    if (!email || !password) return res.status(401).send({ error: 'Unauthorized' });

    const user = await dbClient.users.findOne({
      email,
      password: sha1(password),
    });
    if (!user) return res.status(401).send({ error: 'Unauthorized' });

    const token = uuidv4();
    const key = `auth_${token}`;
    await redisClient.set(key, user._id.toString(), 24 * 3600);
    return res.status(200).send({ token });
  }

  static async getDisconnect(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).send({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).send({ error: 'Unauthorized' });

    await redisClient.del(`auth_${token}`);
    return res.status(204).send();
  }
}

export default AuthController;
