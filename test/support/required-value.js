/**
 * Narrows a credential that only a real provider needs. A run against that
 * provider's stub takes the stub's fixed values and never reaches this. A run
 * against the real provider without the variable set fails naming it, rather
 * than sending `undefined` and reporting whatever the provider says about a
 * blank credential.
 *
 * @param {string | undefined} value
 * @param {string} variableName
 * @returns {string}
 */
export function requireValue(value, variableName) {
  if (!value) {
    throw new Error(
      `${variableName} is not set. This run uses the real provider it belongs to, not a stub.`
    )
  }

  return value
}
