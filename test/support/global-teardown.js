import { defraIdStub } from './defra-id-stub.js'

export default async function globalTeardown() {
  await defraIdStub.expireAllUsers()
}
