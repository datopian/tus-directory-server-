import http from 'node:http'
import path from 'path'
import dotenv from 'dotenv'
import express, { Request, Response } from 'express'
import { Server, Metadata } from '@tus/server'
import { S3Store } from './store/s3store/index'

import { authenticate } from './auth'


dotenv.config()
const app = express();
const port = process.env.SERVER_PORT || 4000
const enableFolderUpload = process.env.ENABLE_FOLDER_UPLOAD === 'true' || false

const uploadApp = express()

const s3StoreDatastore = new S3Store({
  partSize: 8 * 1024 * 1024, // each uploaded part will have ~8MiB,
  s3ClientConfig: {
    bucket: process.env.S3_BUCKET as string,
    endpoint: process.env.S3_ENDPOINT as string,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY as string,
      secretAccessKey: process.env.S3_ACCESS_SECRET as string,
    },
    region: process.env.S3_REGION || 'auto' as string,
  }
})

const server = new Server({
  path: '/uploads',
  datastore: s3StoreDatastore,
  relativeLocation: true,
  async onIncomingRequest(req, res) {
    try {
      const authenticated: boolean | void = await authenticate(req)
      if (!authenticated) {
        throw new Error('Authentication failed')
      }
    } catch (e: any) {
      throw { status_code: 401, body: e.message }
    }
  },

  generateUrl(req: http.IncomingMessage, { proto, host, path, id }) {
    let url = `${proto}://${host}${path}/${id}`
    return decodeURIComponent(url)
  },

  onResponseError: (req: http.IncomingMessage, res: http.ServerResponse, err: any) => {
    console.error(err)
  },

  namingFunction: (req: http.IncomingMessage) => {
    let name = ""
    let meta: any = Metadata.parse(req.headers['upload-metadata'] as string)
    const prefix = meta.prefix || ''
    if (meta.relativePath !== 'null' && enableFolderUpload) {
      name = meta.relativePath
    } else {
      name = meta.name
    }
    return decodeURIComponent(prefix + name)
  },

  getFileIdFromRequest: (req: http.IncomingMessage) => {
    const newPath = path.join(path.sep, ...(req.url?.split(path.sep).slice(2) ?? []));
    return decodeURIComponent(newPath)
  }
})

uploadApp.all('*', server.handle.bind(server))
app.use('/', uploadApp)

app.listen(port, () => {
  console.log(`Server running at http://127.0.0.1:${port}`);
})