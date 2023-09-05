import fs from 'fs';
import { ObjectId } from 'mongodb';
import imageThumbnail from 'image-thumbnail';
import { promisify } from 'util';
import Queue from 'bull/lib/queue';
import dbClient from './utils/db';

const fileQueue = new Queue('thumbnailQueue');
const writeFileAsync = promisify(fs.writeFile);
const generateThumbnail = async (filePath, size) => {
  const buffer = await imageThumbnail(filePath, { width: size });
  return writeFileAsync(`${filePath}_${size}`, buffer);
};

fileQueue.process(async (job, done) => {
  const { fileId } = job.data || null;
  const { userId } = job.data || null;
  if (!fileId) throw Error('Missing fileId');
  if (!userId) throw Error('Missing user');

  console.log(`Processing of job ${job.id} started`);

  const file = await dbClient.files.findOne({
    _id: ObjectId(fileId),
    userId: ObjectId(userId),
  });

  if (!file) throw Error('File not found');
  if (file.type !== 'image') throw Error('File is not an image');

  const sizes = [500, 250, 100];

  Promise.all(
    sizes.map((size) => generateThumbnail(file.localPath, size).then(() => {
      done();
    })),
  );
});
