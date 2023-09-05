import sha1 from 'sha1';
import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class UsersController {
  static async postNew(req, res) {
    const { email, password } = req.body;
    if (!email) return res.status(400).send({ error: 'Missing email' });
    if (!password) return res.status(400).send({ error: 'Missing password' });

    const userExists = await dbClient.users.findOne({ email });
    if (userExists) return res.status(400).send({ error: 'Already exist' });

    const hashPassword = sha1(password);
    const user = await dbClient.users.insertOne({
      email,
      password: hashPassword,
    });
    return res.status(201).send({ id: user.insertedId, email });
  }

  static async getMe(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).send({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).send({ error: 'Unauthorized' });

    const userArr = await dbClient.users.find(`ObjectId("${userId}")`).toArray();
    if (!userArr) return res.status(401).send({ error: 'Unauthorized' });
    const user = userArr[0];
    return res.status(200).send({ id: user._id, email: user.email });
  }
}

export default UsersController;
