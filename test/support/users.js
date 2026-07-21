import { randomUUID } from 'crypto'

class Users {
  async userPayload(email) {
    return {
      userId: randomUUID(),
      email,
      firstName: 'Test',
      lastName: 'User',
      loa: '1',
      aal: '1',
      enrolmentCount: 1,
      enrolmentRequestCount: 1,
      relationships: [
        {
          organisationName: 'ACME ltd',
          relationshipRole: 'Employee',
          roleName: 'Some role',
          roleStatus: '1'
        }
      ]
    }
  }

  async authorisationPayload(email) {
    return {
      user: email,
      // eslint-disable-next-line camelcase
      client_id: '63983fc2-cfff-45bb-8ec2-959e21062b9a',
      // eslint-disable-next-line camelcase
      response_type: 'code',
      // eslint-disable-next-line camelcase
      redirect_uri: 'http://0.0.0.0:3001/health',
      state: 'state',
      scope: 'email'
    }
  }

  async tokenPayload(sessionId) {
    return {
      client_id: '63983fc2-cfff-45bb-8ec2-959e21062b9a', // eslint-disable-line camelcase
      // deepcode ignore HardcodedNonCryptoSecret: intentional test fixture, not a real credential
      client_secret: 'test_value', // eslint-disable-line camelcase
      grant_type: 'authorization_code', // eslint-disable-line camelcase
      code: `${sessionId}`
    }
  }
}

export default Users
