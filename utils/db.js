import { MongoClient } from 'mongodb';

class DBClient {
  constructor() {
    const HOST = process.env.DB_HOST || 'localHOST';
    const PORT = process.env.DB_PORT || 27017;
    const DATABASE = process.env.DB_DATABASE || 'files_manager';
    const url = `mongodb://${HOST}:${PORT}/${DATABASE}`;
    this.client = new MongoClient(url, { useUnifiedTopology: true });
    this.isClientConnected = false;
    this.client.connect((err) => {
      if (!err) {
        this.db = this.client.db(DATABASE);
        this.users = this.db.collection('users');
        this.files = this.db.collection('files');
        this.isClientConnected = true;
      } else {
        console.log(err);
        this.isClientConnected = false;
      }
    });
  }

  isAlive() {
    return this.isClientConnected;
  }

  async nbUsers() {
    const usersCollection = this.db.collection('users');
    const nbUsers = await usersCollection.countDocuments();
    return nbUsers;
  }

  async nbFiles() {
    const filesCollection = this.db.collection('files');
    const nbFiles = await filesCollection.countDocuments();
    return nbFiles;
  }
}

const dbClient = new DBClient();
export default dbClient;
