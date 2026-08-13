/**
 * Narrows a value that only a deployed run supplies. A local or CI run takes
 * the stub's fixed values and never reaches this. A deployed run without the
 * variable set fails naming it, rather than filling `undefined` into a sign-in
 * form and reporting whatever the provider says about a blank user.
 *
 * @param {string | undefined} value
 * @param {string} variableName
 * @returns {string}
 */
export function requireValue(value, variableName) {
  if (!value) {
    throw new Error(
      `${variableName} is not set. A run against a deployed environment needs it.`
    )
  }

  return value
}
