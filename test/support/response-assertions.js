export async function assertSuccessResponse(response, context) {
  const body = await response.body.json()
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(
      `${context}: expected 2xx but got ${response.statusCode}\n${JSON.stringify(body, null, 2)}`
    )
  }
  return body
}

// For an endpoint whose exact status code is part of what the seed relies on -
// a create that must report 201, a transition that must report 200. A 2xx that
// is not the expected one is an API change the seed has to see.
export async function assertStatus(response, expectedStatusCode, context) {
  if (response.statusCode === expectedStatusCode) {
    return response.body.json()
  }

  // Read as text, not JSON: a gateway error or an HTML error page would throw
  // on parse and take the status code - the thing this helper exists to
  // report - down with it.
  throw new Error(
    `${context}: expected ${expectedStatusCode} but got ${response.statusCode}\n${await response.body.text()}`
  )
}

export async function assertSuccessResponseWithoutBody(response, context) {
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const body = await response.body.json()
    throw new Error(
      `${context}: expected 2xx but got ${response.statusCode}\n${JSON.stringify(body, null, 2)}`
    )
  }
}
