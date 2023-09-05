import Queue from 'bull/lib/queue';
import { ObjectId } from 'mongodb';
import { contentType } from 'mime-types';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import { promisify } from 'util';
import redisClient from '../utils/redis';
import dbClient from '../utils/db';

const fileQueue = new Queue('thumbnailQueue');
class FilesController {
  static async postUpload(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).send({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).send({ error: 'Unauthorized' });

    const { name, type, data } = req.body;
    if (!name) return res.status(400).send({ error: 'Missing name' });
    if (!type || !['folder', 'file', 'image'].includes(type)) return res.status(400).send({ error: 'Missing type' });
    if (!data && type !== 'folder') return res.status(400).send({ error: 'Missing data' });

    const parentId = req.body.parentId || 0;
    const isPublic = req.body.isPublic || false;
    if (parentId !== 0) {
      const parentDocArray = await dbClient.files
        .find({ _id: ObjectId(parentId) })
        .toArray();
      if (parentDocArray.length === 0) return res.status(400).send({ error: 'Parent not found' });
      const parentDoc = parentDocArray[0];
      if (parentDoc.type !== 'folder') return res.status(400).send({ error: 'Parent is not a folder' });
    }

    let fileInserted;
    if (type === 'folder') {
      fileInserted = await dbClient.files.insertOne({
        userId: ObjectId(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? parentId : ObjectId(parentId),
      });
    } else {
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
      if (!fs.existsSync(folderPath)) fs.mkdirSync(folderPath, { recursive: true }, () => {});
      const localPath = `${folderPath}/${uuidv4()}`;
      const buff = Buffer.from(data, 'base64');
      fs.writeFileSync(localPath, buff);
      fileInserted = await dbClient.files.insertOne({
        userId: ObjectId(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? parentId : ObjectId(parentId),
        localPath,
      });
      const fileId = fileInserted.insertedId;
      if (type === 'image') {
        const jobName = `image thumbnail [${userId}: ${fileId}]`;
        fileQueue.add({
          userId,
          fileId,
          name: jobName,
        });
      }
    }

    return res.status(201).send({
      id: fileInserted.insertedId,
      userId,
      name,
      type,
      isPublic,
      parentId: parentId === 0 ? parentId : ObjectId(parentId),
    });
  }

  static async getShow(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).send({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).send({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const fileDoc = await dbClient.db.collection('files').findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });
    if (!fileDoc) return res.status(404).send({ error: 'Not found' });
    return res.status(200).json({
      id: fileDoc._id,
      userId: fileDoc.userId,
      name: fileDoc.name,
      type: fileDoc.type,
      isPublic: fileDoc.isPublic,
      parentId: fileDoc.parentId,
    });
  }

  static async getIndex(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).send({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).send({ error: 'Unauthorized' });

    const parentId = req.query.parentId || 0;
    const pagination = req.query.page || 0;

    const fileFilter = {
      parentId: parentId === 0 ? parentId : ObjectId(parentId),
    };
    let agrregateData = [
      { $match: fileFilter },
      { $skip: pagination * 20 },
      { $limit: 20 },
    ];

    if (parentId === 0) agrregateData = [{ $skip: pagination * 20 }, { $limit: 20 }];
    const files = await dbClient.db
      .collection('files')
      .aggregate(agrregateData);
    const filesArray = [];
    await files.forEach((file) => {
      filesArray.push({
        id: file._id,
        userId: file.userId,
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId,
      });
    });

    return res.status(200).json(filesArray);
  }

  static async putPublish(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).send({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).send({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const fileDoc = await dbClient.db.collection('files').findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });
    if (!fileDoc) return res.status(404).send({ error: 'Not found' });

    const isPublic = true;
    await dbClient.db
      .collection('files')
      .updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: true } });
    return res.status(200).json({
      id: fileDoc._id,
      userId: fileDoc.userId,
      name: fileDoc.name,
      type: fileDoc.type,
      isPublic,
      parentId: fileDoc.parentId,
    });
  }

  static async putUnpublish(req, res) {
    const token = req.header('X-Token') || null;
    if (!token) return res.status(401).send({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).send({ error: 'Unauthorized' });

    const fileId = req.params.id;
    const fileDoc = await dbClient.db.collection('files').findOne({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });
    if (!fileDoc) return res.status(404).send({ error: 'Not found' });

    const isPublic = false;
    await dbClient.db
      .collection('files')
      .updateOne({ _id: ObjectId(fileId) }, { $set: { isPublic: false } });
    return res.status(200).json({
      id: fileDoc._id,
      userId: fileDoc.userId,
      name: fileDoc.name,
      type: fileDoc.type,
      isPublic,
      parentId: fileDoc.parentId,
    });
  }

  static async getFile(req, res) {
    const fileId = req.params.id;
    const { size } = req.query || null;
    const fileDoc = await dbClient.db.collection('files').findOne({
      _id: ObjectId(fileId),
    });
    if (!fileDoc) return res.status(404).send({ error: 'Not found' });
    if (fileDoc.type === 'folder') return res.status(400).send({ error: "A folder doesn't have content" });
    if (fileDoc.isPublic === false) {
      const token = req.header('X-Token') || null;
      if (!token) return res.status(401).send({ error: 'Not found' });
      const userId = await redisClient.get(`auth_${token}`);
      if (!userId) return res.status(401).send({ error: 'Not found' });
      const fileDoc = await dbClient.db.collection('files').findOne({
        _id: ObjectId(fileId),
        userId: ObjectId(userId),
      });
      if (!fileDoc) return res.status(404).send({ error: 'Not found' });
      let filePath = fileDoc.localPath;
      if (size) filePath = `${fileDoc.localPath}_${size}`;
      if (!fs.existsSync(filePath)) {
        return res.status(400).send({ error: 'Not found' });
      }
      const statAsync = promisify(fs.stat);
      const fileInfo = await statAsync(filePath);
      if (!fileInfo.isFile()) return res.status(400).send({ error: 'Not found' });
      res.setHeader('Content-Type', contentType(fileDoc.name));
      res.status(200).sendFile(filePath);
    }
    let filePath = fileDoc.localPath;
    if (size) filePath = `${fileDoc.localPath}_${size}`;
    if (!fs.existsSync(filePath)) {
      return res.status(400).send({ error: 'Not found' });
    }
    const statAsync = promisify(fs.stat);
    const fileInfo = await statAsync(filePath);
    if (!fileInfo.isFile()) return res.status(400).send({ error: 'Not found' });
    res.setHeader('Content-Type', contentType(fileDoc.name));
    return res.status(200).sendFile(filePath);
  }
}

export default FilesController;
